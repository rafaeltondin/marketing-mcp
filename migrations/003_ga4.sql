-- Tráfego web (GA4). O custo de anúncio importado (advertiserAdCost) vai para
-- ads_daily(platform='google'); sessões/usuários ficam aqui.
CREATE TABLE IF NOT EXISTS web_daily (
  date             TEXT PRIMARY KEY,
  sessions         INTEGER NOT NULL DEFAULT 0,
  users            INTEGER NOT NULL DEFAULT 0,
  engaged_sessions INTEGER NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  synced_at        TEXT NOT NULL
);

PRAGMA user_version = 3;
