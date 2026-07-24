// Meta Ads (Graph API) — popula ads_daily(platform='meta') e ads_entity_daily.
// A plataforma é DADO, não tabela: ligar Meta não exige DDL (ver 001_core.sql, ads_daily).
import { criarHttp } from '../core/http.js';

const VERSAO = 'v21.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

function cliente(ctx) {
  const c = ctx.cred();
  if (!c?.accessToken) throw new Error('credencial da Meta ausente (accessToken)');
  return criarHttp({
    base: BASE,
    log: ctx.log,
    // Token de sistema/usuário perto de expirar é trocado por um long-lived novo.
    aoRenovar: async () => {
      const appId = ctx.config.get('meta.appId');
      const appSecret = ctx.cred()?.appSecret;
      if (!appId || !appSecret) return null;   // sem app creds, não há como renovar
      try {
        const http = criarHttp({ base: BASE, log: ctx.log });
        const r = await http.get(`/oauth/access_token?grant_type=fb_exchange_token`
          + `&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}`
          + `&fb_exchange_token=${encodeURIComponent(c.accessToken)}`);
        if (!r?.access_token) return null;
        const expiresAt = r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null;
        ctx.cofre.gravar('meta', { kind: 'oauth2',
          payload: { ...c, accessToken: r.access_token }, accountRef: c.adAccountId, expiresAt });
        return {};   // headers não mudam (token vai no query string dos jobs)
      } catch { return null; }
    },
  });
}

const conta = (ctx) => {
  const id = String(ctx.cred()?.adAccountId ?? '').trim();
  return id.startsWith('act_') ? id : `act_${id}`;
};

// actions/action_values vêm como lista [{action_type, value}]. Somamos compras.
const somaCompra = (lista) => (lista ?? [])
  .filter(a => /purchase|omni_purchase|offsite_conversion.fb_pixel_purchase/.test(a.action_type ?? ''))
  .reduce((s, a) => s + Number(a.value ?? 0), 0);

async function insightsPorNivel(ctx, { level, tabela, modo }) {
  const http = cliente(ctx);
  const token = ctx.cred().accessToken;
  const cursor = ctx.lerCursor();
  const desde = modo === 'backfill'
    ? (ctx.config.get('meta.backfillDesde') || '2024-01-01')
    : (cursor || new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  const ate = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

  const campos = level === 'account'
    ? 'spend,impressions,clicks,actions,action_values'
    : 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values';
  const params = new URLSearchParams({
    level, fields: campos, time_increment: '1',
    time_range: JSON.stringify({ since: desde, until: ate }),
    limit: '500', access_token: token,
  });

  const insDaily = ctx.db.prepare(`INSERT INTO ads_daily
      (date, platform, spend, impressions, clicks, conversions, conversion_value, synced_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(date, platform) DO UPDATE SET spend=excluded.spend,
        impressions=excluded.impressions, clicks=excluded.clicks,
        conversions=excluded.conversions, conversion_value=excluded.conversion_value,
        synced_at=excluded.synced_at`);
  const insEntity = ctx.db.prepare(`INSERT INTO ads_entity_daily
      (date, platform, level, entity_id, entity_name, spend, impressions, clicks, conversions, conversion_value, synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(date, platform, level, entity_id) DO UPDATE SET entity_name=excluded.entity_name,
        spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks,
        conversions=excluded.conversions, conversion_value=excluded.conversion_value, synced_at=excluded.synced_at`);

  // Agrega por dia quando o nível é 'account' (uma linha por dia em ads_daily).
  const porDia = new Map();
  let total = 0, maiorData = cursor;
  let caminho = `/${conta(ctx)}/insights?${params}`;

  for await (const pagina of http.paginarLink(caminho, { pausaMs: 300 })) {
    for (const row of pagina?.data ?? []) {
      const dia = row.date_start;
      const spend = Number(row.spend ?? 0);
      const imp = Number(row.impressions ?? 0);
      const clk = Number(row.clicks ?? 0);
      const conv = somaCompra(row.actions);
      const val = somaCompra(row.action_values);
      if (tabela === 'entity') {
        insEntity.run(dia, 'meta', 'campaign', String(row.campaign_id ?? ''),
          row.campaign_name ?? null, spend, imp, clk, conv, val, new Date().toISOString());
      } else {
        const acc = porDia.get(dia) ?? { spend: 0, imp: 0, clk: 0, conv: 0, val: 0 };
        acc.spend += spend; acc.imp += imp; acc.clk += clk; acc.conv += conv; acc.val += val;
        porDia.set(dia, acc);
      }
      if (!maiorData || dia > maiorData) maiorData = dia;
      total++;
    }
  }

  if (tabela !== 'entity') {
    ctx.db.transaction(() => {
      for (const [dia, a] of porDia) {
        insDaily.run(dia, 'meta', a.spend, a.imp, a.clk, a.conv, a.val, new Date().toISOString());
      }
    })();
  }

  ctx.gravarCursor(maiorData, { registros: total });
  return { registros: total };
}

export default {
  name: 'meta',
  label: 'Meta Ads',
  auth: { kind: 'oauth2' },
  setup: {
    accessToken: { label: 'Access token (system/long-lived)', segredo: true, obrigatorio: true },
    adAccountId: { label: 'Ad Account ID', placeholder: 'act_123456789 ou 123456789', obrigatorio: true },
    appSecret: { label: 'App secret (para renovar o token)', segredo: true, obrigatorio: false },
  },

  async validate(ctx) {
    const http = cliente(ctx);
    const r = await http.get(`/${conta(ctx)}?fields=name,currency,account_status&access_token=${ctx.cred().accessToken}`);
    if (!r?.id && !r?.name) throw new Error('não foi possível ler a ad account (token/ID?)');
    return { conta: r.name, moeda: r.currency, status: r.account_status };
  },

  describeTables() {
    return [
      { tabela: 'ads_daily', origem: 'Meta Graph API (insights)', chave: 'date+platform',
        descricao: 'Gasto, impressões, cliques e conversões diárias do Meta Ads.' },
      { tabela: 'ads_entity_daily', origem: 'Meta Graph API (insights level=campaign)', chave: 'date+platform+level+entity_id',
        descricao: 'Métricas diárias por campanha do Meta Ads.' },
    ];
  },

  jobs: [
    { name: 'insights', schedule: '20 */3 * * *', run: (ctx, o) => insightsPorNivel(ctx, { level: 'account', tabela: 'daily', ...o }) },
    { name: 'campanhas', schedule: '40 */6 * * *', run: (ctx, o) => insightsPorNivel(ctx, { level: 'campaign', tabela: 'entity', ...o }) },
  ],
};
