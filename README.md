# storekit

**Painel + ETL + MCP + RAG multi-loja Shopify numa única imagem Docker — uma métrica, uma implementação, três superfícies.**
**Panel + ETL + MCP + RAG multi-store Shopify in a single Docker image — one metric, one implementation, three surfaces.**

[![version](https://img.shields.io/badge/version-0.4.0-blue.svg)](./CHANGELOG.md)
[![tools](https://img.shields.io/badge/MCP%20tools-18-red.svg)](#as-18-tools--the-18-tools)
[![node](https://img.shields.io/badge/node-20+-brightgreen.svg)](https://nodejs.org/)
[![license](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![mcp](https://img.shields.io/badge/MCP-Streamable%20HTTP-purple.svg)](https://modelcontextprotocol.io/)
[![linkedin](https://img.shields.io/badge/LinkedIn-Rafael%20Tondin-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rafael-tondin-635a58293/)
[![instagram-riwer](https://img.shields.io/badge/Instagram-%40riwerlabs-E4405F?logo=instagram&logoColor=white)](https://instagram.com/riwerlabs)
[![instagram-rafael](https://img.shields.io/badge/Instagram-%40rafaeltondin-E4405F?logo=instagram&logoColor=white)](https://instagram.com/rafaeltondin)

> 🇧🇷 **Português** em cima · 🇬🇧 **English** on the bottom

---

## 🇧🇷 Português

### O que é

`storekit` conecta uma loja (Shopify, Meta Ads, GA4) e serve os **mesmos números** por três superfícies geradas de **uma única definição de métrica**: painel web server-rendered, API REST e servidor **Model Context Protocol** (MCP) para agentes de IA como Claude Code, Claude Desktop ou Cursor.

Um fato, uma fonte; uma métrica, uma implementação — nunca duas queries calculando "a mesma coisa" e divergindo.

### Por que isso importa?

Dashboards de e-commerce costumam ter a mesma métrica implementada três vezes — uma no painel, uma na API, uma no que o agente de IA consulta — e elas divergem. O faturamento do gráfico não bate com o do endpoint, que não bate com o que o bot respondeu.

`storekit` mata isso na raiz: cada métrica é declarada **uma vez** num registry (`src/metrics/*.js`) e daí derivam sozinhas a rota REST, a tool MCP e o verbete de glossário. O agente de IA responde **exatamente** o número do painel, porque é o mesmo código.

- **Sem build step** — UI server-rendered, um processo, cold start baixo.
- **Cifrado at-rest** — banco SQLCipher; PII em AES-256-GCM; credenciais da loja no banco, nunca em env (env vaza em `docker inspect` e logs de orquestrador).
- **Resiliente** — retry/backoff/429, renovação de token, circuit breaker por job, cursor incremental que sobrevive a erro no meio da sincronização.
- **Multi-loja** — a mesma imagem veste-se com a identidade visual de qualquer loja; nada é hardcodado.
- **Extensível** — conector é um plugin com `validate()` + `jobs`; ligar um canal novo é 1 arquivo, zero DDL.

### Instalação

#### Opção 1 — Docker Compose (recomendado)

```bash
git clone https://github.com/rafaeltondin/storekit.git
cd storekit
cp .env.example .env
npm run genkeys >> .env          # gera DB_KEY, PII_KEY, JWT_SECRET, MCP_TOKEN
docker compose up -d             # painel em http://localhost:3000
```

Abra o painel, crie o administrador e cole o domínio `.myshopify.com` + access token. O painel lê a identidade visual da loja e se veste com ela; as métricas aparecem sozinhas.

#### Opção 2 — Local (Node ≥ 20)

```bash
git clone https://github.com/rafaeltondin/storekit.git
cd storekit
npm ci
npm run genkeys >> .env
DATA_DIR=./data node src/main.js
```

### Configuração no cliente MCP

O MCP fala **Streamable HTTP (stateless)** em `POST /mcp`, autenticado por `MCP_TOKEN` (`Authorization: Bearer` ou `x-api-key`, comparação timing-safe).

#### Claude Code / Claude Desktop (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "storekit-minhaloja": {
      "type": "http",
      "url": "https://minhaloja.exemplo.com/mcp",
      "headers": { "Authorization": "Bearer SEU_MCP_TOKEN" }
    }
  }
}
```

Modo stdio para Desktop e outros detalhes em [`docs/mcp.md`](./docs/mcp.md).

### Sanidade em 1 comando

Depois de configurar, no cliente MCP peça:

> "Rode `status_sync` do storekit."

Se responder com a data da última sincronização de cada conector, o server está saudável e falando com o banco.

### As 18 tools — The 18 tools

Cada métrica ativa vira uma tool; mais `descrever_painel` e `glossario`. Uma métrica só aparece se os conectores de que ela depende estiverem conectados — métrica ausente da lista significa integração não conectada, **nunca** um número estimado.

#### 📊 Vendas & faturamento

| Tool | O que faz |
|---|---|
| `kpis` | Faturamento, pedidos, ticket médio e ROAS do período (soma de pedidos não cancelados, exclui "voided") |
| `vendas_diarias` | Série dia a dia, agrupada pelo dia civil da loja (não pelo dia UTC) |
| `vendas_por_canal` | De qual canal de marketing veio a venda (atribuição do customer journey, cai pra UTM do landing) |
| `vendas_por_origem` | Agrupa por `source_name` — o canal técnico da Shopify, complementar ao de marketing |
| `mais_vendidos` | Ranking de produtos por unidade (só pedidos pagos ou parcialmente reembolsados) |
| `comparar_periodos` | Compara o período com a janela anterior de mesmo tamanho — alimenta os deltas do painel |

#### 📦 Produtos, catálogo & estoque

| Tool | O que faz |
|---|---|
| `catalogo` | Visão geral do catálogo — quantos produtos, preços, estoque |
| `busca_produtos` | Busca textual (índice FTS5, prefixo por token, ordenada por relevância bm25) |
| `margem_por_produto` | CMV = Σ(qtd × custo da variante); margem = receita − CMV; cobertura de custo |
| `previsao_ruptura` | Dias até ruptura = estoque ÷ velocidade de venda real (pedidos pagos na janela) |

#### 👥 Clientes

| Tool | O que faz |
|---|---|
| `ltv_coortes` | Clientes novos vs recorrentes e taxa de recompra (novo = 1ª compra caiu no período) |

#### 🌐 Tráfego & Ads

| Tool | O que faz |
|---|---|
| `ads_plataformas` | Gasto e ROAS por plataforma (ROAS aqui usa o valor de conversão reportado pela plataforma) |
| `trafego_web` | Série diária de sessões/tráfego web via GA4 |

#### 🎯 Metas & qualidade

| Tool | O que faz |
|---|---|
| `metas` | Metas do ano (tabela `goals`; editar no painel marca manual e a planilha não sobrescreve) |
| `qualidade_dado` | Diagnóstico de completude/consistência dos dados sincronizados |
| `status_sync` | Data da última sincronização de cada conector (não exige nenhum conector ligado) |

#### 🧭 Meta (dicionário)

| Tool | O que faz |
|---|---|
| `descrever_painel` | Dicionário de dados — o que é cada valor, moeda, fuso, tabelas, regras. Chame antes de interpretar |
| `glossario` | Fórmula de cada métrica ativa, composta em runtime (nunca prosa escrita à mão) |

### Modos de operação (ROLE)

| ROLE | Faz |
|---|---|
| `all` (padrão) | painel + API + MCP + ETL |
| `web` | painel + API + MCP (sem agendador) |
| `worker` | só ETL (agendador) |

Separar `web` de `worker` é decisão de operação, não de código — mesma imagem.

### Conectores

| Conector | Estado | Popula |
|---|---|---|
| Shopify | estável | orders, order_items, products, product_variants (custo/CMV) |
| Meta Ads | beta | ads_daily (platform=meta), ads_entity_daily |
| GA4 | beta | ads_daily (advertiserAdCost), sessões web |

Cada conector declara `validate()` (uma chamada real à API antes de virar "conectado" — não basta guardar o token), `jobs` (com `schedule` cron e dependência `after`) e `describeTables()`. Veja [`CONTRIBUTING.md`](./CONTRIBUTING.md) para criar o seu.

### Configuração (env)

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

### Segurança

- Banco **SQLCipher** cifrado at-rest; PII em **AES-256-GCM**; senhas com **bcrypt**.
- Credenciais da loja moram cifradas no banco, **nunca em env** (env vaza em `docker inspect` e logs de orquestrador).
- `MCP_TOKEN` com comparação timing-safe; `JWT_SECRET` recusa boot com o valor default em produção.
- Rate-limit no Fastify; regra do servidor: **nunca inventar número** — tool vazia = não há dado no período.

### Desenvolvimento

```bash
npm ci
npm test          # node --test (contrato: todo conector/métrica é validado)
npm run lint
```

### Contribuindo

Bugs, features ou conectores novos: abra uma issue ou PR. Regra de ouro: **toda métrica é declarada uma vez** no registry (`src/metrics/`) — nunca implemente a mesma métrica em dois lugares.

### Licença

MIT. Ver [LICENSE](./LICENSE).

---

## 🇬🇧 English

### What it is

`storekit` connects a store (Shopify, Meta Ads, GA4) and serves the **same numbers** across three surfaces generated from **a single metric definition**: a server-rendered web panel, a REST API, and a **Model Context Protocol** (MCP) server for AI agents like Claude Code, Claude Desktop, or Cursor.

One fact, one source; one metric, one implementation — never two queries computing "the same thing" and drifting apart.

### Why it matters

E-commerce dashboards tend to implement the same metric three times — one in the panel, one in the API, one in whatever the AI agent queries — and they drift. The revenue on the chart doesn't match the endpoint, which doesn't match what the bot answered.

`storekit` kills that at the root: every metric is declared **once** in a registry (`src/metrics/*.js`), and from it the REST route, the MCP tool, and the glossary entry derive themselves. The AI agent returns **exactly** the panel's number, because it's the same code.

- **No build step** — server-rendered UI, single process, low cold start.
- **Encrypted at-rest** — SQLCipher database; PII in AES-256-GCM; store credentials in the DB, never in env (env leaks via `docker inspect` and orchestrator logs).
- **Resilient** — retry/backoff/429, token refresh, per-job circuit breaker, incremental cursor that survives a mid-sync error.
- **Multi-store** — the same image dresses itself in any store's visual identity; nothing is hardcoded.
- **Extensible** — a connector is a plugin with `validate()` + `jobs`; wiring a new channel is 1 file, zero DDL.

### Install

#### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/rafaeltondin/storekit.git
cd storekit
cp .env.example .env
npm run genkeys >> .env          # generates DB_KEY, PII_KEY, JWT_SECRET, MCP_TOKEN
docker compose up -d             # panel at http://localhost:3000
```

Open the panel, create the admin user, and paste the `.myshopify.com` domain + access token. The panel reads the store's visual identity and dresses itself with it; the metrics show up on their own.

#### Option 2 — Local (Node ≥ 20)

```bash
git clone https://github.com/rafaeltondin/storekit.git
cd storekit
npm ci
npm run genkeys >> .env
DATA_DIR=./data node src/main.js
```

### MCP client config

The MCP speaks **Streamable HTTP (stateless)** at `POST /mcp`, authenticated with `MCP_TOKEN` (`Authorization: Bearer` or `x-api-key`, timing-safe comparison).

Claude Code / Claude Desktop (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "storekit-mystore": {
      "type": "http",
      "url": "https://mystore.example.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}
```

stdio mode and more in [`docs/mcp.md`](./docs/mcp.md).

### The 18 tools — summary

| Category | Count | Tools |
|---|--:|---|
| **Sales & revenue** | 6 | `kpis`, `vendas_diarias`, `vendas_por_canal`, `vendas_por_origem`, `mais_vendidos`, `comparar_periodos` |
| **Products, catalog & stock** | 4 | `catalogo`, `busca_produtos`, `margem_por_produto`, `previsao_ruptura` |
| **Customers** | 1 | `ltv_coortes` |
| **Traffic & Ads** | 2 | `ads_plataformas`, `trafego_web` |
| **Goals & data quality** | 3 | `metas`, `qualidade_dado`, `status_sync` |
| **Meta (data dictionary)** | 2 | `descrever_painel`, `glossario` |

A metric only appears as a tool when the connectors it depends on are connected — an absent metric means the integration isn't connected, **never** an estimated number.

### Operation modes (ROLE)

| ROLE | Runs |
|---|---|
| `all` (default) | panel + API + MCP + ETL |
| `web` | panel + API + MCP (no scheduler) |
| `worker` | ETL only (scheduler) |

Splitting `web` from `worker` is an ops decision, not a code one — same image.

### Security

Designed to keep customer data safe by default:

- **SQLCipher** at-rest; PII in **AES-256-GCM**; passwords with **bcrypt**.
- Store credentials live encrypted in the DB, **never in env**.
- `MCP_TOKEN` timing-safe comparison; `JWT_SECRET` refuses to boot with the default in production.
- Fastify rate-limit; server rule: **never invent a number** — an empty tool means no data in the period.

### Development

```bash
npm ci
npm test          # node --test (contract: every connector/metric is validated)
npm run lint
```

### License

MIT. See [LICENSE](./LICENSE).

---

## Contributing / Contribuindo

PRs welcome. Every metric is declared **once** in the registry (`src/metrics/`) — never implement the same metric twice.
Contribuições são bem-vindas. Toda métrica é declarada **uma vez** no registry (`src/metrics/`) — nunca implemente a mesma métrica em dois lugares.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## Author / Autor

**Rafael Tondin** — Founder @ [RiwerLabs](https://riwerlabs.com)
[LinkedIn](https://www.linkedin.com/in/rafael-tondin-635a58293/) · [GitHub](https://github.com/rafaeltondin) · Instagram: [@rafaeltondin](https://instagram.com/rafaeltondin) · [@riwerlabs](https://instagram.com/riwerlabs)

Bugs, features, ou parceria — abra uma issue, mande DM no Instagram ou entre em contato pelo LinkedIn.

---

*Built for the e-commerce & AI community. Feedback via GitHub Issues.*
