// Métricas de anúncios e tráfego. Lêem ads_daily/web_daily — populadas pelos
// conectores Meta e GA4. Retornam vazio (não erro) enquanto não há dado.
export default [
  {
    key: 'ads_plataformas',
    title: 'Anúncios por plataforma',
    descricao: 'Gasto, impressões, cliques e conversões por plataforma de anúncio no período (Meta, Google...).',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'Soma ads_daily por platform. ROAS aqui usa o valor de conversão REPORTADO pela plataforma (não a receita Shopify).',
    query: (db, p) => ({
      plataformas: db.prepare(`
        SELECT platform AS plataforma,
               ROUND(COALESCE(SUM(spend),0),2) AS gasto,
               COALESCE(SUM(impressions),0) AS impressoes,
               COALESCE(SUM(clicks),0) AS cliques,
               ROUND(COALESCE(SUM(conversions),0),2) AS conversoes,
               ROUND(COALESCE(SUM(conversion_value),0),2) AS valor_conversao,
               CASE WHEN COALESCE(SUM(spend),0) > 0
                    THEN ROUND(SUM(conversion_value) / SUM(spend), 4) ELSE NULL END AS roas_plataforma
        FROM ads_daily WHERE date >= :de AND date <= :ate
        GROUP BY platform ORDER BY gasto DESC`).all(p),
    }),
  },

  {
    key: 'trafego_web',
    title: 'Tráfego web (GA4)',
    descricao: 'Sessões, usuários e sessões engajadas por dia, vindas do GA4.',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'Série diária de web_daily (GA4). Vazio até o conector GA4 estar conectado e sincronizado.',
    query: (db, p) => ({
      series: db.prepare(`
        SELECT date AS dia, sessions AS sessoes, users AS usuarios,
               engaged_sessions AS sessoes_engajadas, ROUND(conversions,2) AS conversoes
        FROM web_daily WHERE date >= :de AND date <= :ate ORDER BY date`).all(p),
    }),
  },
];
