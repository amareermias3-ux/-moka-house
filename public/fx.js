/* MOKA HOUSE — Motion Pack (fx.js) */
(function(){
  /* inject styles */
  var st=document.createElement('style');
  st.textContent=`
  .fx-aurora{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.35;overflow:hidden}
  .fx-aurora i{position:absolute;width:60vw;height:60vw;border-radius:50%;filter:blur(90px);opacity:.16;animation:fxA 26s ease-in-out infinite alternate}
  .fx-aurora i:nth-child(1){background:#d98e32;top:-20%;left:-10%}
  .fx-aurora i:nth-child(2){background:#8fa87e;bottom:-25%;right:-15%;animation-delay:-8s}
  .fx-aurora i:nth-child(3){background:#e8b56b;top:30%;left:50%;animation-delay:-16s}
  @keyframes fxA{0%{transform:translate(0,0) scale(1)}50%{transform:translate(6vw,-4vw) scale(1.15)}100%{transform:translate(-6vw,5vw) scale(.95)}}
  .fx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;max-width:1220px;margin:0 auto;padding:2.5rem 26px;position:relative;z-index:2}
  .fx-stat{text-align:center;background:rgba(34,26,21,.7);border:1px solid rgba(241,230,212,.13);border-radius:12px;padding:1.4rem .8rem;backdrop-filter:blur(6px)}
  .fx-stat b{display:block;font-family:Fraunces,serif;font-size:2rem;font-weight:900;color:#e8b56b}
  .fx-stat span{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:#93866f}
  .fx-ripple{position:relative;overflow:hidden}
  .fx-ripple .rp{position:absolute;border-radius:50%;background:rgba(241,230,212,.4);transform:scale(0);animation:fxR .6s linear;pointer-events:none}
  @keyframes fxR{to{transform:scale(4);opacity:0}}
  @media(max-width:760px){.fx-stats{grid-template-columns:repeat(2,1fr)}}
  `;
  document.head.appendChild(st);

  /* aurora */
  var au=document.createElement('div');au.className='fx-aurora';au.innerHTML='<i></i><i></i><i></i>';
  document.body.insertBefore(au,document.body.firstChild);

  /* stats band (homepage only) */
  if(location.pathname==='/'||location.pathname==='/index.html'){
    var mq=document.querySelector('.marquee');
    if(mq){
      var band=document.createElement('div');band.className='fx-stats';
      var data=[[120000,'+','Cups poured','የተቀዱ ኩባያዎች'],[11,'','Partner farms','አጋር እርሻዎች'],[10,'','Years roasting','ዓመታት ማጠስ'],[3,'','Shops','ሱች']];
      band.innerHTML=data.map(function(d){return '<div class="fx-stat"><b data-n="'+d[0]+'" data-s="'+d[1]+'">0</b><span>'+d[2]+'</span></div>';}).join('');
      mq.parentNode.insertBefore(band,mq.nextSibling);
      var io=new IntersectionObserver(function(es){es.forEach(function(e){
        if(!e.isIntersecting)return;
        var el=e.target,n=+el.dataset.n,s=el.dataset.s||'',t0=null;
        function step(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/1400);
          el.textContent=Math.floor(n*p).toLocaleString()+ (p>=1?s:'');
          if(p<1)requestAnimationFrame(step);}
        requestAnimationFrame(step);io.unobserve(el);
      });},{threshold:.5});
      band.querySelectorAll('b').forEach(function(b){io.observe(b);});
    }
  }

  /* ripple on buttons */
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
})();