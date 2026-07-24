// Shopify — um conector, quatro jobs, uma API, um token, um orçamento de rate limit.
// No sistema atual isso são 4 pipelines separados que gravam DUAS versões do mesmo
// pedido (108.871 vs 108.869 linhas, R$10k de divergência). Aqui, uma tabela só.
import { criarHttp } from '../core/http.js';
import { inserirEmLotes } from '../core/db.js';

const VERSAO_API = '2025-01';

function cliente(ctx) {
  const c = ctx.cred();
  if (!c?.accessToken || !c?.shop) throw new Error('credencial da Shopify ausente');
  return criarHttp({
    base: `https://${c.shop}/admin/api/${VERSAO_API}`,
    headers: { 'X-Shopify-Access-Token': c.accessToken },
    log: ctx.log,
  });
}

// A Shopify grava em UTC; o cursor é guardado em ISO com Z explícito.
// (O sistema atual guardava string naive e reinterpretava como -03:00 — fonte de bug.)
const isoZ = (d) => new Date(d).toISOString();

// ---- job: pedidos ---------------------------------------------------------
const CAMPOS_PEDIDO = [
  'id', 'name', 'created_at', 'processed_at', 'cancelled_at', 'financial_status',
  'fulfillment_status', 'currency', 'total_price', 'subtotal_price', 'total_discounts',
  'total_tax', 'total_shipping_price_set', 'line_items', 'source_name', 'discount_codes',
  'landing_site', 'referring_site', 'customer',
].join(',');

function extrairUtm(landing) {
  if (!landing) return {};
  try {
    const u = new URL(landing, 'https://loja.local');
    return {
      utm_source: u.searchParams.get('utm_source'),
      utm_medium: u.searchParams.get('utm_medium'),
      utm_campaign: u.searchParams.get('utm_campaign'),
    };
  } catch { return {}; }
}

// '' = processado e sem cupom · NULL = ainda não extraído. A distinção é load-bearing.
function extrairCupons(pedido) {
  if (!Array.isArray(pedido.discount_codes)) return null;
  return pedido.discount_codes.map(d => String(d.code || '').trim()).filter(Boolean).join(',').slice(0, 255);
}

async function syncPedidos(ctx, { modo }) {
  const http = cliente(ctx);
  const cursor = ctx.lerCursor();
  // sem cursor, 3 dias (incremental) — backfill controlado por config
  const desde = modo === 'backfill'
    ? (ctx.config.get('shopify.backfillDesde') || '2024-01-01T00:00:00Z')
    : (cursor || isoZ(Date.now() - 3 * 864e5));

  const insOrder = ctx.db.prepare(`
    INSERT INTO orders (id, order_name, created_at, processed_at, cancelled_at, financial_status,
      fulfillment_status, currency, total_price, subtotal_price, total_discounts, total_tax,
      total_shipping, units, source_name, utm_source, utm_medium, utm_campaign, discount_codes,
      customer_id_enc, customer_hash, landing_site_enc, referring_site_enc, synced_at)
    VALUES (@id,@order_name,@created_at,@processed_at,@cancelled_at,@financial_status,
      @fulfillment_status,@currency,@total_price,@subtotal_price,@total_discounts,@total_tax,
      @total_shipping,@units,@source_name,@utm_source,@utm_medium,@utm_campaign,@discount_codes,
      @customer_id_enc,@customer_hash,@landing_site_enc,@referring_site_enc,@synced_at)
    ON CONFLICT(id) DO UPDATE SET
      financial_status=excluded.financial_status, fulfillment_status=excluded.fulfillment_status,
      cancelled_at=excluded.cancelled_at, total_price=excluded.total_price,
      units=excluded.units, discount_codes=excluded.discount_codes, synced_at=excluded.synced_at`);

  const delItens = ctx.db.prepare('DELETE FROM order_items WHERE order_id = ?');
  const insItem = ctx.db.prepare(`
    INSERT INTO order_items (id, order_id, product_id, variant_id, sku, title, variant_title, quantity, price, total_discount)
    VALUES (@id,@order_id,@product_id,@variant_id,@sku,@title,@variant_title,@quantity,@price,@total_discount)
    ON CONFLICT(id) DO UPDATE SET quantity=excluded.quantity, price=excluded.price`);

  let total = 0, maiorCreated = cursor;
  const caminho = `/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(desde)}&fields=${CAMPOS_PEDIDO}`;

  try {
    for await (const pagina of http.paginarLink(caminho, { pausaMs: 250 })) {
      const pedidos = pagina?.orders ?? [];
      if (!pedidos.length) break;

      const linhas = pedidos.map(p => {
        const utm = extrairUtm(p.landing_site);
        return {
          id: Number(p.id),
          order_name: p.name ?? String(p.id),
          created_at: p.created_at, processed_at: p.processed_at ?? null,
          cancelled_at: p.cancelled_at ?? null,
          financial_status: p.financial_status ?? null,
          fulfillment_status: p.fulfillment_status ?? null,
          currency: p.currency ?? null,
          total_price: Number(p.total_price ?? 0),
          subtotal_price: Number(p.subtotal_price ?? 0),
          total_discounts: Number(p.total_discounts ?? 0),
          total_tax: Number(p.total_tax ?? 0),
          total_shipping: Number(p.total_shipping_price_set?.shop_money?.amount ?? 0),
          units: (p.line_items ?? []).reduce((s, i) => s + Number(i.quantity ?? 0), 0),
          source_name: p.source_name ?? null,
          utm_source: utm.utm_source ?? null, utm_medium: utm.utm_medium ?? null,
          utm_campaign: utm.utm_campaign ?? null,
          discount_codes: extrairCupons(p),
          // PII cifrada: o painel decifra só o necessário; o MCP nunca decifra.
          customer_id_enc: ctx.cripto.cifrar(p.customer?.id ?? null),
          customer_hash: ctx.cripto.hash(p.customer?.id ?? null),
          landing_site_enc: ctx.cripto.cifrar(p.landing_site ?? null),
          referring_site_enc: ctx.cripto.cifrar(p.referring_site ?? null),
          synced_at: new Date().toISOString(),
        };
      });

      inserirEmLotes(ctx.db, insOrder, linhas);

      // line items: sempre persistidos (é o que permite métrica por produto na mesma base)
      ctx.db.transaction(() => {
        for (const p of pedidos) {
          delItens.run(Number(p.id));
          for (const i of p.line_items ?? []) {
            insItem.run({
              id: Number(i.id), order_id: Number(p.id),
              product_id: i.product_id ? Number(i.product_id) : null,
              variant_id: i.variant_id ? Number(i.variant_id) : null,
              sku: i.sku ?? null, title: i.title ?? null, variant_title: i.variant_title ?? null,
              quantity: Number(i.quantity ?? 0), price: Number(i.price ?? 0),
              total_discount: Number(i.total_discount ?? 0),
            });
          }
        }
      })();

      total += pedidos.length;
      for (const p of pedidos) if (!maiorCreated || p.created_at > maiorCreated) maiorCreated = p.created_at;
      ctx.log.info('sync', `pedidos: ${total} processados`);
    }

    ctx.gravarCursor(maiorCreated, { registros: total });
    return { registros: total };
  } catch (e) {
    // erro NUNCA destrói o cursor
    ctx.gravarCursor(null, { status: 'error', registros: total, erro: e.message });
    throw e;
  }
}

// ---- job: catálogo --------------------------------------------------------
async function syncCatalogo(ctx) {
  const http = cliente(ctx);
  const insProd = ctx.db.prepare(`
    INSERT INTO products (id,title,handle,url,description_text,vendor,product_type,status,tags,
      price_min,price_max,total_inventory,image_url,published_at,shopify_updated_at,synced_at)
    VALUES (@id,@title,@handle,@url,@description_text,@vendor,@product_type,@status,@tags,
      @price_min,@price_max,@total_inventory,@image_url,@published_at,@shopify_updated_at,@synced_at)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status,
      price_min=excluded.price_min, price_max=excluded.price_max,
      total_inventory=excluded.total_inventory, tags=excluded.tags, synced_at=excluded.synced_at`);
  const insVar = ctx.db.prepare(`
    INSERT INTO product_variants (id,product_id,title,sku,price,compare_at_price,position,
      option1,option2,option3,inventory_quantity,inventory_policy,barcode,synced_at)
    VALUES (@id,@product_id,@title,@sku,@price,@compare_at_price,@position,
      @option1,@option2,@option3,@inventory_quantity,@inventory_policy,@barcode,@synced_at)
    ON CONFLICT(id) DO UPDATE SET price=excluded.price,
      inventory_quantity=excluded.inventory_quantity, synced_at=excluded.synced_at`);
  // FTS5 standalone: rowid = product_id. Upsert = delete + insert.
  const delFts = ctx.db.prepare('DELETE FROM products_fts WHERE rowid = ?');
  const insFts = ctx.db.prepare('INSERT INTO products_fts(rowid,title,description,tags) VALUES (?,?,?,?)');

  const c = ctx.cred();
  let totalP = 0, totalV = 0;
  const vistos = new Set();

  for await (const pagina of http.paginarLink('/products.json?limit=250', { pausaMs: 250 })) {
    const produtos = pagina?.products ?? [];
    if (!produtos.length) break;
    ctx.db.transaction(() => {
      for (const p of produtos) {
        const precos = (p.variants ?? []).map(v => Number(v.price ?? 0)).filter(n => n > 0);
        const estoque = (p.variants ?? []).reduce((s, v) => s + Number(v.inventory_quantity ?? 0), 0);
        const pid = Number(p.id);
        const descricao = String(p.body_html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
        const tags = p.tags ?? null;
        insProd.run({
          id: pid, title: p.title ?? null, handle: p.handle ?? null,
          url: `https://${c.shop.replace('.myshopify.com', '')}.myshopify.com/products/${p.handle}`,
          description_text: descricao,
          vendor: p.vendor ?? null, product_type: p.product_type ?? null, status: p.status ?? null,
          tags,
          price_min: precos.length ? Math.min(...precos) : null,
          price_max: precos.length ? Math.max(...precos) : null,
          total_inventory: estoque,
          image_url: p.image?.src ?? null,
          published_at: p.published_at ?? null, shopify_updated_at: p.updated_at ?? null,
          synced_at: new Date().toISOString(),
        });
        // Índice de busca por texto (rowid = product_id).
        delFts.run(pid);
        insFts.run(pid, p.title ?? '', descricao, tags ?? '');
        vistos.add(pid);
        for (const v of p.variants ?? []) {
          insVar.run({
            id: Number(v.id), product_id: Number(p.id), title: v.title ?? null, sku: v.sku ?? null,
            price: Number(v.price ?? 0), compare_at_price: v.compare_at_price ? Number(v.compare_at_price) : null,
            position: v.position ?? null, option1: v.option1 ?? null, option2: v.option2 ?? null,
            option3: v.option3 ?? null, inventory_quantity: Number(v.inventory_quantity ?? 0),
            inventory_policy: v.inventory_policy ?? null, barcode: v.barcode ?? null,
            synced_at: new Date().toISOString(),
          });
          totalV++;
        }
        totalP++;
      }
    })();
    ctx.log.info('sync', `catálogo: ${totalP} produtos`);
  }

  // reconciliação de deleção por diff de ids (padrão do product-sync atual)
  if (vistos.size) {
    const doBanco = ctx.db.prepare('SELECT id FROM products').all().map(r => r.id);
    const sumiram = doBanco.filter(id => !vistos.has(id));
    if (sumiram.length) {
      const del = ctx.db.prepare('DELETE FROM products WHERE id = ?');
      ctx.db.transaction(() => sumiram.forEach(id => { del.run(id); delFts.run(id); }))();
      ctx.log.info('sync', `${sumiram.length} produtos removidos do catálogo`);
    }
  }

  ctx.gravarCursor(new Date().toISOString(), { registros: totalP });
  return { registros: totalP, variantes: totalV };
}

// ---- job: custo das variantes (GraphQL, exige read_inventory) --------------
async function syncCusto(ctx) {
  const c = ctx.cred();
  const http = criarHttp({
    base: `https://${c.shop}/admin/api/${VERSAO_API}`,
    headers: { 'X-Shopify-Access-Token': c.accessToken, 'content-type': 'application/json' },
    log: ctx.log, timeoutMs: 60_000,
  });
  const upd = ctx.db.prepare('UPDATE product_variants SET unit_cost = ? WHERE id = ?');
  // Histórico de custo por dia: o CMV de pedido antigo não muda quando o custo atual muda.
  const insHist = ctx.db.prepare(`INSERT INTO variant_cost_history (variant_id, effective_date, unit_cost, synced_at)
    VALUES (?,?,?,?) ON CONFLICT(variant_id, effective_date) DO UPDATE SET unit_cost=excluded.unit_cost`);
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  let cursor = null, total = 0;

  do {
    const q = `{ productVariants(first: 100${cursor ? `, after: "${cursor}"` : ''}) {
      nodes { id inventoryItem { unitCost { amount } } }
      pageInfo { hasNextPage endCursor } } }`;
    const r = await http.post('/graphql.json', { query: q });
    const d = r?.data?.productVariants;
    if (!d) break;
    ctx.db.transaction(() => {
      for (const n of d.nodes ?? []) {
        const custo = n.inventoryItem?.unitCost?.amount;
        if (custo != null) {
          const vid = Number(String(n.id).split('/').pop());
          upd.run(Number(custo), vid);
          insHist.run(vid, hoje, Number(custo), new Date().toISOString());
          total++;
        }
      }
    })();
    cursor = d.pageInfo?.hasNextPage ? d.pageInfo.endCursor : null;
  } while (cursor);

  ctx.gravarCursor(new Date().toISOString(), { registros: total });
  return { registros: total };
}

// ---- job: CMV (derivado, sem API) -----------------------------------------
async function calcularCmv(ctx) {
  const custos = new Map(
    ctx.db.prepare('SELECT id, unit_cost FROM product_variants WHERE unit_cost IS NOT NULL AND unit_cost > 0')
      .all().map(r => [r.id, r.unit_cost]));

  // Proteção herdada do sistema atual: sem mapa de custos, NÃO zera o CMV existente.
  if (!custos.size) {
    ctx.gravarCursor(null, { status: 'warn', erro: 'sem custos de variante — CMV não recalculado' });
    return { registros: 0 };
  }

  const pend = ctx.db.prepare('SELECT id FROM orders WHERE cmv_done = 0 LIMIT 2000').all();
  const itens = ctx.db.prepare('SELECT variant_id, quantity FROM order_items WHERE order_id = ?');
  const upd = ctx.db.prepare('UPDATE orders SET cmv = ?, cmv_done = 1 WHERE id = ?');

  let n = 0, parciais = 0;
  ctx.db.transaction(() => {
    for (const { id } of pend) {
      let cmv = 0, faltou = false;
      for (const it of itens.all(id)) {
        const c = custos.get(it.variant_id);
        if (c == null) { faltou = true; continue; }
        cmv += c * it.quantity;
      }
      upd.run(Math.round(cmv * 100) / 100, id);
      if (faltou) parciais++;
      n++;
    }
  })();

  ctx.gravarCursor(new Date().toISOString(), {
    registros: n,
    status: parciais ? 'warn' : 'ok',
    erro: parciais ? `${parciais} pedidos com item sem custo cadastrado` : null,
  });
  return { registros: n };
}

export default {
  name: 'shopify',
  label: 'Shopify',
  auth: { kind: 'apikey' },
  setup: {
    shop: { label: 'Domínio da loja', placeholder: 'minha-loja.myshopify.com', obrigatorio: true },
    accessToken: { label: 'Access token do app', segredo: true, obrigatorio: true },
  },

  // Uma chamada real: só assim o conector vira "conectado".
  async validate(ctx) {
    const loja = (await cliente(ctx).get('/shop.json'))?.shop;
    if (!loja) throw new Error('resposta inesperada de /shop.json');
    // A loja também informa a identidade do tenant — o painel se configura sozinho.
    ctx.config.set('store.domain', loja.myshopify_domain);
    ctx.config.set('store.name', loja.name);
    ctx.config.set('store.currency', loja.currency);
    ctx.config.set('store.timezone', loja.iana_timezone);
    ctx.config.set('store.publicDomain', loja.domain);
    return { loja: loja.name, moeda: loja.currency, fuso: loja.iana_timezone };
  },

  describeTables() {
    return [
      { tabela: 'orders', origem: 'Shopify Admin REST', chave: 'id',
        descricao: 'Pedidos da loja. Base de faturamento, ticket, clientes e atribuição.' },
      { tabela: 'order_items', origem: 'Shopify Admin REST', chave: 'id',
        descricao: 'Itens de cada pedido. Base das métricas por produto.' },
      { tabela: 'products', origem: 'Shopify Admin REST', chave: 'id',
        descricao: 'Catálogo: preço, estoque e status por produto.' },
      { tabela: 'product_variants', origem: 'Shopify Admin REST + GraphQL', chave: 'id',
        descricao: 'Variantes (SKU) com preço, estoque e custo unitário.' },
    ];
  },

  jobs: [
    { name: 'orders',  schedule: '*/15 * * * *', run: syncPedidos },
    { name: 'catalog', schedule: '0 */6 * * *',  run: syncCatalogo },
    { name: 'cost',    schedule: '30 5 * * *',   run: syncCusto },
    { name: 'cmv',     schedule: '*/15 * * * *', run: calcularCmv, after: 'orders' },
  ],
};
