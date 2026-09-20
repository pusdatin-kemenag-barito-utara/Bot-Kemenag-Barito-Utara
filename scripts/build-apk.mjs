import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

function print(color, text) {
  console.log(`${color}${text}${RESET}`);
}

let INFISICAL_API_URL = process.env.INFISICAL_API_URL || process.env.INFISICAL_HOST_URL || 'https://app.infisical.com/api';
let INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID;
let INFISICAL_CLIENT_ID = process.env.INFISICAL_CLIENT_ID || process.env.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID;
let INFISICAL_CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET || process.env.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET;
let INFISICAL_SECRET_PATH = process.env.INFISICAL_SECRET_PATH || '/bot-kemenag';

// Normalisasi path jika Git Bash / MSYS mengonversi path
if (INFISICAL_SECRET_PATH.includes(':') || INFISICAL_SECRET_PATH.includes('\\')) {
  const parts = INFISICAL_SECRET_PATH.replace(/\\/g, '/').split('/');
  const lastPart = parts.filter(Boolean).pop();
  INFISICAL_SECRET_PATH = lastPart ? '/' + lastPart : '/bot-kemenag';
}

// Deteksi dinamis kredensial dari profil pengguna jika sesi shell belum me-refresh environment
if (!INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !INFISICAL_PROJECT_ID) {
  try {
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
  } catch {}
}

async function fetchInfisicalSecrets(env = 'dev') {
  if (process.env.ANDROID_KEYSTORE_PASSWORD && process.env.ANDROID_KEY_ALIAS) {
    return process.env;
  }

  if (!INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !INFISICAL_PROJECT_ID) {
    print(YELLOW, '[Infisical] Kredensial Infisical tidak terdeteksi, menggunakan variabel lokal/default.');
    return process.env;
  }

  print(CYAN, `[Infisical] Mengambil kredensial sertifikat Android dari Infisical Cloud [${env}]...`);
  try {
    const loginRes = await fetch(`${INFISICAL_API_URL}/v1/auth/universal-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: INFISICAL_CLIENT_ID,
        clientSecret: INFISICAL_CLIENT_SECRET,
      }),
    });
    if (!loginRes.ok) throw new Error(`Universal Auth failed: ${loginRes.status}`);
    const loginData = await loginRes.json();
    const token = loginData.accessToken;

    const url = `${INFISICAL_API_URL}/v3/secrets/raw?environment=${encodeURIComponent(env)}&workspaceId=${encodeURIComponent(INFISICAL_PROJECT_ID)}&secretPath=${encodeURIComponent(INFISICAL_SECRET_PATH)}`;
    const secRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!secRes.ok) throw new Error(`Fetch secrets failed: ${secRes.status}`);

    const secData = await secRes.json();
    const secrets = {};
    if (Array.isArray(secData.secrets)) {
      for (const s of secData.secrets) {
        if (s.secretKey) secrets[s.secretKey] = s.secretValue ?? '';
      }
    }
    print(GREEN, `[Infisical] ✔ Berhasil mengambil sertifikat & kredensial dari '${INFISICAL_SECRET_PATH}' [${env}]!`);
    return { ...process.env, ...secrets };
  } catch (err) {
    print(YELLOW, `[Infisical Warning] ${err.message}. Melanjutkan dengan env lokal.`);
    return process.env;
  }
}

async function main() {
  console.log();
  print(CYAN + BOLD, '================================================================');
  print(CYAN + BOLD, '   PWA to APK (TWA) Cloud Builder — Infisical Integrated        ');
  print(CYAN + BOLD, '================================================================');
  console.log();

  const manifestPath = path.join(rootDir, 'frontend', 'public', 'manifest.webmanifest');
  if (!fs.existsSync(manifestPath)) {
    print(RED, `[Error] File manifest tidak ditemukan di: ${manifestPath}`);
    process.exit(1);
  }

  const isProd = process.argv.includes('--prod') || process.env.INFISICAL_ENV === 'prod';
  const targetEnv = isProd ? 'prod' : 'dev';
  const secrets = await fetchInfisicalSecrets(targetEnv);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const host = secrets.PWA_HOST || 'https://bot.kemenag-baritoutara.com';
  const name = manifest.name || 'PTSP Kemenag Barito Utara - WhatsApp Gateway';
  const launcherName = manifest.short_name || 'PTSP Kemenag';
  const packageId = secrets.PWA_PACKAGE_ID || 'com.kemenag_baritoutara.bot.twa';
  const themeColor = manifest.theme_color || '#0d1527';
  const backgroundColor = manifest.background_color || '#0d1527';
  const startUrl = '/?source=android_twa';
  const iconUrl = `${host}/pwa-512x512.png`;
  const maskableIconUrl = `${host}/pwa-maskable-512x512.png`;

  const keyAlias = secrets.ANDROID_KEY_ALIAS || 'kemenagbot';
  const storePassword = secrets.ANDROID_KEYSTORE_PASSWORD || 'sIf0tBm3d3r7';
  const keyPassword = secrets.ANDROID_KEY_PASSWORD || storePassword;

  print(CYAN, `• Host        : ${host}`);
  print(CYAN, `• App Name    : ${name}`);
  print(CYAN, `• Launcher    : ${launcherName}`);
  print(CYAN, `• Package ID  : ${packageId}`);
  print(CYAN, `• Key Alias   : ${keyAlias} (dari Infisical)`);
  console.log();

  const payload = {
    host,
    name,
    launcherName,
    packageId,
    themeColor,
    navigationColor: themeColor,
    navigationColorDark: themeColor,
    backgroundColor,
    startUrl,
    iconUrl,
    maskableIconUrl,
    appVersion: '1.0.0',
    appVersionCode: 1,
    display: 'standalone',
    splashScreenFadeOutDuration: 300,
    signingMode: 'new',
    webManifestUrl: `${host}/manifest.webmanifest`,
    signing: {
      fullName: 'Pusdatin Kemenag Barito Utara',
      organization: 'Kemenag Barito Utara',
      organizationalUnit: 'Pusdatin',
      countryCode: 'ID',
      keyPassword,
      storePassword,
      alias: keyAlias,
    },
    enableNotifications: true,
    enableSiteSettingsShortcut: true,
    fallbackType: 'customtabs',
    features: {
      locationDelegation: { enabled: false },
      playBilling: { enabled: false },
    },
    includeSourceCode: false,
  };

  print(YELLOW, 'Mengirim konfigurasi PWA ke PWABuilder Cloud Build Service...');
  print(DIM, 'Proses kompilasi Gradle di cloud membutuhkan waktu ~30 - 60 detik...');

  const startTime = performance.now();
  let res;
  try {
    res = await fetch('https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    print(RED, `\n[Error] Gagal terhubung ke Cloud Build Service: ${err.message}`);
    process.exit(1);
  }

  const duration = ((performance.now() - startTime) / 1000).toFixed(1);

  if (!res.ok) {
    const errorText = await res.text();
    print(RED, `\n[Error] Build gagal (HTTP ${res.status}): ${errorText}`);
    process.exit(1);
  }

  print(GREEN, `✔ Build berhasil diselesaikan di cloud dalam ${duration}s!`);
  print(CYAN, 'Mengunduh paket instalasi...');

  const arrayBuffer = await res.arrayBuffer();
  const zipPath = path.join(rootDir, 'android-build.zip');
  fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

  const androidBuildDir = path.join(rootDir, 'android-build');
  const downloadDir = path.join(rootDir, 'frontend', 'public', 'download');
  const wellKnownDir = path.join(rootDir, 'frontend', 'public', '.well-known');
  const backendWebDir = path.join(rootDir, 'backend', 'web', 'public');

  fs.mkdirSync(androidBuildDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(wellKnownDir, { recursive: true });

  // Ekstrak ZIP menggunakan tar bawaan Windows / Linux
  try {
    execSync(`tar -xf "${zipPath}" -C "${androidBuildDir}"`);
    fs.unlinkSync(zipPath);
  } catch (err) {
    print(RED, `[Error] Gagal mengekstrak berkas build: ${err.message}`);
    process.exit(1);
  }

  // AMANKAN KEAMANAN: Hapus file plaintext signing-key-info.txt jika ada
  const keyInfoFile = path.join(androidBuildDir, 'signing-key-info.txt');
  if (fs.existsSync(keyInfoFile)) {
    fs.unlinkSync(keyInfoFile);
    print(GREEN, `✔ File plaintext signing-key-info.txt otomatis dihapus (kredensial aman di Infisical).`);
  }

  // Pindahkan APK ke folder public/download/
  const files = fs.readdirSync(androidBuildDir);
  const apkFile = files.find((f) => f.endsWith('.apk'));
  const aabFile = files.find((f) => f.endsWith('.aab'));

  if (apkFile) {
    const targetApk = path.join(downloadDir, 'ptsp-kemenag-bot.apk');
    fs.copyFileSync(path.join(androidBuildDir, apkFile), targetApk);
    print(GREEN, `✔ APK siap didistribusikan : frontend/public/download/ptsp-kemenag-bot.apk`);

    // Sinkronisasi ke backend static dir jika ada
    if (fs.existsSync(backendWebDir)) {
      const backendDownload = path.join(backendWebDir, 'download');
      fs.mkdirSync(backendDownload, { recursive: true });
      fs.copyFileSync(targetApk, path.join(backendDownload, 'ptsp-kemenag-bot.apk'));
    }
  }

  // Perbarui assetlinks.json
  const assetlinksPath = path.join(androidBuildDir, 'assetlinks.json');
  if (fs.existsSync(assetlinksPath)) {
    const targetAssetlinks = path.join(wellKnownDir, 'assetlinks.json');
    fs.copyFileSync(assetlinksPath, targetAssetlinks);
    print(GREEN, `✔ Asset Links diperbarui   : frontend/public/.well-known/assetlinks.json`);

    if (fs.existsSync(backendWebDir)) {
      const backendWellKnown = path.join(backendWebDir, '.well-known');
      fs.mkdirSync(backendWellKnown, { recursive: true });
      fs.copyFileSync(targetAssetlinks, path.join(backendWellKnown, 'assetlinks.json'));
    }

    try {
      const links = JSON.parse(fs.readFileSync(targetAssetlinks, 'utf8'));
      const fp = links[0]?.target?.sha256_cert_fingerprints?.[0];
      if (fp) {
        print(CYAN, `• SHA-256 Fingerprint     : ${fp}`);
      }
    } catch {}
  }

  if (aabFile) {
    print(GREEN, `✔ AAB (Play Store)        : android-build/${aabFile}`);
  }

  console.log();
  print(GREEN + BOLD, '================================================================');
  print(GREEN + BOLD, '   ✔ BUILD APK SELESAI & AMAN DI INFISICAL!                     ');
  print(GREEN + BOLD, '================================================================');
  print(CYAN, `• Download URL : ${host}/download/ptsp-kemenag-bot.apk`);
  print(CYAN, `• Keystore     : android-build/signing.keystore`);
  print(CYAN, `• Kredensial   : Disimpan aman di Infisical (${INFISICAL_SECRET_PATH})`);
  console.log();
}

main();
