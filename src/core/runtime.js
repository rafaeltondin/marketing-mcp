// O processo: log estruturado, config do tenant, cache e agendador.
// Substitui logger.js + config.js + cache.js + scheduler.js — mudam juntos, moram juntos.
import cron from 'node-cron';

// ---- log ------------------------------------------------------------------
// 1 linha JSON por evento (padrão da casa: requestId + duration, nunca segredo).
const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40 };

export function criarLog({ nivel = process.env.LOG_LEVEL || 'info', tenant = null } = {}) {
  const min = NIVEIS[nivel] ?? 20;
  const emitir = (lvl, step, msg, extra) => {
    if (NIVEIS[lvl] < min) return;
    const linha = { ts: new Date().toISOString(), lvl, step, msg };
    if (tenant) linha.tenant = tenant;
    if (extra && Object.keys(extra).length) Object.assign(linha, extra);
    (lvl === 'error' ? console.error : console.log)(JSON.stringify(linha));
  };
  return {
    debug: (s, m, e) => emitir('debug', s, m, e),
    info:  (s, m, e) => emitir('info',  s, m, e),
    warn:  (s, m, e) => emitir('warn',  s, m, e),
    error: (s, m, e) => emitir('error', s, m, e),
    filho: (extra) => {
      const base = criarLog({ nivel, tenant });
      return {
        debug: (s, m, e) => base.debug(s, m, { ...extra, ...e }),
        info:  (s, m, e) => base.info(s, m, { ...extra, ...e }),
        warn:  (s, m, e) => base.warn(s, m, { ...extra, ...e }),
        error: (s, m, e) => base.error(s, m, { ...extra, ...e }),
      };
    },
  };
}

// ---- config do tenant -----------------------------------------------------
// Fica no banco (preenchida pelo wizard), não em env. Env só carrega infra.
export function criarConfig({ db }) {
  const cache = new Map();
  const api = {
    get(chave, padrao = null) {
      if (cache.has(chave)) return cache.get(chave);
      const r = db.prepare('SELECT value FROM tenant_config WHERE key = ?').get(chave);
      const v = r ? JSON.parse(r.value) : padrao;
      cache.set(chave, v);
      return v;
    },
    set(chave, valor) {
      db.prepare(`INSERT INTO tenant_config (key, value, updated_at) VALUES (?,?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
        .run(chave, JSON.stringify(valor), new Date().toISOString());
      cache.set(chave, valor);
    },
    tudo() {
      const linhas = db.prepare('SELECT key, value FROM tenant_config').all();
      return Object.fromEntries(linhas.map(l => [l.key, JSON.parse(l.value)]));
    },
    // A loja está configurada? Define se o wizard aparece.
    configurado() { return !!api.get('store.domain'); },
    invalidar() { cache.clear(); },
  };
  return api;
}

// ---- cache com TTL + single-flight ---------------------------------------
// Com um processo só, cache distribuído (Redis) é complexidade sem função.
export function criarCache({ ttlMs = 300_000, max = 500 } = {}) {
  const dados = new Map();
  const voando = new Map();

  return {
    async pegar(chave, produzir, { ttl = ttlMs } = {}) {
      const hit = dados.get(chave);
      if (hit && hit.expira > Date.now()) return hit.valor;

      // single-flight: chamadas idênticas simultâneas compartilham uma promessa
      if (voando.has(chave)) return voando.get(chave);

      const p = (async () => {
        try {
          const valor = await produzir();
          if (dados.size >= max) dados.delete(dados.keys().next().value);
          dados.set(chave, { valor, expira: Date.now() + ttl });
          return valor;
        } finally {
          voando.delete(chave);
        }
      })();
      voando.set(chave, p);
      return p;
    },
    limpar(prefixo) {
      if (!prefixo) return dados.clear();
      for (const k of dados.keys()) if (k.startsWith(prefixo)) dados.delete(k);
    },
  };
}

// ---- agendador ------------------------------------------------------------
// Cada job isolado: erro não propaga, execução registrada, e circuit breaker
// suspende o que está falhando em série em vez de queimar a janela de rate limit.
export function criarAgendador({ db, log, tz = 'America/Sao_Paulo' }) {
  const tarefas = [];
  const falhas = new Map();
  const suspensoEm = new Map();          // nome -> timestamp da suspensão (reset por tempo)
  let emAndamento = 0;                    // jobs rodando agora (para graceful shutdown)
  const LIMITE_FALHAS = 3;
  const REARME_MS = 15 * 60_000;         // circuit breaker se auto-rearma após 15min

  const redigir = (s) => String(s ?? '')
    .replace(/(shpat_|Bearer\s+|token=|access_token=|api[_-]?key=)[A-Za-z0-9._-]+/gi, '$1[REDIGIDO]')
    .slice(0, 500);

  async function executar(nome, fn, { forcar = false } = {}) {
    const bloqueado = (falhas.get(nome) ?? 0) >= LIMITE_FALHAS;
    const rearmar = bloqueado && Date.now() - (suspensoEm.get(nome) ?? 0) >= REARME_MS;
    if (rearmar) { falhas.set(nome, 0); log.info('scheduler', `${nome} rearmado após janela`); }
    if (!forcar && bloqueado && !rearmar) {
      log.warn('scheduler', `${nome} suspenso por falhas consecutivas`, { falhas: falhas.get(nome) });
      return { status: 'suspenso' };
    }
    const inicio = Date.now();
    emAndamento++;
    const id = db.prepare(`INSERT INTO job_runs (connector, started_at, status) VALUES (?,?,?)`)
      .run(nome, new Date().toISOString(), 'rodando').lastInsertRowid;
    try {
      const r = await fn();
      falhas.set(nome, 0);
      db.prepare(`UPDATE job_runs SET finished_at=?, status=?, records=? WHERE id=?`)
        .run(new Date().toISOString(), 'ok', r?.registros ?? 0, id);
      log.info('scheduler', `${nome} ok`, { ms: Date.now() - inicio, registros: r?.registros ?? 0 });
      return { status: 'ok', ...r };
    } catch (e) {
      const n = (falhas.get(nome) ?? 0) + 1;
      falhas.set(nome, n);
      if (n >= LIMITE_FALHAS) suspensoEm.set(nome, Date.now());
      db.prepare(`UPDATE job_runs SET finished_at=?, status=?, error=? WHERE id=?`)
        .run(new Date().toISOString(), 'erro', redigir(e.message), id);
      log.error('scheduler', `${nome} falhou`, { ms: Date.now() - inicio, erro: redigir(e.message) });
      return { status: 'erro', erro: e.message };
    } finally {
      emAndamento--;
    }
  }

  return {
    registrar(nome, expressao, fn) {
      const t = cron.schedule(expressao, () => executar(nome, fn), { scheduled: false, timezone: tz });
      tarefas.push({ nome, expressao, t });
    },
    iniciar() {
      tarefas.forEach(({ nome, expressao, t }) => {
        t.start();
        log.info('scheduler', `agendado ${nome}`, { cron: expressao, tz });
      });
    },
    parar() { tarefas.forEach(({ t }) => t.stop()); },
    executar,
    resetar(nome) { falhas.set(nome, 0); suspensoEm.delete(nome); },
    emAndamento: () => emAndamento,
    // Espera os jobs em andamento drenarem (para shutdown sem corromper o banco).
    async aguardarOcioso(timeoutMs = 25_000) {
      const fim = Date.now() + timeoutMs;
      while (emAndamento > 0 && Date.now() < fim) {
        await new Promise((r) => setTimeout(r, 200));
      }
      return emAndamento === 0;
    },
  };
}
