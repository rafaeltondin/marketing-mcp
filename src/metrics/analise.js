// Métricas de análise derivadas. Uma definição vira REST + tool MCP + glossário.
import { faixaDia, VENDA_VALIDA, PEDIDO_PAGO } from '../core/db.js';

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;
const hojeBrt = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

// Janela civil da loja (UTC-3) reaproveitada no CASE do coorte (mesmo offset do faixaDia).
const naJanela = (col) => `${col} >= datetime(:de,'+3 hours') AND ${col} < datetime(:ate,'+1 day','+3 hours')`;

function somaPeriodo(db, de, ate) {
  return db.prepare(`SELECT COALESCE(SUM(total_price),0) AS faturamento, COUNT(*) AS pedidos,
                            COALESCE(SUM(units),0) AS unidades
                     FROM orders WHERE ${faixaDia()} AND ${VENDA_VALIDA}`).get({ de, ate });
}

// Desloca uma janela [de,ate] para a janela imediatamente anterior de mesmo tamanho.
function janelaAnterior(de, ate) {
  const d0 = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const d1 = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  const dias = Math.round((d1 - d0) / 864e5);
  const antAte = new Date(d0 - 864e5);
  const antDe = new Date(d0 - 864e5 - dias * 864e5);
  return { de: antDe.toISOString().slice(0, 10), ate: antAte.toISOString().slice(0, 10) };
}

const delta = (a, b) => (b ? round2(((a - b) / b) * 100) : (a ? 100 : 0));

export default [
  {
    key: 'comparar_periodos',
    title: 'Comparar com o período anterior',
    descricao: 'Faturamento, pedidos e unidades do período vs a janela anterior de mesmo tamanho, com variação %.',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'A janela anterior tem o mesmo número de dias e termina no dia anterior a "de".',
    query: (db, p) => {
      const atual = somaPeriodo(db, p.de, p.ate);
      const janAnt = janelaAnterior(p.de, p.ate);
      const anterior = somaPeriodo(db, janAnt.de, janAnt.ate);
      return {
        atual, anterior, periodo_anterior: janAnt,
        variacao_pct: {
          faturamento: delta(atual.faturamento, anterior.faturamento),
          pedidos: delta(atual.pedidos, anterior.pedidos),
          unidades: delta(atual.unidades, anterior.unidades),
        },
      };
    },
  },

  {
    key: 'vendas_por_origem',
    title: 'Vendas por origem (source_name)',
    descricao: 'Faturamento e pedidos por canal técnico de origem do pedido (web, pos, app, checkout...).',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'Agrupa por source_name do pedido — o canal técnico da Shopify, complementar ao vendas_por_canal (marketing).',
    query: (db, p) => ({
      origens: db.prepare(`
        SELECT COALESCE(NULLIF(source_name,''),'desconhecido') AS origem,
               COUNT(*) AS pedidos, COALESCE(SUM(total_price),0) AS faturamento
        FROM orders WHERE ${faixaDia()} AND ${VENDA_VALIDA}
        GROUP BY origem ORDER BY faturamento DESC`).all(p),
    }),
  },

  {
    key: 'margem_por_produto',
    title: 'Margem por produto',
    descricao: 'Receita, CMV e margem bruta por produto no período (exige custo de variante cadastrado).',
    params: { periodo: true, limite: { tipo: 'number', padrao: 20, label: 'quantos produtos' } },
    requires: ['shopify'],
    glossary: 'CMV = Σ(quantidade × custo unitário da variante). Margem = receita − CMV. Cobertura = fração de unidades com custo.',
    query: (db, p) => ({
      produtos: db.prepare(`
        SELECT i.product_id, COALESCE(pr.title, i.title) AS produto,
               ROUND(SUM(i.quantity * i.price), 2) AS receita,
               ROUND(SUM(i.quantity * COALESCE(v.unit_cost, 0)), 2) AS cmv,
               ROUND(SUM(i.quantity * i.price) - SUM(i.quantity * COALESCE(v.unit_cost, 0)), 2) AS margem,
               ROUND(CAST(SUM(CASE WHEN v.unit_cost IS NOT NULL THEN i.quantity ELSE 0 END) AS REAL)
                     / NULLIF(SUM(i.quantity), 0), 4) AS cobertura_custo,
               SUM(i.quantity) AS unidades
        FROM order_items i
        JOIN orders o ON o.id = i.order_id
        LEFT JOIN products pr ON pr.id = i.product_id
        LEFT JOIN product_variants v ON v.id = i.variant_id
        WHERE ${faixaDia('o.created_at')} AND o.cancelled_at IS NULL AND o.${PEDIDO_PAGO}
        GROUP BY i.product_id, produto
        HAVING unidades > 0
        ORDER BY margem DESC LIMIT :limite`).all(p),
    }),
  },

  {
    key: 'previsao_ruptura',
    title: 'Previsão de ruptura de estoque',
    descricao: 'Variantes que vão esgotar mais cedo, pela velocidade de venda real dos últimos dias.',
    params: { dias: { tipo: 'number', padrao: 30, label: 'janela de velocidade (dias)' },
              limite: { tipo: 'number', padrao: 20, label: 'quantas variantes' } },
    requires: ['shopify'],
    glossary: 'Velocidade = unidades vendidas (pedidos pagos) na janela ÷ dias. Dias p/ ruptura = estoque ÷ velocidade. Ignora venda sob demanda (inventory_policy=continue).',
    query: (db, p) => {
      const dias = Number(p.dias) > 0 ? Number(p.dias) : 30;
      const desde = new Date(Date.now() - dias * 864e5).toISOString();
      const linhas = db.prepare(`
        SELECT v.id AS variant_id, v.sku, COALESCE(pr.title, v.title) AS produto,
               v.inventory_quantity AS estoque,
               COALESCE(vend.qtd, 0) AS vendidos
        FROM product_variants v
        LEFT JOIN products pr ON pr.id = v.product_id
        LEFT JOIN (
          SELECT i.variant_id, SUM(i.quantity) AS qtd
          FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE o.created_at >= :desde AND o.cancelled_at IS NULL AND o.${PEDIDO_PAGO}
          GROUP BY i.variant_id
        ) vend ON vend.variant_id = v.id
        WHERE v.inventory_quantity > 0 AND COALESCE(v.inventory_policy,'deny') <> 'continue'
      `).all({ desde });
      const out = linhas
        .map(l => {
          const vel = l.vendidos / dias;
          return { ...l, velocidade_dia: round2(vel),
                   dias_para_ruptura: vel > 0 ? Math.floor(l.estoque / vel) : null };
        })
        .filter(l => l.dias_para_ruptura != null)
        .sort((a, b) => a.dias_para_ruptura - b.dias_para_ruptura)
        .slice(0, Number(p.limite) > 0 ? Number(p.limite) : 20);
      return { janela_dias: dias, variantes: out };
    },
  },

  {
    key: 'ltv_coortes',
    title: 'Clientes novos vs recorrentes',
    descricao: 'No período: clientes únicos, quantos são de primeira compra vs recorrentes, receita de cada grupo e taxa de recompra.',
    params: { periodo: true },
    requires: ['shopify'],
    glossary: 'Cliente "novo" = primeira compra de todos os tempos caiu dentro do período. Recompra = recorrentes ÷ clientes.',
    query: (db, p) => {
      const r = db.prepare(`
        WITH firsts AS (
          SELECT customer_hash, MIN(created_at) AS fc
          FROM orders WHERE customer_hash IS NOT NULL AND ${VENDA_VALIDA}
          GROUP BY customer_hash )
        SELECT COUNT(DISTINCT o.customer_hash) AS clientes,
               COUNT(DISTINCT CASE WHEN ${naJanela('f.fc')} THEN o.customer_hash END) AS novos,
               COALESCE(SUM(o.total_price),0) AS receita,
               COALESCE(SUM(CASE WHEN ${naJanela('f.fc')} THEN o.total_price ELSE 0 END),0) AS receita_novos
        FROM orders o JOIN firsts f ON f.customer_hash = o.customer_hash
        WHERE ${faixaDia('o.created_at')} AND o.customer_hash IS NOT NULL AND ${VENDA_VALIDA}
      `).get(p);
      const recorrentes = r.clientes - r.novos;
      return {
        clientes: r.clientes, novos: r.novos, recorrentes,
        receita: round2(r.receita), receita_novos: round2(r.receita_novos),
        receita_recorrentes: round2(r.receita - r.receita_novos),
        taxa_recompra: r.clientes ? round2((recorrentes / r.clientes) * 100) : 0,
      };
    },
  },

  {
    key: 'metas',
    title: 'Metas do ano',
    descricao: 'Metas mensais cadastradas por métrica (total, por canal...).',
    params: { ano: { tipo: 'number', label: 'ano (padrão: atual)' } },
    requires: ['shopify'],
    glossary: 'Metas ficam na tabela goals; editar no painel marca manual=1 e a planilha não sobrescreve.',
    query: (db, p) => {
      const ano = Number(p.ano) || Number(hojeBrt().slice(0, 4));
      return {
        ano,
        metas: db.prepare(`SELECT month AS mes, metric AS metrica, value AS valor, manual
                           FROM goals WHERE year = ? ORDER BY month, metric`).all(ano),
      };
    },
  },

  {
    key: 'qualidade_dado',
    title: 'Qualidade do dado',
    descricao: 'Quantos pedidos/variantes estão sem origem, sem journey, sem CMV ou sem custo — transparência do que falta.',
    params: {},
    requires: ['shopify'],
    query: (db) => {
      const o = db.prepare(`SELECT COUNT(*) AS pedidos,
          COALESCE(SUM(CASE WHEN utm_source IS NULL AND source_name IS NULL THEN 1 ELSE 0 END),0) AS sem_origem,
          COALESCE(SUM(CASE WHEN j_source IS NULL THEN 1 ELSE 0 END),0) AS sem_journey,
          COALESCE(SUM(CASE WHEN cmv_done = 0 THEN 1 ELSE 0 END),0) AS sem_cmv,
          COALESCE(SUM(CASE WHEN customer_hash IS NULL THEN 1 ELSE 0 END),0) AS sem_cliente
        FROM orders`).get();
      const v = db.prepare(`SELECT COUNT(*) AS variantes,
          COALESCE(SUM(CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END),0) AS sem_custo
        FROM product_variants`).get();
      return { ...o, ...v };
    },
  },

  {
    key: 'busca_produtos',
    title: 'Busca de produtos por texto',
    descricao: 'Procura produtos por palavra no título/descrição/tags (FTS5, ignora acento).',
    params: { termo: { tipo: 'string', label: 'texto a procurar' },
              limite: { tipo: 'number', padrao: 20, label: 'quantos resultados' } },
    requires: ['shopify'],
    glossary: 'Índice FTS5 populado no sync de catálogo. Prefixo por token; ordena por relevância (bm25).',
    query: (db, p) => {
      const termo = String(p.termo ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
      if (!termo) return { produtos: [] };
      const q = termo.split(/\s+/).map(t => `"${t}"*`).join(' ');
      return {
        produtos: db.prepare(`
          SELECT p.id, p.title AS produto, p.handle, p.status,
                 p.price_min, p.price_max, p.total_inventory
          FROM products_fts f JOIN products p ON p.id = f.rowid
          WHERE products_fts MATCH :q
          ORDER BY bm25(products_fts) LIMIT :limite`).all({ q, limite: Number(p.limite) > 0 ? Number(p.limite) : 20 }),
      };
    },
  },
];
