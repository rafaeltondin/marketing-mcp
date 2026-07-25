// UI server-rendered. Tokens vêm do tema derivado da loja — nenhuma cor de marca
// aqui. Sem build step. CSP com nonce: nada de handler inline (onclick=""); tudo
// é ligado por id dentro do <script nonce>.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function tokensCss(marca) {
  const claro = marca?.tokensClaro ?? {};
  const escuro = marca?.tokensEscuro ?? {};
  const linhas = (o) => Object.entries(o).map(([k, v]) => `    ${k}: ${v};`).join('\n');
  return `:root[data-theme="light"], :root {
${linhas(claro) || '    --bg:#fff; --surface:#f7f7f8; --ink:#141414; --ink-2:#555; --line:#e3e3e6; --action:#3a6ea5; --action-ink:#fff;'}
  }
  :root[data-theme="dark"] {
${linhas(escuro) || '    --bg:#101014; --surface:#17171d; --ink:#f2f2f4; --ink-2:#b9b9c2; --line:#2b2b34; --action:#5d8abb; --action-ink:#08080a;'}
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme]) {
${linhas(escuro)}
  } }`;
}

const BASE = () => `
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
  .wrap{max-width:1100px;margin:0 auto;padding:clamp(1rem,4vw,2.5rem)}
  header{display:flex;align-items:center;gap:.75rem;margin-bottom:2rem;flex-wrap:wrap}
  header img{height:34px;width:auto;border-radius:6px}
  h1{font-size:clamp(1.25rem,3vw,1.6rem);margin:0;letter-spacing:-.02em}
  .sub{color:var(--ink-2);font-size:.9rem}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:12px;
        padding:1.25rem;margin-bottom:1rem}
  .grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
  .kpi{font-size:clamp(1.4rem,4vw,2rem);font-weight:650;letter-spacing:-.02em;margin:.15rem 0 0}
  .rot{color:var(--ink-2);font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}
  button,.btn{background:var(--action);color:var(--action-ink);border:0;border-radius:9px;
        padding:.62rem 1.05rem;font-size:.94rem;font-weight:550;cursor:pointer;font-family:inherit}
  button:hover{filter:brightness(1.08)} button:disabled{opacity:.55;cursor:not-allowed}
  input{width:100%;padding:.6rem .7rem;border:1px solid var(--line);border-radius:8px;
        background:var(--bg);color:var(--ink);font:inherit;font-size:.94rem}
  label{display:block;margin:.75rem 0 .25rem;font-size:.86rem;color:var(--ink-2)}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th,td{text-align:left;padding:.5rem .4rem;border-bottom:1px solid var(--line)}
  th{color:var(--ink-2);font-weight:550;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-flex;align-items:center;gap:.35rem;font-size:.76rem;padding:.2rem .55rem;
        border-radius:99px;border:1px solid var(--line)}
  .ok{color:#1a7f4b} .err{color:#b3261e} .warn{color:#8a6100}
  .tbl-wrap{overflow-x:auto}
  .msg{padding:.7rem .9rem;border-radius:9px;border:1px solid var(--line);margin:.75rem 0;font-size:.9rem}
  .swatches{display:flex;gap:.3rem;margin-top:.5rem}
  .sw{width:26px;height:26px;border-radius:6px;border:1px solid var(--line)}
  .chart{width:100%;height:auto;display:block}
  .leg{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.5rem;font-size:.8rem;color:var(--ink-2)}
  .leg span{display:inline-flex;align-items:center;gap:.3rem}
  .leg i{width:11px;height:11px;border-radius:3px;display:inline-block}
  footer{margin-top:2.5rem;color:var(--ink-2);font-size:.8rem}
  @media(max-width:520px){.wrap{padding:1rem}}

  .auth-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem}
  .auth-card{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);
        border-radius:16px;padding:2.1rem 1.9rem;box-shadow:0 1px 2px rgba(0,0,0,.05),0 16px 40px -16px rgba(0,0,0,.22)}
  .auth-logo{width:56px;height:56px;border-radius:14px;margin:0 auto .9rem;overflow:hidden;
        display:flex;align-items:center;justify-content:center;background:var(--action);
        color:var(--action-ink);font-size:1.3rem;font-weight:650}
  .auth-logo img{width:100%;height:100%;object-fit:cover}
  .auth-head{text-align:center;margin-bottom:1.6rem}
  .auth-head h1{font-size:1.2rem;margin:0 0 .2rem;letter-spacing:-.01em}
  .auth-head p{margin:0;color:var(--ink-2);font-size:.86rem}
  .field{margin-bottom:1.1rem}
  .field label{margin:0 0 .35rem}
  .pwd-wrap{position:relative}
  .pwd-wrap input{padding-right:3.4rem}
  .pwd-toggle{position:absolute;right:.35rem;top:50%;transform:translateY(-50%);background:none;
        border:0;padding:.4rem .5rem;color:var(--ink-2);cursor:pointer;font-size:.76rem;
        font-weight:600;border-radius:6px}
  .pwd-toggle:hover{color:var(--ink);background:var(--line)}
  .auth-submit{width:100%;margin-top:.3rem;display:flex;align-items:center;justify-content:center;gap:.55rem}
  .spinner{width:14px;height:14px;border-radius:50%;flex:none;
        border:2px solid rgba(255,255,255,.45);border-top-color:currentColor;
        animation:girar .7s linear infinite;display:none}
  .auth-submit.loading .spinner{display:inline-block}
  .auth-foot{text-align:center;margin-top:1.4rem;color:var(--ink-2);font-size:.76rem}
  @keyframes girar{to{transform:rotate(360deg)}}
`;

function layoutAuth({ titulo, marca, corpo, script = '', nonce = '' }) {
  const n = nonce ? ` nonce="${esc(nonce)}"` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<style${n}>${tokensCss(marca)}${BASE()}</style></head>
<body>${corpo}<script${n}>${script}</script></body></html>`;
}

function layout({ titulo, marca, corpo, script = '', nonce = '' }) {
  const logo = marca?.logo || marca?.logoUrl;
  const n = nonce ? ` nonce="${esc(nonce)}"` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<style${n}>${tokensCss(marca)}${BASE(marca)}</style></head>
<body><div class="wrap">
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><h1>${esc(titulo)}</h1></div></header>
${corpo}
<footer>storekit ${esc(process.env.APP_VERSION ?? 'dev')} — painel, ETL, MCP e RAG numa imagem</footer>
</div><script${n}>${script}</script></body></html>`;
}

// Helpers de gráfico embutidos no cliente (sem dependência; usam a paleta acessível).
const CHART_JS = `
  const PAL = window.__GRAF__ || ['#3a6ea5','#1a7f4b','#8a6100','#8e44ad','#b3261e'];
  function svgLinha(dados, campoX, campoY){
    if(!dados||dados.length<2) return '<p class="sub">sem dados no período</p>';
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
    if(!dados||!dados.length) return '<p class="sub">sem dados no período</p>';
    const top=dados.slice(0,8), max=Math.max(...top.map(d=>+d[campoVal]||0),1);
    const W=680,bh=26,gap=8,H=top.length*(bh+gap)+8;
    let s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img">';
    top.forEach((d,i)=>{const w=(+d[campoVal]||0)/max*(W-180),yy=i*(bh+gap)+4,cor=PAL[i%PAL.length];
      s+='<rect x="150" y="'+yy+'" width="'+Math.max(w,1)+'" height="'+bh+'" rx="4" fill="'+cor+'"/>'
        +'<text x="0" y="'+(yy+bh/2+4)+'" font-size="12" fill="var(--ink-2)">'+String(d[campoRot]??'').slice(0,20)+'</text>';});
    return s+'</svg>';
  }
`;

export function paginaSetup({ config, conectores, temAdmin, nonce }) {
  const estado = conectores.estado();
  const marca = config.get('brand');
  const corpo = `
  <div class="card">
    <div class="rot">Passo 1</div><h2 style="margin:.2rem 0 .6rem">Criar acesso</h2>
    ${temAdmin ? '<p class="ok">✓ administrador já criado</p>' : `
    <p class="sub">Ninguém acessa este painel sem senha. Comece criando o seu acesso.</p>
    <div id="f1"><label>Usuário</label><input id="u" autocomplete="username">
    <label>Senha (mín. 8 caracteres)</label><input id="p" type="password" autocomplete="new-password">
    <p><button id="btnAdmin">Criar administrador</button></p></div>`}
  </div>

  <div class="card">
    <div class="rot">Passo 2</div><h2 style="margin:.2rem 0 .6rem">Conectar a loja</h2>
    <p class="sub">Ao conectar, o painel lê a identidade visual da loja e se veste com ela.
       Nada é digitado duas vezes.</p>
    <label>Domínio .myshopify.com</label>
    <input id="shop" placeholder="minha-loja.myshopify.com">
    <label>Access token do app (shpat_…)</label>
    <input id="tk" type="password" placeholder="shpat_...">
    <p><button id="btnConectar" ${temAdmin ? '' : 'disabled'}>Conectar Shopify</button>
       ${temAdmin ? '' : '<span class="sub"> — crie o administrador primeiro</span>'}</p>
    <div id="res"></div>
  </div>

  <div class="card">
    <h2 style="margin:0 0 .6rem;font-size:1.05rem">Integrações</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Integração</th><th>Estado</th><th>Conta</th></tr></thead><tbody>
    ${estado.map(c => `<tr><td>${esc(c.rotulo)}</td>
      <td><span class="pill ${c.status === 'conectado' ? 'ok' : c.status === 'erro' ? 'err' : ''}">${esc(c.status)}</span></td>
      <td class="sub">${esc(c.conta ?? '—')}</td></tr>`).join('')}
    </tbody></table></div>
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
  return layout({ titulo: 'Configurar painel', marca, corpo, script, nonce });
}

export function paginaLogin({ config, nonce }) {
  const marca = config.get('brand');
  const logo = marca?.logo || marca?.logoUrl;
  const nomeLoja = config.get('store.name') ?? 'Painel';
  const inicial = esc(nomeLoja.trim().charAt(0).toUpperCase() || 'P');

  const corpo = `<div class="auth-shell"><div class="auth-card">
    <div class="auth-head">
      <div class="auth-logo">${logo ? `<img src="${esc(logo)}" alt="">` : inicial}</div>
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

  return layoutAuth({ titulo: nomeLoja, marca, corpo, script, nonce });
}

export function paginaPainel({ config, conectores, metricas, nonce }) {
  const marca = config.get('brand');
  const moeda = config.get('store.currency') ?? 'BRL';
  const estado = conectores.estado();
  const ativas = metricas.ativas();
  const graficos = marca?.graficos ?? null;
  const corpo = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
      <div><div class="rot">Período</div>
        <div style="display:flex;gap:.5rem;margin-top:.3rem">
          <input id="de" type="date" style="width:auto"><input id="ate" type="date" style="width:auto">
          <button id="btnAplicar">Aplicar</button></div></div>
      <div class="sub">${esc(config.get('store.domain') ?? '')}</div>
    </div>
  </div>
  <div id="kpis" class="grid"></div>
  <div class="card"><h2 style="margin:0 0 .7rem;font-size:1.05rem">Vendas por dia</h2>
    <div id="grafSerie"></div><div id="serie" class="tbl-wrap"></div></div>
  <div class="card"><h2 style="margin:0 0 .7rem;font-size:1.05rem">Canais</h2>
    <div id="grafCanais"></div><div id="canais" class="tbl-wrap"></div></div>
  <div class="card"><h2 style="margin:0 0 .7rem;font-size:1.05rem">Mais vendidos</h2>
    <div id="prod" class="tbl-wrap"></div></div>
  <div class="card"><h2 style="margin:0 0 .7rem;font-size:1.05rem">Integrações</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Integração</th><th>Estado</th><th>Última execução</th></tr></thead><tbody>
    ${estado.map(c => `<tr><td>${esc(c.rotulo)}</td>
      <td><span class="pill ${c.status === 'conectado' ? 'ok' : c.status === 'erro' ? 'err' : ''}">${esc(c.status)}</span></td>
      <td class="sub">${esc(c.ultimaExecucao?.finished_at ?? '—')} ${c.ultimaExecucao?.records != null ? `(${c.ultimaExecucao.records} reg.)` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p><button id="btnSync">Sincronizar agora</button> <span id="s" class="sub"></span></p>
  </div>
  <div class="card"><div class="rot">Métricas disponíveis</div>
    <p class="sub">${ativas.map(m => esc(m.key)).join(' · ')}</p>
    <p class="sub">Também expostas via MCP em <code>/mcp</code> e via REST em <code>/api/m/&lt;chave&gt;</code> (OpenAPI em <code>/openapi.json</code>) — as mesmas definições, uma implementação.</p></div>`;

  const script = `
  window.__GRAF__=${JSON.stringify(graficos)};
  ${CHART_JS}
  const MOEDA=${JSON.stringify(moeda)};
  const fm=v=>v==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:MOEDA}).format(v);
  const fn=v=>v==null?'—':new Intl.NumberFormat('pt-BR').format(v);
  const hoje=new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const ini=hoje.slice(0,8)+'01';
  de.value=ini; ate.value=hoje;
  async function get(k,q){try{const r=await fetch('/api/m/'+k+'?'+new URLSearchParams(q));
    if(!r.ok) return null; return await r.json()}catch(e){return null}}
  function tabela(cols,linhas){ if(!linhas||!linhas.length) return '<p class="sub">sem dados no período</p>';
    return '<table><thead><tr>'+cols.map(c=>'<th'+(c.num?' class="num"':'')+'>'+c.t+'</th>').join('')+
      '</tr></thead><tbody>'+linhas.map(l=>'<tr>'+cols.map(c=>'<td'+(c.num?' class="num"':'')+'>'+c.f(l)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
  async function carregar(){
    const q={de:de.value,ate:ate.value};
    kpis.innerHTML='<div class="card sub">carregando…</div>';
    const k=await get('kpis',q);
    if(k) kpis.innerHTML=[['Faturamento',fm(k.faturamento)],['Pedidos',fn(k.pedidos)],
      ['Ticket médio',fm(k.ticket)],['Unidades',fn(k.unidades)],['Clientes',fn(k.clientes)],
      ['Gasto em ads',fm(k.gasto_ads)],['ROAS',k.roas!=null?k.roas:'—'],['CAC',fm(k.cac)],
      ['Margem bruta',fm(k.margem_bruta)],['Descontos',fm(k.descontos)]]
      .map(([r,v])=>'<div class="card"><div class="rot">'+r+'</div><div class="kpi">'+v+'</div></div>').join('');
    else kpis.innerHTML='<div class="card err">falha ao carregar KPIs</div>';
    const s=await get('vendas_diarias',q);
    document.getElementById('grafSerie').innerHTML=svgLinha(s?.series||[],'dia','faturamento');
    serie.innerHTML=tabela([{t:'Dia',f:l=>l.dia},{t:'Pedidos',num:1,f:l=>fn(l.pedidos)},
      {t:'Unid.',num:1,f:l=>fn(l.unidades)},{t:'Faturamento',num:1,f:l=>fm(l.faturamento)}], s?.series);
    const c=await get('vendas_por_canal',q);
    document.getElementById('grafCanais').innerHTML=svgBarras(c?.canais||[],'canal','faturamento');
    canais.innerHTML=tabela([{t:'Canal',f:l=>l.canal},{t:'Tipo',f:l=>l.tipo},
      {t:'Pedidos',num:1,f:l=>fn(l.pedidos)},{t:'Faturamento',num:1,f:l=>fm(l.faturamento)}], c?.canais);
    const p=await get('mais_vendidos',{...q,limite:10});
    prod.innerHTML=tabela([{t:'Produto',f:l=>l.produto??'—'},{t:'Unid.',num:1,f:l=>fn(l.unidades)},
      {t:'Receita',num:1,f:l=>fm(l.receita)}], p?.produtos);
  }
  async function sincronizar(){
    const el=document.getElementById('s'); el.textContent='sincronizando…';
    const r=await fetch('/api/conectores/shopify/sync',{method:'POST'});
    const d=await r.json().catch(()=>({}));
    el.textContent=r.ok?('ok: '+JSON.stringify(d)):'falhou';
    if(r.ok) setTimeout(()=>location.reload(),1200);
  }
  document.getElementById('btnAplicar').addEventListener('click',carregar);
  document.getElementById('btnSync').addEventListener('click',sincronizar);
  carregar();`;
  return layout({ titulo: config.get('store.name') ?? 'Painel', marca, corpo, script, nonce });
}
