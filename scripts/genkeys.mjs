#!/usr/bin/env node
// Gera as chaves de infraestrutura no formato exato que o storekit espera.
// Uso:  npm run genkeys >> .env   (ou:  node scripts/genkeys.mjs)
import crypto from 'node:crypto';

const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const b64 = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// DB_KEY: passphrase do SQLCipher (não precisa ser hex; usamos base64url forte).
// PII_KEY: PRECISA ser 64 hex (32 bytes) — validado em src/core/secrets.js.
const linhas = [
  `DB_KEY=${b64(32)}`,
  `PII_KEY=${hex(32)}`,
  `JWT_SECRET=${b64(48)}`,
  `MCP_TOKEN=${b64(32)}`,
];

// Sem argumentos: imprime as 4 linhas (pronto para `>> .env`).
process.stdout.write(linhas.join('\n') + '\n');
