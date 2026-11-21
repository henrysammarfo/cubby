// @ts-nocheck
/* Ported from design/v2/hero-v2.html. Theme, hold-to-open demo, embers. */

(function(){
  var doc=document.documentElement; doc.classList.add('js');
  var q=new URLSearchParams(location.search);
  if(q.get('shot')) doc.classList.add('shot');

  /* Mobile banner sheet and nav menu */
  (function(){
    var banner=document.querySelector('.banner');
    var bannerBtn=document.getElementById('bannerMore');
    var bannerLinks=document.getElementById('bannerLinks');
    var nav=document.querySelector('.nav');
    var navBtn=document.getElementById('navMore');
    var navPanel=document.getElementById('navPanel');
    function closeBanner(){ if(banner) banner.classList.remove('is-open'); if(bannerBtn) bannerBtn.setAttribute('aria-expanded','false'); }
    function closeNav(){ if(nav) nav.classList.remove('is-open'); if(navBtn) navBtn.setAttribute('aria-expanded','false'); }
    if(bannerBtn&&banner){
      bannerBtn.addEventListener('click',function(){
        var open=!banner.classList.contains('is-open');
        closeNav();
        banner.classList.toggle('is-open',open);
        bannerBtn.setAttribute('aria-expanded',String(open));
      });
    }
    if(navBtn&&nav){
      navBtn.addEventListener('click',function(){
        var open=!nav.classList.contains('is-open');
        closeBanner();
        nav.classList.toggle('is-open',open);
        navBtn.setAttribute('aria-expanded',String(open));
      });
    }
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeBanner(); closeNav(); } });
    document.addEventListener('click',function(e){
      var t=e.target;
      if(!(t instanceof Node)) return;
      if(banner&&!banner.contains(t)) closeBanner();
      if(nav&&!nav.contains(t)) closeNav();
    });
    if(navPanel) navPanel.querySelectorAll('a').forEach(function(a){ a.addEventListener('click',closeNav); });
  })();

  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- springs: SwiftUI / Motion style (duration, bounce) into CSS linear() ---------- */
  function spring(dur,bounce){
    var w0=2*Math.PI/dur, z=bounce>=0?1-bounce:1/(1+bounce), x=0,v=0,dt=1/600,t=0,pts=[],settle=0;
    while(t<3){ for(var k=0;k<10;k++){ var a=-w0*w0*(x-1)-2*z*w0*v; v+=a*dt; x+=v*dt; t+=dt; }
      pts.push(+x.toFixed(4)); if(Math.abs(x-1)<0.001&&Math.abs(v)<0.01){ settle=t; break; } }
    var step=Math.max(1,Math.floor(pts.length/40)), out=[]; for(var i=0;i<pts.length;i+=step) out.push(pts[i]); out.push(1);
    return {e:'linear('+out.join(',')+')',ms:Math.round((settle||t)*1000)};
  }
  [['snappy',.5,.15],['bouncy',.5,.3],['smooth',.5,0]].forEach(function(s){ var r=spring(s[1],s[2]); doc.style.setProperty('--spring-'+s[0],r.e); doc.style.setProperty('--spring-'+s[0]+'-d',r.ms+'ms'); });

  /* ---------- theme: Light, Dark (true black), Auto ---------- */
  var seg=document.querySelector('.seg'), thumb=seg.querySelector('.thumb'), mq=matchMedia('(prefers-color-scheme: dark)');
  function place(){ var on=seg.querySelector('[aria-pressed=true]'); thumb.style.width=on.offsetWidth+'px'; thumb.style.transform='translateX('+(on.offsetLeft-3)+'px)'; }
  function apply(t,anim){ var real=t==='system'?(mq.matches?'dark':'light'):t;
    if(anim&&!reduce){ doc.classList.add('theming'); setTimeout(function(){doc.classList.remove('theming')},260); }
    doc.dataset.theme=real; seg.querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-pressed',String(b.dataset.t===t)); }); place();
    try{ localStorage.setItem('cubby-theme',t); }catch(e){} }
  var saved=q.get('theme')||(function(){try{return localStorage.getItem('cubby-theme')}catch(e){}})()||'light';
  apply(saved,false);
  seg.addEventListener('click',function(e){ var b=e.target.closest('button'); if(b) apply(b.dataset.t,true); });
  mq.addEventListener('change',function(){ if(seg.querySelector('[data-t=system]').getAttribute('aria-pressed')==='true') apply('system',true); });
  addEventListener('resize',place);

  /* ---------- copy EMBER address: label morph like Pocket's hold label ---------- */
  var cp=document.getElementById('copyEmber');
  cp.addEventListener('click',function(){ var a=document.getElementById('emberAddress').textContent;
    (navigator.clipboard?navigator.clipboard.writeText(a):Promise.reject()).catch(function(){}).finally(function(){ cp.classList.add('ok'); say('EMBER address copied'); setTimeout(function(){cp.classList.remove('ok')},1800); }); });

  /* ---------- ember particles: slow rise, no looping oscillation (HIG: avoid sustained ~0.2 Hz motion) ---------- */
  var cv=document.getElementById('embers'), cx=cv.getContext('2d'), P=[], run=!reduce&&!q.get('state');
  function size(){ var r=cv.getBoundingClientRect(), d=Math.min(2,devicePixelRatio||1); cv.width=r.width*d; cv.height=r.height*d; cx.setTransform(d,0,0,d,0,0); }
  size(); addEventListener('resize',size);
  for(var i=0;i<46;i++) P.push({x:Math.random(),y:Math.random(),s:.6+Math.random()*1.8,v:.00012+Math.random()*.00028,h:(Math.random()-.5)*.00006,a:.25+Math.random()*.6});
  var last=performance.now();
  function frame(t){ var dt=Math.min(50,t-last); last=t; var w=cv.clientWidth,h=cv.clientHeight; cx.clearRect(0,0,w,h);
    P.forEach(function(p){ p.y-=p.v*dt; p.x+=p.h*dt; p.h+=(Math.random()-.5)*.000004*dt; if(p.y<-.02){p.y=1.02;p.x=.35+Math.random()*.65;}
      var g=cx.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,p.s*3); g.addColorStop(0,'rgba(255,170,80,'+p.a+')'); g.addColorStop(1,'rgba(255,90,31,0)');
      cx.fillStyle=g; cx.beginPath(); cx.arc(p.x*w,p.y*h,p.s*3,0,7); cx.fill(); });
    if(run&&!document.hidden) requestAnimationFrame(frame); }
  frame(last); document.addEventListener('visibilitychange',function(){ if(!document.hidden&&run){ last=performance.now(); requestAnimationFrame(frame);} });

  /* ---------- pointer parallax on the art: follows the pointer, rests when it stops ---------- */
  var art=document.getElementById('art'), tx=0,ty=0,cxp=0,cyp=0,raf=0;
  if(!reduce&&matchMedia('(pointer:fine)').matches){
    document.getElementById('stage').addEventListener('pointermove',function(e){ var r=this.getBoundingClientRect(); tx=((e.clientX-r.left)/r.width-.5)*-14; ty=((e.clientY-r.top)/r.height-.5)*-10; if(!raf) raf=requestAnimationFrame(lerp); });
  }
  function lerp(){ cxp+=(tx-cxp)*.12; cyp+=(ty-cyp)*.12; art.style.translate=cxp.toFixed(2)+'px '+cyp.toFixed(2)+'px'; raf=(Math.abs(tx-cxp)+Math.abs(ty-cyp)>.05)?requestAnimationFrame(lerp):0; }

  /* ---------- balance: hidden dots + eye toggle, or 0.0002 BCH when shown ---------- */
  var VAL='0.0002';
  var balAmount=document.getElementById('balAmount');
  var balWrap=document.getElementById('balWrap');
  var balToggle=document.getElementById('balToggle');
  var balShown=false;
  function setBalanceShown(show){
    balShown=!!show;
    if(balWrap) balWrap.classList.toggle('is-hidden', !balShown);
    if(balAmount) balAmount.textContent=balShown?VAL:'••••••';
    if(balToggle){
      balToggle.setAttribute('aria-pressed', String(balShown));
      balToggle.setAttribute('aria-label', balShown?'Hide the demo balance':'Show the demo balance');
    }
    var live=document.getElementById('balText');
    if(live) live.textContent=balShown?('Balance '+VAL+' BCH'):'Balance hidden';
  }
  setBalanceShown(false);
  if(balToggle) balToggle.addEventListener('click', function(){ setBalanceShown(!balShown); });
  function roll(show){ setBalanceShown(show); }

  /* ---------- the vault: hold, scan, chain check, success, or fail if released early ---------- */
  var vault=document.getElementById('vault'), btn=document.getElementById('hold'), fill=document.getElementById('fill'), hint=document.getElementById('hint'),
      steps=[].slice.call(document.querySelectorAll('#steps li')), live=document.getElementById('live'), br=document.querySelectorAll('#br path'), resetB=document.getElementById('reset');
  var S={p:0,mode:'idle',last:0,from:0,start:0,raf:0,ht:0};
  function say(t){ live.textContent=''; setTimeout(function(){ live.textContent=t; },30); }
  function bez(x1,y1,x2,y2){ var cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by; return function(x){ var t=x; for(var i=0;i<8;i++){ var e=((ax*t+bx)*t+cx)*t-x; if(Math.abs(e)<1e-5)break; var d=(3*ax*t+2*bx)*t+cx; if(Math.abs(d)<1e-6)break; t-=e/d; } return ((ay*t+by)*t+cy)*t; }; }
  var easeOut=bez(.23,1,.32,1);
  var LEN=[]; br.forEach(function(p,i){ var L=p.getTotalLength?p.getTotalLength():20; LEN[i]=L; p.style.strokeDasharray=L; });
  function draw(){ fill.style.clipPath='inset(0 '+(100-S.p*100).toFixed(2)+'% 0 0 round 999px)';
    /* the face frame closes in as you hold: the scan corners are the progress too */
    br.forEach(function(p,i){ if(i<4) p.style.strokeDashoffset=(LEN[i]*(1-Math.max(.25,S.p))).toFixed(2); }); }
  draw();
  function loop(t){ if(S.mode==='hold'){ S.p=Math.min(1,S.p+(t-S.last)/1200); S.last=t; draw(); if(S.p>=1) return done(); S.raf=requestAnimationFrame(loop); }
    else if(S.mode==='release'){ var k=Math.min(1,(t-S.start)/200); S.p=S.from*(1-easeOut(k)); draw(); if(k<1) S.raf=requestAnimationFrame(loop); else { S.mode='idle'; S.p=0; draw(); } } }
  function start(e){ if(S.mode==='done'||S.mode==='busy') return; if(e&&e.button>0) return;
    if(e&&e.pointerId!=null){ e.preventDefault(); try{btn.setPointerCapture(e.pointerId)}catch(_){} }
    cancelAnimationFrame(S.raf); S.mode='hold'; S.last=performance.now(); btn.classList.add('is-down'); hint.classList.remove('show'); vault.dataset.state='holding'; S.raf=requestAnimationFrame(loop); }
  function stop(){ if(S.mode!=='hold') return; btn.classList.remove('is-down'); S.mode='release'; S.from=S.p; S.start=performance.now(); cancelAnimationFrame(S.raf); S.raf=requestAnimationFrame(loop);
    vault.dataset.state='idle'; hint.classList.add('show'); clearTimeout(S.ht); S.ht=setTimeout(function(){hint.classList.remove('show')},1600);
    if(!reduce){ vault.classList.remove('nope'); void vault.offsetWidth; vault.classList.add('nope'); }
    say('Not opened. Keep holding to open.'); }
  function stepTo(k,state){ steps.forEach(function(li){ if(li.dataset.k===k){ li.classList.add('on'); li.classList.remove('busy','done'); if(state) li.classList.add(state); } }); }
  function done(){ S.mode='busy'; btn.classList.remove('is-down'); btn.classList.add('complete'); if(!reduce) btn.classList.add('pop');
    try{navigator.vibrate&&navigator.vibrate(12)}catch(_){}
    vault.dataset.state='checking'; document.getElementById('vsub').textContent='Checking it is you'; say('Face ID signed. The Bitcoin Cash chain is checking.');
    var R=reduce?0.25:1;
    stepTo('sign','done');
    setTimeout(function(){ stepTo('chain','busy'); },160*R);
    setTimeout(function(){ stepTo('chain','done'); stepTo('open','done'); success(); },1300*R); }
  function success(){ S.mode='done'; vault.dataset.state='success'; document.getElementById('altLab').firstChild.textContent='Opened';
    document.getElementById('vsub').textContent='Opened. The chain said yes.'; document.getElementById('balText').textContent='Balance 0.0002 BCH';
    roll(true); resetB.hidden=false; say('Opened. Balance 0.0002 Bitcoin Cash.'); }
  function reset(){ S.mode='idle'; S.p=0; draw(); vault.dataset.state='idle'; btn.classList.remove('complete','pop'); document.getElementById('altLab').firstChild.textContent='Checking';
    steps.forEach(function(li){ li.className=''; }); roll(false); document.getElementById('vsub').textContent='Locked. Only you can open it.'; document.getElementById('balText').textContent='Balance hidden'; resetB.hidden=true; btn.focus(); }
  btn.addEventListener('pointerdown',start); btn.addEventListener('pointerup',stop); btn.addEventListener('pointercancel',stop); btn.addEventListener('lostpointercapture',stop);
  btn.addEventListener('contextmenu',function(e){e.preventDefault()});
  btn.addEventListener('keydown',function(e){ if((e.key===' '||e.key==='Enter')&&!e.repeat){ e.preventDefault(); start(); } });
  btn.addEventListener('keyup',function(e){ if(e.key===' '||e.key==='Enter') stop(); });
  resetB.addEventListener('click',reset);
  var coins=vault.querySelector('.coins'); for(var c=0;c<7;c++){ var ci=document.createElement('i'); var a=-Math.PI*(.15+.7*c/6); ci.style.setProperty('--x',Math.cos(a)*70+'px'); ci.style.setProperty('--y',Math.sin(a)*60+'px'); ci.style.animationDelay=(c*25)+'ms'; coins.appendChild(ci); }

  /* ---------- states for screenshots: ?state=idle|holding|failed|checking|success ---------- */
  var st=q.get('state');
  if(st){ doc.classList.add('shot');
    if(st==='holding'){ S.p=+(q.get('p')||.6); draw(); vault.dataset.state='holding'; btn.classList.add('is-down'); }
    if(st==='failed'){ hint.classList.add('show'); }
    if(st==='checking'){ S.p=1; draw(); btn.classList.add('complete'); vault.dataset.state='checking'; stepTo('sign','done'); stepTo('chain','busy'); document.getElementById('vsub').textContent='Checking it is you'; }
    if(st==='success'){ S.p=1; draw(); btn.classList.add('complete'); stepTo('sign','done'); stepTo('chain','done'); stepTo('open','done'); success(); }
  }
  requestAnimationFrame(function(){ document.getElementById('stage').classList.add('go'); });
})();
