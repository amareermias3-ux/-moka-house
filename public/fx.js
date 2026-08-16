/* ERSCOMAS | fx.js v3 — brand + motion + NEW DESIGN (theme toggle + polish) */
(function(){
  /* ===== 🏷️ Brand rename ===== */
  var NAME='ERSCOMAS';
  function walker(root){
    var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
      var p=n.parentNode; if(!p) return NodeFilter.FILTER_REJECT;
      var t=p.tagName; if(t==='SCRIPT'||t==='STYLE'||t==='TEXTAREA') return NodeFilter.FILTER_REJECT;
      return /moka\s*house/i.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }});
    var n; while(n=w.nextNode()){ n.nodeValue=n.nodeValue.replace(/moka\s*house/gi,NAME); }
  }
  function setTitle(){
    document.title=document.title.replace(/moka\s*house/gi,NAME);
    var og=document.querySelector('meta[property="og:title"]'); if(og)og.setAttribute('content',og.getAttribute('content').replace(/moka\s*house/gi,NAME));
    var os=document.querySelector('meta[property="og:site_name"]'); if(os)os.setAttribute('content',NAME);
  }
  function doRename(){ try{ if(document.body)walker(document.body); setTitle(); }catch(e){} }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',doRename);}else{doRename();}
  setTimeout(doRename,400); setTimeout(doRename,1200);

  /* ===== 🎨 NEW DESIGN styles ===== */
  var st=document.createElement('style');
  st.textContent=
  /* aurora */
  ".fx-aurora{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.35;overflow:hidden}"+
  ".fx-aurora i{position:absolute;width:60vw;height:60vw;border-radius:50%;filter:blur(90px);opacity:.16;animation:fxA 26s ease-in-out infinite alternate}"+
  ".fx-aurora i:nth-child(1){background:#d98e32;top:-20%;left:-10%}"+
  ".fx-aurora i:nth-child(2){background:#8fa87e;bottom:-25%;right:-15%;animation-delay:-8s}"+
  ".fx-aurora i:nth-child(3){background:#e8b56b;top:30%;left:50%;animation-delay:-16s}"+
  "@keyframes fxA{0%{transform:translate(0,0) scale(1)}50%{transform:translate(6vw,-4vw) scale(1.15)}100%{transform:translate(-6vw,5vw) scale(.95)}}"+
  /* shimmer titles */
  ".mast-title,.sec-title{background:linear-gradient(90deg,#f1e6d4 20%,#e8b56b 40%,#d98e32 50%,#e8b56b 60%,#f1e6d4 80%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 5s linear infinite}"+
  ".mast-title .row2{-webkit-text-fill-color:transparent}"+
  "@keyframes shimmer{to{background-position:200% center}}"+
  /* card glow */
  ".dish:hover,.shop:hover,.ticket:hover{box-shadow:0 0 0 1px rgba(217,142,50,.4),0 18px 50px -12px rgba(217,142,50,.25)!important}"+
  /* ripple */
  ".fx-ripple{position:relative;overflow:hidden}.fx-ripple .rp{position:absolute;border-radius:50%;background:rgba(241,230,212,.4);transform:scale(0);animation:fxR .6s linear;pointer-events:none}@keyframes fxR{to{transform:scale(4);opacity:0}}"+
  /* stats */
  ".fx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;max-width:1220px;margin:0 auto;padding:2.5rem 26px;position:relative;z-index:2}"+
  ".fx-stat{text-align:center;background:rgba(34,26,21,.7);border:1px solid rgba(241,230,212,.13);border-radius:12px;padding:1.4rem .8rem;backdrop-filter:blur(6px)}"+
  ".fx-stat b{display:block;font-family:Fraunces,serif;font-size:2rem;font-weight:900;color:#e8b56b}"+
  ".fx-stat span{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:#93866f}"+
  "@media(max-width:760px){.fx-stats{grid-template-columns:repeat(2,1fr)}}"+
  /* theme toggle button */
  "#themeBtn{position:fixed;top:14px;left:14px;z-index:200;width:44px;height:44px;border-radius:50%;background:#221a15;border:1.5px solid rgba(217,142,50,.6);color:#e8b56b;font-size:18px;cursor:pointer;box-shadow:0 10px 30px -8px rgba(0,0,0,.6)}"+
  /* ===== LIGHT THEME ===== */
  "body.fx-light{background:#f7f1e6!important;color:#241a10}"+
  "body.fx-light .fx-aurora{opacity:.5}"+
  "body.fx-light header,body.fx-light .dish,body.fx-light .shop,body.fx-light .ticket,body.fx-light .panel,body.fx-light .brew-panel,body.fx-light .stamp-card{background:#fffdf8!important;border-color:rgba(36,26,16,.15)!important}"+
  "body.fx-light .dish,body.fx-light .shop,body.fx-light .ticket{box-shadow:0 10px 30px -12px rgba(36,26,16,.15)}"+
  "body.fx-light,body.fx-light .mast-copy,body.fx-light .dish-desc,body.fx-light .sec-head p,body.fx-light .brew-steps p{color:#4a3a28}"+
  "body.fx-light .rowline h4,body.fx-light .shop-body h3,body.fx-light .ticket-body h4{color:#241a10}"+
  "body.fx-light .price,body.fx-light .roast-chip b{color:#b3691e}"+
  "body.fx-light .roast-chip,body.fx-light .tab,body.fx-light .mchip,body.fx-light .cart-btn,body.fx-light .lang-sel{background:#fffdf8!important;color:#4a3a28;border-color:rgba(36,26,16,.2)!important}"+
  "body.fx-light .tab.active,body.fx-light .mchip.active{background:#d98e32!important;color:#191008!important}"+
  "body.fx-light .mast-title,body.fx-light .sec-title{background:linear-gradient(90deg,#241a10 20%,#b3691e 40%,#d98e32 50%,#b3691e 60%,#241a10 80%);background-size:200% auto;-webkit-background-clip:text;background-clip:text}"+
  "body.fx-light .hours td,body.fx-light .addr,body.fx-light .ticket-body p{color:#6b5d49}"+
  "body.fx-light footer{background:#efe6d6!important}"+
  "body.fx-light .foot-grid p,body.fx-light .foot-grid a{color:#6b5d49}"+
  "body.fx-light #themeBtn{background:#fffdf8;color:#b3691e;border-color:rgba(36,26,16,.2)}";

  document.head.appendChild(st);

  /* aurora */
  var au=document.createElement('div');au.className='fx-aurora';au.innerHTML='<i></i><i></i><i></i>';
  document.body.insertBefore(au,document.body.firstChild);

  /* ===== /☀️ Theme toggle ===== */
  var tb=document.createElement('button');tb.id='themeBtn';tb.textContent='☀️';tb.title='Toggle theme';
  document.body.appendChild(tb);
  var savedTheme=localStorage.getItem('moka-theme')||'dark';
  if(savedTheme==='light'){document.body.classList.add('fx-light');tb.textContent='🌙';}
  tb.addEventListener('click',function(){
    var light=document.body.classList.toggle('fx-light');
    tb.textContent=light?'🌙':'☀️';
    localStorage.setItem('moka-theme',light?'light':'dark');
  });

  /* ===== magnetic buttons ===== */
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.addEventListener('mousemove',function(e){
      var b=e.target.closest('.btn,.add-btn,.club-btn');
      document.querySelectorAll('.btn,.add-btn,.club-btn').forEach(function(x){if(x!==b)x.style.transform='';});
      if(!b)return;
      var r=b.getBoundingClientRect();
      var dx=(e.clientX-(r.left+r.width/2))/r.width, dy=(e.clientY-(r.top+r.height/2))/r.height;
      b.style.transform='translate('+(dx*6)+'px,'+(dy*6)+'px)';
    });
  }

  /* ===== ripple ===== */
  document.addEventListener('click',function(e){
    var b=e.target.closest('.btn,.add-btn,.pm-btn,.club-btn,.tab');
    if(!b)return;
    b.classList.add('fx-ripple');
    var r=b.getBoundingClientRect();
    var d=Math.max(r.width,r.height);
    var s=document.createElement('span');s.className='rp';
    s.style.width=s.style.height=d+'px';
    s.style.left=(e.clientX-r.left-d/2)+'px';
    s.style.top=(e.clientY-r.top-d/2)+'px';
    b.appendChild(s);
    setTimeout(function(){s.remove();},600);
  });

  /* ===== stats band (homepage) ===== */
  if(location.pathname==='/'||location.pathname==='/index.html'){
    var mq=document.querySelector('.marquee');
    if(mq&&!document.querySelector('.fx-stats')){
      var band=document.createElement('div');band.className='fx-stats';
      var data=[[120000,'+','Cups poured','የተቀዱ ኩባያዎች'],[11,'','Partner farms','አጋር እርሻዎች'],[10,'','Years roasting','ዓመታት ማጠስ'],[3,'','Shops','ሱቆች']];
      band.innerHTML=data.map(function(d){return '<div class="fx-stat"><b data-n="'+d[0]+'" data-s="'+d[1]+'">0</b><span>'+d[2]+'</span></div>';}).join('');
      mq.parentNode.insertBefore(band,mq.nextSibling);
      var io=new IntersectionObserver(function(es){es.forEach(function(e){
        if(!e.isIntersecting)return;
        var el=e.target,n=+el.dataset.n,s=el.dataset.s||'',t0=null;
        function step(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/1400);
          el.textContent=Math.floor(n*p).toLocaleString()+(p>=1?s:'');
          if(p<1)requestAnimationFrame(step);}
        requestAnimationFrame(step);io.unobserve(el);
      });},{threshold:.5});
      band.querySelectorAll('b').forEach(function(b){io.observe(b);});
    }
  }
})();