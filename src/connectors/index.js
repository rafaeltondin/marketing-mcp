// Registry de conectores: descoberta, estado, execução isolada.
// Um conector nunca derruba outro; o painel funciona com dado parcial.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

export async function carregarConectores() {
  const arquivos = readdirSync(AQUI).filter(f => f.endsWith('.js') && f !== 'index.js');
  const lista = [];
  for (const f of arquivos) {
    const mod = await import(join(AQUI, f));
    if (mod.default?.name) lista.push(mod.default);
  }
  return lista.sort((a, b) => a.name.localeCompare(b.name));
}

export function criarRegistroConectores({ db, cofre, config, log, agendador, cripto }) {
  let conectores = [];

  const api = {
    async carregar() {
      conectores = await carregarConectores();
      log.info('connectors', `${conectores.length} conectores carregados`,
        { nomes: conectores.map(c => c.name).join(',') });
      return conectores;
    },

    todos: () => conectores,
    achar: (nome) => conectores.find(c => c.name === nome),

    // Estado de cada conector para o wizard e o painel.
    estado() {
      return conectores.map(c => {
        const cred = db.prepare(
          'SELECT status, account_ref, last_error, last_check_at FROM credentials WHERE connector = ?'
        ).get(c.name);
        const ultima = db.prepare(
          `SELECT started_at, finished_at, status, records, error FROM job_runs
           WHERE connector LIKE ? ORDER BY id DESC LIMIT 1`
        ).get(`${c.name}%`);
        return {
          nome: c.name,
          rotulo: c.label,
          auth: c.auth?.kind ?? 'apikey',
          status: cred?.status ?? 'nao_configurado',
          conta: cred?.account_ref ?? null,
          erro: cred?.last_error ?? null,
          verificadoEm: cred?.last_check_at ?? null,
          ultimaExecucao: ultima ?? null,
          jobs: (c.jobs ?? []).map(j => j.name),
        };
      });
    },

    // Só vira "conectado" depois de uma chamada real bem-sucedida.
    async validar(nome) {
      const c = api.achar(nome);
      if (!c) throw new Error(`conector desconhecido: ${nome}`);
      try {
        const info = await c.validate(api.contexto(c));
        cofre.marcar(nome, 'conectado', null);
        log.info('connectors', `${nome} validado`, info ?? {});
        return { ok: true, info };
      } catch (e) {
        cofre.marcar(nome, 'erro', e.message);
        return { ok: false, erro: e.message };
      }
    },

    contexto(c, jobNome = null) {
      const fonte = jobNome ? `${c.name}:${jobNome}` : c.name;
      return {
        db, config, cripto, cofre,
        log: log.filho({ conector: fonte }),
        cred: () => cofre.ler(c.name),
        // cursor incremental — erro NUNCA destrói o cursor
        lerCursor: () => db.prepare('SELECT last_cursor FROM sync_state WHERE source = ?').get(fonte)?.last_cursor ?? null,
        gravarCursor: (cursor, { status = 'ok', registros = 0, erro = null } = {}) => {
          db.prepare(`INSERT INTO sync_state (source, last_cursor, last_run, last_status, records, error_message)
                      VALUES (?,?,?,?,?,?)
                      ON CONFLICT(source) DO UPDATE SET
                        last_cursor = COALESCE(excluded.last_cursor, sync_state.last_cursor),
                        last_run = excluded.last_run, last_status = excluded.last_status,
                        records = excluded.records, error_message = excluded.error_message`)
            .run(fonte, cursor, new Date().toISOString(), status, registros, erro);
        },
      };
    },

    // Executa os jobs de um conector, respeitando dependências declaradas em `after`.
    async sincronizar(nome, { job = null, modo = 'incremental' } = {}) {
      const c = api.achar(nome);
      if (!c) throw new Error(`conector desconhecido: ${nome}`);
      if (cofre.estado(nome) !== 'conectado') {
        log.warn('connectors', `${nome} sem credencial — pulando`);
        return { status: 'nao_configurado' };
      }

      const jobs = job ? (c.jobs ?? []).filter(j => j.name === job) : (c.jobs ?? []);
      const isolado = Boolean(job);   // pedido explícito de um job só
      const resultados = {};
      for (const j of jobs) {
        // Dependência vale no fluxo automático: se o anterior falhou, o dependente
        // rodaria sobre dado velho. Chamada explícita de um job é intenção do operador.
        if (!isolado && j.after && resultados[j.after]?.status !== 'ok') {
          log.warn('connectors', `${nome}:${j.name} pulado — depende de ${j.after}`);
          resultados[j.name] = { status: 'pulado' };
          continue;
        }
        resultados[j.name] = await agendador.executar(
          `${nome}:${j.name}`,
          () => j.run(api.contexto(c, j.name), { modo }),
        );
      }
      return resultados;
    },

    agendarTudo() {
      for (const c of conectores) {
        for (const j of c.jobs ?? []) {
          if (!j.schedule) continue;
          agendador.registrar(`${c.name}:${j.name}`, j.schedule, async () => {
            if (cofre.estado(c.name) !== 'conectado') return { registros: 0 };
            return j.run(api.contexto(c, j.name), { modo: 'incremental' });
          });
        }
      }
    },
  };
  return api;
}
