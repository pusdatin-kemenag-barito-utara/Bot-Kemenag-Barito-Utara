-- Migration 002: Hapus tabel log webhook n8n karena sistem n8n dinonaktifkan
DROP TABLE IF EXISTS wa_webhook_logs CASCADE;
