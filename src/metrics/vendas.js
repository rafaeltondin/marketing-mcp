// Métricas de venda. Cada objeto vira automaticamente rota REST + tool MCP + glossário.
import { faixaDia, BUCKET, VENDA_VALIDA, PEDIDO_PAGO } from '../core/db.js';

export default [
  {
    key: 'kpis',
    title: 'KPIs do período',
    descricao: 'Faturamento, pedidos, ticket médio, unidades, descontos, frete, reembolsos e clientes únicos no período.',
    params: { periodo: true },
    requires: ['shopify'],
    good: 'up',
    glossary: 'Faturamento = soma de total_price dos pedidos não cancelados (exclui "voided"). Ticket = faturamento ÷ pedidos.',
    query: (db, p) => {
      const r = db.prepare(`
        SELECT COALESCE(SUM(total_price),0) AS faturamento,
               COUNT(*)                     AS pedidos,
               COALESCE(SUM(units),0)       AS unidades,
               COALESCE(SUM(total_discounts),0) AS descontos,
               COALESCE(SUM(total_shipping),0)  AS frete,
               COALESCE(SUM(CASE WHEN financial_status='refunded' THEN total_price ELSE 0 END),0) AS reembolsos,
               COUNT(DISTINCT customer_hash) AS clientes,
               COALESCE(SUM(cmv),0)         AS cmv
        FROM orders WHERE ${faixaDia()} AND ${VENDA_VALIDA}`).get(p);
      const ads = db.prepare(`
        SELECT COALESCE(SUM(spend),0) AS gasto FROM ads_daily WHERE date >= :de AND date <= :ate`).get(p);
      const ticket = r.pedidos ? r.faturamento / r.pedidos : 0;
      return {
        ...r,
        ticket: Math.round(ticket * 100) / 100,
        gasto_ads: ads.gasto,
        roas: ads.gasto ? Math.round((r.faturamento / ads.gasto) * 10000) / 10000 : null,
        cac: r.pedidos && ads.gasto ? Math.round((ads.gasto / r.pedidos) * 100) / 100 : null,
        margem_bruta: r.cmv ? Math.round((r.faturamento - r.cmv) * 100) / 100 : null,
      };
    },
  },

  {
    key: 'vendas_diarias',
    title: 'Vendas por dia',
    descricao: 'Série diária de faturamento e pedidos no período, no fuso da loja.',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'Agrupado pelo dia civil da loja (UTC-3), não pelo dia UTC.',
    query: (db, p) => ({
      series: db.prepare(`
        SELECT date(${BUCKET()}) AS dia,
               COALESCE(SUM(total_price),0) AS faturamento,
               COUNT(*) AS pedidos,
               COALESCE(SUM(units),0) AS unidades
        FROM orders WHERE ${faixaDia()} AND ${VENDA_VALIDA}
        GROUP BY dia ORDER BY dia`).all(p),
    }),
  },

  {
    key: 'vendas_por_canal',
    title: 'Vendas por canal',
    descricao: 'Faturamento e pedidos por canal de origem (atribuição last-click não-direto).',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'Prefere a atribuição do customer journey (j_source); cai para UTM do landing quando ausente. Direto = sem origem rastreável.',
    query: (db, p) => ({
      canais: db.prepare(`
        SELECT COALESCE(NULLIF(LOWER(COALESCE(j_source, utm_source)),''), 'direto') AS canal,
               COALESCE(NULLIF(LOWER(COALESCE(j_medium, utm_medium)),''), 'none')   AS tipo,
               COUNT(*) AS pedidos,
               COALESCE(SUM(total_price),0) AS faturamento
        FROM orders WHERE ${faixaDia()} AND ${VENDA_VALIDA}
        GROUP BY canal, tipo ORDER BY faturamento DESC`).all(p),
    }),
  },

  {
    key: 'mais_vendidos',
    title: 'Produtos mais vendidos',
    descricao: 'Ranking de produtos por unidades vendidas no período, com receita.',
    params: { periodo: true, limite: { tipo: 'number', padrao: 20, label: 'quantos produtos retornar' } },
    requires: ['shopify'],
    glossary: 'Considera apenas pedidos pagos (paid ou partially_refunded).',
    query: (db, p) => ({
      produtos: db.prepare(`
        SELECT i.product_id, COALESCE(pr.title, i.title) AS produto,
               SUM(i.quantity) AS unidades,
               ROUND(SUM(i.quantity * i.price), 2) AS receita,
               COUNT(DISTINCT i.order_id) AS pedidos
        FROM order_items i
        JOIN orders o ON o.id = i.order_id
        LEFT JOIN products pr ON pr.id = i.product_id
        WHERE ${faixaDia('o.created_at')} AND o.cancelled_at IS NULL AND o.${PEDIDO_PAGO}
        GROUP BY i.product_id, produto
        HAVING unidades > 0
        ORDER BY unidades DESC LIMIT :limite`).all(p),
    }),
  },

  {
    key: 'catalogo',
    title: 'Visão geral do catálogo',
    descricao: 'Total de produtos, ativos, esgotados, valor de estoque e faixa de preço.',
    params: {},
    requires: ['shopify'],
    query: (db) => {
      const g = db.prepare(`
        SELECT COUNT(*) AS produtos,
               SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS ativos,
               SUM(CASE WHEN COALESCE(total_inventory,0) <= 0 THEN 1 ELSE 0 END) AS esgotados,
               MIN(price_min) AS preco_min, MAX(price_max) AS preco_max,
               MAX(synced_at) AS sincronizado_em
        FROM products`).get();
      // Valor de estoque só faz sentido sobre estoque REAL. Variante com
      // inventory_policy='continue' vende sob demanda e costuma carregar um número
      // fictício (a Pinha tem 2.055 variantes com 711 unidades cada) — incluí-las
      // inflava o total para a casa do bilhão. Ficam de fora, e o recorte é explícito.
      const e = db.prepare(`
        SELECT ROUND(SUM(price * inventory_quantity), 2) AS valor_estoque,
               COUNT(*) AS variantes_com_estoque_real
        FROM product_variants
        WHERE inventory_quantity > 0 AND COALESCE(inventory_policy,'deny') <> 'continue'`).get();
      const sob = db.prepare(`
        SELECT COUNT(*) AS n FROM product_variants WHERE inventory_policy = 'continue'`).get();
      const custo = db.prepare(`
        SELECT SUM(CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END) AS sem_custo, COUNT(*) AS total
        FROM product_variants`).get();
      return {
        ...g,
        valor_estoque: e.valor_estoque ?? 0,
        variantes_com_estoque_real: e.variantes_com_estoque_real,
        variantes_sob_demanda: sob.n,
        variantes_sem_custo: custo.sem_custo,
        variantes: custo.total,
        aviso: custo.sem_custo === custo.total
          ? 'nenhuma variante tem custo cadastrado na loja — CMV e margem ficam indisponíveis'
          : undefined,
      };
    },
  },

  {
    key: 'status_sync',
    title: 'Status das sincronizações',
    descricao: 'Quando cada fonte rodou pela última vez, com status e erro. Use para saber se um dado está atualizado.',
    params: {},
    requires: [],
    query: (db) => ({
      fontes: db.prepare(`SELECT source AS fonte, last_cursor AS cursor, last_run AS ultima_execucao,
                                 last_status AS status, records AS registros, error_message AS erro
                          FROM sync_state ORDER BY source`).all(),
    }),
  },
];
