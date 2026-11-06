#!/bin/bash
set -euo pipefail
docker compose up -d --wait
bun run migration:run
exec bun run start:dev
