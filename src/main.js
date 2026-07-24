// Entrypoint. ROLE define o papel: web (painel+API+MCP), worker (só ETL) ou all.
// Uma imagem, três modos — separar web de worker é decisão de operação, não de código.
import { join } from 'node:path';
import { abrirBanco, migrar } from './core/db.js';
import { criarCripto, criarCofre } from './core/secrets.js';
import { criarLog, criarConfig, criarAgendador } from './core/runtime.js';
import { criarRegistroConectores } from './connectors/index.js';
import { criarRegistroMetricas } from './metrics/index.js';
import { criarServidor } from './web/server.js';
import { criarMcp } from './mcp.js';

const ROLE = process.env.ROLE ?? 'all';
const TENANT = process.env.TENANT ?? 'default';
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const PORT = Number(process.env.PORT ?? 3000);

const log = criarLog({ tenant: TENANT });

function exigir(nome, dica) {
  const v = process.env[nome];
  if (!v) {
    log.error('boot', `variável obrigatória ausente: ${nome}`, { dica });
    process.exit(1);
  }
  return v;
}

async function main() {
  log.info('boot', 'iniciando storekit', { role: ROLE, tenant: TENANT, versao: process.env.APP_VERSION ?? 'dev' });

  // Cripto é pré-requisito, não opção: sem chave o processo não sobe.
  const dbKey = exigir('DB_KEY', 'chave do SQLCipher — 32+ caracteres, guardada no vault');
  const piiKey = exigir('PII_KEY', '64 caracteres hex (32 bytes) para AES-256-GCM da PII');

  const db = abrirBanco({ caminho: join(DATA_DIR, TENANT, 'store.db'), chave: dbKey });
  const { aplicadas } = migrar(db, { log });
  log.info('boot', `banco pronto`, { migrations: aplicadas });

  const cripto = criarCripto({ piiKeyHex: piiKey });
  const cofre = criarCofre({ db, cripto, log });
  const config = criarConfig({ db });
  const agendador = criarAgendador({ db, log, tz: config.get('store.timezone') ?? 'America/Sao_Paulo' });

  const conectores = criarRegistroConectores({ db, cofre, config, log, agendador, cripto });
  await conectores.carregar();
  const metricas = criarRegistroMetricas({ db, config, cofre, log });

  if (ROLE === 'worker' || ROLE === 'all') {
    conectores.agendarTudo();
    // Retenção: job_runs cresce indefinidamente (4 jobs a cada 15min). Poda diária.
    const DIAS_RETENCAO = Number(process.env.JOB_RUNS_RETENCAO_DIAS ?? 30);
    agendador.registrar('sistema:retencao', '0 4 * * *', async () => {
      const corte = new Date(Date.now() - DIAS_RETENCAO * 864e5).toISOString();
      const r = db.prepare('DELETE FROM job_runs WHERE started_at < ?').run(corte);
      return { registros: r.changes };
    });
    agendador.iniciar();
  }

  let app = null;
  if (ROLE === 'web' || ROLE === 'all') {
    const mcp = criarMcp({ metricas, conectores, config, log });
    app = await criarServidor({ db, config, cofre, conectores, metricas, log, mcp });
    await app.listen({ port: PORT, host: '0.0.0.0' });
    log.info('boot', `ouvindo em :${PORT}`, {
      configurado: config.configurado(),
      conectores: conectores.todos().length,
      metricas: metricas.ativas().length,
    });
  }

  let encerrando = false;
  const encerrar = async (sinal) => {
    if (encerrando) return;            // não fecha o banco duas vezes
    encerrando = true;
    log.info('shutdown', `recebido ${sinal}`);
    agendador.parar();                 // não dispara novos jobs
    try { await app?.close(); } catch {}
    // Espera job em andamento terminar ANTES de fechar o banco (evita corrupção).
    const ocioso = await agendador.aguardarOcioso(25_000);
    if (!ocioso) log.warn('shutdown', 'jobs ainda ativos ao encerrar', { emAndamento: agendador.emAndamento() });
    try { db.close(); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

main().catch(e => {
  log.error('boot', 'falha fatal', { erro: e.message, stack: e.stack?.split('\n')[1]?.trim() });
  process.exit(1);
});
