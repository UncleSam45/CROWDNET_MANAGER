'use strict';

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const PRELOAD_SOURCE = String.raw`'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crowdnetCredentials', Object.freeze({
  load: () => ipcRenderer.invoke('credentials:load'),
  save: (credentials) => ipcRenderer.invoke('credentials:save', credentials),
  clear: () => ipcRenderer.invoke('credentials:clear'),
}));`;

const credentialsPath = () => path.join(app.getPath('userData'), 'credentials.bin');

function assertTrustedRenderer(event) {
  if (!event.senderFrame.url.startsWith('data:text/html')) {
    throw new Error('Credential request rejected.');
  }
}

async function loadCredentials(event) {
  assertTrustedRenderer(event);
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(credentialsPath());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[CrowdNet] Could not restore credentials.');
    return null;
  }
}

async function saveCredentials(event, credentials) {
  assertTrustedRenderer(event);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable on this computer.');
  }
  const username = typeof credentials?.username === 'string' ? credentials.username.slice(0, 80) : '';
  const accessKey = typeof credentials?.accessKey === 'string' ? credentials.accessKey : '';
  if (!username || !accessKey) throw new Error('Both credentials are required.');
  await fs.mkdir(path.dirname(credentialsPath()), { recursive: true });
  await fs.writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify({ username, accessKey })), { mode: 0o600 });
  return true;
}

async function clearCredentials(event) {
  assertTrustedRenderer(event);
  await fs.rm(credentialsPath(), { force: true });
  return true;
}

const APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src https://api.github.com; img-src data:">
  <title>CrowdNet — Access Portal</title>
  <style>
    :root { color-scheme: dark; --ink:#f5f7ff; --muted:#9299ad; --violet:#825cff; --cyan:#44d7ff; --pink:#f058ca; }
    * { box-sizing:border-box; }
    html,body { width:100%; height:100%; margin:0; overflow:hidden; }
    body { font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#05060b; color:var(--ink); -webkit-font-smoothing:antialiased; }
    button,input { font:inherit; }
    .noise { position:fixed; inset:0; z-index:20; pointer-events:none; opacity:.035; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E"); }
    #space { position:fixed; inset:0; width:100%; height:100%; }
    .orb { position:fixed; border-radius:999px; filter:blur(85px); opacity:.16; pointer-events:none; animation:drift 12s ease-in-out infinite alternate; }
    .orb.one { width:42vw; height:42vw; left:-14vw; top:-12vw; background:var(--violet); }
    .orb.two { width:35vw; height:35vw; right:-8vw; bottom:-14vw; background:var(--cyan); animation-delay:-6s; }
    @keyframes drift { to { transform:translate(7vw,6vh) scale(1.15); opacity:.25; } }
    .splash { position:fixed; inset:0; z-index:30; display:grid; place-items:center; background:#05060b; animation:splashOut .9s cubic-bezier(.7,0,.2,1) 2.65s forwards; }
    .splash-core { text-align:center; animation:splashIn 1s cubic-bezier(.2,.8,.2,1) both; }
    .mark { width:70px; height:70px; margin:0 auto 24px; position:relative; }
    .mark span { position:absolute; inset:8px; border:1px solid rgba(255,255,255,.65); transform:rotate(45deg); animation:markPulse 1.8s ease-in-out infinite; }
    .mark span:nth-child(2){ inset:19px; border-color:var(--cyan); animation-delay:-.5s; }
    .splash h1 { margin:0; font-size:clamp(28px,4vw,46px); letter-spacing:.38em; font-weight:500; padding-left:.38em; }
    .splash p { color:var(--muted); letter-spacing:.32em; text-transform:uppercase; font-size:9px; margin-top:17px; }
    .loadline { height:1px; width:180px; margin:28px auto 0; background:#202333; overflow:hidden; }
    .loadline:after { content:""; display:block; height:100%; background:linear-gradient(90deg,var(--violet),var(--cyan)); animation:load 2s .35s cubic-bezier(.65,0,.2,1) both; }
    @keyframes splashIn { from{opacity:0;transform:scale(.92);filter:blur(14px)} to{opacity:1;transform:none;filter:none} }
    @keyframes splashOut { to{opacity:0;visibility:hidden;transform:scale(1.08);filter:blur(15px)} }
    @keyframes markPulse { 50%{transform:rotate(135deg) scale(.82);opacity:.35} }
    @keyframes load { from{transform:translateX(-100%)} to{transform:translateX(0)} }
    main { position:relative; z-index:2; min-height:100%; display:grid; grid-template-columns:minmax(360px,1.05fr) minmax(440px,.95fr); opacity:0; animation:reveal 1.2s 3s ease forwards; }
    @keyframes reveal { to{opacity:1} }
    .story { padding:clamp(38px,6vw,90px); display:flex; flex-direction:column; justify-content:space-between; }
    .brand { display:flex; align-items:center; gap:13px; font-size:12px; font-weight:650; letter-spacing:.22em; }
    .brand-icon { width:25px; height:25px; border:1px solid #71788d; transform:rotate(45deg); display:grid; place-items:center; }
    .brand-icon:after { content:""; width:7px; height:7px; background:var(--cyan); box-shadow:0 0 18px var(--cyan); }
    .eyebrow { color:var(--cyan); font:600 10px ui-monospace,monospace; letter-spacing:.25em; text-transform:uppercase; margin-bottom:22px; }
    .hero h2 { max-width:720px; font-size:clamp(48px,6.6vw,100px); line-height:.91; letter-spacing:-.065em; font-weight:430; margin:0; }
    .hero h2 em { font-style:normal; color:transparent; -webkit-text-stroke:1px rgba(255,255,255,.42); }
    .hero-copy { max-width:480px; color:var(--muted); line-height:1.7; font-size:14px; margin:32px 0 0; }
    .statusbar { display:flex; gap:34px; color:#72798b; font:9px ui-monospace,monospace; letter-spacing:.13em; text-transform:uppercase; }
    .statusbar i { display:inline-block; width:5px; height:5px; margin-right:8px; border-radius:50%; background:#49e59a; box-shadow:0 0 9px #49e59a; }
    .access-side { display:grid; place-items:center; padding:28px; position:relative; }
    .access-side:before { content:""; position:absolute; left:0; top:9%; bottom:9%; width:1px; background:linear-gradient(transparent,rgba(255,255,255,.14),transparent); }
    .panel { width:min(440px,92%); padding:42px; position:relative; border:1px solid rgba(255,255,255,.11); background:linear-gradient(145deg,rgba(20,22,32,.86),rgba(9,10,16,.7)); backdrop-filter:blur(24px); box-shadow:0 35px 90px rgba(0,0,0,.45); }
    .panel:before,.panel:after { content:""; position:absolute; width:22px; height:22px; border-color:var(--cyan); opacity:.65; }
    .panel:before { left:-1px; top:-1px; border-left:1px solid; border-top:1px solid; }
    .panel:after { right:-1px; bottom:-1px; border-right:1px solid; border-bottom:1px solid; }
    .step { color:#6d7487; font:9px ui-monospace,monospace; letter-spacing:.22em; text-transform:uppercase; }
    .panel h3 { font-size:29px; font-weight:470; letter-spacing:-.03em; margin:14px 0 8px; }
    .sub { color:var(--muted); font-size:12px; line-height:1.6; margin:0 0 34px; }
    .field { position:relative; margin:20px 0; }
    .field label { display:block; color:#a7adbd; font:9px ui-monospace,monospace; letter-spacing:.2em; text-transform:uppercase; margin-bottom:9px; }
    .input-wrap { position:relative; }
    input { width:100%; color:#f6f7fb; background:rgba(3,4,8,.55); border:1px solid #292c38; outline:none; padding:15px 44px 15px 15px; font-size:13px; transition:.3s; caret-color:var(--cyan); }
    input:focus { border-color:rgba(68,215,255,.65); box-shadow:0 0 0 3px rgba(68,215,255,.06),0 0 25px rgba(68,215,255,.06); }
    input::placeholder { color:#4e5362; }
    .peek { position:absolute; right:9px; top:50%; transform:translateY(-50%); border:0; background:none; color:#7f8799; cursor:pointer; padding:6px; font-size:10px; }
    .connect { width:100%; position:relative; overflow:hidden; border:0; margin-top:12px; padding:16px; background:linear-gradient(100deg,#7654f5,#4dcffa); color:white; font-size:10px; font-weight:750; letter-spacing:.2em; text-transform:uppercase; cursor:pointer; transition:transform .25s,box-shadow .25s; }
    .connect:hover { transform:translateY(-2px); box-shadow:0 14px 38px rgba(86,113,255,.28); }
    .connect:disabled { cursor:wait; opacity:.72; }
    .connect:after { content:""; position:absolute; top:0; bottom:0; width:55px; background:rgba(255,255,255,.25); filter:blur(12px); transform:skewX(-20deg); left:-100px; transition:left .7s; }
    .connect:hover:after { left:120%; }
    .fineprint { display:flex; align-items:flex-start; gap:10px; color:#696f80; font-size:9px; line-height:1.5; margin-top:20px; }
    .shield { color:#49e59a; font-size:12px; }
    .remember { display:flex; align-items:center; gap:10px; margin:17px 0 4px; color:#a7adbd; font-size:10px; cursor:pointer; user-select:none; }
    .remember input { position:absolute; opacity:0; pointer-events:none; }
    .remember-box { width:16px; height:16px; border:1px solid #3b4050; display:grid; place-items:center; transition:.25s; }
    .remember-box:after { content:"✓"; color:#071016; font-size:11px; font-weight:900; opacity:0; transform:scale(.4); transition:.25s; }
    .remember input:checked + .remember-box { border-color:var(--cyan); background:var(--cyan); box-shadow:0 0 16px rgba(68,215,255,.22); }
    .remember input:checked + .remember-box:after { opacity:1; transform:none; }
    .remember input:focus-visible + .remember-box { outline:2px solid white; outline-offset:2px; }
    .message { height:18px; margin-top:16px; text-align:center; color:#ff718e; font-size:10px; letter-spacing:.04em; }
    .success { position:fixed; inset:0; z-index:25; display:grid; place-items:center; background:rgba(4,5,9,.91); backdrop-filter:blur(20px); opacity:0; visibility:hidden; transition:.6s; }
    .success.show { opacity:1; visibility:visible; }
    .success-inner { text-align:center; transform:scale(.8); transition:.8s cubic-bezier(.16,1,.3,1); }
    .success.show .success-inner { transform:none; }
    .rings { width:150px; height:150px; position:relative; margin:auto; }
    .rings span { position:absolute; inset:0; border:1px solid rgba(68,215,255,.4); border-radius:50%; animation:ring 2s ease-out infinite; }
    .rings span:nth-child(2){animation-delay:-.7s}.rings span:nth-child(3){animation-delay:-1.4s}
    .check { position:absolute; inset:33px; display:grid; place-items:center; border-radius:50%; background:linear-gradient(145deg,var(--violet),var(--cyan)); box-shadow:0 0 55px rgba(68,215,255,.3); font-size:30px; }
    @keyframes ring { 0%{transform:scale(.45);opacity:0} 35%{opacity:1} 100%{transform:scale(1.2);opacity:0} }
    .success h4 { font-size:32px; font-weight:450; margin:25px 0 10px; }
    .success p { color:var(--muted); font-size:12px; letter-spacing:.08em; }
    @media(max-width:840px){ main{grid-template-columns:1fr}.story{position:absolute;inset:0;padding:30px}.hero,.statusbar{display:none}.access-side:before{display:none}.panel{background:rgba(10,11,18,.9)} }
    @media(prefers-reduced-motion:reduce){ *,*:before,*:after{animation-duration:.01ms!important;animation-delay:0ms!important;transition-duration:.01ms!important} }
  </style>
</head>
<body>
  <canvas id="space"></canvas><div class="orb one"></div><div class="orb two"></div><div class="noise"></div>
  <div class="splash"><div class="splash-core"><div class="mark"><span></span><span></span></div><h1>CROWDNET</h1><p>Initializing secure workspace</p><div class="loadline"></div></div></div>
  <main>
    <section class="story">
      <div class="brand"><span class="brand-icon"></span>CROWDNET <span style="color:#555c70">/ MANAGER</span></div>
      <div class="hero"><div class="eyebrow">// Secure operations portal</div><h2>Build what<br><em>moves</em> us<br>forward.</h2><p class="hero-copy">One connected workspace for ambitious teams. Authenticate to enter the CrowdNet project command center.</p></div>
      <div class="statusbar"><span><i></i>Systems operational</span><span>Encrypted session</span><span id="clock">00:00:00 UTC</span></div>
    </section>
    <section class="access-side">
      <form class="panel" id="login">
        <div class="step">Access node / 01</div><h3>Welcome back.</h3><p class="sub">Identify yourself to establish a secure bridge.</p>
        <div class="field"><label for="username">Username</label><div class="input-wrap"><input id="username" autocomplete="username" placeholder="Enter your internal username" required maxlength="80"></div></div>
        <div class="field"><label for="key">Access key</label><div class="input-wrap"><input id="key" type="password" autocomplete="current-password" placeholder="••••••••••••••••••••" required><button class="peek" type="button" aria-label="Show access key">SHOW</button></div></div>
        <label class="remember"><input id="remember" type="checkbox"><span class="remember-box"></span><span>Remember my credentials securely</span></label>
        <button class="connect" type="submit">Establish connection</button>
        <div class="fineprint"><span class="shield">◇</span><span>Your access key is stored only when requested, using your operating system's encrypted credential protection.</span></div>
        <div class="message" role="alert" aria-live="polite"></div>
      </form>
    </section>
  </main>
  <section class="success" aria-hidden="true"><div class="success-inner"><div class="rings"><span></span><span></span><span></span><div class="check">✓</div></div><h4>Connection established.</h4><p id="welcome">WELCOME TO CROWDNET</p></div></section>
  <script>
    const canvas=document.querySelector('#space'),ctx=canvas.getContext('2d'); let points=[],mouse={x:-999,y:-999};
    function size(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);points=Array.from({length:Math.min(85,Math.floor(innerWidth/14))},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,r:Math.random()*1.2+.2}))} addEventListener('resize',size);size();
    addEventListener('pointermove',e=>{mouse.x=e.clientX;mouse.y=e.clientY});
    function draw(){ctx.clearRect(0,0,innerWidth,innerHeight);for(const p of points){p.x=(p.x+p.vx+innerWidth)%innerWidth;p.y=(p.y+p.vy+innerHeight)%innerHeight;const d=Math.hypot(p.x-mouse.x,p.y-mouse.y);if(d<130){p.x+=(p.x-mouse.x)/Math.max(d,1)*.25;p.y+=(p.y-mouse.y)/Math.max(d,1)*.25}ctx.beginPath();ctx.fillStyle='rgba(164,181,220,'+(p.r*.2)+')';ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}requestAnimationFrame(draw)}draw();
    const clock=document.querySelector('#clock'); setInterval(()=>clock.textContent=new Date().toISOString().slice(11,19)+' UTC',1000);
    const key=document.querySelector('#key'),peek=document.querySelector('.peek');peek.onclick=()=>{key.type=key.type==='password'?'text':'password';peek.textContent=key.type==='password'?'SHOW':'HIDE'};
    const form=document.querySelector('#login'),message=document.querySelector('.message'),button=document.querySelector('.connect'),username=document.querySelector('#username'),remember=document.querySelector('#remember');
    window.crowdnetCredentials.load().then(saved=>{if(saved){username.value=saved.username;key.value=saved.accessKey;remember.checked=true;message.style.color='#49e59a';message.textContent='Saved credentials restored securely.';setTimeout(()=>{message.textContent='';message.style.color=''},2200)}});
    form.addEventListener('submit',async e=>{e.preventDefault();message.style.color='';message.textContent='';button.disabled=true;button.textContent='VERIFYING ACCESS…';const accessKey=key.value.trim();try{const response=await fetch('https://api.github.com/repos/UNCLESAM45/CROWDNET_MANAGER_BRIDGE',{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+accessKey,'X-GitHub-Api-Version':'2022-11-28'}});if(!response.ok)throw new Error(response.status===401||response.status===404?'Access denied. Check your credentials and permissions.':'The secure bridge is unavailable. Please try again.');if(remember.checked)await window.crowdnetCredentials.save({username:username.value.trim(),accessKey});else await window.crowdnetCredentials.clear();document.querySelector('#welcome').textContent='WELCOME, '+username.value.trim().toUpperCase();const success=document.querySelector('.success');success.classList.add('show');success.setAttribute('aria-hidden','false');key.value=''}catch(error){message.textContent=error.message||'Unable to establish a secure connection.';form.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'none'}],{duration:280})}finally{button.disabled=false;button.textContent='ESTABLISH CONNECTION'}});
  </script>
</body></html>`;

function createWindow(preload) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#05060b',
    title: 'CrowdNet Manager',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(APP_HTML)}`);
  window.once('ready-to-show', () => window.show());
}

app.whenReady().then(async () => {
  ipcMain.handle('credentials:load', loadCredentials);
  ipcMain.handle('credentials:save', saveCredentials);
  ipcMain.handle('credentials:clear', clearCredentials);
  const preload = path.join(app.getPath('userData'), 'crowdnet-preload.js');
  await fs.writeFile(preload, PRELOAD_SOURCE, { mode: 0o600 });
  createWindow(preload);
  app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow(preload));
});
app.on('window-all-closed', () => process.platform === 'darwin' || app.quit());
