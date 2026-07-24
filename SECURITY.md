# Política de segurança

## Reportar vulnerabilidade

Não abra issue pública. Envie e-mail para o mantenedor com detalhes e um PoC mínimo.
Resposta esperada em até 72h.

## Modelo de ameaça

O que a criptografia do storekit **protege**:
- Dump do disco / roubo do arquivo `store.db` — o banco inteiro é cifrado por SQLCipher.
- `docker inspect` / logs do orquestrador — credenciais vivem cifradas no banco, nunca em env.
- Leitura casual do banco — PII de cliente em colunas `*_enc` (AES-256-GCM); identificadores
  pesquisáveis em `*_hash` (HMAC-SHA256, permite `COUNT DISTINCT` sem revelar o valor).

O que **não** protege (fora do escopo da cripto at-rest):
- RCE no processo com as chaves em memória.
- Comprometimento do host com acesso às variáveis de ambiente do processo.

## Chaves e rotação

- `DB_KEY` (SQLCipher), `PII_KEY` (AES/HMAC), `JWT_SECRET`, `MCP_TOKEN` — gere com `npm run genkeys`.
- **Nunca** interpole segredo em linha de comando (fica no histórico/log). Use env do
  orquestrador ou arquivo `chmod 600`.
- Rotação de `DB_KEY`: `PRAGMA rekey` com backup do banco antes.
- Rotação de `PII_KEY`: **quebra** `customer_hash` (contagem histórica de clientes). Requer
  re-hash de todas as linhas; planeje antes de trocar.
- Rotação de `MCP_TOKEN`: a implementação aceita comparação timing-safe; troque via env e
  reinicie. Para zero-downtime, rode dois processos na janela de troca.

## Boas práticas de deploy

- Sempre atrás de TLS. Com HTTP puro, `COOKIE_SECURE=false` (só em rede local confiável).
- Defina `MCP_TOKEN` — sem ele o `/mcp` fica aberto.
- Defina `JWT_SECRET` — o boot recusa subir em produção com o valor default.
- Rode como non-root (a imagem já usa `USER node`).
