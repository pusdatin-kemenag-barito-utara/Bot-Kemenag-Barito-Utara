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

function banner() {
  console.log();
  print(CYAN + BOLD, '================================================================');
  print(CYAN + BOLD, '   Dev Runner — Bot PTSP Kemenag Barito Utara (Air + Astro)');
  print(CYAN + BOLD, '================================================================');
  print(CYAN, '   UI    : http://localhost:3000        (Astro / React)');
  print(CYAN, '   API   : http://127.0.0.1:8080        (Go Fiber v3 + Air Live Reload)');
  print(CYAN, '   Proxy : /api dan /ws  ->  backend :8080   (hanya mode dev)');
  print(CYAN, '   DB    : DATABASE_URL (env dari Infisical)');
  print(YELLOW, '   Log   : status tiap request (halaman FE + endpoint BE) + durasi ms');
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
  banner();
  const started = performance.now();
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
        prefixColor: 'yellow',
        env: {
          ...process.env,
          PATH: devPath,
          PORT: process.env.BACKEND_PORT || '8080',
          LOG_HTTP_REQUESTS: '1',
        },
      },
      {
        name: 'FE',
        command: 'npm run dev',
        cwd: 'frontend',
        prefixColor: 'cyan',
        env: {
          ...process.env,
          PORT: process.env.FRONTEND_PORT || '3000',
          ASTRO_DEV_BACKGROUND: 'false',
        },
      },
    ],
    {
      killOthersOn: ['failure'],
      prefix: '{time} {name}',
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
    print(RED, '  Tips: jalankan dengan `infisical run -- npm run dev` agar env DATABASE_URL, SESSION_SECRET, dll. tersedia.');
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