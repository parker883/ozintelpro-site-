/* Pulls the latest items from /api/news (Google Sheet + RSS feeds) into the page.
   Anything already on the page stays as a fallback if the feed is empty or unavailable. */
(function(){
  var industry=document.getElementById('news-feed'), team=document.getElementById('team-feed'), home=document.getElementById('home-news');
  if(!industry && !team && !home) return;
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmt(d){ if(!d) return ''; var x=new Date(d); return isNaN(x)?'':x.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); }
  function card(it, cls){
    return '<a class="'+(cls||'more-item')+'" href="'+esc(it.link)+'" target="_blank" rel="noopener">'+
      '<div class="insight-meta"><span class="outlet">'+esc(it.source)+'</span><span>'+esc(fmt(it.date))+'</span>'+(it.type?'<span class="pill">'+esc(it.type)+'</span>':'')+'</div>'+
      '<h3>'+esc(it.title)+'</h3>'+(it.summary?'<p>'+esc(it.summary)+'</p>':'')+
      '<span class="more-go">Read on '+esc(it.source)+' ↗</span></a>';
  }
  function have(el){ var s={}; [].forEach.call(el.querySelectorAll('a[href]'),function(a){s[a.getAttribute('href')]=1;}); return s; }
  function prepend(el, items, max){
    if(!el||!items.length) return;
    var seen=have(el), html='';
    items.forEach(function(it){ if(!seen[it.link]){ html+=card(it); seen[it.link]=1; } });
    el.insertAdjacentHTML('afterbegin', html);
    var kids=el.querySelectorAll('.more-item'); for(var i=max;i<kids.length;i++) kids[i].remove();
  }
  // Industry news: show the 3 newest, with a button to reveal the rest.
  var SHOW=3;
  function collapse(){
    if(!industry) return;
    var items=[].slice.call(industry.querySelectorAll('.more-item')), extra=items.length-SHOW;
    var btn=document.getElementById('news-more');
    items.forEach(function(el,i){ el.hidden = i>=SHOW && !(btn && btn.getAttribute('aria-expanded')==='true'); });
    if(extra<=0){ if(btn) btn.remove(); return; }
    if(!btn){
      btn=document.createElement('button'); btn.type='button'; btn.id='news-more'; btn.className='btn btn-outline news-more';
      btn.setAttribute('aria-expanded','false'); btn.setAttribute('aria-controls','news-feed');
      industry.insertAdjacentElement('afterend',btn);
      btn.addEventListener('click',function(){
        var open=btn.getAttribute('aria-expanded')!=='true';
        btn.setAttribute('aria-expanded',String(open)); collapse();
        if(!open) document.getElementById('industry-news').scrollIntoView({behavior:'smooth',block:'start'});
      });
    }
    btn.textContent = btn.getAttribute('aria-expanded')==='true' ? 'Show fewer' : 'Show more industry news ('+extra+')';
  }
  collapse();
  fetch('/api/news',{headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(!d||!d.items||!d.items.length) return;
    var ind=d.items.filter(function(i){return i.section!=='team';}), tm=d.items.filter(function(i){return i.section==='team';});
    prepend(industry, ind, 12);
    prepend(team, tm, 12);
    collapse();
    if(home){
      var slots=home.querySelectorAll('[data-slot]');
      d.items.slice(0, slots.length).forEach(function(it,i){ slots[i].outerHTML = card(it,'more-item home-news-card').replace('<a ','<a data-slot ') ; });
    }
  }).catch(function(){});
})();
