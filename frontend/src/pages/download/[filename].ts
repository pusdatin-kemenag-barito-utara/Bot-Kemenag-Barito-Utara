import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

export function getStaticPaths() {
  return [
    { params: { filename: 'wa-bot-kemenag.apk' } },
    { params: { filename: 'ptsp-kemenag-bot.apk' } },
  ];
}

export const GET: APIRoute = async ({ params }) => {
  const filename = params.filename;
  if (!filename) {
    return new Response('Filename not provided', { status: 400 });
  }

  // Cari file di folder public/download
  const candidatePaths = [
    path.resolve(process.cwd(), 'public', 'download', filename),
    path.resolve(process.cwd(), 'frontend', 'public', 'download', filename),
    path.resolve(process.cwd(), '..', 'frontend', 'public', 'download', filename),
    path.resolve('D:/Coding/Bot-Kemenag-Barito-Utara/frontend/public/download', filename),
    path.resolve('D:/Coding/Bot-Kemenag-Barito-Utara/backend/web/public/download', filename),
  ];

  let targetPath: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    return new Response(`Berkas ${filename} tidak ditemukan di server`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const fileBuffer = fs.readFileSync(targetPath);
  const mimeType = filename.endsWith('.apk')
    ? 'application/vnd.android.package-archive'
    : 'application/octet-stream';

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
