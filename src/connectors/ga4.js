// Google Analytics 4 (Data API v1beta) via Service Account.
// Popula web_daily (sessões/usuários) e ads_daily(platform='google') com o
// custo de anúncio importado (advertiserAdCost) — o mesmo caminho do adspend-connector.
import crypto from 'node:crypto';
import { criarHttp } from '../core/http.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Assina um JWT de service account e troca por access_token (grant jwt-bearer).
async function tokenAcesso(ctx) {
  const c = ctx.cred();
  if (!c?.clientEmail || !c?.privateKey) throw new Error('credencial GA4 ausente (clientEmail/privateKey)');
  const chave = String(c.privateKey).replace(/\\n/g, '\n');
  const agora = Math.floor(Date.now() / 1000);
  const cabec = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: c.clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora, exp: agora + 3600,
  }));
  const assinatura = crypto.createSign('RSA-SHA256').update(`${cabec}.${claim}`).sign(chave, 'base64url');
  const jwt = `${cabec}.${claim}.${assinatura}`;

  const http = criarHttp({ base: 'https://oauth2.googleapis.com', log: ctx.log });
  const r = await http.post('/token', new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt,
  }).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  if (!r?.access_token) throw new Error('GA4: falha ao obter access_token do service account');
  return r.access_token;
}

async function runReport(ctx, { metrics, dimensions = [{ name: 'date' }], since, until }) {
  const token = await tokenAcesso(ctx);
  const prop = String(ctx.cred().propertyId).replace(/^properties\//, '');
  const http = criarHttp({
    base: 'https://analyticsdata.googleapis.com/v1beta',
    headers: { authorization: `Bearer ${token}` }, log: ctx.log, timeoutMs: 60_000,
  });
  return http.post(`/properties/${prop}:runReport`, {
    dimensions, metrics,
    dateRanges: [{ startDate: since, endDate: until }],
    limit: 100000,
  });
}

const num = (v) => Number(v ?? 0);
const dia = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

async function syncTrafego(ctx, { modo }) {
  const cursor = ctx.lerCursor();
  const since = modo === 'backfill'
    ? (ctx.config.get('ga4.backfillDesde') || '2024-01-01')
    : (cursor || new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  const until = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

  const rep = await runReport(ctx, {
    since, until,
    metrics: [
      { name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' },
      { name: 'conversions' }, { name: 'advertiserAdCost' },
      { name: 'advertiserAdClicks' }, { name: 'advertiserAdImpressions' },
    ],
  });

  const insWeb = ctx.db.prepare(`INSERT INTO web_daily (date, sessions, users, engaged_sessions, conversions, synced_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET sessions=excluded.sessions,
      users=excluded.users, engaged_sessions=excluded.engaged_sessions,
      conversions=excluded.conversions, synced_at=excluded.synced_at`);
  const insAds = ctx.db.prepare(`INSERT INTO ads_daily
      (date, platform, spend, impressions, clicks, conversions, conversion_value, synced_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(date, platform) DO UPDATE SET spend=excluded.spend,
        impressions=excluded.impressions, clicks=excluded.clicks,
        conversions=excluded.conversions, synced_at=excluded.synced_at`);

  let total = 0, maiorData = cursor;
  const agora = new Date().toISOString();
  ctx.db.transaction(() => {
    for (const row of rep?.rows ?? []) {
      const d = dia(row.dimensionValues?.[0]?.value ?? '');
      const m = (row.metricValues ?? []).map(x => num(x.value));
      const [sessions, users, engaged, conv, adCost, adClicks, adImpr] = m;
      insWeb.run(d, Math.round(sessions), Math.round(users), Math.round(engaged), conv, agora);
      if (adCost > 0 || adClicks > 0) {
        insAds.run(d, 'google', adCost, Math.round(adImpr), Math.round(adClicks), conv, 0, agora);
      }
      if (!maiorData || d > maiorData) maiorData = d;
      total++;
    }
  })();

  ctx.gravarCursor(maiorData, { registros: total });
  return { registros: total };
}

export default {
  name: 'ga4',
  label: 'Google Analytics 4',
  auth: { kind: 'oauth2' },
  setup: {
    propertyId: { label: 'GA4 Property ID', placeholder: '123456789', obrigatorio: true },
    clientEmail: { label: 'Service account client_email', obrigatorio: true },
    privateKey: { label: 'Service account private_key', segredo: true, obrigatorio: true },
  },

  async validate(ctx) {
    const rep = await runReport(ctx, {
      metrics: [{ name: 'sessions' }], dimensions: [],
      since: '7daysAgo', until: 'today',
    });
    if (!rep || rep.error) throw new Error(rep?.error?.message || 'GA4: runReport falhou na validação');
    return { propriedade: ctx.cred().propertyId };
  },

  describeTables() {
    return [
      { tabela: 'web_daily', origem: 'GA4 Data API', chave: 'date',
        descricao: 'Sessões, usuários e sessões engajadas por dia (GA4).' },
      { tabela: 'ads_daily', origem: 'GA4 advertiserAdCost', chave: 'date+platform',
        descricao: 'Custo/cliques/impressões de anúncio importados no GA4 (platform=google).' },
    ];
  },

  jobs: [
    { name: 'trafego', schedule: '15 */6 * * *', run: syncTrafego },
  ],
};
