-- Núcleo do storekit.
-- Cripto: o arquivo inteiro é cifrado por SQLCipher; PII em colunas *_enc com
-- AES-256-GCM (iv|tag|ciphertext) e identificadores pesquisáveis em *_hash (HMAC-SHA256).

-- ---- configuração e credenciais -------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,          -- JSON
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  connector     TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,        -- oauth2 | apikey
  payload_enc   BLOB NOT NULL,        -- AES-GCM: {accessToken, refreshToken, ...}
  account_ref   TEXT,                 -- conta/propriedade escolhida no wizard
  status        TEXT NOT NULL,        -- nao_configurado|conectado|erro|token_expirado
  expires_at    TEXT,
  last_check_at TEXT,
  last_error    TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,        -- bcrypt
  role          TEXT NOT NULL DEFAULT 'viewer',
  created_at    TEXT NOT NULL
);

-- ---- estado dos jobs -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  source        TEXT PRIMARY KEY,
  last_cursor   TEXT,
  last_run      TEXT,
  last_status   TEXT,                 -- ok | warn | error
  records       INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS job_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  connector   TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,
  records     INTEGER DEFAULT 0,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_runs ON job_runs(connector, started_at DESC);

-- ---- pedidos: UMA tabela (o sistema atual tem duas, com R$10k de divergência) ----
CREATE TABLE IF NOT EXISTS orders (
  id                 INTEGER PRIMARY KEY,
  order_name         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  processed_at       TEXT,
  cancelled_at       TEXT,
  financial_status   TEXT,
  fulfillment_status TEXT,
  currency           TEXT,
  total_price        REAL,
  subtotal_price     REAL,
  total_discounts    REAL,
  total_tax          REAL,
  total_shipping     REAL,
  units              INTEGER NOT NULL DEFAULT 0,
  cmv                REAL,
  cmv_done           INTEGER NOT NULL DEFAULT 0,
  source_name        TEXT,
  utm_source         TEXT,
  utm_medium         TEXT,
  utm_campaign       TEXT,
  j_source           TEXT,
  j_medium           TEXT,
  j_done             INTEGER NOT NULL DEFAULT 0,
  discount_codes     TEXT,            -- '' = sem cupom | NULL = não extraído
  customer_id_enc    BLOB,
  customer_hash      TEXT,
  landing_site_enc   BLOB,
  referring_site_enc BLOB,
  synced_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_agg  ON orders(created_at, financial_status, cancelled_at);
CREATE INDEX IF NOT EXISTS idx_orders_cust ON orders(customer_hash);
CREATE INDEX IF NOT EXISTS idx_orders_cmv  ON orders(cmv_done) WHERE cmv_done = 0;

CREATE TABLE IF NOT EXISTS order_items (
  id             INTEGER PRIMARY KEY,
  order_id       INTEGER NOT NULL,
  product_id     INTEGER,
  variant_id     INTEGER,
  sku            TEXT,
  title          TEXT,
  variant_title  TEXT,
  quantity       INTEGER NOT NULL DEFAULT 0,
  price          REAL,
  total_discount REAL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

-- ---- catálogo --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                  INTEGER PRIMARY KEY,
  title               TEXT,
  handle              TEXT,
  url                 TEXT,
  description_text    TEXT,
  vendor              TEXT,
  product_type        TEXT,
  status              TEXT,
  tags                TEXT,
  price_min           REAL,
  price_max           REAL,
  total_inventory     INTEGER,
  image_url           TEXT,
  published_at        TEXT,
  shopify_updated_at  TEXT,
  synced_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_handle ON products(handle);

CREATE TABLE IF NOT EXISTS product_variants (
  id                 INTEGER PRIMARY KEY,
  product_id         INTEGER,
  title              TEXT,
  sku                TEXT,
  price              REAL,
  compare_at_price   REAL,
  unit_cost          REAL,            -- custo real: base do CMV
  position           INTEGER,
  option1 TEXT, option2 TEXT, option3 TEXT,
  inventory_quantity INTEGER,
  inventory_policy   TEXT,
  barcode            TEXT,
  synced_at          TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku     ON product_variants(sku);

-- ---- anúncios: plataforma é DADO, não tabela -------------------------------
-- Ligar TikTok Ads amanhã = 1 conector e zero DDL.
CREATE TABLE IF NOT EXISTS ads_daily (
  date             TEXT NOT NULL,
  platform         TEXT NOT NULL,     -- meta | google | tiktok | ...
  spend            REAL NOT NULL DEFAULT 0,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0,
  synced_at        TEXT NOT NULL,
  PRIMARY KEY (date, platform)
);

-- ---- metas e custos --------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  year      INTEGER NOT NULL,
  month     INTEGER NOT NULL,
  metric    TEXT NOT NULL,            -- total | ch_meta | ch_google | ...
  value     REAL NOT NULL DEFAULT 0,
  manual    INTEGER NOT NULL DEFAULT 0,   -- 1 = editada no painel, planilha não sobrescreve
  synced_at TEXT,
  PRIMARY KEY (year, month, metric)
);

CREATE TABLE IF NOT EXISTS cost_lines (
  month     TEXT NOT NULL,            -- 'YYYY-MM-01'
  channel   TEXT NOT NULL DEFAULT 'geral',
  grupo     TEXT NOT NULL,            -- cmv|imposto|variavel_pedido|fixo|marketing
  linha     TEXT NOT NULL,
  base      TEXT NOT NULL,            -- pct_receita|reais_por_pedido|reais_por_unidade|fixo_mes|investimento
  valor     REAL NOT NULL DEFAULT 0,
  manual    INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT,
  PRIMARY KEY (month, channel, grupo, linha)
);

-- ---- reviews: loja e produto na mesma tabela (product_id NULL = a loja) -----
CREATE TABLE IF NOT EXISTS reviews_monthly (
  product_id    INTEGER,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  avg_rating    REAL,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_uk
  ON reviews_monthly(COALESCE(product_id, -1), year, month);
