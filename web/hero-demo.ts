// @ts-nocheck
/* Theme, banner sheet, and nav menu. */

(function(){
  var doc=document.documentElement; doc.classList.add('js');
  var q=new URLSearchParams(location.search);
  if(q.get('shot')) doc.classList.add('shot');

  var banner=document.querySelector('.banner');
  var bannerBtn=document.getElementById('bannerMore');
  var nav=document.querySelector('.appbar, .nav');
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

  var seg=document.querySelector('.seg'), thumb=seg&&seg.querySelector('.thumb'), mq=matchMedia('(prefers-color-scheme: dark)');
  function place(){ if(!seg||!thumb) return; var on=seg.querySelector('[aria-pressed=true]'); if(!on) return; thumb.style.width=on.offsetWidth+'px'; thumb.style.transform='translateX('+(on.offsetLeft-3)+'px)'; }
  function apply(t,anim){
    if(!seg) return;
    var real=t==='system'?(mq.matches?'dark':'light'):t;
    if(anim){ doc.classList.add('theming'); setTimeout(function(){doc.classList.remove('theming')},260); }
    doc.dataset.theme=real;
    seg.querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-pressed',String(b.dataset.t===t)); });
    place();
    try{ localStorage.setItem('cubby-theme',t); }catch(e){}
  }
  var saved=q.get('theme')||(function(){try{return localStorage.getItem('cubby-theme')}catch(e){}})()||'light';
  apply(saved,false);
  if(seg) seg.addEventListener('click',function(e){ var b=e.target.closest('button'); if(b) apply(b.dataset.t,true); });
  mq.addEventListener('change',function(){ if(seg&&seg.querySelector('[data-t=system]')&&seg.querySelector('[data-t=system]').getAttribute('aria-pressed')==='true') apply('system',true); });
  addEventListener('resize',place);

  var cp=document.getElementById('copyEmber');
  if(cp) cp.addEventListener('click',function(){
    var a=document.getElementById('emberAddress')&&document.getElementById('emberAddress').textContent;
    if(!a) return;
    (navigator.clipboard?navigator.clipboard.writeText(a):Promise.reject()).catch(function(){}).finally(function(){ cp.classList.add('ok'); setTimeout(function(){cp.classList.remove('ok')},1800); });
  });
})();
