// UI server-rendered. Tokens vêm do tema derivado da loja — nenhuma cor de marca
// aqui. Sem build step. CSP com nonce: nada de handler inline (onclick=""); tudo
// é ligado por id/data-attr dentro do <script nonce>.
//
// Estrutura espelha o padrão do Painel Fiber (topbar sticky + abas + blocos com
// estado + KPI com delta), sobre a escala Fibonacci de espaçamento/raio/fonte.
// Diferença consciente: o Fiber carrega Montserrat/Poppins do Google Fonts; aqui
// a CSP é `default-src 'self'` (sem host externo), então o mesmo tratamento
// tipográfico (uppercase + tracking largo) é aplicado sobre a fonte do sistema.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function tokensCss(marca) {
  const claro = marca?.tokensClaro ?? {};
  const escuro = marca?.tokensEscuro ?? {};
  const linhas = (o) => Object.entries(o).map(([k, v]) => `    ${k}: ${v};`).join('\n');
  const PADRAO_CLARO = '    --bg:#f4f4f5; --surface:#fff; --surface-2:#fafafa; --ink:#1c1c1c; --ink-2:#5a5a5a; --ink-muted:#9a9a9a; --line:#e1e1e1; --brand:#3a6ea5; --action:#3a6ea5; --action-ink:#fff;';
  const PADRAO_ESCURO = '    --bg:#141414; --surface:#1c1c1c; --surface-2:#242424; --ink:#f2f2f2; --ink-2:#b5b5b5; --ink-muted:#777; --line:#2e2e2e; --brand:#5d8abb; --action:#5d8abb; --action-ink:#08080a;';
  return `:root{
    --fib-1:1px; --fib-2:2px; --fib-3:3px; --fib-5:5px; --fib-8:8px; --fib-13:13px;
    --fib-21:21px; --fib-34:34px; --fib-55:55px; --fib-89:89px; --fib-144:144px; --fib-233:233px;
    --ok:#1a7f4b; --erro:#b3261e; --alerta:#8a6100;
    --ease:cubic-bezier(.22,1,.36,1);
  }
  :root[data-theme="light"], :root {
${linhas(claro) || PADRAO_CLARO}
    --shadow-sm:0 var(--fib-3) var(--fib-8) rgba(28,28,28,.05);
    --shadow-md:0 var(--fib-5) var(--fib-21) rgba(28,28,28,.08);
    --shadow-lg:0 var(--fib-13) var(--fib-34) rgba(28,28,28,.12);
  }
  :root[data-theme="dark"] {
${linhas(escuro) || PADRAO_ESCURO}
    --shadow-sm:0 var(--fib-3) var(--fib-8) rgba(0,0,0,.4);
    --shadow-md:0 var(--fib-5) var(--fib-21) rgba(0,0,0,.5);
    --shadow-lg:0 var(--fib-13) var(--fib-34) rgba(0,0,0,.6);
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme]) {
${linhas(escuro) || PADRAO_ESCURO}
    --shadow-sm:0 var(--fib-3) var(--fib-8) rgba(0,0,0,.4);
    --shadow-md:0 var(--fib-5) var(--fib-21) rgba(0,0,0,.5);
    --shadow-lg:0 var(--fib-13) var(--fib-34) rgba(0,0,0,.6);
  } }`;
}

const BASE = () => `
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100vh;font:var(--fib-13)/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;
       transition:background .3s var(--ease),color .3s var(--ease)}
  h1,h2,h3{margin:0;font-weight:800;text-transform:uppercase;letter-spacing:.18em;color:var(--ink)}
  :focus-visible{outline:var(--fib-3) solid var(--action);outline-offset:var(--fib-2)}
  a{color:var(--action)}
  code{font-size:.92em;background:var(--surface-2);padding:0 var(--fib-3);border-radius:var(--fib-3)}

  /* ---------- topbar / subbar ---------- */
  .app{display:flex;flex-direction:column;min-height:100vh}
  .topbar{background:var(--surface);border-bottom:var(--fib-1) solid var(--line);
        padding:var(--fib-13) var(--fib-34);display:flex;align-items:center;gap:var(--fib-34);
        flex-wrap:wrap;position:sticky;top:0;z-index:20;box-shadow:var(--shadow-sm)}
  .topbar__brand{display:flex;align-items:center;gap:var(--fib-21);min-width:0}
  .topbar__logo{max-height:var(--fib-34);max-width:var(--fib-144);width:auto;height:auto}
  .topbar__title{font-size:var(--fib-21);line-height:1.2}
  .topbar__right{display:flex;align-items:center;gap:var(--fib-13);margin-left:auto}
  .topbar__name{font-weight:700;color:var(--ink-2)}
  .subbar{background:var(--surface);border-bottom:var(--fib-1) solid var(--line);
        padding:0 var(--fib-34);display:flex;align-items:center;justify-content:space-between;
        gap:var(--fib-21);flex-wrap:wrap;position:sticky;top:var(--fib-55);z-index:15;overflow-x:auto}
  .tabs{display:flex;gap:var(--fib-3);align-items:stretch}
  .tab{font:inherit;font-weight:700;font-size:var(--fib-13);text-transform:uppercase;
        letter-spacing:.18em;background:transparent;border:0;box-shadow:none;color:var(--ink-2);
        padding:var(--fib-21) var(--fib-13) var(--fib-13);cursor:pointer;position:relative;
        display:inline-flex;align-items:center;gap:var(--fib-8);white-space:nowrap;
        border-bottom:var(--fib-3) solid transparent;
        transition:color .2s var(--ease),border-color .2s var(--ease)}
  .tab:hover{color:var(--ink)}
  .tab--active{color:var(--action);border-bottom-color:var(--action)}
  .tab__icon{font-size:var(--fib-13);opacity:.7}
  .tab--active .tab__icon{opacity:1}

  /* ---------- conteúdo ---------- */
  .content{flex:1;width:100%;padding:var(--fib-34);display:flex;flex-direction:column;gap:var(--fib-21)}
  .panel{display:none;flex-direction:column;gap:var(--fib-21)}
  .panel--active{display:flex}
  .grid{display:grid;gap:var(--fib-21)}
  .grid--full{grid-template-columns:1fr}
  .grid--2{grid-template-columns:1fr 1fr}
  .grid--3{grid-template-columns:1fr 1fr 1fr}

  .page-filter{display:flex;align-items:center;flex-wrap:wrap;gap:var(--fib-13);
        padding:var(--fib-8) var(--fib-13);background:var(--surface);
        border:var(--fib-1) solid var(--line);border-radius:var(--fib-13);box-shadow:var(--shadow-sm)}
  .page-filter__label{font-weight:700;font-size:var(--fib-8);text-transform:uppercase;
        letter-spacing:.13em;color:var(--ink-muted)}
  .page-filter__right{margin-left:auto;color:var(--ink-muted);font-size:var(--fib-8);
        text-transform:uppercase;letter-spacing:.13em}

  /* ---------- KPI ---------- */
  .kpis{display:grid;gap:var(--fib-13);grid-template-columns:repeat(6,1fr)}
  .kpis--sm{grid-template-columns:repeat(auto-fit,minmax(var(--fib-144),1fr))}
  .kpi{background:var(--surface);border:var(--fib-1) solid var(--line);border-radius:var(--fib-13);
        box-shadow:var(--shadow-sm);padding:var(--fib-13);display:flex;flex-direction:column;
        gap:var(--fib-5);min-width:0;animation:rise .45s var(--ease) both}
  .kpi--accent{border-color:var(--action);border-top:var(--fib-3) solid var(--action)}
  .kpi--accent .kpi__value{color:var(--action);font-size:var(--fib-34)}
  .kpi__top{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--fib-8)}
  .kpi__label{font-weight:700;font-size:var(--fib-8);text-transform:uppercase;letter-spacing:.18em;
        color:var(--ink-2);line-height:1.4}
  .kpi__icon{font-weight:700;font-size:var(--fib-13);color:var(--action);opacity:.85;line-height:1}
  .kpi__value{font-weight:700;font-size:var(--fib-21);color:var(--ink);line-height:1.1;
        font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  .kpi__foot{display:flex;align-items:center;justify-content:space-between;gap:var(--fib-8);margin-top:auto}
  .kpi__hint{font-size:var(--fib-8);color:var(--ink-muted)}
  .kpi__delta{font-weight:700;font-size:var(--fib-13);display:inline-flex;align-items:center;
        gap:var(--fib-3);white-space:nowrap}
  .kpi__delta--up{color:var(--ok)} .kpi__delta--down{color:var(--erro)} .kpi__delta--flat{color:var(--ink-muted)}
  .sk{display:inline-block;width:var(--fib-89);height:var(--fib-21);border-radius:var(--fib-5);
        background:linear-gradient(90deg,var(--surface-2) 25%,var(--line) 50%,var(--surface-2) 75%);
        background-size:200% 100%;animation:shimmer 1.2s ease infinite}

  /* ---------- bloco ---------- */
  .block{background:var(--surface);border:var(--fib-1) solid var(--line);border-radius:var(--fib-13);
        box-shadow:var(--shadow-sm);padding:var(--fib-21);display:flex;flex-direction:column;
        gap:var(--fib-13);min-width:0;animation:rise .45s var(--ease) both;
        transition:box-shadow .2s var(--ease),border-color .2s var(--ease)}
  .block:hover{box-shadow:var(--shadow-md)}
  .block__head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--fib-13);
        border-bottom:var(--fib-1) solid var(--line);padding-bottom:var(--fib-13)}
  .block__head-text{display:flex;flex-direction:column;gap:var(--fib-3);min-width:0}
  .block__title{font-size:var(--fib-13);font-weight:800}
  .block__subtitle{font-size:var(--fib-8);color:var(--ink-muted);text-transform:none;letter-spacing:normal}
  .block__body{min-width:0}
  .block__hint{font-size:var(--fib-8);color:var(--ink-muted);border-top:var(--fib-1) solid var(--line);
        padding-top:var(--fib-8)}

  .state{display:flex;align-items:center;justify-content:center;gap:var(--fib-13);
        min-height:var(--fib-89);font-size:var(--fib-13);color:var(--ink-2);text-align:center}
  .state--error{color:var(--erro)}
  .state--inline{min-height:auto;padding:var(--fib-13);border-radius:var(--fib-8)}
  .state__icon{font-size:var(--fib-21);opacity:.7}
  .skeleton{display:flex;align-items:flex-end;gap:var(--fib-8);height:var(--fib-144);padding:var(--fib-8) 0}
  .skeleton__bar{flex:1;border-radius:var(--fib-3);
        background:linear-gradient(0deg,var(--surface-2) 25%,var(--line) 50%,var(--surface-2) 75%);
        background-size:100% 200%;animation:shimmerY 1.2s ease infinite}

  /* ---------- controles ---------- */
  button,.btn{font:inherit;font-weight:700;font-size:var(--fib-13);text-transform:uppercase;
        letter-spacing:.18em;border:0;border-radius:var(--fib-8);padding:var(--fib-13) var(--fib-21);
        cursor:pointer;color:var(--action-ink);
        background:linear-gradient(135deg,var(--action),color-mix(in srgb,var(--action) 78%,black));
        box-shadow:0 var(--fib-3) var(--fib-13) color-mix(in srgb,var(--action) 25%,transparent);
        transition:filter .15s var(--ease),transform .08s var(--ease)}
  button:hover{filter:brightness(1.06)} button:active{transform:translateY(1px)}
  button:disabled{opacity:.55;cursor:not-allowed;filter:none;box-shadow:none}
  .btn--ghost{background:transparent;color:var(--ink-2);box-shadow:none;
        border:var(--fib-1) solid var(--line)}
  .btn--ghost:hover{color:var(--ink);background:var(--surface-2);filter:none}
  .btn--sm{padding:var(--fib-5) var(--fib-13);font-size:var(--fib-8)}
  input,select{width:100%;padding:var(--fib-13);border:var(--fib-1) solid var(--line);
        border-radius:var(--fib-8);background:var(--surface);color:var(--ink);font:inherit;
        font-size:var(--fib-13)}
  input[type=date]{width:auto}
  label{display:block;margin:0 0 var(--fib-5);font-weight:700;font-size:var(--fib-8);
        text-transform:uppercase;letter-spacing:.13em;color:var(--ink-2)}

  /* ---------- tabelas ---------- */
  .tbl-wrap{overflow-x:auto;min-width:0}
  table{width:100%;border-collapse:collapse;font-size:var(--fib-13)}
  th,td{text-align:left;padding:var(--fib-8) var(--fib-5);border-bottom:var(--fib-1) solid var(--line);
        white-space:nowrap}
  th{color:var(--ink-2);font-weight:700;font-size:var(--fib-8);text-transform:uppercase;letter-spacing:.13em}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr:hover{background:var(--surface-2)}
  .pill{display:inline-flex;align-items:center;gap:var(--fib-3);font-size:var(--fib-8);
        padding:var(--fib-2) var(--fib-8);border-radius:var(--fib-55);border:var(--fib-1) solid var(--line);
        text-transform:uppercase;letter-spacing:.1em;font-weight:700}
  .ok{color:var(--ok)} .err{color:var(--erro)} .warn{color:var(--alerta)}
  .msg{padding:var(--fib-13);border-radius:var(--fib-8);border:var(--fib-1) solid var(--line);
        margin:var(--fib-13) 0;font-size:var(--fib-13)}
  .sub{color:var(--ink-2);font-size:var(--fib-13)}
  .chart{width:100%;height:auto;display:block}
  .leg{display:flex;gap:var(--fib-13);flex-wrap:wrap;margin-top:var(--fib-8);font-size:var(--fib-8);
        color:var(--ink-2)}
  .leg span{display:inline-flex;align-items:center;gap:var(--fib-3)}
  .leg i{width:var(--fib-8);height:var(--fib-8);border-radius:var(--fib-2);display:inline-block}
  .swatches{display:flex;gap:var(--fib-3);margin-top:var(--fib-8)}
  .sw{width:var(--fib-21);height:var(--fib-21);border-radius:var(--fib-5);border:var(--fib-1) solid var(--line)}
  footer.rodape{padding:var(--fib-21) var(--fib-34);color:var(--ink-muted);font-size:var(--fib-8);
        border-top:var(--fib-1) solid var(--line)}

  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @keyframes shimmerY{0%{background-position:0 200%}100%{background-position:0 -200%}}
  @keyframes rise{from{opacity:0;transform:translateY(var(--fib-13))}to{opacity:1;transform:none}}
  @keyframes girar{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

  @media(max-width:1100px){ .kpis{grid-template-columns:repeat(3,1fr)} .grid--3{grid-template-columns:1fr 1fr} }
  @media(max-width:820px){
    .topbar,.subbar,.content{padding-left:var(--fib-13);padding-right:var(--fib-13)}
    .grid--2,.grid--3{grid-template-columns:1fr}
    .kpis{grid-template-columns:repeat(2,1fr)}
    .subbar{top:auto;position:static}
  }

  /* ---------- login / setup ---------- */
  .auth-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:var(--fib-21);
        background:radial-gradient(at 50% 0%,color-mix(in srgb,var(--brand,var(--action)) 7%,transparent),transparent 60%) fixed,var(--bg)}
  .auth-card{width:100%;max-width:377px;background:var(--surface);
        border:var(--fib-1) solid var(--line);border-radius:var(--fib-13);
        padding:var(--fib-55) var(--fib-34);box-shadow:var(--shadow-md)}
  .auth-logo{margin:0 auto var(--fib-13);display:flex;align-items:center;justify-content:center}
  .auth-logo.is-avatar{width:var(--fib-55);height:var(--fib-55);border-radius:var(--fib-13);
        background:var(--action);color:var(--action-ink);font-size:var(--fib-21);font-weight:700}
  .auth-logo img{max-height:var(--fib-55);max-width:var(--fib-233);width:auto;height:auto;object-fit:contain}
  .auth-head{text-align:center;margin-bottom:var(--fib-21)}
  .auth-head h1{font-size:var(--fib-21);margin-bottom:var(--fib-5)}
  .auth-head p{margin:0;color:var(--ink-2);font-size:var(--fib-13)}
  .field{margin-bottom:var(--fib-13)}
  .pwd-wrap{position:relative}
  .pwd-wrap input{padding-right:var(--fib-55)}
  .pwd-toggle{position:absolute;right:var(--fib-5);top:50%;transform:translateY(-50%);background:none;
        border:0;box-shadow:none;padding:var(--fib-5);color:var(--ink-2);cursor:pointer;
        font-size:var(--fib-8);text-transform:none;letter-spacing:normal;border-radius:var(--fib-5)}
  .pwd-toggle:hover{color:var(--ink);background:var(--surface-2);filter:none}
  .auth-submit{width:100%;margin-top:var(--fib-5);display:flex;align-items:center;
        justify-content:center;gap:var(--fib-8)}
  .spinner{width:var(--fib-13);height:var(--fib-13);border-radius:50%;flex:none;
        border:var(--fib-2) solid rgba(255,255,255,.45);border-top-color:currentColor;
        animation:girar .7s linear infinite;display:none}
  .auth-submit.loading .spinner{display:inline-block}
  .auth-foot{text-align:center;margin-top:var(--fib-21);color:var(--ink-muted);font-size:var(--fib-8)}
  .setup-wrap{max-width:610px;margin:0 auto;padding:var(--fib-34) var(--fib-13);
        display:flex;flex-direction:column;gap:var(--fib-21)}
  .setup-wrap .block{max-width:none}
  .rot{color:var(--ink-2);font-size:var(--fib-8);text-transform:uppercase;letter-spacing:.13em;font-weight:700}
`;

// Página fora do app shell (login/setup): sem topbar/abas.
function layoutSolo({ titulo, marca, corpo, script = '', nonce = '' }) {
  const n = nonce ? ` nonce="${esc(nonce)}"` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
${marca?.favicon ? `<link rel="icon" href="${esc(marca.favicon)}">` : ''}
<style${n}>${tokensCss(marca)}${BASE()}</style></head>
<body>${corpo}<script${n}>${TEMA_JS}${script}</script></body></html>`;
}

// Alterna claro/escuro e persiste. Sem framework: só data-theme no <html>.
const TEMA_JS = `
  (function(){
    var salvo = null;
    try { salvo = localStorage.getItem('sk-tema'); } catch(e) {}
    if (salvo) document.documentElement.setAttribute('data-theme', salvo);
    function atual(){
      return document.documentElement.getAttribute('data-theme')
        || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    function rotulo(){
      var b = document.getElementById('btnTema');
      if (b) { var esc = atual() === 'dark'; b.textContent = esc ? '☀' : '☾';
               b.setAttribute('aria-label', esc ? 'Usar tema claro' : 'Usar tema escuro'); }
    }
    document.addEventListener('DOMContentLoaded', function(){
      rotulo();
      document.getElementById('btnTema')?.addEventListener('click', function(){
        var novo = atual() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', novo);
        try { localStorage.setItem('sk-tema', novo); } catch(e) {}
        rotulo();
      });
    });
  })();
`;

// App shell: topbar + subbar com abas + conteúdo. `abas` = [{id,label,icon}].
function layoutApp({ titulo, marca, abas, corpo, script = '', nonce = '', usuario = null, versao = 'dev' }) {
  const logo = marca?.logo || marca?.logoUrl;
  const n = nonce ? ` nonce="${esc(nonce)}"` : '';
  const tabsHtml = abas.map((a, i) => `<button id="tab-${esc(a.id)}" class="tab${i === 0 ? ' tab--active' : ''}"
      role="tab" type="button" data-tab="${esc(a.id)}" aria-selected="${i === 0}"
      aria-controls="panel-${esc(a.id)}" tabindex="${i === 0 ? 0 : -1}">
      <span class="tab__icon" aria-hidden="true">${esc(a.icon ?? '')}</span>
      <span class="tab__label">${esc(a.label)}</span></button>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
${marca?.favicon ? `<link rel="icon" href="${esc(marca.favicon)}">` : ''}
<style${n}>${tokensCss(marca)}${BASE()}</style></head>
<body><div class="app">
<header class="topbar">
  <div class="topbar__brand">
    ${logo ? `<img class="topbar__logo" id="headerLogo" src="${esc(logo)}" alt="">` : ''}
    <h1 class="topbar__title">${esc(titulo)}</h1>
  </div>
  <div class="topbar__right">
    <button class="btn--ghost btn--sm" id="btnTema" type="button" aria-label="Alternar tema">☾</button>
    ${usuario ? `<span class="topbar__name">${esc(usuario)}</span>` : ''}
    <button class="btn--ghost btn--sm" id="btnSair" type="button">Sair</button>
  </div>
</header>
<div class="subbar"><nav class="tabs" role="tablist" aria-label="Seções do painel">${tabsHtml}</nav></div>
<main class="content" id="conteudo">${corpo}</main>
<footer class="rodape">storekit ${esc(versao)} — painel, ETL, MCP e RAG numa imagem</footer>
</div><script${n}>${TEMA_JS}${ABAS_JS}${script}</script></body></html>`;
}

// Navegação por abas: troca de painel + setas do teclado + hash na URL.
// Emite 'aba:ativa' pra cada painel carregar seus dados só quando aparece.
const ABAS_JS = `
  (function(){
    var botoes = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    var ids = botoes.map(function(b){ return b.dataset.tab; });
    function ativar(id, foco){
      if (ids.indexOf(id) < 0) return;
      botoes.forEach(function(b){
        var sel = b.dataset.tab === id;
        b.classList.toggle('tab--active', sel);
        b.setAttribute('aria-selected', sel ? 'true' : 'false');
        b.tabIndex = sel ? 0 : -1;
        if (sel && foco) b.focus();
      });
      document.querySelectorAll('.panel').forEach(function(p){
        p.classList.toggle('panel--active', p.id === 'panel-' + id);
      });
      try { history.replaceState(null, '', '#' + id); } catch(e) {}
      document.dispatchEvent(new CustomEvent('aba:ativa', { detail: { id: id } }));
    }
    botoes.forEach(function(b){
      b.addEventListener('click', function(){ ativar(b.dataset.tab); });
    });
    document.querySelector('.tabs')?.addEventListener('keydown', function(e){
      var i = ids.indexOf(document.querySelector('.tab--active')?.dataset.tab);
      if (i < 0) return;
      var n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % ids.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + ids.length) % ids.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = ids.length - 1;
      if (n != null) { e.preventDefault(); ativar(ids[n], true); }
    });
    var inicial = (location.hash || '').replace('#','');
    document.addEventListener('DOMContentLoaded', function(){
      ativar(ids.indexOf(inicial) >= 0 ? inicial : ids[0]);
    });
    window.__ativarAba = ativar;
  })();
`;

// Gráficos SVG sem dependência, sobre a paleta acessível derivada da marca.
const CHART_JS = `
  const PAL = window.__GRAF__ || ['#3a6ea5','#1a7f4b','#8a6100','#8e44ad','#b3261e'];
  function svgLinha(dados, campoX, campoY){
    if(!dados||dados.length<2) return vazio();
    const W=680,H=170,P=28, ys=dados.map(d=>+d[campoY]||0), max=Math.max(...ys,1), min=Math.min(...ys,0);
    const x=i=>P+i*(W-2*P)/(dados.length-1), y=v=>H-P-(v-min)/((max-min)||1)*(H-2*P);
    const pts=dados.map((d,i)=>x(i)+','+y(+d[campoY]||0)).join(' ');
    const area='M'+P+','+(H-P)+' L'+pts.replaceAll(' ',' L')+' L'+(W-P)+','+(H-P)+' Z';
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img">'
      +'<path d="'+area+'" fill="'+PAL[0]+'" opacity="0.12"/>'
      +'<polyline points="'+pts+'" fill="none" stroke="'+PAL[0]+'" stroke-width="2.5" stroke-linejoin="round"/>'
      +'</svg>';
  }
  function svgBarras(dados, campoRot, campoVal){
    if(!dados||!dados.length) return vazio();
    const top=dados.slice(0,8), max=Math.max(...top.map(d=>+d[campoVal]||0),1);
    const W=680,bh=26,gap=8,H=top.length*(bh+gap)+8;
    let s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img">';
    top.forEach((d,i)=>{const w=(+d[campoVal]||0)/max*(W-180),yy=i*(bh+gap)+4,cor=PAL[i%PAL.length];
      s+='<rect x="150" y="'+yy+'" width="'+Math.max(w,1)+'" height="'+bh+'" rx="4" fill="'+cor+'"/>'
        +'<text x="0" y="'+(yy+bh/2+4)+'" font-size="12" fill="currentColor" opacity=".75">'+String(d[campoRot]??'').slice(0,20)+'</text>';});
    return s+'</svg>';
  }
`;

export function paginaSetup({ config, conectores, temAdmin, nonce }) {
  const estado = conectores.estado();
  const marca = config.get('brand');
  const corpo = `<div class="setup-wrap">
  <div class="auth-head"><h1>Configurar painel</h1><p>Dois passos e o painel está de pé.</p></div>

  <section class="block">
    <header class="block__head"><div class="block__head-text">
      <span class="rot">Passo 1</span><h2 class="block__title">Criar acesso</h2>
      <span class="block__subtitle">Ninguém acessa este painel sem senha.</span>
    </div></header>
    <div class="block__body">
    ${temAdmin ? '<p class="ok">✓ administrador já criado</p>' : `
      <div class="field"><label for="u">Usuário</label><input id="u" autocomplete="username"></div>
      <div class="field"><label for="p">Senha (mín. 8 caracteres)</label>
        <input id="p" type="password" autocomplete="new-password"></div>
      <button id="btnAdmin" type="button">Criar administrador</button>`}
    </div>
  </section>

  <section class="block">
    <header class="block__head"><div class="block__head-text">
      <span class="rot">Passo 2</span><h2 class="block__title">Conectar a loja</h2>
      <span class="block__subtitle">O painel lê a identidade visual da loja e se veste com ela.</span>
    </div></header>
    <div class="block__body">
      <div class="field"><label for="shop">Domínio .myshopify.com</label>
        <input id="shop" placeholder="minha-loja.myshopify.com"></div>
      <div class="field"><label for="tk">Access token do app (shpat_…)</label>
        <input id="tk" type="password" placeholder="shpat_..."></div>
      <button id="btnConectar" type="button" ${temAdmin ? '' : 'disabled'}>Conectar Shopify</button>
      ${temAdmin ? '' : '<p class="sub">Crie o administrador primeiro.</p>'}
      <div id="res"></div>
    </div>
  </section>

  <section class="block">
    <header class="block__head"><div class="block__head-text">
      <h2 class="block__title">Integrações</h2></div></header>
    <div class="block__body"><div class="tbl-wrap"><table>
      <thead><tr><th>Integração</th><th>Estado</th><th>Conta</th></tr></thead><tbody>
      ${estado.map(c => `<tr><td>${esc(c.rotulo)}</td>
        <td><span class="pill ${c.status === 'conectado' ? 'ok' : c.status === 'erro' ? 'err' : ''}">${esc(c.status)}</span></td>
        <td class="sub">${esc(c.conta ?? '—')}</td></tr>`).join('')}
      </tbody></table></div></div>
  </section>
</div>`;

  const script = `
  async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
    return {ok:r.ok, data: await r.json().catch(()=>({}))}}
  async function criarAdmin(){
    const {ok,data}=await post('/api/setup/admin',{username:u.value,password:p.value});
    if(!ok){alert(data.erro||'falhou');return}
    await post('/api/login',{username:u.value,password:p.value});
    location.reload();
  }
  async function conectar(){
    const el=document.getElementById('res');
    el.innerHTML='<div class="msg">conectando e validando…</div>';
    const {ok,data}=await post('/api/conectores/shopify',{shop:shop.value.trim(),accessToken:tk.value.trim()});
    if(!ok){el.innerHTML='<div class="msg err">'+(data.erro||'falhou')+'</div>';return}
    const m=data.marca||{};
    el.innerHTML='<div class="msg ok">✓ '+(data.info?.loja||'conectada')+' — '+(data.info?.moeda||'')+
      '</div>'+(m.marca?'<div class="sub">identidade detectada: '+m.marca+
      ' <span class="swatches">'+(m.graficos||[]).map(c=>'<span class="sw" style="background:'+c+'"></span>').join('')+'</span></div>':'');
    setTimeout(()=>location.reload(),1800);
  }
  document.getElementById('btnAdmin')?.addEventListener('click',criarAdmin);
  document.getElementById('btnConectar')?.addEventListener('click',conectar);`;
  return layoutSolo({ titulo: 'Configurar painel', marca, corpo, script, nonce });
}

export function paginaLogin({ config, nonce }) {
  const marca = config.get('brand');
  const logo = marca?.logo || marca?.logoUrl;
  const nomeLoja = config.get('store.name') ?? 'Painel';
  const inicial = esc(nomeLoja.trim().charAt(0).toUpperCase() || 'P');

  const logoHtml = logo
    ? `<div class="auth-logo" id="authLogo"><img id="authLogoImg" src="${esc(logo)}" alt=""></div>`
    : `<div class="auth-logo is-avatar" id="authLogo">${inicial}</div>`;

  const corpo = `<div class="auth-shell"><div class="auth-card">
    <div class="auth-head">
      ${logoHtml}
      <h1>${esc(nomeLoja)}</h1>
      <p>Entrar no painel</p>
    </div>
    <form id="fLogin" novalidate>
      <div class="field"><label for="u">Usuário</label>
        <input id="u" name="username" autocomplete="username" autocapitalize="off" required></div>
      <div class="field"><label for="p">Senha</label>
        <div class="pwd-wrap">
          <input id="p" name="password" type="password" autocomplete="current-password" required>
          <button type="button" class="pwd-toggle" id="btnOlho" aria-label="Mostrar senha">mostrar</button>
        </div>
      </div>
      <div id="e" role="alert" aria-live="polite"></div>
      <button type="submit" class="auth-submit" id="btnEntrar">
        <span class="spinner"></span><span id="txtBtn">Entrar</span>
      </button>
    </form>
    <p class="auth-foot">storekit ${esc(process.env.APP_VERSION ?? 'dev')}</p>
  </div></div>`;

  const script = `
  const form = document.getElementById('fLogin');
  const btn = document.getElementById('btnEntrar');
  const txtBtn = document.getElementById('txtBtn');
  const elErro = document.getElementById('e');
  const campoSenha = document.getElementById('p');
  const olho = document.getElementById('btnOlho');

  // Logo real pode falhar em runtime (URL do tema mudou) — cai pro avatar com a inicial.
  document.getElementById('authLogoImg')?.addEventListener('error', function() {
    const wrap = document.getElementById('authLogo');
    wrap.classList.add('is-avatar');
    wrap.textContent = ${JSON.stringify(inicial)};
  });

  olho.addEventListener('click', () => {
    const mostrar = campoSenha.type === 'password';
    campoSenha.type = mostrar ? 'text' : 'password';
    olho.textContent = mostrar ? 'ocultar' : 'mostrar';
    olho.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
  });

  async function entrar(ev) {
    ev.preventDefault();
    elErro.innerHTML = '';
    btn.disabled = true; btn.classList.add('loading'); txtBtn.textContent = 'Entrando…';
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: {'content-type':'application/json'},
        body: JSON.stringify({ username: document.getElementById('u').value, password: campoSenha.value }),
      });
      if (r.ok) { location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      const msg = r.status === 401 ? 'usuário ou senha incorretos'
        : r.status === 429 ? 'muitas tentativas — aguarde um pouco e tente de novo'
        : (d.erro || d.message || 'falha ao entrar');
      elErro.innerHTML = '<div class="msg err">' + msg + '</div>';
    } catch (e) {
      elErro.innerHTML = '<div class="msg err">falha de conexão — tente novamente</div>';
    } finally {
      btn.disabled = false; btn.classList.remove('loading'); txtBtn.textContent = 'Entrar';
    }
  }
  form.addEventListener('submit', entrar);
  document.getElementById('u').focus();`;

  return layoutSolo({ titulo: nomeLoja, marca, corpo, script, nonce });
}

// Abas do painel. Cada uma declara as métricas que consome — se nenhuma estiver
// disponível (conector faltando), a aba mostra o motivo em vez de sumir sem explicar.
const ABAS = [
  { id: 'overview', label: 'Visão Geral', icon: '◆' },
  { id: 'sales', label: 'Vendas', icon: '↗' },
  { id: 'products', label: 'Produtos', icon: '▦' },
  { id: 'customers', label: 'Clientes', icon: '☺' },
  { id: 'ads', label: 'Tráfego & Ads', icon: '◎' },
  { id: 'margin', label: 'Custos & Margem', icon: '◐' },
  { id: 'system', label: 'Sistema', icon: '⚙' },
];

// Filtro de período reaproveitado no topo de cada aba que usa janela de datas.
const filtroPeriodo = (id, extra = '') => `
  <div class="page-filter">
    <span class="page-filter__label">Período</span>
    <input type="date" data-per="de" id="de-${id}"><input type="date" data-per="ate" id="ate-${id}">
    <button class="btn--sm" type="button" data-aplicar="${id}">Aplicar</button>
    ${extra}
  </div>`;

const bloco = ({ id, titulo, subtitulo, dica, largura = 'full', corpo = '' }) => `
  <section class="block" data-bloco="${id}" aria-busy="true">
    <header class="block__head"><div class="block__head-text">
      <h2 class="block__title">${esc(titulo)}</h2>
      ${subtitulo ? `<span class="block__subtitle">${esc(subtitulo)}</span>` : ''}
    </div></header>
    <div class="block__body" id="body-${id}">${corpo || '<div class="skeleton">' +
      [55, 89, 34, 144, 89, 55, 110, 70].map((h, i) =>
        `<span class="skeleton__bar" style="height:${h}px;animation-delay:${(i * 0.08).toFixed(2)}s"></span>`).join('') +
      '</div>'}</div>
    ${dica ? `<footer class="block__hint">${esc(dica)}</footer>` : ''}
  </section>`;

export function paginaPainel({ config, conectores, metricas, nonce, usuario = null }) {
  const marca = config.get('brand');
  const moeda = config.get('store.currency') ?? 'BRL';
  const estado = conectores.estado();
  const ativas = metricas.ativas().map(m => m.key);
  const todas = metricas.todas();
  const graficos = marca?.graficos ?? null;
  const nomeLoja = config.get('store.name') ?? 'Painel';

  // Métrica indisponível: explicar qual conector falta, não esconder a seção.
  const faltando = (chave) => {
    const m = todas.find(x => x.key === chave);
    if (!m) return `métrica "${chave}" não existe nesta versão`;
    const req = (m.requires ?? []).filter(c => !estado.find(e => e.nome === c && e.status === 'conectado'));
    return req.length ? `conecte ${req.join(', ')} para ver esta seção` : null;
  };
  const indisponivel = (chave) => {
    const motivo = faltando(chave);
    return motivo ? `<div class="state"><span class="state__icon" aria-hidden="true">◍</span><span>${esc(motivo)}</span></div>` : null;
  };
  // Bloco que já nasce explicado quando a métrica não está disponível.
  const blocoM = (opts) => {
    const ind = indisponivel(opts.metrica ?? opts.id);
    return bloco({ ...opts, corpo: ind ?? opts.corpo ?? '' });
  };

  const corpo = `
  <section class="panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
    ${filtroPeriodo('overview', `<span class="page-filter__right">${esc(config.get('store.domain') ?? '')}</span>`)}
    <div class="kpis kpis--lg" id="kpisTopo"></div>
    <div class="kpis kpis--sm" id="kpisBase"></div>
    ${blocoM({ id: 'ovSerie', metrica: 'vendas_diarias', titulo: 'Vendas no tempo', subtitulo: 'Faturamento por dia no período' })}
    <div class="grid grid--2">
      ${blocoM({ id: 'ovCanais', metrica: 'vendas_por_canal', titulo: 'Vendas por canal', subtitulo: 'Receita por origem de marketing' })}
      ${blocoM({ id: 'ovProdutos', metrica: 'mais_vendidos', titulo: 'Mais vendidos', subtitulo: 'Top 10 do período por unidades' })}
    </div>
  </section>

  <section class="panel" id="panel-sales" role="tabpanel" aria-labelledby="tab-sales">
    ${filtroPeriodo('sales')}
    <div class="kpis kpis--sm" id="kpisComparar"></div>
    ${blocoM({ id: 'slSerie', metrica: 'vendas_diarias', titulo: 'Vendas por dia', subtitulo: 'Série diária com pedidos e unidades' })}
    <div class="grid grid--2">
      ${blocoM({ id: 'slCanais', metrica: 'vendas_por_canal', titulo: 'Canais (marketing)', subtitulo: 'utm_source / referring_site' })}
      ${blocoM({ id: 'slOrigens', metrica: 'vendas_por_origem', titulo: 'Origens (técnico)', subtitulo: 'source_name da Shopify: web, pos, app…' })}
    </div>
  </section>

  <section class="panel" id="panel-products" role="tabpanel" aria-labelledby="tab-products">
    <div class="kpis kpis--sm" id="kpisCatalogo"></div>
    ${blocoM({ id: 'pdBusca', metrica: 'busca_produtos', titulo: 'Buscar produto', subtitulo: 'Busca por texto no catálogo (FTS5)',
      corpo: `<div class="page-filter"><input id="qProduto" placeholder="nome, sku, tipo…" style="max-width:340px">
              <button class="btn--sm" type="button" id="btnBuscar">Buscar</button></div><div id="resBusca"></div>` })}
    ${blocoM({ id: 'pdRuptura', metrica: 'previsao_ruptura', titulo: 'Previsão de ruptura', subtitulo: 'Variantes que esgotam primeiro, pela velocidade real de venda',
      dica: 'Ignora variantes com venda sob demanda (inventory_policy=continue).' })}
  </section>

  <section class="panel" id="panel-customers" role="tabpanel" aria-labelledby="tab-customers">
    ${filtroPeriodo('customers')}
    <div class="kpis kpis--sm" id="kpisClientes"></div>
    ${blocoM({ id: 'cuCoortes', metrica: 'ltv_coortes', titulo: 'Novos vs recorrentes', subtitulo: 'Receita de cada grupo no período',
      dica: 'Cliente "novo" = primeira compra de todos os tempos caiu dentro do período.' })}
  </section>

  <section class="panel" id="panel-ads" role="tabpanel" aria-labelledby="tab-ads">
    ${filtroPeriodo('ads')}
    ${blocoM({ id: 'adPlataformas', metrica: 'ads_plataformas', titulo: 'Anúncios por plataforma', subtitulo: 'Gasto, cliques e ROAS reportado pela plataforma',
      dica: 'ROAS aqui usa o valor de conversão REPORTADO pela plataforma, não a receita da Shopify.' })}
    ${blocoM({ id: 'adTrafego', metrica: 'trafego_web', titulo: 'Tráfego web (GA4)', subtitulo: 'Sessões e usuários por dia' })}
  </section>

  <section class="panel" id="panel-margin" role="tabpanel" aria-labelledby="tab-margin">
    ${filtroPeriodo('margin')}
    ${blocoM({ id: 'mgProdutos', metrica: 'margem_por_produto', titulo: 'Margem por produto', subtitulo: 'Receita, CMV e margem bruta no período',
      dica: 'Exige custo de variante cadastrado na loja. Cobertura mostra a fração de unidades com custo conhecido.' })}
    ${blocoM({ id: 'mgMetas', metrica: 'metas', titulo: 'Metas do ano', subtitulo: 'Metas mensais cadastradas por métrica' })}
  </section>

  <section class="panel" id="panel-system" role="tabpanel" aria-labelledby="tab-system">
    ${bloco({ id: 'syIntegracoes', titulo: 'Integrações', subtitulo: 'Estado de cada conector e última execução',
      corpo: `<div class="tbl-wrap"><table>
        <thead><tr><th>Integração</th><th>Estado</th><th>Última execução</th></tr></thead><tbody>
        ${estado.map(c => `<tr><td>${esc(c.rotulo)}</td>
          <td><span class="pill ${c.status === 'conectado' ? 'ok' : c.status === 'erro' ? 'err' : ''}">${esc(c.status)}</span></td>
          <td class="sub">${esc(c.ultimaExecucao?.finished_at ?? '—')} ${c.ultimaExecucao?.records != null ? `(${c.ultimaExecucao.records} reg.)` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p><button id="btnSync" type="button">Sincronizar agora</button> <span id="s" class="sub"></span></p>` })}
    ${blocoM({ id: 'sySync', metrica: 'status_sync', titulo: 'Status das sincronizações', subtitulo: 'Quando cada fonte rodou, com status e erro' })}
    ${blocoM({ id: 'syQualidade', metrica: 'qualidade_dado', titulo: 'Qualidade do dado', subtitulo: 'O que falta preencher — transparência, não maquiagem' })}
    ${bloco({ id: 'syApi', titulo: 'API e MCP', subtitulo: 'As mesmas definições servem painel, REST e MCP',
      corpo: `<p class="sub">${ativas.length} de ${todas.length} métricas disponíveis: ${ativas.map(k => `<code>${esc(k)}</code>`).join(' ')}</p>
        <p class="sub">REST em <code>/api/m/&lt;chave&gt;</code> · OpenAPI em <code>/openapi.json</code> · MCP em <code>/mcp</code>
        · Prometheus em <code>/metrics</code></p>` })}
  </section>`;

  const script = `
  window.__GRAF__=${JSON.stringify(graficos)};
  ${CHART_JS}
  const MOEDA=${JSON.stringify(moeda)};
  const fm=v=>v==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:MOEDA}).format(v);
  const fn=v=>v==null?'—':new Intl.NumberFormat('pt-BR').format(v);
  const fp=v=>v==null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(v)+'%';
  const fr=v=>v==null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v);
  const vazio=(msg)=>'<div class="state"><span class="state__icon" aria-hidden="true">◍</span><span>'+(msg||'Sem dados no período.')+'</span></div>';
  const erroBox=m=>'<div class="state state--error state--inline" role="alert"><span class="state__icon" aria-hidden="true">⚠</span><span><strong>Falha ao carregar.</strong> '+m+'</span></div>';

  // Período: padrão = mês corrente (fuso da loja, UTC-3).
  const hoje=new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const ini=hoje.slice(0,8)+'01';
  document.querySelectorAll('[data-per=de]').forEach(e=>e.value=ini);
  document.querySelectorAll('[data-per=ate]').forEach(e=>e.value=hoje);
  const periodoDe=id=>document.getElementById('de-'+id)?.value||ini;
  const periodoAte=id=>document.getElementById('ate-'+id)?.value||hoje;

  async function get(k,q){
    try{
      const r=await fetch('/api/m/'+k+'?'+new URLSearchParams(q));
      const d=await r.json().catch(()=>({}));
      if(!r.ok) return {erro:d.erro||('HTTP '+r.status)};
      return {dados:d};
    }catch(e){ return {erro:'falha de conexão'} }
  }
  function corpoDe(id){ return document.getElementById('body-'+id); }
  function pronto(id){ document.querySelector('[data-bloco='+id+']')?.setAttribute('aria-busy','false'); }
  // Preenche um bloco tratando os 3 estados (erro / vazio / conteúdo) num só lugar.
  async function encher(id, chave, params, render){
    const el=corpoDe(id); if(!el) return;
    if(el.dataset.indisponivel==='1') return;
    const r=await get(chave, params);
    el.innerHTML = r.erro ? erroBox(r.erro) : (render(r.dados) || vazio());
    pronto(id);
  }
  // Blocos renderizados no servidor como "indisponível" não devem ser sobrescritos.
  document.querySelectorAll('.block__body').forEach(el=>{
    if(el.querySelector('.state') && !el.querySelector('.skeleton')) { el.dataset.indisponivel='1'; pronto(el.id.replace('body-','')); }
  });

  function tabela(cols,linhas,msgVazio){
    if(!linhas||!linhas.length) return vazio(msgVazio);
    return '<div class="tbl-wrap"><table><thead><tr>'+cols.map(c=>'<th'+(c.num?' class="num"':'')+'>'+c.t+'</th>').join('')+
      '</tr></thead><tbody>'+linhas.map(l=>'<tr>'+cols.map(c=>'<td'+(c.num?' class="num"':'')+'>'+c.f(l)+'</td>').join('')+'</tr>').join('')+
      '</tbody></table></div>';
  }
  function kpi({label,valor,delta,hint,icon,accent,invertido}){
    let cls='kpi__delta--flat', seta='▬';
    if(delta!=null&&isFinite(delta)&&Math.abs(delta)>=0.05){
      const subiu=delta>0, bom=invertido?!subiu:subiu;
      cls=bom?'kpi__delta--up':'kpi__delta--down'; seta=subiu?'▲':'▼';
    }
    const d=(delta!=null&&isFinite(delta))
      ? '<span class="kpi__delta '+cls+'" title="Variação vs período anterior">'+seta+' '+fp(Math.abs(delta))+'</span>' : '';
    return '<div class="kpi'+(accent?' kpi--accent':'')+'">'
      +'<div class="kpi__top"><span class="kpi__label">'+label+'</span>'+(icon?'<span class="kpi__icon" aria-hidden="true">'+icon+'</span>':'')+'</div>'
      +'<span class="kpi__value">'+valor+'</span>'
      +'<div class="kpi__foot">'+(hint?'<span class="kpi__hint">'+hint+'</span>':'<span></span>')+d+'</div></div>';
  }
  const skel=n=>Array.from({length:n},()=>'<div class="kpi"><div class="kpi__top"><span class="kpi__label">&nbsp;</span></div><span class="sk"></span><div class="kpi__foot"><span></span></div></div>').join('');

  // ---------- VISÃO GERAL ----------
  async function carregarOverview(){
    const q={de:periodoDe('overview'),ate:periodoAte('overview')};
    const topo=document.getElementById('kpisTopo'), base=document.getElementById('kpisBase');
    topo.innerHTML=skel(6); base.innerHTML=skel(6);
    // comparar_periodos dá a variação % das 3 métricas-âncora sem 2ª chamada de kpis.
    const [rk,rc]=await Promise.all([get('kpis',q), get('comparar_periodos',q)]);
    if(rk.erro){ topo.innerHTML='<div class="kpi">'+erroBox(rk.erro)+'</div>'; base.innerHTML=''; return; }
    const k=rk.dados, v=rc.dados?.variacao_pct||{};
    topo.innerHTML=[
      kpi({label:'Faturamento',valor:fm(k.faturamento),delta:v.faturamento,icon:'$',accent:1}),
      kpi({label:'ROAS',valor:k.roas!=null?fr(k.roas):'—',hint:'faturamento ÷ ads',icon:'◎'}),
      kpi({label:'Pedidos',valor:fn(k.pedidos),delta:v.pedidos,icon:'#'}),
      kpi({label:'Ticket médio',valor:fm(k.ticket),icon:'~'}),
      kpi({label:'Gasto em ads',valor:fm(k.gasto_ads),icon:'▸',invertido:1}),
      kpi({label:'CAC',valor:fm(k.cac),hint:'custo de aquisição',icon:'◷',invertido:1}),
    ].join('');
    base.innerHTML=[
      kpi({label:'Unidades',valor:fn(k.unidades),delta:v.unidades}),
      kpi({label:'Clientes',valor:fn(k.clientes)}),
      kpi({label:'Margem bruta',valor:fm(k.margem_bruta)}),
      kpi({label:'CMV',valor:fm(k.cmv)}),
      kpi({label:'Descontos',valor:fm(k.descontos),invertido:1}),
      kpi({label:'Frete',valor:fm(k.frete)}),
      kpi({label:'Reembolsos',valor:fm(k.reembolsos),invertido:1}),
    ].join('');

    encher('ovSerie','vendas_diarias',q,d=>svgLinha(d.series||[],'dia','faturamento')+
      tabela([{t:'Dia',f:l=>l.dia},{t:'Pedidos',num:1,f:l=>fn(l.pedidos)},
              {t:'Unid.',num:1,f:l=>fn(l.unidades)},{t:'Faturamento',num:1,f:l=>fm(l.faturamento)}],(d.series||[]).slice(-14)));
    encher('ovCanais','vendas_por_canal',q,d=>svgBarras(d.canais||[],'canal','faturamento')+
      tabela([{t:'Canal',f:l=>l.canal},{t:'Pedidos',num:1,f:l=>fn(l.pedidos)},
              {t:'Faturamento',num:1,f:l=>fm(l.faturamento)}],d.canais));
    encher('ovProdutos','mais_vendidos',{...q,limite:10},d=>
      tabela([{t:'Produto',f:l=>l.produto??'—'},{t:'Unid.',num:1,f:l=>fn(l.unidades)},
              {t:'Receita',num:1,f:l=>fm(l.receita)}],d.produtos));
  }

  // ---------- VENDAS ----------
  async function carregarVendas(){
    const q={de:periodoDe('sales'),ate:periodoAte('sales')};
    const box=document.getElementById('kpisComparar');
    box.innerHTML=skel(3);
    const r=await get('comparar_periodos',q);
    if(r.erro){ box.innerHTML='<div class="kpi">'+erroBox(r.erro)+'</div>'; }
    else{
      const a=r.dados.atual||{}, v=r.dados.variacao_pct||{}, pa=r.dados.periodo_anterior||{};
      const ref='vs '+(pa.de||'')+' → '+(pa.ate||'');
      box.innerHTML=[
        kpi({label:'Faturamento',valor:fm(a.faturamento),delta:v.faturamento,hint:ref,accent:1}),
        kpi({label:'Pedidos',valor:fn(a.pedidos),delta:v.pedidos,hint:ref}),
        kpi({label:'Unidades',valor:fn(a.unidades),delta:v.unidades,hint:ref}),
      ].join('');
    }
    encher('slSerie','vendas_diarias',q,d=>svgLinha(d.series||[],'dia','faturamento')+
      tabela([{t:'Dia',f:l=>l.dia},{t:'Pedidos',num:1,f:l=>fn(l.pedidos)},
              {t:'Unid.',num:1,f:l=>fn(l.unidades)},{t:'Faturamento',num:1,f:l=>fm(l.faturamento)}],d.series));
    encher('slCanais','vendas_por_canal',q,d=>svgBarras(d.canais||[],'canal','faturamento')+
      tabela([{t:'Canal',f:l=>l.canal},{t:'Tipo',f:l=>l.tipo??'—'},{t:'Pedidos',num:1,f:l=>fn(l.pedidos)},
              {t:'Faturamento',num:1,f:l=>fm(l.faturamento)}],d.canais));
    encher('slOrigens','vendas_por_origem',q,d=>svgBarras(d.origens||[],'origem','faturamento')+
      tabela([{t:'Origem',f:l=>l.origem},{t:'Pedidos',num:1,f:l=>fn(l.pedidos)},
              {t:'Faturamento',num:1,f:l=>fm(l.faturamento)}],d.origens));
  }

  // ---------- PRODUTOS ----------
  async function carregarProdutos(){
    const box=document.getElementById('kpisCatalogo');
    box.innerHTML=skel(6);
    const r=await get('catalogo',{});
    if(r.erro){ box.innerHTML='<div class="kpi">'+erroBox(r.erro)+'</div>'; }
    else{
      const c=r.dados;
      box.innerHTML=[
        kpi({label:'Produtos',valor:fn(c.produtos),accent:1}),
        kpi({label:'Ativos',valor:fn(c.ativos)}),
        kpi({label:'Esgotados',valor:fn(c.esgotados),invertido:1}),
        kpi({label:'Valor de estoque',valor:fm(c.valor_estoque),hint:'só estoque real'}),
        kpi({label:'Variantes',valor:fn(c.variantes)}),
        kpi({label:'Sem custo',valor:fn(c.variantes_sem_custo),hint:'trava CMV/margem',invertido:1}),
      ].join('')+(c.aviso?'<div class="kpi" style="grid-column:1/-1"><span class="warn">⚠ '+c.aviso+'</span></div>':'');
    }
    encher('pdRuptura','previsao_ruptura',{limite:20},d=>
      tabela([{t:'Produto',f:l=>l.produto??'—'},{t:'SKU',f:l=>l.sku??'—'},
              {t:'Estoque',num:1,f:l=>fn(l.estoque)},{t:'Vendidos',num:1,f:l=>fn(l.vendidos)},
              {t:'Velocid./dia',num:1,f:l=>fr(l.velocidade_dia)},
              {t:'Dias p/ ruptura',num:1,f:l=>l.dias_para_ruptura==null?'—':fn(l.dias_para_ruptura)}],
              d.variantes,'Nenhuma variante com risco de ruptura (ou catálogo ainda não sincronizado).'));
  }
  async function buscarProduto(){
    const el=document.getElementById('resBusca');
    const q=document.getElementById('qProduto')?.value?.trim();
    if(!q){ el.innerHTML='<p class="sub">digite um termo para buscar</p>'; return; }
    el.innerHTML='<p class="sub">buscando…</p>';
    const r=await get('busca_produtos',{q,limite:20});
    if(r.erro){ el.innerHTML=erroBox(r.erro); return; }
    const linhas=r.dados.produtos||r.dados.resultados||[];
    el.innerHTML=tabela([{t:'Produto',f:l=>l.produto??l.title??'—'},{t:'Tipo',f:l=>l.product_type??l.tipo??'—'},
      {t:'Preço',num:1,f:l=>fm(l.price_min??l.preco_min)},{t:'Estoque',num:1,f:l=>fn(l.total_inventory??l.estoque)}],linhas);
  }

  // ---------- CLIENTES ----------
  async function carregarClientes(){
    const q={de:periodoDe('customers'),ate:periodoAte('customers')};
    const box=document.getElementById('kpisClientes');
    box.innerHTML=skel(5);
    const r=await get('ltv_coortes',q);
    if(r.erro){ box.innerHTML='<div class="kpi">'+erroBox(r.erro)+'</div>'; pronto('cuCoortes'); return; }
    const c=r.dados;
    box.innerHTML=[
      kpi({label:'Clientes',valor:fn(c.clientes),accent:1}),
      kpi({label:'Novos',valor:fn(c.novos)}),
      kpi({label:'Recorrentes',valor:fn(c.recorrentes)}),
      kpi({label:'Taxa de recompra',valor:fp(c.taxa_recompra)}),
      kpi({label:'Receita',valor:fm(c.receita)}),
    ].join('');
    const el=corpoDe('cuCoortes');
    if(el && el.dataset.indisponivel!=='1'){
      el.innerHTML=tabela([{t:'Grupo',f:l=>l.grupo},{t:'Clientes',num:1,f:l=>fn(l.clientes)},{t:'Receita',num:1,f:l=>fm(l.receita)}],[
        {grupo:'Novos',clientes:c.novos,receita:c.receita_novos},
        {grupo:'Recorrentes',clientes:c.recorrentes,receita:c.receita_recorrentes},
      ]);
      pronto('cuCoortes');
    }
  }

  // ---------- ADS ----------
  async function carregarAds(){
    const q={de:periodoDe('ads'),ate:periodoAte('ads')};
    encher('adPlataformas','ads_plataformas',q,d=>
      tabela([{t:'Plataforma',f:l=>l.plataforma},{t:'Gasto',num:1,f:l=>fm(l.gasto)},
              {t:'Impressões',num:1,f:l=>fn(l.impressoes)},{t:'Cliques',num:1,f:l=>fn(l.cliques)},
              {t:'Conversões',num:1,f:l=>fr(l.conversoes)},{t:'Valor conv.',num:1,f:l=>fm(l.valor_conversao)},
              {t:'ROAS plat.',num:1,f:l=>l.roas_plataforma==null?'—':fr(l.roas_plataforma)}],d.plataformas));
    encher('adTrafego','trafego_web',q,d=>svgLinha(d.dias||d.series||[],'dia','sessoes')+
      tabela([{t:'Dia',f:l=>l.dia},{t:'Sessões',num:1,f:l=>fn(l.sessoes)},
              {t:'Usuários',num:1,f:l=>fn(l.usuarios)},{t:'Engajadas',num:1,f:l=>fn(l.sessoes_engajadas)},
              {t:'Conversões',num:1,f:l=>fr(l.conversoes)}],(d.dias||d.series||[]).slice(-14)));
  }

  // ---------- MARGEM ----------
  async function carregarMargem(){
    const q={de:periodoDe('margin'),ate:periodoAte('margin')};
    encher('mgProdutos','margem_por_produto',{...q,limite:20},d=>
      tabela([{t:'Produto',f:l=>l.produto??'—'},{t:'Unid.',num:1,f:l=>fn(l.unidades)},
              {t:'Receita',num:1,f:l=>fm(l.receita)},{t:'CMV',num:1,f:l=>fm(l.cmv)},
              {t:'Margem',num:1,f:l=>fm(l.margem)},
              {t:'Cobert. custo',num:1,f:l=>l.cobertura_custo==null?'—':fp(l.cobertura_custo*100)}],d.produtos));
    encher('mgMetas','metas',{},d=>
      tabela([{t:'Mês',f:l=>l.mes},{t:'Métrica',f:l=>l.metrica},{t:'Valor',num:1,f:l=>fm(l.valor)},
              {t:'Manual',f:l=>l.manual?'sim':'não'}],d.metas,'Nenhuma meta cadastrada para o ano.'));
  }

  // ---------- SISTEMA ----------
  async function carregarSistema(){
    encher('sySync','status_sync',{},d=>
      tabela([{t:'Fonte',f:l=>l.fonte},{t:'Status',f:l=>'<span class="pill '+(l.status==='ok'?'ok':l.status==='error'?'err':'warn')+'">'+(l.status??'—')+'</span>'},
              {t:'Última execução',f:l=>l.ultima_execucao??'—'},{t:'Registros',num:1,f:l=>fn(l.registros)},
              {t:'Erro',f:l=>l.erro?'<span class="err">'+String(l.erro).slice(0,60)+'</span>':'—'}],
              d.fontes,'Nenhuma sincronização registrada ainda.'));
    encher('syQualidade','qualidade_dado',{},d=>{
      const linhas=Object.entries(d).filter(([,v])=>typeof v==='number'||typeof v==='string')
        .map(([k,v])=>({item:k.replace(/_/g,' '),valor:v}));
      return tabela([{t:'Item',f:l=>l.item},{t:'Valor',num:1,f:l=>typeof l.valor==='number'?fn(l.valor):l.valor}],linhas);
    });
  }

  async function sincronizar(){
    const el=document.getElementById('s'); el.textContent='sincronizando…';
    try{
      const r=await fetch('/api/conectores/shopify/sync',{method:'POST'});
      const d=await r.json().catch(()=>({}));
      el.textContent=r.ok?('ok — '+(d.registros!=null?d.registros+' registros':'concluído')):'falhou';
      if(r.ok) setTimeout(()=>location.reload(),1500);
    }catch(e){ el.textContent='falha de conexão'; }
  }
  async function sair(){
    try{ await fetch('/api/logout',{method:'POST'}); }catch(e){}
    location.reload();
  }

  // Carrega a aba só quando ela aparece (e uma vez, salvo reaplicar período).
  const CARGA={overview:carregarOverview,sales:carregarVendas,products:carregarProdutos,
               customers:carregarClientes,ads:carregarAds,margin:carregarMargem,system:carregarSistema};
  const jaCarregou={};
  document.addEventListener('aba:ativa',ev=>{
    const id=ev.detail.id;
    if(jaCarregou[id]) return;
    jaCarregou[id]=1;
    CARGA[id]?.();
  });
  document.querySelectorAll('[data-aplicar]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.aplicar;
    document.querySelectorAll('#panel-'+id+' .block__body').forEach(el=>{
      if(el.dataset.indisponivel!=='1') el.innerHTML='<p class="sub">carregando…</p>';
    });
    CARGA[id]?.();
  }));
  document.getElementById('btnBuscar')?.addEventListener('click',buscarProduto);
  document.getElementById('qProduto')?.addEventListener('keydown',e=>{if(e.key==='Enter')buscarProduto()});
  document.getElementById('btnSync')?.addEventListener('click',sincronizar);
  document.getElementById('btnSair')?.addEventListener('click',sair);
  document.getElementById('headerLogo')?.addEventListener('error',function(){ this.remove(); });`;

  return layoutApp({
    titulo: nomeLoja, marca, abas: ABAS, corpo, script, nonce,
    usuario, versao: process.env.APP_VERSION ?? 'dev',
  });
}
