#!/bin/sh
set -e

# Jalankan aplikasi langsung dengan environment variable yang telah disediakan oleh Coolify / Docker
exec ptsp-wa-bot "$@"
