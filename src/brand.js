// Identidade visual: lê o tema da loja Shopify e deriva tokens de painel com
// contraste garantido por cálculo. Validado nesta sessão contra lojas reais.
import { criarHttp } from './core/http.js';

// ---- cor: sRGB <-> OKLCH + contraste WCAG ---------------------------------
const s2l = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const l2s = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const rgb2hex = ([r, g, b]) => '#' + [r, g, b].map(v =>
  Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

function rgb2oklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map(s2l);
  const l = Math.cbrt(.4122214708 * R + .5363325363 * G + .0514459929 * B);
  const m = Math.cbrt(.2119034982 * R + .6806995451 * G + .1073969566 * B);
  const s = Math.cbrt(.0883024619 * R + .2817188376 * G + .6299787005 * B);
  const L = .2104542553 * l + .7936177850 * m - .0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s;
  const Bb = .0259040371 * l + .7827717662 * m - .8086757660 * s;
  return [L, Math.hypot(A, Bb), (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360];
}
function oklch2rgb([L, C, H]) {
  const h = H * Math.PI / 180, A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3;
  const m = (L - .1055613458 * A - .0638541728 * B) ** 3;
  const s = (L - .0894841775 * A - 1.2914855480 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
          -.0041960863 * l - .7034186147 * m + 1.7076147010 * s].map(l2s);
}
const noGamut = r => r.every(v => v >= -.001 && v <= 1.001);
function oklch2hex([L, C, H]) { let c = C; while (c > 0 && !noGamut(oklch2rgb([L, c, H]))) c -= .004; return rgb2hex(oklch2rgb([L, c, H])); }

const lum = hex => { const [r, g, b] = hex2rgb(hex).map(s2l); return .2126 * r + .7152 * g + .0722 * b; };
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
const tintaSobre = bg => contraste(bg, '#ffffff') >= contraste(bg, '#111111') ? '#ffffff' : '#111111';

const DEGRAUS = { 50: .97, 100: .93, 200: .86, 300: .77, 400: .68, 500: .60, 600: .52, 700: .44, 800: .35, 900: .27, 950: .19 };
const escala = (H, C) => Object.fromEntries(Object.entries(DEGRAUS).map(([k, L]) =>
  [k, oklch2hex([L, C * (L > .85 || L < .2 ? .4 : 1), H])]));

// Deriva a paleta do painel. A cor da marca vira ACENTO, não fundo:
// um painel de dados todo vermelho cansa e deixa alerta/erro ambíguos.
export function derivarTema(marcaHex) {
  const [L0, C0, H0] = rgb2oklch(hex2rgb(marcaHex));
  const rampaMarca = escala(H0, Math.max(C0, .10));
  const neutro = escala(H0, .012);   // neutros levemente tingidos: "da marca" sem cansar

  let acao = marcaHex, tinta = tintaSobre(marcaHex);
  if (contraste(acao, tinta) < 4.5) {            // desce na escala até passar em WCAG AA
    for (const k of [600, 700, 800, 500, 900, 950]) {
      const cand = rampaMarca[k], t = tintaSobre(cand);
      if (contraste(cand, t) >= 4.5) { acao = cand; tinta = t; break; }
    }
  }

  const claro = {
    '--bg': '#ffffff', '--surface': neutro[50], '--surface-2': neutro[100],
    '--ink': neutro[950], '--ink-2': neutro[700], '--ink-muted': neutro[600],
    '--line': neutro[200], '--brand': marcaHex, '--action': acao, '--action-ink': tinta,
  };
  const escuro = {
    '--bg': oklch2hex([.16, .015, H0]), '--surface': oklch2hex([.21, .018, H0]),
    '--surface-2': oklch2hex([.26, .02, H0]), '--ink': neutro[50], '--ink-2': neutro[300],
    '--ink-muted': neutro[400], '--line': oklch2hex([.32, .02, H0]),
    '--brand': oklch2hex([Math.max(.62, L0), Math.max(C0 * .85, .09), H0]),
  };
  escuro['--action'] = escuro['--brand'];
  escuro['--action-ink'] = tintaSobre(escuro['--brand']);

  return {
    marca: marcaHex, hue: Math.round(H0 * 10) / 10, claro, escuro,
    // status NÃO deriva da marca: senão "erro" fica igual a uma marca vermelha
    status: { ok: '#1a7f4b', alerta: '#8a6100', erro: '#b3261e' },
    graficos: paletaGraficos(H0),
    checagens: [
      ['texto/fundo claro', claro['--ink'], claro['--bg'], 4.5],
      ['texto2/surface', claro['--ink-2'], claro['--surface'], 4.5],
      ['tinta/ação', claro['--action-ink'], claro['--action'], 4.5],
      ['texto/fundo escuro', escuro['--ink'], escuro['--bg'], 4.5],
      ['tinta/ação escuro', escuro['--action-ink'], escuro['--action'], 4.5],
    ].map(([nome, fg, bg, min]) => ({ nome, fg, bg, razao: Math.round(contraste(fg, bg) * 100) / 100, passa: contraste(fg, bg) >= min })),
  };
}

// Série categórica separável, inclusive sob daltonismo. Teto honesto: 5 cores —
// exigir separação garantida entre todos os pares sob deuteranopia não permite mais.
function paletaGraficos(H0) {
  const sim = (hex, tipo) => {
    const [r, g, b] = hex2rgb(hex).map(s2l);
    const L = .31399022 * r + .63951294 * g + .04649755 * b;
    const M = .15537241 * r + .75789446 * g + .08670142 * b;
    const S = .01775239 * r + .10944209 * g + .87256922 * b;
    let l = L, m = M, s = S;
    if (tipo === 'protan') l = 1.05118294 * M - 0.05116099 * S;
    if (tipo === 'deutan') m = 0.9513092 * L + 0.04866992 * S;
    if (tipo === 'tritan') s = -0.86744736 * L + 1.86727089 * M;
    return rgb2hex([5.47221206 * l - 4.6419601 * m + .16963708 * s,
                    -1.1252419 * l + 2.29317094 * m - .1678952 * s,
                    .02980165 * l - .19318073 * m + 1.16364789 * s].map(l2s));
  };
  const lab = hex => { const [r, g, b] = hex2rgb(hex).map(s2l);
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .7936177850 * m - .0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
            .0259040371 * l + .7827717662 * m - .8086757660 * s]; };
  const dE = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100; };
  const pior = (a, b) => Math.min(dE(a, b), ...['protan', 'deutan', 'tritan'].map(t => dE(sim(a, t), sim(b, t))));

  const cands = [];
  for (let h = 0; h < 360; h += 4) for (const L of [.46, .52, .58]) for (const C of [.12, .16]) {
    const hx = oklch2hex([L, C, (H0 + h) % 360]);
    if (rgb2oklch(hex2rgb(hx))[1] < .105) continue;      // não pode ler como cinza
    if (contraste(hx, '#fcfcfb') < 3.05) continue;       // contraste vs superfície clara
    cands.push(hx);
  }
  const out = [oklch2hex([.58, .14, H0])];
  while (out.length < 8) {
    let melhor = null, score = -1;
    for (const c of cands) {
      if (out.includes(c)) continue;
      const gN = Math.min(...out.map(o => dE(o, c)));
      const gC = Math.min(...out.map(o => pior(o, c)));
      if (gN < 15 || gC < 6) continue;
      if (gC > score) { score = gC; melhor = c; }
    }
    if (!melhor) break;
    out.push(melhor);
  }
  return out;
}

// ---- extração da identidade da loja ---------------------------------------
// shop.brand NÃO existe na Admin API (testado em 7 versões, 2023-10..2025-07).
// A fonte boa é o settings_data.json do tema principal.
export async function extrairIdentidade({ shop, accessToken, log }) {
  const http = criarHttp({
    base: `https://${shop}/admin/api/2025-01`,
    headers: { 'X-Shopify-Access-Token': accessToken }, log,
  });

  const resultado = { cores: [], logo: null, favicon: null, tema: null };

  try {
    const temas = (await http.get('/themes.json'))?.themes ?? [];
    const principal = temas.find(t => t.role === 'main');
    if (!principal) return resultado;
    resultado.tema = principal.name;

    const asset = await http.get(
      `/themes/${principal.id}/assets.json?asset[key]=config/settings_data.json`);
    const cur = JSON.parse(asset?.asset?.value ?? '{}').current ?? {};

    // Varredura profunda: cada tema nomeia as cores do seu jeito. Dawn usa
    // color_schemes; temas custom usam chaves planas (heading_color,
    // primary_button_background, <marca>_brand_color...). Procurar padrão de
    // nome falha — procurar VALOR hex em qualquer profundidade, não.
    const visitar = (obj, caminho = '') => {
      for (const [k, v] of Object.entries(obj ?? {})) {
        const p = caminho ? `${caminho}.${k}` : k;
        if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) {
          resultado.cores.push({ chave: p, hex: v.toLowerCase() });
        } else if (v && typeof v === 'object') {
          visitar(v, p);
        }
      }
    };
    visitar(cur);

    resultado.logo = cur.checkout_logo_image ?? cur.logo ?? cur.logo_image ?? null;
    resultado.favicon = cur.favicon ?? null;
  } catch (e) {
    log?.warn('brand', 'não foi possível ler o tema', { erro: e.message });
  }

  return resultado;
}

// Cores que NUNCA podem ser confundidas com a marca: semáforo de status.
// (Um tema costuma ter success=verde e error=vermelho bem saturados; sem este
// filtro, a "marca" da loja vira o verde de "em estoque".)
const CHAVE_STATUS = /success|error|danger|warning|alert|low_stock|in_stock|sale|sold_out/i;
const CHAVE_MARCA  = /brand|accent/i;
const CHAVE_BOTAO  = /primary_button_background|button_background|button_color/i;

// Escolhe a cor de marca por prioridade, ignorando neutros e status.
export function escolherMarca(identidade) {
  const sat = hex => { try { return rgb2oklch(hex2rgb(hex))[1]; } catch { return 0; } };
  const candidatas = (identidade.cores ?? [])
    .filter(c => !CHAVE_STATUS.test(c.chave))
    .filter(c => sat(c.hex) > 0.04);          // descarta preto, branco e cinzas

  const porPrioridade =
       candidatas.filter(c => CHAVE_MARCA.test(c.chave))
    .concat(candidatas.filter(c => CHAVE_BOTAO.test(c.chave)))
    .concat(candidatas.sort((a, b) => sat(b.hex) - sat(a.hex)));

  return porPrioridade[0]?.hex ?? '#3a6ea5';   // azul neutro se a loja não declarar cor
}
