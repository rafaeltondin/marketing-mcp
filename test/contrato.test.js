// Testes de contrato: rodam sobre TODOS os conectores e métricas registrados.
// Um conector novo herda esta suíte sem escrever teste — é o que faz a robustez escalar.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { abrirBanco, migrar, faixaDia, validarData, VENDA_VALIDA } from '../src/core/db.js';
import { criarCripto, criarCofre } from '../src/core/secrets.js';
import { criarLog, criarConfig, criarAgendador, criarCache } from '../src/core/runtime.js';
import { carregarConectores, criarRegistroConectores } from '../src/connectors/index.js';
import { criarRegistroMetricas } from '../src/metrics/index.js';
import { derivarTema, contraste } from '../src/brand.js';

const log = criarLog({ nivel: 'error' });
let seq = 0;

// Cada ambiente em seu próprio arquivo: testes que compartilham banco se
// derrubam entre si (foi exatamente o que aconteceu na primeira execução).
function ambiente() {
  const caminho = `/tmp/storekit-test-${process.pid}-${++seq}.db`;
  rmSync(caminho, { force: true });
  const db = abrirBanco({ caminho, chave: 'chave-de-teste' });
  migrar(db, { log });
  const cripto = criarCripto({ piiKeyHex: 'a'.repeat(64) });
  const cofre = criarCofre({ db, cripto, log });
  const config = criarConfig({ db });
  const agendador = criarAgendador({ db, log });
  return { db, cripto, cofre, config, agendador };
}

describe('contrato: conectores', async () => {
  const conectores = await carregarConectores();

  test('há pelo menos um conector', () => assert.ok(conectores.length > 0));

  for (const c of conectores) {
    test(`${c.name}: formato da declaração`, () => {
      assert.ok(c.name && typeof c.name === 'string', 'name');
      assert.ok(c.label, 'label');
      assert.ok(['oauth2', 'apikey'].includes(c.auth?.kind ?? 'apikey'), 'auth.kind conhecido');
      assert.ok(typeof c.validate === 'function', 'validate()');
      assert.ok(Array.isArray(c.jobs) && c.jobs.length, 'jobs');
      for (const j of c.jobs) {
        assert.ok(j.name && typeof j.run === 'function', `job ${j.name} precisa de run()`);
      }
    });

    test(`${c.name}: descreve as próprias tabelas`, () => {
      const t = c.describeTables?.() ?? [];
      assert.ok(Array.isArray(t), 'describeTables devolve array');
      for (const d of t) assert.ok(d.tabela && d.descricao, 'tabela e descrição');
    });

    test(`${c.name}: dependência de job aponta para job existente`, () => {
      const nomes = new Set(c.jobs.map(j => j.name));
      for (const j of c.jobs) {
        if (j.after) assert.ok(nomes.has(j.after), `${j.name}.after="${j.after}" não existe`);
      }
    });

    test(`${c.name}: sem credencial não lança, apenas dorme`, async () => {
      const { db, cripto, cofre, config, agendador } = ambiente();
      const reg = criarRegistroConectores({ db, cofre, config, log, agendador, cripto });
      await reg.carregar();
      const r = await reg.sincronizar(c.name);
      assert.equal(r.status, 'nao_configurado');
      db.close();
    });

    test(`${c.name}: erro preserva o cursor anterior`, () => {
      const { db, cripto, cofre, config, agendador } = ambiente();
      const reg = criarRegistroConectores({ db, cofre, config, log, agendador, cripto });
      const ctx = reg.contexto(c, 'x');
      ctx.gravarCursor('cursor-bom', { registros: 10 });
      ctx.gravarCursor(null, { status: 'error', erro: 'falhou' });   // erro grava cursor null
      const st = db.prepare("SELECT last_cursor, last_status FROM sync_state WHERE source = ?").get(`${c.name}:x`);
      assert.equal(st.last_cursor, 'cursor-bom', 'cursor sobreviveu ao erro');
      assert.equal(st.last_status, 'error');
      db.close();
    });
  }
});

describe('contrato: métricas', () => {
  const { db, cofre, config } = ambiente();
  cofre.gravar('shopify', { kind: 'apikey', payload: { shop: 'x', accessToken: 'y' }, status: 'conectado' });
  const M = criarRegistroMetricas({ db, config, cofre, log });

  for (const m of M.todas()) {
    test(`${m.key}: declaração completa`, () => {
      assert.ok(m.key && m.title, 'key e title');
      assert.ok(typeof m.query === 'function', 'query()');
      assert.ok(Array.isArray(m.requires), 'requires é array');
    });

    test(`${m.key}: período vazio devolve zeros, nunca crash`, () => {
      const r = M.executar(m.key, { de: '2001-01-01', ate: '2001-01-02', limite: 3 });
      assert.ok(r && typeof r === 'object');
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} finito`);
      }
    });

    if (m.params?.periodo) {
      test(`${m.key}: recusa data inexistente`, () => {
        assert.throws(() => M.executar(m.key, { de: '2026-02-30', ate: '2026-03-01' }), /calendário/);
      });
      test(`${m.key}: recusa período invertido`, () => {
        assert.throws(() => M.executar(m.key, { de: '2026-03-01', ate: '2026-01-01' }), /posterior/);
      });
    }
  }

  test('métrica some quando o conector não está conectado', () => {
    const a = ambiente();
    const M2 = criarRegistroMetricas({ db: a.db, config: a.config, cofre: a.cofre, log });
    const ativas = M2.ativas().map(m => m.key);
    assert.ok(!ativas.includes('kpis'), 'kpis exige shopify conectado');
    assert.ok(ativas.includes('status_sync'), 'status_sync não exige conector');
    assert.throws(() => M2.executar('kpis', {}), /conecte/);
    a.db.close();
  });
});

describe('contrato: SQL index-safe e recorte único', () => {
  test('faixaDia desloca a borda, nunca embrulha a coluna', () => {
    const sql = faixaDia('created_at');
    assert.ok(!/datetime\(\s*created_at/.test(sql),
      'a coluna indexada não pode ser embrulhada em função no WHERE');
    assert.match(sql, /created_at >=/);
  });

  test('recorte de receita é uma constante única', () => {
    assert.match(VENDA_VALIDA, /cancelled_at IS NULL/);
    assert.match(VENDA_VALIDA, /voided/);
  });

  test('métricas de receita usam a constante, não SQL solto', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/metrics/vendas.js', import.meta.url), 'utf8');
    const usos = (src.match(/VENDA_VALIDA|PEDIDO_PAGO/g) ?? []).length;
    assert.ok(usos >= 3, 'as métricas devem referenciar o recorte canônico');
    assert.ok(!/cancelled_at IS NULL AND \(financial/.test(src.replace(/const VENDA_VALIDA[^\n]*/, '')),
      'nenhuma métrica deve reescrever o recorte à mão');
  });
});

describe('contrato: migração', () => {
  test('rodar migrar() de novo não reaplica nada (idempotente)', () => {
    const { db } = ambiente();
    const r2 = migrar(db, { log });
    assert.equal(r2.aplicadas, 0, 'segunda chamada não deve aplicar migration nenhuma');
    assert.ok(r2.total > 0, 'reporta o total de arquivos de migration existentes');
    db.close();
  });

  test('banco novo aplica todas as migrations disponíveis de uma vez', () => {
    const { db } = ambiente();
    const total = db.prepare('SELECT COUNT(*) n FROM _migrations').get().n;
    assert.ok(total > 0, 'ambiente() já roda migrar() — deve ter registrado as migrations');
    const arquivos = db.prepare('SELECT nome FROM _migrations ORDER BY nome').all().map(r => r.nome);
    assert.deepEqual(arquivos, [...new Set(arquivos)], 'sem migration duplicada na tabela de controle');
    db.close();
  });
});

describe('contrato: datas', () => {
  test('aceita data real', () => assert.equal(validarData('2026-07-24'), '2026-07-24'));
  test('recusa 31 de junho', () => assert.throws(() => validarData('2026-06-31'), /calendário/));
  test('recusa 30 de fevereiro', () => assert.throws(() => validarData('2026-02-30'), /calendário/));
  test('recusa formato solto', () => assert.throws(() => validarData('24/07/2026'), /YYYY-MM-DD/));
});

describe('contrato: cripto', () => {
  test('PII cifra, decifra e não vaza em claro', () => {
    const c = criarCripto({ piiKeyHex: 'b'.repeat(64) });
    const buf = c.cifrar('cliente-12345');
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(!buf.includes(Buffer.from('cliente-12345')), 'texto claro não pode aparecer no blob');
    assert.equal(c.decifrar(buf), 'cliente-12345');
  });

  test('chave diferente não decifra', () => {
    const a = criarCripto({ piiKeyHex: 'b'.repeat(64) });
    const b = criarCripto({ piiKeyHex: 'c'.repeat(64) });
    assert.equal(b.decifrar(a.cifrar('segredo')), null);
  });

  test('hash é determinístico e sem o valor original', () => {
    const c = criarCripto({ piiKeyHex: 'b'.repeat(64) });
    assert.equal(c.hash('abc'), c.hash('abc'));
    assert.notEqual(c.hash('abc'), c.hash('abd'));
    assert.equal(c.hash('abc').length, 64);
  });

  test('chave inválida é rejeitada no boot', () => {
    assert.throws(() => criarCripto({ piiKeyHex: 'curta' }), /64 caracteres hex/);
  });
});

describe('contrato: tema acessível', () => {
  for (const marca of ['#00b900', '#b8243f', '#3a6ea5', '#000000', '#ffdd00']) {
    test(`${marca}: todas as checagens WCAG passam`, () => {
      const t = derivarTema(marca);
      for (const c of t.checagens) {
        assert.ok(c.passa, `${c.nome} falhou com razão ${c.razao}:1`);
      }
    });
    test(`${marca}: paleta de gráfico tem contraste sobre a superfície`, () => {
      const t = derivarTema(marca);
      assert.ok(t.graficos.length >= 3, 'ao menos 3 séries separáveis');
      for (const cor of t.graficos) {
        assert.ok(contraste(cor, '#fcfcfb') >= 3, `${cor} sem contraste suficiente`);
      }
    });
  }
  test('status nunca deriva da marca', () => {
    const a = derivarTema('#00b900').status, b = derivarTema('#b8243f').status;
    assert.deepEqual(a, b, 'cores de status são fixas, não seguem a marca');
  });
});

describe('contrato: cache', () => {
  test('single-flight: chamadas simultâneas compartilham uma execução', async () => {
    const cache = criarCache({ ttlMs: 1000 });
    let execucoes = 0;
    const lento = async () => { execucoes++; await new Promise(r => setTimeout(r, 40)); return 42; };
    const [a, b, c] = await Promise.all([
      cache.pegar('k', lento), cache.pegar('k', lento), cache.pegar('k', lento)]);
    assert.deepEqual([a, b, c], [42, 42, 42]);
    assert.equal(execucoes, 1, 'produziu uma vez só');
  });
});
