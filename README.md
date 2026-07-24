# storekit

**Painel + ETL + MCP + RAG multi-loja Shopify numa imagem Docker.**

storekit conecta uma loja (Shopify, Meta Ads, GA4) e serve os mesmos números por
três superfícies geradas de **uma única definição de métrica**: painel web, API REST
e servidor MCP para agentes de IA. Um fato, uma fonte; uma métrica, uma implementação —
nunca duas queries calculando "a mesma coisa" e divergindo.

- **Sem build step** — UI server-rendered, um processo, cold start baixo.
- **Cifrado at-rest** — banco SQLCipher; PII em AES-256-GCM; credenciais no banco, nunca em env.
- **Resiliente** — retry/backoff/429, renovação de token, circuit breaker por job, cursor incremental que sobrevive a erro.
- **Extensível** — conector é um plugin com `validate()` + `jobs`; ligar um canal novo é 1 arquivo, zero DDL.

## Quickstart (3 comandos)

```bash
cp .env.example .env
npm run genkeys >> .env          # gera DB_KEY, PII_KEY, JWT_SECRET, MCP_TOKEN
docker compose up -d             # painel em http://localhost:3000
```

Abra o painel, crie o administrador e cole o domínio `.myshopify.com` + access token.
O painel lê a identidade visual da loja e se veste com ela; as métricas aparecem sozinhas.

Sem Docker:

```bash
npm ci
node -e "import('./scripts/genkeys.mjs')"   # ou: npm run genkeys
DATA_DIR=./data node src/main.js
```

## Conectores

| Conector | Estado | Popula |
|---|---|---|
| Shopify | estável | orders, order_items, products, product_variants (custo/CMV) |
| Meta Ads | beta | ads_daily (platform=meta), ads_entity_daily |
| GA4 | beta | ads_daily (advertiserAdCost), sessões |

Cada conector declara `validate()` (uma chamada real à API antes de virar "conectado"),
`jobs` (com `schedule` cron e dependência `after`) e `describeTables()`. Veja
`CONTRIBUTING.md` para criar o seu.

## MCP

Endpoint `POST /mcp` (Streamable HTTP, stateless). Autentica por `MCP_TOKEN`
(`Authorization: Bearer` ou `x-api-key`). Cada métrica ativa vira uma tool; mais
`descrever_painel` (dicionário de dados) e `glossario`. As tools respondem os
**mesmos números** do painel — é o mesmo registry.

Para Claude Desktop, veja `docs/mcp.md` (modo HTTP e stdio).

## Modos de operação (ROLE)

| ROLE | Faz |
|---|---|
| `all` (padrão) | painel + API + MCP + ETL |
| `web` | painel + API + MCP (sem agendador) |
| `worker` | só ETL (agendador) |

Separar `web` de `worker` é decisão de operação, não de código — mesma imagem.

## Configuração (env)

Só infraestrutura vai em env; a configuração da loja vive no banco (preenchida pelo wizard).

| Variável | Obrigatória | Padrão |
|---|---|---|
| `DB_KEY` | sim | — (chave do SQLCipher) |
| `PII_KEY` | sim | — (64 hex = 32 bytes, AES-256-GCM) |
| `JWT_SECRET` | em produção | — (recusa boot com o default) |
| `MCP_TOKEN` | recomendada | — (sem ele, `/mcp` fica aberto) |
| `ROLE` | não | `all` |
| `TENANT` | não | `default` |
| `DATA_DIR` | não | `/data` |
| `PORT` | não | `3000` |
| `LOG_LEVEL` | não | `info` |
| `COOKIE_SECURE` | não | `true` (use `false` só em HTTP local) |

## Desenvolvimento

```bash
npm ci
npm test          # node --test (contrato: todo conector/métrica é validado)
npm run lint
```

## Licença

MIT — veja [LICENSE](LICENSE).
