# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.3.2] — 2026-07-26

### Alterado
- Gráficos SVG reescritos no estilo do Painel Fiber, muito mais legíveis: eixo Y com valores
  (compactos — `R$ 5k`, `1,2M`), eixo X com datas (`dd/mm`), grid horizontal tracejado,
  gradiente na área e **tooltip no hover** (via `<title>` por coluna/barra — mostra o valor
  cheio). Barras horizontais ganharam o valor ao lado e destaque de coluna no hover. Aspect
  ratio corrigido (o `preserveAspectRatio="none"` antigo achatava/esticava o traçado). As cores
  seguem a paleta acessível derivada da marca de cada loja — nada da cor do Fiber é hardcodado.

## [0.3.1] — 2026-07-25

### Corrigido
- Card de login/setup ficou estreito demais na reescrita da 0.3.0 (`max-width` caiu para
  `--fib-233` = 233px, apertando o título da loja em duas linhas). Voltou para 377px (largura do
  card do Painel Fiber, também Fibonacci: 233+144); o wizard de setup foi para 610px (377+233).

## [0.3.0] — 2026-07-25

### Adicionado
- **Painel reestruturado em 7 abas** (Visão Geral, Vendas, Produtos, Clientes, Tráfego & Ads,
  Custos & Margem, Sistema), espelhando a arquitetura do Painel Fiber. Antes só 3 blocos numa
  página única expunham 4 das 16 métricas; agora **todas as 16** têm lugar na UI.
- Topbar fixa com logo/nome da loja, alternador de tema claro/escuro (persistido em
  `localStorage`) e botão de sair; subbar fixa com as abas (navegação por setas do teclado,
  `role=tablist`, estado refletido no hash da URL).
- KPI cards no padrão do Fiber: rótulo uppercase com tracking, ícone, valor tabular e **delta
  vs período anterior** (verde/vermelho, invertido para gasto/CAC/descontos — subir é ruim).
  A variação vem de `comparar_periodos`, sem 2ª chamada de `kpis`.
- Blocos com os 3 estados padronizados: skeleton shimmer enquanto carrega, erro inline (um bloco
  quebrado não derruba a tela) e vazio com mensagem adequada ao contexto.
- Métrica indisponível agora **explica o que falta** ("conecte meta, ga4 para ver esta seção")
  em vez de simplesmente não aparecer.
- Carga por aba sob demanda (a aba só busca dados quando é aberta) e filtro de período por aba.
- Busca de produtos por texto e previsão de ruptura expostas na UI (já existiam na API/MCP).

### Alterado
- CSS reescrito sobre a **escala Fibonacci** (espaçamento/raio/fonte), como no Painel Fiber,
  com sombras em 3 níveis e `prefers-reduced-motion` respeitado. Diferença consciente: o Fiber
  carrega Montserrat/Poppins do Google Fonts; aqui a CSP é `default-src 'self'` (sem host
  externo), então o mesmo tratamento tipográfico (uppercase + tracking largo) é aplicado sobre
  a fonte do sistema.
- Favicon da página passa a usar o favicon detectado da loja.

## [0.2.2] — 2026-07-25

### Corrigido
- Resolução de logo/favicon `shopify://` ganhou um 2º nível de busca: em produção (Pinha) a
  referência exata salva no tema não batia com nenhum arquivo da loja (arquivo renomeado/
  substituído desde que o tema foi configurado — órfã). Agora, se a busca exata falhar, tenta
  achar por palavra-chave (`logo`/`favicon`) antes de desistir e cair pro avatar. Também
  adicionada allowlist (`/^[\w.-]+$/`) no nome do arquivo antes de montar a query GraphQL
  (achado do defensive-engineering-reviewer — risco baixo mas correção de 1 linha).

## [0.2.1] — 2026-07-25

### Corrigido
- Logo da loja gravado como `shopify://shop_images/<arquivo>` (referência interna do tema,
  não uma URL válida) não carregava no painel/login — `extrairIdentidade()` agora resolve essa
  referência pro CDN real via GraphQL Admin (`files`). Fallback defensivo: se a imagem falhar em
  runtime (URL quebrada/removida), cai pro avatar com a inicial da loja em vez de ficar vazio.
- Dependências com CVE crítico corrigidas: `@fastify/jwt` 9→10 (`fast-jwt` tinha bypass de auth
  via segredo HMAC vazio e confusão de cache trocando claims entre tokens — CVEs GHSA-gmvf-9v4p-v8jc/
  GHSA-rp9m-7r4c-75qg entre outros); `node-cron` 3→4 (CVE de `uuid` transitivo). `@fastify/static`
  removido (dependência não usada em lugar nenhum do código, tinha CVE alto de path traversal).
  Residual aceito: 1 CVE moderado transitivo (`@hono/node-server` via `@modelcontextprotocol/sdk`)
  é path-traversal específico de Windows — irrelevante no nosso deploy (Linux/Docker).

### Alterado
- Visual do painel/login realinhado ao padrão do Painel Fiber (referência real extraída via
  inspeção computada, não só olhando print): cards com sombra suave + raio 13px, botões em
  gradiente com sombra na cor da marca, títulos/labels uppercase com tracking largo, fundo com
  glow radial sutil na cor da marca — tudo via `color-mix()` sobre os tokens de marca existentes
  (mantém a auto-adequação de cor por loja, não hardcoda a cor do Fiber). Logo real (quando existe)
  não é mais forçado num quadrado — exibido no tamanho natural, sem cortar.

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
