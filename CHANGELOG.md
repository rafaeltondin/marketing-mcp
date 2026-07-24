# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.2.0] — 2026-07-24

### Adicionado
- Empacotamento open-source: README, LICENSE (MIT), CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, `.env.example`, CI (GitHub Actions), ESLint/Prettier.
- `scripts/genkeys.mjs` (`npm run genkeys`) e `install.sh` para setup zero-a-painel.
- `docker-compose.yml` de referência com serviços `web` e `worker` separados.
- Conector **Meta Ads** (`connectors/meta.js`) populando `ads_daily` e `ads_entity_daily`.
- Conector **GA4** (`connectors/ga4.js`) populando `ads_daily` (advertiserAdCost) e sessões.
- Busca de produtos por texto (SQLite FTS5) indexada no job de catálogo; métrica/tool `busca_produtos`.
- Métricas novas: `comparar_periodos`, `margem_por_produto`, `previsao_ruptura`, `vendas_por_origem`, `ltv_coortes`, `qualidade_dado`, `metas`.
- Endpoints `/ready` (readiness), `/metrics` (Prometheus) e `/openapi.json` (gerado do registry).
- Gráficos SVG no painel (usam a paleta acessível derivada da marca) e KPIs de ROAS/CAC/margem.
- Tabela `variant_cost_history` (custo por data — CMV não muda retroativamente) e `audit_log`.
- Índice `order_items(variant_id)`; `PRAGMA user_version`; retenção de `job_runs`.

### Segurança
- Boot recusa `JWT_SECRET` default em produção.
- Validação anti-SSRF do domínio da loja (`*.myshopify.com`).
- Headers de segurança (CSP com nonce, HSTS, X-Frame-Options, no-sniff) no painel.
- Redação de segredo em `last_error` de conector.

### Corrigido
- Graceful shutdown aguarda job em andamento antes de fechar o banco (evitava risco de corrupção).

## [0.1.2] — 2026-07 (pré-open-source)
- Núcleo: registry único (REST+MCP+glossário), conector Shopify (orders/catalog/cost/cmv), cripto SQLCipher+AES-GCM, derivação de tema OKLCH/WCAG, UI server-rendered.
