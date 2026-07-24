// Registry de métricas: UMA definição vira rota REST, tool MCP e verbete de glossário.
// É o que impede a divergência que existe hoje (mesma métrica implementada 3×).
import { z } from 'zod';
import { validarData, periodoPadrao } from '../core/db.js';
import vendas from './vendas.js';
import analise from './analise.js';
import anuncios from './anuncios.js';

const TODAS = [...vendas, ...analise, ...anuncios];

export function criarRegistroMetricas({ db, config, cofre, log }) {
  // Métrica só existe se os conectores de que ela depende estiverem conectados.
  const disponivel = (m) => (m.requires ?? []).every(c => cofre.estado(c) === 'conectado');

  function normalizarParams(m, entrada = {}) {
    const p = { ...entrada };
    if (m.params?.periodo) {
      const padrao = periodoPadrao();
      p.de = validarData(p.de || padrao.de, 'de');
      p.ate = validarData(p.ate || padrao.ate, 'ate');
      if (p.de > p.ate) throw new Error('"de" não pode ser posterior a "ate"');
    }
    for (const [k, def] of Object.entries(m.params ?? {})) {
      if (k === 'periodo') continue;
      if (p[k] === undefined && def.padrao !== undefined) p[k] = def.padrao;
      if (def.obrigatorio && p[k] === undefined) throw new Error(`parâmetro obrigatório: ${k}`);
    }
    return p;
  }

  const api = {
    todas: () => TODAS,
    ativas: () => TODAS.filter(disponivel),
    achar: (chave) => TODAS.find(m => m.key === chave),

    executar(chave, params = {}) {
      const m = api.achar(chave);
      if (!m) throw new Error(`métrica desconhecida: ${chave}`);
      if (!disponivel(m)) {
        const faltando = (m.requires ?? []).filter(c => cofre.estado(c) !== 'conectado');
        throw new Error(`indisponível: conecte ${faltando.join(', ')} para usar "${chave}"`);
      }
      const p = normalizarParams(m, params);
      const inicio = Date.now();
      const dados = m.query(db, p);
      log.debug('metrics', `${chave} ok`, { ms: Date.now() - inicio });
      return { ...dados, _periodo: m.params?.periodo ? { de: p.de, ate: p.ate } : undefined };
    },

    // Schema zod para o MCP, derivado da mesma declaração.
    schemaZod(m) {
      const shape = {};
      if (m.params?.periodo) {
        shape.de = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe('início do período (YYYY-MM-DD). Padrão: 1º de janeiro do ano corrente.');
        shape.ate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe('fim do período (YYYY-MM-DD). Padrão: hoje.');
      }
      for (const [k, def] of Object.entries(m.params ?? {})) {
        if (k === 'periodo') continue;
        let t = def.tipo === 'number' ? z.number() : z.string();
        if (def.enum) t = z.enum(def.enum);
        shape[k] = def.obrigatorio ? t.describe(def.label ?? k) : t.optional().describe(def.label ?? k);
      }
      return shape;
    },

    // Glossário e dicionário compostos em runtime — nunca prosa escrita à mão
    // com nome de loja dentro (o sistema atual afirma colunas que não existem).
    glossario() {
      return Object.fromEntries(api.ativas().map(m => [m.key, {
        titulo: m.title, formula: m.glossary ?? null, bom: m.good ?? null,
      }]));
    },

    descrever(conectores) {
      const loja = config.get('store.name') ?? '(loja não configurada)';
      const ativos = conectores.filter(c => cofre.estado(c.name) === 'conectado');
      const tabelas = ativos.flatMap(c => c.describeTables?.() ?? []);
      return {
        painel: `Painel de e-commerce de ${loja}.`,
        moeda: config.get('store.currency') ?? null,
        fuso: config.get('store.timezone') ?? null,
        conectores_ativos: ativos.map(c => c.label),
        metricas_disponiveis: api.ativas().map(m => ({ chave: m.key, titulo: m.title })),
        metricas_indisponiveis: TODAS.filter(m => !disponivel(m))
          .map(m => ({ chave: m.key, precisa: m.requires })),
        tabelas,
        regras: [
          'Faturamento vem sempre do Shopify — é a verdade do caixa.',
          'Datas são interpretadas no fuso da loja; o banco guarda UTC.',
          'Pedidos cancelados e "voided" não entram nas somas de receita.',
        ],
      };
    },
  };
  return api;
}
