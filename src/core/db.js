// Banco do tenant: SQLite cifrado (SQLCipher) + migrations idempotentes.
// Um arquivo por loja em DATA_DIR/<tenant>/store.db.
import Database from 'better-sqlite3-multiple-ciphers';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function abrirBanco({ caminho, chave }) {
  mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);

  // A chave precisa vir ANTES de qualquer leitura, senão o arquivo é ilegível.
  if (chave) db.pragma(`key='${chave.replace(/'/g, "''")}'`);

  db.pragma('journal_mode = WAL');      // leitores não bloqueiam o ETL
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Falha cedo e com mensagem clara se a chave estiver errada.
  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (e) {
    db.close();
    if (String(e.code).includes('NOTADB')) {
      throw new Error('banco ilegível: chave de criptografia incorreta ou arquivo corrompido');
    }
    throw e;
  }
  return db;
}

// Migrations: arquivos .sql ordenados, aplicados uma vez, dentro de transação.
export function migrar(db, { log } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)`);

  const jaAplicadas = new Set(db.prepare('SELECT nome FROM _migrations').all().map(r => r.nome));
  const dir = join(RAIZ, 'migrations');
  const arquivos = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  let aplicadas = 0;
  for (const arq of arquivos) {
    if (jaAplicadas.has(arq)) continue;
    const sql = readFileSync(join(dir, arq), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (nome, aplicada_em) VALUES (?, ?)')
        .run(arq, new Date().toISOString());
    })();
    aplicadas++;
    log?.info('migrate', `aplicada ${arq}`);
  }
  return { aplicadas, total: arquivos.length };
}

// ---- helpers de tempo ----------------------------------------------------
// O negócio opera em America/Sao_Paulo (UTC-3 fixo desde 2019, sem horário de verão).
// Os dados ficam em UTC; a correção é sempre na consulta.
export const OFFSET_HORAS = -3;

// Bucket: agrupar por dia/hora civil brasileiro.
export const BUCKET = (col = 'created_at') => `datetime(${col}, '${OFFSET_HORAS} hours')`;

// Range: desloca a BORDA, nunca a coluna — envolver a coluna no WHERE mata o índice
// (medido no sistema atual: 7,8s vs 0,2s).
export function faixaDia(col = 'created_at') {
  return `${col} >= datetime(:de, '${-OFFSET_HORAS} hours')
      AND ${col} <  datetime(:ate, '+1 day', '${-OFFSET_HORAS} hours')`;
}

export function agoraBrt() {
  return new Date(Date.now() + OFFSET_HORAS * 3600 * 1000);
}

export function hojeBrt() {
  return agoraBrt().toISOString().slice(0, 10);
}

// Valida data do calendário real: 2026-06-31 é recusada, nunca normalizada.
export function validarData(s, campo = 'data') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${campo} deve estar em YYYY-MM-DD`);
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`${campo} não existe no calendário: ${s}`);
  }
  return s;
}

// Período padrão: 1º de janeiro do ano corrente até hoje, em BRT.
export function periodoPadrao() {
  const hoje = hojeBrt();
  return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
}

// ---- recorte canônico de receita -----------------------------------------
// A definição de "venda que conta" existe UMA vez. Toda métrica usa esta constante.
// Replicamos o comportamento atual do painel para o shadow-run bater; mudar a
// semântica é decisão separada, depois do cutover (ver briefing §7).
export const VENDA_VALIDA =
  `cancelled_at IS NULL AND (financial_status IS NULL OR financial_status <> 'voided')`;

// Usado nas métricas de produto (espelha FINANCIAL_STATUS_PAGOS do sistema atual).
export const PEDIDO_PAGO = `financial_status IN ('paid','partially_refunded')`;

// Grava lote grande sem segurar o event loop nem estourar transação única.
export function inserirEmLotes(db, stmt, linhas, tamanho = 500) {
  let n = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const fatia = linhas.slice(i, i + tamanho);
    db.transaction(() => { for (const l of fatia) stmt.run(l); })();
    n += fatia.length;
  }
  return n;
}
