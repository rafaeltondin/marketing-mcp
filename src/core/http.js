// Cliente HTTP dos conectores: timeout, retry com backoff, 429/Retry-After,
// paginação e injeção de credencial. Toda essa lógica existe UMA vez — no sistema
// atual cada sources/*.js reimplementa a própria variação, e é aí que moram os
// bugs de rate limit que já custaram incidente.

const TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ErroHttp extends Error {
  constructor(status, corpo, url) {
    super(`HTTP ${status} em ${url}: ${String(corpo).slice(0, 200)}`);
    this.name = 'ErroHttp';
    this.status = status;
    this.corpo = corpo;
  }
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

export function criarHttp({
  base = '',
  headers: headersBase = {},
  timeoutMs = 30_000,
  tentativas = 4,
  log,
  // Permite ao conector dizer que um 200 é, na verdade, rate limit.
  // (Tiny devolve HTTP 200 com codigo_erro=6; UpPromote devolve 400 "Too Many Attempts".)
  ehTransitorio = null,
  aoRenovar = null,      // chamado em 401 para renovar token; devolve headers novos
} = {}) {

  async function req(caminho, opcoes = {}) {
    const url = caminho.startsWith('http') ? caminho : `${base}${caminho}`;
    let headers = { ...headersBase, ...(opcoes.headers || {}) };
    let ultimoErro;

    for (let n = 1; n <= tentativas; n++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), opcoes.timeoutMs ?? timeoutMs);
      try {
        const res = await fetch(url, { ...opcoes, headers, signal: ac.signal });
        clearTimeout(timer);
        const texto = await res.text();
        let corpo;
        try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }

        // 401: tenta renovar a credencial uma vez antes de desistir.
        if (res.status === 401 && aoRenovar && n === 1) {
          const novos = await aoRenovar();
          if (novos) { headers = { ...headers, ...novos }; continue; }
        }

        // Rate limit que chega disfarçado de sucesso.
        const disfarcado = ehTransitorio?.(res, corpo);
        if (res.ok && !disfarcado) return { corpo, headers: res.headers, status: res.status };

        if (res.status === 429 || disfarcado) {
          const espera = Number(res.headers.get('retry-after')) * 1000 || Math.min(2 ** n * 1000, 30_000);
          log?.warn('http', `rate limit, aguardando ${espera}ms`, { url, tentativa: n });
          await dormir(espera);
          continue;   // 429 não consome tentativa útil: é espera, não falha
        }

        if (!TRANSITORIOS.has(res.status)) throw new ErroHttp(res.status, corpo, url);

        ultimoErro = new ErroHttp(res.status, corpo, url);
        await dormir(Math.min(500 * 2 ** (n - 1), 16_000) + Math.random() * 250);
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof ErroHttp) throw e;            // 4xx real não é re-tentado
        ultimoErro = e;
        if (n === tentativas) break;
        await dormir(Math.min(500 * 2 ** (n - 1), 16_000) + Math.random() * 250);
      }
    }
    throw ultimoErro ?? new Error(`falha ao chamar ${url}`);
  }

  return {
    req,
    async get(caminho, opcoes) { return (await req(caminho, { ...opcoes, method: 'GET' })).corpo; },
    async post(caminho, corpo, opcoes) {
      return (await req(caminho, {
        ...opcoes, method: 'POST',
        headers: { 'content-type': 'application/json', ...(opcoes?.headers || {}) },
        body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
      })).corpo;
    },
    // Paginação por header Link rel="next" — o padrão do Shopify REST.
    // Nunca usar page=N: a Shopify não suporta e silenciosamente repete a 1ª página.
    async *paginarLink(caminho, opcoes = {}) {
      let proxima = caminho;
      let pagina = 0;
      while (proxima && pagina < (opcoes.maxPaginas ?? 500)) {
        const r = await req(proxima, { ...opcoes, method: 'GET' });
        yield r.corpo;
        pagina++;
        const link = r.headers.get('link') || '';
        const m = link.match(/<([^>]+)>;\s*rel="?next"?/);
        proxima = m ? m[1] : null;
        if (proxima && opcoes.pausaMs) await dormir(opcoes.pausaMs);
      }
    },
  };
}
