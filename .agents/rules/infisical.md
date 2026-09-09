# Aturan Pengelolaan Environment Variables & Secrets (Infisical + Coolify)

1. **DILARANG KERAS** membuat atau mengedit file `.env`, `.env.example`, `.env.local`, atau file env lainnya di repositori ini.
2. Seluruh environment variable dan secrets **WAJIB** dikelola langsung melalui MCP Infisical (`infisical` tools: `create-secret`, `update-secret`, `list-secrets`, dll.).
3. Project ID Infisical: `1c3cc392-ba00-4c6c-8b5f-ff1ffca61602`.
4. Jika ada kebutuhan penambahan atau perubahan variabel environment, selalu gunakan MCP Infisical langsung ke environment `dev` dan `prod`.
5. **Konfigurasi Coolify (Zero Manual Secrets)**:
   - Panel Coolify (baik Production maupun Preview Deployments) **HANYA** menyimpan 6 variabel koneksi:
     - `PORT=8080`
     - `INFISICAL_API_URL=https://env.kemenag-baritoutara.com`
     - `INFISICAL_CLIENT_ID=8665ed24-6b4b-4712-ba66-0a6e21651763`
     - `INFISICAL_CLIENT_SECRET=0db1e3cfbd799fd9332d863f9ef09713085e1c9045db72c80d6ad19a66938e48`
     - `INFISICAL_PROJECT_ID=1c3cc392-ba00-4c6c-8b5f-ff1ffca61602`
     - `INFISICAL_ENV=prod`
   - Dilarang memasukkan secret individual (DATABASE_URL, API_KEY, dsb.) ke Coolify.
6. **Container Runtime Entrypoint**:
   - `Dockerfile` memasang `infisical` CLI.
   - `docker-entrypoint.sh` menginjeksi secret secara dinamis via Universal Auth saat booting container (`infisical run -- ...`).
7. **Coolify Network & Healthcheck**:
   - Reverse proxy port Traefik/Caddy harus disesuaikan ke `8080` (sesuai port aplikasi).
   - Healthcheck diatur ke `/health` pada port `8080` dengan `start_period: 20` detik.
