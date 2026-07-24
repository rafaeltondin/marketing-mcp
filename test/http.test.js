// Testes do cliente HTTP dos conectores: retry/backoff, 429 com Retry-After,
// 401→renovação, 4xx não re-tentado, rate-limit disfarçado de 200 e paginação por Link.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { criarHttp, ErroHttp } from '../src/core/http.js';

// Servidor fake local: cada teste registra sua própria sequência de respostas.
function servidorFake(handler) {
  const srv = http.createServer(handler);
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

describe('contrato: cliente http', () => {
  test('5xx transitório é re-tentado até suceder', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => {
      chamadas++;
      if (chamadas < 3) { res.writeHead(503); return res.end('indisponível'); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    const http1 = criarHttp({ base: `http://127.0.0.1:${srv.address().port}`, tentativas: 4 });
    const r = await http1.get('/x');
    assert.deepEqual(r, { ok: true });
    assert.equal(chamadas, 3, 'tentou até a 3ª chamada suceder');
    srv.close();
  });

  test('4xx real não é re-tentado', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => {
      chamadas++;
      res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"erro":"não achado"}');
    });
    const http1 = criarHttp({ base: `http://127.0.0.1:${srv.address().port}`, tentativas: 4 });
    await assert.rejects(() => http1.get('/x'), ErroHttp);
    assert.equal(chamadas, 1, '4xx não consome tentativas extras');
    srv.close();
  });

  test('esgota tentativas e lança o último erro em 5xx persistente', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => { chamadas++; res.writeHead(500); res.end('erro'); });
    const http1 = criarHttp({ base: `http://127.0.0.1:${srv.address().port}`, tentativas: 3 });
    await assert.rejects(() => http1.get('/x'), ErroHttp);
    assert.equal(chamadas, 3, 'esgotou exatamente as tentativas configuradas');
    srv.close();
  });

  test('429 com Retry-After espera o tempo indicado e não consome tentativa', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => {
      chamadas++;
      if (chamadas === 1) { res.writeHead(429, { 'retry-after': '0' }); return res.end('rate limit'); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    const http1 = criarHttp({ base: `http://127.0.0.1:${srv.address().port}`, tentativas: 2 });
    const r = await http1.get('/x');
    assert.deepEqual(r, { ok: true });
    assert.equal(chamadas, 2);
    srv.close();
  });

  test('rate limit disfarçado de 200 é detectado via ehTransitorio', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => {
      chamadas++;
      if (chamadas === 1) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"codigo_erro":6}'); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    const http1 = criarHttp({
      base: `http://127.0.0.1:${srv.address().port}`, tentativas: 2,
      ehTransitorio: (res, corpo) => corpo?.codigo_erro === 6,
    });
    const r = await http1.get('/x');
    assert.deepEqual(r, { ok: true });
    assert.equal(chamadas, 2, 'o 200 disfarçado não contou como sucesso');
    srv.close();
  });

  test('401 aciona renovação de credencial uma vez e reusa headers novos', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => {
      chamadas++;
      if (req.headers['authorization'] !== 'Bearer novo') { res.writeHead(401); return res.end('expirado'); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    let renovacoes = 0;
    const http1 = criarHttp({
      base: `http://127.0.0.1:${srv.address().port}`, tentativas: 3,
      aoRenovar: async () => { renovacoes++; return { authorization: 'Bearer novo' }; },
    });
    const r = await http1.get('/x');
    assert.deepEqual(r, { ok: true });
    assert.equal(renovacoes, 1, 'renovou uma única vez');
    assert.equal(chamadas, 2, '1ª tentativa (401) + 2ª com credencial nova');
    srv.close();
  });

  test('paginarLink segue o header Link rel=next até acabar', async () => {
    const srv = await servidorFake((req, res) => {
      const porta = srv.address().port;
      if (req.url === '/lista') {
        res.writeHead(200, { 'content-type': 'application/json', link: `<http://127.0.0.1:${porta}/lista?p=2>; rel="next"` });
        return res.end('{"itens":[1,2]}');
      }
      res.writeHead(200, { 'content-type': 'application/json' }); // sem Link: última página
      res.end('{"itens":[3]}');
    });
    const http1 = criarHttp({ base: `http://127.0.0.1:${srv.address().port}` });
    const paginas = [];
    for await (const p of http1.paginarLink('/lista')) paginas.push(p);
    assert.deepEqual(paginas, [{ itens: [1, 2] }, { itens: [3] }]);
    srv.close();
  });

  test('timeout aborta a requisição e conta como falha re-tentável', async () => {
    let chamadas = 0;
    const srv = await servidorFake((req, res) => {
      chamadas++;
      if (chamadas === 1) return; // nunca responde — força o timeout
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    const http1 = criarHttp({ base: `http://127.0.0.1:${srv.address().port}`, tentativas: 2, timeoutMs: 150 });
    const r = await http1.get('/x');
    assert.deepEqual(r, { ok: true });
    assert.equal(chamadas, 2);
    srv.close();
  });
});
