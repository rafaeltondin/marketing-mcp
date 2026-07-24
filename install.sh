#!/usr/bin/env bash
# storekit — instalação zero-a-painel. Idempotente: rode quantas vezes quiser.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> storekit install"

# 1. .env com chaves geradas (não sobrescreve o que já existe).
if [ ! -f .env ]; then
  echo "==> gerando .env com chaves novas"
  cp .env.example .env
  # substitui as 4 linhas de chave pelas geradas
  KEYS="$(node scripts/genkeys.mjs)"
  while IFS='=' read -r nome valor; do
    [ -z "$nome" ] && continue
    # escapa & e / para o sed
    esc=$(printf '%s' "$valor" | sed -e 's/[&/\]/\\&/g')
    sed -i "s|^${nome}=.*|${nome}=${esc}|" .env
  done <<< "$KEYS"
  echo "==> .env criado (chaves geradas)"
else
  echo "==> .env já existe — mantido"
fi

# 2. Sobe via docker compose se disponível; senão, instrui modo local.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "==> subindo com docker compose"
  docker compose up -d --build
  echo "==> pronto: http://localhost:${PORT:-3000}"
else
  echo "==> docker compose indisponível — modo local:"
  echo "    npm ci && set -a && . ./.env && set +a && DATA_DIR=./data node src/main.js"
fi
