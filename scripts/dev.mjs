import concurrently from 'concurrently';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import path from 'node:path';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

function print(color, text) {
  console.log(`${color}${text}${RESET}`);
}

let INFISICAL_API_URL = process.env.INFISICAL_API_URL || process.env.INFISICAL_HOST_URL || 'https://app.infisical.com/api';
let INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID;
let INFISICAL_CLIENT_ID = process.env.INFISICAL_CLIENT_ID || process.env.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID;
let INFISICAL_CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET || process.env.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET;
let INFISICAL_SECRET_PATH = process.env.INFISICAL_SECRET_PATH || '/bot-kemenag';

// Deteksi dinamis kredensial dari profil pengguna jika sesi shell belum me-refresh environment
if (!INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !INFISICAL_PROJECT_ID) {
  try {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const cfgPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const iEnv = cfg?.mcpServers?.infisical?.env;
      if (iEnv) {
        INFISICAL_API_URL = INFISICAL_API_URL || iEnv.INFISICAL_API_URL || iEnv.INFISICAL_HOST_URL;
        INFISICAL_PROJECT_ID = INFISICAL_PROJECT_ID || iEnv.INFISICAL_PROJECT_ID;
        INFISICAL_CLIENT_ID = INFISICAL_CLIENT_ID || iEnv.INFISICAL_CLIENT_ID || iEnv.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID;
        INFISICAL_CLIENT_SECRET = INFISICAL_CLIENT_SECRET || iEnv.INFISICAL_CLIENT_SECRET || iEnv.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET;
      }
    }
  } catch {
    /* abaikan jika file konfigurasi tidak ada */
  }
}

const args = process.argv.slice(2);
const isProd = args.includes('--prod') || args.includes('--env=prod') || process.env.INFISICAL_ENV === 'prod';
const targetEnv = isProd ? 'prod' : (process.env.INFISICAL_ENV || 'dev');

async function fetchSecrets(env) {
  print(CYAN, `[Infisical] Mengautentikasi ke Infisical Cloud (${INFISICAL_API_URL})...`);
  let token = process.env.INFISICAL_TOKEN;
  if (!token) {
    const loginRes = await fetch(`${INFISICAL_API_URL}/v1/auth/universal-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: INFISICAL_CLIENT_ID,
        clientSecret: INFISICAL_CLIENT_SECRET,
      }),
    });
    if (!loginRes.ok) {
      throw new Error(`Login Universal Auth gagal: HTTP ${loginRes.status} ${await loginRes.text()}`);
    }
    const loginData = await loginRes.json();
    token = loginData.accessToken;
  }

  print(CYAN, `[Infisical] Mengunduh secrets dari folder '${INFISICAL_SECRET_PATH}' (env: ${env})...`);
  const url = `${INFISICAL_API_URL}/v3/secrets/raw?environment=${encodeURIComponent(env)}&workspaceId=${encodeURIComponent(INFISICAL_PROJECT_ID)}&secretPath=${encodeURIComponent(INFISICAL_SECRET_PATH)}`;
  const secRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!secRes.ok) {
    throw new Error(`Gagal mengambil secret Infisical: HTTP ${secRes.status} ${await secRes.text()}`);
  }

  const secData = await secRes.json();
  const secrets = {};
  if (Array.isArray(secData.secrets)) {
    for (const s of secData.secrets) {
      if (s.secretKey) {
        secrets[s.secretKey] = s.secretValue ?? '';
      }
    }
  }

  print(GREEN, `[Infisical] \u2714 Berhasil menginjeksi ${Object.keys(secrets).length} secrets dari '${INFISICAL_SECRET_PATH}' [${env}] langsung ke runtime memory!\n`);
  return secrets;
}

function banner(env) {
  console.log();
  print(CYAN + BOLD, '================================================================');
  print(CYAN + BOLD, '   Dev Runner — Bot PTSP Kemenag Barito Utara (Air + Astro)');
  print(CYAN + BOLD, '================================================================');
  print(CYAN, `   Env   : Infisical Cloud [${env.toUpperCase()}] -> /bot-kemenag`);
  print(CYAN, '   UI    : http://localhost:3000        (Astro / React)');
  print(CYAN, '   API   : http://127.0.0.1:8080        (Go Fiber v3 + Air Live Reload)');
  print(CYAN, '   Proxy : /api dan /ws  ->  backend :8080   (hanya mode dev)');
  print(YELLOW, '   Log   : [FE] Halaman UI  |  [BE] API Endpoint (Status & Latensi)');
  print(CYAN + BOLD, '================================================================');
  print(DIM, '   Ctrl+C  -> menghentikan backend & frontend bersamaan.');
  console.log();
}

// Deteksi proses siap dengan memantau stream stdout/stderr milik ChildProcess.
function watchReady(cmd, marker, onReady) {
  let attached = false;
  const handler = (buf) => {
    if (buf.toString().includes(marker)) onReady();
  };
  const tryAttach = () => {
    const p = cmd.process;
    if (p) {
      if (attached) return;
      attached = true;
      p.stdout?.on('data', handler);
      p.stderr?.on('data', handler);
      return;
    }
    setTimeout(tryAttach, 30);
  };
  tryAttach();
}

async function main() {
  const started = performance.now();
  let secrets = {};
  try {
    secrets = await fetchSecrets(targetEnv);
  } catch (err) {
    print(RED, `\n[Infisical Error] ${err.message}`);
    print(RED, 'Pastikan koneksi internet aktif dan kredensial Infisical valid.');
    process.exit(1);
  }

  banner(targetEnv);
  const done = { be: false, fe: false };
  let commands = [];

  const goBin = process.env.GOPATH
    ? path.join(process.env.GOPATH, 'bin')
    : path.join(process.env.USERPROFILE || process.env.HOME || '', 'go', 'bin');
  const devPath = [goBin, process.env.PATH].filter(Boolean).join(path.delimiter);

  const { result, commands: cmds } = concurrently(
    [
      {
        name: 'BE',
        command: 'air',
        cwd: 'backend',
        prefixColor: 'yellow.bold',
        env: {
          ...process.env,
          ...secrets,
          PATH: devPath,
          PORT: secrets.BACKEND_PORT || secrets.PORT || '8080',
          LOG_HTTP_REQUESTS: '1',
        },
      },
      {
        name: 'FE',
        command: 'npm run dev',
        cwd: 'frontend',
        prefixColor: 'cyan.bold',
        env: {
          ...process.env,
          ...secrets,
          PORT: secrets.FRONTEND_PORT || '3000',
          ASTRO_DEV_BACKGROUND: 'false',
        },
      },
    ],
    {
      killOthersOn: ['failure'],
      prefix: '{time} [{name}]',
      timestampFormat: 'HH:mm:ss',
    },
  );
  commands = cmds;

  cmds.forEach((cmd, idx) => {
    const key = idx === 0 ? 'be' : 'fe';
    watchReady(cmd, key === 'be' ? '[HTTP] Listening on' : 'Local:', () => {
      if (done[key]) return;
      done[key] = true;
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      readyLine(key.toUpperCase(), secs);
    });
  });

  try {
    const ok = await result;
    if (done.be && done.fe) {
      const total = ((performance.now() - started) / 1000).toFixed(1);
      print(DIM, `\nSemua layanan siap dalam ${total}s sejak runner dimulai.\n`);
    }
    process.exitCode = ok ? 0 : 1;
  } catch (err) {
    const detail = (Array.isArray(err) ? err : [err])
      .map((e) => {
        if (e && typeof e.message === 'string' && e.message) return e.message;
        if (e && typeof e === 'object') {
          const name = e.command?.command ?? e.name ?? '';
          const code = e.exitCode != null ? ` exit ${e.exitCode}` : '';
          return `${name}${code}`.trim();
        }
        return e != null ? String(e) : '';
      })
      .filter(Boolean)
      .slice(0, 3)
      .join('; ');
    print(RED, `\n  Proses dev berhenti — periksa log di atas.${detail ? ` (${detail})` : ''}`);
    commands.forEach((c) => c.kill?.());
    process.exitCode = 1;
  }
}

function readyLine(name, secs) {
  print(GREEN, `\n  \u2714 ${name} siap dalam ${secs}s\n`);
}

let signalling = false;
process.on('SIGINT', () => {
  if (signalling) process.exit(130);
  signalling = true;
  print(YELLOW, '\nMenghentikan semua proses dev...');
  setTimeout(() => process.exit(130), 1500);
});

main();