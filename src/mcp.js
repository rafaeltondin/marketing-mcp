// MCP: as tools são GERADAS do mesmo registry que serve a API REST.
// É isso que impede o painel e o agente de responderem números diferentes —
// o problema que existe hoje no sistema atual (duas tabelas de pedido).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import crypto from 'node:crypto';

const MAX_CHARS = 30_000;

const txt = (o) => {
  let s = typeof o === 'string' ? o : JSON.stringify(o, null, 2);
  if (s.length > MAX_CHARS) {
    s = s.slice(0, MAX_CHARS) +
      `\n\n…[resposta truncada em ${MAX_CHARS} chars — restrinja o período ou use "limite"]`;
  }
  return { content: [{ type: 'text', text: s }] };
};
const erro = (m) => ({ content: [{ type: 'text', text: `ERRO: ${m}` }], isError: true });

export function criarMcp({ metricas, conectores, config, log }) {
  function montarServidor() {
    const loja = config.get('store.name') ?? 'a loja';
    const server = new McpServer({
      name: 'storekit', version: process.env.APP_VERSION ?? 'dev',
    }, {
      instructions:
`Dados de e-commerce de ${loja}. O faturamento vem sempre da plataforma da loja (verdade do caixa).

ONDE BUSCAR CADA INFORMAÇÃO
- Faturamento, pedidos, ticket, ROAS no período  -> kpis
- Evolução dia a dia                             -> vendas_diarias
- De qual canal vieram as vendas                 -> vendas_por_canal
- Quais produtos mais venderam                   -> mais_vendidos
- Preço, estoque, quantos produtos existem       -> catalogo
- Se os dados estão atualizados                  -> status_sync
- O que é cada métrica e de onde vem             -> descrever_painel

REGRAS
- Datas em YYYY-MM-DD, interpretadas no fuso da loja. Sem período informado, usa do dia 1º de janeiro até hoje.
- Nunca invente número: se uma tool devolver vazio, diga que não há dado no período.
- Métrica ausente da lista significa que a integração dela não está conectada — diga isso em vez de estimar.`,
    });

    // Uma tool por métrica ativa, com schema derivado da mesma declaração.
    for (const m of metricas.ativas()) {
      server.tool(m.key, m.descricao ?? m.title, metricas.schemaZod(m), async (args) => {
        try { return txt(metricas.executar(m.key, args ?? {})); }
        catch (e) { return erro(e.message); }
      });
    }

    server.tool('descrever_painel',
      'Dicionário de dados: o que cada tabela e cada métrica significa, de onde vem e como é sincronizada. Consulte antes de interpretar um valor.',
      {}, async () => txt(metricas.descrever(conectores.todos())));

    server.tool('glossario',
      'Definição e fórmula de cada métrica do painel.',
      { termo: z.string().optional().describe('métrica específica; vazio traz todas') },
      async ({ termo }) => {
        const g = metricas.glossario();
        if (termo && !g[termo]) return erro(`termo desconhecido: ${termo}. Disponíveis: ${Object.keys(g).join(', ')}`);
        return txt(termo ? { [termo]: g[termo] } : g);
      });

    return server;
  }

  return {
    async registrar(app) {
      // Streamable HTTP stateless: server+transport novos por requisição.
      app.post('/mcp', async (req, reply) => {
        const esperado = process.env.MCP_TOKEN;
        if (esperado) {
          const veio = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
            || req.headers['x-api-key'] || '';
          const a = Buffer.from(String(veio)), b = Buffer.from(esperado);
          if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return reply.code(401).send({ erro: 'token inválido' });
          }
        }
        const server = montarServidor();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        reply.raw.on('close', () => { transport.close?.(); server.close?.(); });
        await server.connect(transport);
        await transport.handleRequest(req.raw, reply.raw, req.body);
        reply.hijack();
      });

      app.get('/mcp', async (_req, reply) => reply.code(405).send({ erro: 'use POST' }));
      log.info('mcp', 'endpoint /mcp registrado', { tools: metricas.ativas().length + 2 });
    },
  };
}
