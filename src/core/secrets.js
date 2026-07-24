// Criptografia e cofre de credenciais.
// PII: AES-256-GCM (iv|tag|ciphertext) — mesmo formato do sistema atual, para a
// migração poder copiar os blobs sem decifrar.
// Identificadores pesquisáveis: HMAC-SHA256 determinístico (permite COUNT DISTINCT
// sem revelar o valor). Trocar a chave muda os hashes e quebra a contagem histórica.
import crypto from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

function chaveDe(hex, nome) {
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`${nome} deve ser 64 caracteres hex (32 bytes)`);
  }
  return Buffer.from(hex, 'hex');
}

export function criarCripto({ piiKeyHex }) {
  const chave = chaveDe(piiKeyHex, 'PII_KEY');
  const chaveHmac = crypto.createHash('sha256').update(Buffer.concat([chave, Buffer.from('hmac')])).digest();

  return {
    cifrar(texto) {
      if (texto === null || texto === undefined || texto === '') return null;
      const iv = crypto.randomBytes(IV_BYTES);
      const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
      const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), dados]);
    },

    decifrar(buf) {
      if (!buf || buf.length < IV_BYTES + TAG_BYTES) return null;
      try {
        const iv = buf.subarray(0, IV_BYTES);
        const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
        const d = crypto.createDecipheriv('aes-256-gcm', chave, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(buf.subarray(IV_BYTES + TAG_BYTES)), d.final()]).toString('utf8');
      } catch {
        return null; // tag inválida = dado adulterado ou chave errada
      }
    },

    hash(valor) {
      if (valor === null || valor === undefined || valor === '') return null;
      return crypto.createHmac('sha256', chaveHmac).update(String(valor)).digest('hex');
    },
  };
}

// ---- cofre de credenciais -------------------------------------------------
// Credencial de integração vive cifrada no banco, NUNCA em env: env vaza em
// `docker inspect` (é uma pendência real do stack atual).
export function criarCofre({ db, cripto, log }) {
  const cofre = {
    listar() {
      return db.prepare(`SELECT connector, kind, account_ref, status, expires_at,
                                last_check_at, last_error, updated_at
                         FROM credentials ORDER BY connector`).all();
    },

    estado(conector) {
      const r = db.prepare('SELECT status FROM credentials WHERE connector = ?').get(conector);
      return r?.status ?? 'nao_configurado';
    },

    ler(conector) {
      const r = db.prepare('SELECT payload_enc, account_ref, expires_at FROM credentials WHERE connector = ?').get(conector);
      if (!r) return null;
      const txt = cripto.decifrar(r.payload_enc);
      if (!txt) { log?.error('cofre', `credencial de ${conector} ilegível`); return null; }
      return { ...JSON.parse(txt), accountRef: r.account_ref, expiresAt: r.expires_at };
    },

    gravar(conector, { kind, payload, accountRef = null, expiresAt = null, status = 'conectado', erro = null }) {
      db.prepare(`INSERT INTO credentials
          (connector, kind, payload_enc, account_ref, status, expires_at, last_check_at, last_error, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(connector) DO UPDATE SET
          kind=excluded.kind, payload_enc=excluded.payload_enc, account_ref=excluded.account_ref,
          status=excluded.status, expires_at=excluded.expires_at,
          last_check_at=excluded.last_check_at, last_error=excluded.last_error,
          updated_at=excluded.updated_at`)
        .run(conector, kind, cripto.cifrar(JSON.stringify(payload)), accountRef,
             status, expiresAt, new Date().toISOString(), erro, new Date().toISOString());
    },

    marcar(conector, status, erro = null) {
      db.prepare(`UPDATE credentials SET status=?, last_error=?, last_check_at=?, updated_at=?
                  WHERE connector=?`)
        .run(status, erro, new Date().toISOString(), new Date().toISOString(), conector);
      if (status !== 'conectado') log?.warn('cofre', `${conector} -> ${status}`, { erro });
    },

    remover(conector) {
      db.prepare('DELETE FROM credentials WHERE connector = ?').run(conector);
    },

    // Token perto de expirar é renovado ANTES de falhar. Requisito de dia 1:
    // no sistema atual uma fonte ficou 10 dias parada com token revogado, em silêncio.
    precisaRenovar(conector, margemMs = 5 * 60_000) {
      const c = cofre.ler(conector);
      if (!c?.expiresAt) return false;
      return new Date(c.expiresAt).getTime() - Date.now() < margemMs;
    },
  };
  return cofre;
}
