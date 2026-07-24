// Fastify: API gerada do registry + wizard de setup + painel.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { extrairIdentidade, escolherMarca, derivarTema } from '../brand.js';
import { paginaSetup, paginaPainel, paginaLogin } from './ui.js';

const JWT_DEFAULT = 'troque-em-producao';

export async function criarServidor({ db, config, cofre, conectores, metricas, log, mcp }) {
  // Em produção, recusar subir com o segredo default (assinatura de sessão trivial).
  const jwtSecret = process.env.JWT_SECRET || JWT_DEFAULT;
  if (process.env.NODE_ENV === 'production' && jwtSecret === JWT_DEFAULT) {
    throw new Error('JWT_SECRET ausente ou default em produção — gere com `npm run genkeys`');
  }

  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  // Registro de auditoria de ações sensíveis.
  const auditar = (ator, acao, detalhe = null) => {
    try {
      db.prepare('INSERT INTO audit_log (ts, ator, acao, detalhe) VALUES (?,?,?,?)')
        .run(new Date().toISOString(), ator ?? 'anon', acao, detalhe);
    } catch (e) { log.warn('audit', e.message); }
  };

  // Cabeçalhos de segurança em toda resposta.
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (process.env.COOKIE_SECURE !== 'false') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });

  // Body vazio com content-type json é comum em POST de ação (ex.: disparar sync).
  // O parser padrão do Fastify devolve 400; aqui trata como objeto vazio.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, corpo, done) => {
    if (!corpo || !String(corpo).trim()) return done(null, {});
    try { done(null, JSON.parse(corpo)); }
    catch (e) { e.statusCode = 400; done(e); }
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: jwtSecret,
    cookie: { cookieName: 'sk_token', signed: false },
  });
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });

  const precisaAuth = async (req, reply) => {
    try { await req.jwtVerify(); }
    catch { return reply.code(401).send({ erro: 'não autenticado' }); }
  };
  const precisaAdmin = async (req, reply) => {
    await precisaAuth(req, reply);
    if (req.user?.role !== 'admin') return reply.code(403).send({ erro: 'requer admin' });
  };

  const temUsuario = () => db.prepare('SELECT COUNT(*) n FROM users').get().n > 0;

  // ---- saúde -------------------------------------------------------------
  app.get('/health', async () => ({
    ok: true, configurado: config.configurado(), versao: process.env.APP_VERSION ?? 'dev',
  }));

  // Readiness: só 200 se o banco responde (migrations aplicadas, arquivo legível).
  app.get('/ready', async (_req, reply) => {
    try { db.prepare('SELECT 1').get(); return { ready: true }; }
    catch (e) { return reply.code(503).send({ ready: false, erro: e.message }); }
  });

  // Métricas Prometheus (texto). Saúde de conector/sync + processo.
  app.get('/metrics', async (_req, reply) => {
    reply.type('text/plain; version=0.0.4');
    const linhas = ['# storekit metrics', 'storekit_up 1'];
    const esc = (s) => String(s ?? '').replace(/["\\\n]/g, '_');
    for (const c of conectores.estado()) {
      linhas.push(`storekit_connector_up{connector="${esc(c.nome)}",status="${esc(c.status)}"} ${c.status === 'conectado' ? 1 : 0}`);
      if (c.ultimaExecucao) {
        linhas.push(`storekit_job_last_records{connector="${esc(c.nome)}"} ${Number(c.ultimaExecucao.records ?? 0)}`);
        linhas.push(`storekit_job_last_ok{connector="${esc(c.nome)}"} ${c.ultimaExecucao.status === 'ok' ? 1 : 0}`);
      }
    }
    const sync = db.prepare('SELECT source, records, last_status FROM sync_state').all();
    for (const s of sync) {
      linhas.push(`storekit_sync_records{source="${esc(s.source)}",status="${esc(s.last_status)}"} ${Number(s.records ?? 0)}`);
    }
    const mem = process.memoryUsage();
    linhas.push(`process_resident_memory_bytes ${mem.rss}`);
    linhas.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);
    linhas.push(`process_uptime_seconds ${Math.round(process.uptime())}`);
    return linhas.join('\n') + '\n';
  });

  // OpenAPI 3 gerado do MESMO registry que serve REST e MCP.
  app.get('/openapi.json', async () => {
    const paths = {};
    for (const m of metricas.todas()) {
      const params = [];
      if (m.params?.periodo) {
        params.push({ name: 'de', in: 'query', schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, description: 'início (YYYY-MM-DD)' });
        params.push({ name: 'ate', in: 'query', schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, description: 'fim (YYYY-MM-DD)' });
      }
      for (const [k, def] of Object.entries(m.params ?? {})) {
        if (k === 'periodo') continue;
        params.push({ name: k, in: 'query', required: !!def.obrigatorio,
          schema: { type: def.tipo === 'number' ? 'number' : 'string' }, description: def.label ?? k });
      }
      paths[`/api/m/${m.key}`] = {
        get: { summary: m.title, description: m.descricao ?? '', tags: ['métricas'],
          security: [{ cookieAuth: [] }], parameters: params,
          responses: { 200: { description: 'ok' }, 400: { description: 'parâmetro inválido' }, 401: { description: 'não autenticado' } } },
      };
    }
    return {
      openapi: '3.0.3',
      info: { title: 'storekit API', version: process.env.APP_VERSION ?? 'dev',
        description: 'Métricas de e-commerce. As mesmas definições servem o painel, o MCP e esta API.' },
      components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sk_token' } } },
      paths,
    };
  });

  // ---- autenticação ------------------------------------------------------
  app.post('/api/setup/admin', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (temUsuario()) return reply.code(409).send({ erro: 'já existe usuário' });
      const { username, password } = req.body ?? {};
      if (!username || !password || password.length < 8) {
        return reply.code(400).send({ erro: 'usuário e senha (mín. 8 caracteres) obrigatórios' });
      }
      db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)')
        .run(username, bcrypt.hashSync(password, 10), 'admin', new Date().toISOString());
      log.info('setup', 'admin criado', { username });
      return { ok: true };
    });

  app.post('/api/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { username, password } = req.body ?? {};
      const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').slice(0, 60));
      if (!u || !bcrypt.compareSync(String(password ?? ''), u.password_hash)) {
        log.warn('auth', 'login falhou', { username });
        return reply.code(401).send({ erro: 'credenciais inválidas' });
      }
      auditar(u.username, 'login');
      const token = app.jwt.sign({ id: u.id, username: u.username, role: u.role }, { expiresIn: '12h' });
      reply.setCookie('sk_token', token, {
        httpOnly: true, sameSite: 'lax', path: '/', maxAge: 43200,
        secure: process.env.COOKIE_SECURE !== 'false',
      });
      return { ok: true, usuario: { username: u.username, role: u.role } };
    });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie('sk_token', { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: precisaAuth }, async (req) => ({
    usuario: req.user, configurado: config.configurado(),
  }));

  // ---- configuração e wizard --------------------------------------------
  app.get('/api/config', async () => ({
    configurado: config.configurado(),
    temAdmin: temUsuario(),
    loja: {
      nome: config.get('store.name'), dominio: config.get('store.domain'),
      moeda: config.get('store.currency'), fuso: config.get('store.timezone'),
    },
    marca: config.get('brand') ?? null,
    conectores: conectores.estado(),
  }));

  app.get('/api/conectores', { preHandler: precisaAuth }, async () => conectores.estado());

  // Conectar uma integração: grava credencial e valida com chamada real.
  app.post('/api/conectores/:nome', { preHandler: precisaAdmin }, async (req, reply) => {
    const { nome } = req.params;
    const c = conectores.achar(nome);
    if (!c) return reply.code(404).send({ erro: 'conector desconhecido' });

    // Anti-SSRF: o servidor vai CHAMAR o domínio informado. Só *.myshopify.com.
    if (nome === 'shopify') {
      const shop = String(req.body?.shop ?? '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
        return reply.code(400).send({ erro: 'domínio inválido: use minha-loja.myshopify.com' });
      }
      req.body.shop = shop;
    }

    cofre.gravar(nome, { kind: c.auth?.kind ?? 'apikey', payload: req.body ?? {}, status: 'nao_configurado' });
    const r = await conectores.validar(nome);
    if (!r.ok) { auditar(req.user?.username, `conectar:${nome}:falha`, r.erro); return reply.code(400).send({ erro: r.erro }); }
    auditar(req.user?.username, `conectar:${nome}`, r.info ? JSON.stringify(r.info).slice(0, 200) : null);

    // Ao conectar a loja, o painel já se veste com a identidade dela.
    if (nome === 'shopify') { try { await aplicarTema(req.body); } catch (e) { log.warn('brand', e.message); } }
    return { ok: true, info: r.info, marca: config.get('brand') ?? null };
  });

  app.delete('/api/conectores/:nome', { preHandler: precisaAdmin }, async (req) => {
    cofre.remover(req.params.nome);
    auditar(req.user?.username, `desconectar:${req.params.nome}`);
    return { ok: true };
  });

  // Dispara sync manual (o agendador cuida do resto).
  app.post('/api/conectores/:nome/sync', { preHandler: precisaAdmin }, async (req) => {
    const { job, modo } = req.query ?? {};
    auditar(req.user?.username, `sync:${req.params.nome}`, job ? `job=${job}` : null);
    return conectores.sincronizar(req.params.nome, { job: job ?? null, modo: modo ?? 'incremental' });
  });

  async function aplicarTema(cred) {
    const identidade = await extrairIdentidade({ shop: cred.shop, accessToken: cred.accessToken, log });
    const marca = escolherMarca(identidade);
    const tema = derivarTema(marca);
    config.set('brand', {
      marca, tema: identidade.tema, logo: identidade.logo, favicon: identidade.favicon,
      tokensClaro: tema.claro, tokensEscuro: tema.escuro,
      graficos: tema.graficos, status: tema.status,
      checagens: tema.checagens, coresDetectadas: identidade.cores.length,
    });
    log.info('brand', 'identidade aplicada', { marca, cores: identidade.cores.length });
    return tema;
  }

  app.post('/api/tema/reextrair', { preHandler: precisaAdmin }, async (req, reply) => {
    const cred = cofre.ler('shopify');
    if (!cred) return reply.code(400).send({ erro: 'Shopify não conectado' });
    return aplicarTema(cred);
  });

  // Permite ajuste manual, mas recusa combinação ilegível.
  app.put('/api/tema', { preHandler: precisaAdmin }, async (req, reply) => {
    const { marca } = req.body ?? {};
    if (!/^#[0-9a-f]{6}$/i.test(marca ?? '')) return reply.code(400).send({ erro: 'cor inválida' });
    const tema = derivarTema(marca);
    const ruins = tema.checagens.filter(c => !c.passa);
    if (ruins.length) return reply.code(400).send({ erro: 'contraste insuficiente', falhas: ruins });
    config.set('brand', { ...(config.get('brand') ?? {}), marca, tokensClaro: tema.claro,
      tokensEscuro: tema.escuro, graficos: tema.graficos, checagens: tema.checagens });
    return tema;
  });

  // ---- métricas: rotas GERADAS do registry -------------------------------
  for (const m of metricas.todas()) {
    app.get(`/api/m/${m.key}`, { preHandler: precisaAuth }, async (req, reply) => {
      try { return metricas.executar(m.key, req.query ?? {}); }
      catch (e) { return reply.code(400).send({ erro: e.message }); }
    });
  }

  app.get('/api/metricas', { preHandler: precisaAuth }, async () => ({
    disponiveis: metricas.ativas().map(m => ({ chave: m.key, titulo: m.title, descricao: m.descricao })),
    glossario: metricas.glossario(),
  }));

  app.get('/api/descrever', { preHandler: precisaAuth }, async () =>
    metricas.descrever(conectores.todos()));

  // ---- MCP ---------------------------------------------------------------
  if (mcp) await mcp.registrar(app);

  // ---- páginas -----------------------------------------------------------
  app.get('/', async (req, reply) => {
    reply.type('text/html; charset=utf-8');
    // Nonce por requisição: CSP estrita, sem 'unsafe-inline' (a UI liga tudo por id).
    const nonce = crypto.randomBytes(16).toString('base64');
    reply.header('Content-Security-Policy',
      `default-src 'self'; img-src 'self' https: data:; style-src 'nonce-${nonce}'; ` +
      `script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    if (!temUsuario() || !config.configurado()) return paginaSetup({ config, conectores, temAdmin: temUsuario(), nonce });
    try { await req.jwtVerify(); } catch { return paginaLogin({ config, nonce }); }
    return paginaPainel({ config, conectores, metricas, nonce });
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ erro: 'rota não encontrada' });
    reply.redirect('/');
  });

  return app;
}
