-- Extensões v0.2.0: índice faltante, histórico de custo, auditoria, ads por
-- entidade, e busca de produtos por texto (FTS5).

-- O CMV faz lookup por variante e não havia índice (só product_id).
CREATE INDEX IF NOT EXISTS idx_items_variant ON order_items(variant_id);

-- Custo por data: o CMV de um pedido antigo não pode mudar quando o custo atual muda.
CREATE TABLE IF NOT EXISTS variant_cost_history (
  variant_id     INTEGER NOT NULL,
  effective_date TEXT NOT NULL,        -- 'YYYY-MM-DD' a partir de quando este custo vale
  unit_cost      REAL NOT NULL,
  synced_at      TEXT NOT NULL,
  PRIMARY KEY (variant_id, effective_date)
);

-- Auditoria de ações sensíveis (login, conectar/remover conector, disparar sync).
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  ator    TEXT,                        -- username ou 'sistema'
  acao    TEXT NOT NULL,
  detalhe TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);

-- Anúncios por entidade (campanha/adset/ad) — a agregação diária fica em ads_daily.
CREATE TABLE IF NOT EXISTS ads_entity_daily (
  date             TEXT NOT NULL,
  platform         TEXT NOT NULL,
  level            TEXT NOT NULL,      -- campaign | adset | ad
  entity_id        TEXT NOT NULL,
  entity_name      TEXT,
  spend            REAL NOT NULL DEFAULT 0,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0,
  synced_at        TEXT NOT NULL,
  PRIMARY KEY (date, platform, level, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_ads_entity_date ON ads_entity_daily(date, platform);

-- Busca de produtos por texto. FTS5 standalone: rowid = product_id, populado
-- pelo job de catálogo. remove_diacritics 2 = "camiseta" acha "camisêta".
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  title, description, tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

PRAGMA user_version = 2;
