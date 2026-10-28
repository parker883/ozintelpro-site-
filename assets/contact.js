/* Contact Us: opens a small chooser so the email works even without a desktop mail app. */
(function(){
  var EMAIL='info@ozintelpro.com', SUBJ='OZ Intel Pro inquiry';
  var q='?subject='+encodeURIComponent(SUBJ);
  var links=[
    ['Open in Gmail','https://mail.google.com/mail/?view=cm&fs=1&to='+EMAIL+'&su='+encodeURIComponent(SUBJ),'gmail'],
    ['Open in Outlook','https://outlook.office.com/mail/deeplink/compose?to='+EMAIL+'&subject='+encodeURIComponent(SUBJ),true],
    ['Use my email app','mailto:'+EMAIL+q,false]
  ];
  var dlg=document.createElement('dialog'); dlg.className='contact-dlg'; dlg.setAttribute('aria-labelledby','contact-h');
  dlg.innerHTML='<button class="contact-x" type="button" aria-label="Close">&times;</button>'+
    '<span class="eyebrow">Contact us</span><h3 id="contact-h">Email the OZ Intel Pro team</h3>'+
    '<div class="contact-addr"><span>'+EMAIL+'</span><button type="button" class="contact-copy">Copy</button></div>'+
    '<div class="contact-btns">'+links.map(function(l){return '<a class="btn '+(l[2]==='gmail'?'btn-primary':'btn-outline')+'" href="'+l[1]+'"'+(l[2]?' target="_blank" rel="noopener"':'')+'>'+l[0]+'</a>';}).join('')+'</div>'+
    '<small>We'll get back to you as soon as we can.</small>';
  document.body.appendChild(dlg);
  var copyBtn=dlg.querySelector('.contact-copy');
  copyBtn.addEventListener('click',function(){
    function done(){copyBtn.textContent='Copied';setTimeout(function(){copyBtn.textContent='Copy';},1800);}
    if(navigator.clipboard){navigator.clipboard.writeText(EMAIL).then(done,function(){prompt('Copy this email:',EMAIL);});}else{prompt('Copy this email:',EMAIL);}
  });
  dlg.querySelector('.contact-x').addEventListener('click',function(){dlg.close();});
  dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});
  dlg.querySelectorAll('.contact-btns a').forEach(function(a){a.addEventListener('click',function(){setTimeout(function(){dlg.close();},300);});});
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href^="mailto:'+EMAIL+'"]');
    if(!a||dlg.contains(a)||typeof dlg.showModal!=='function')return;
    e.preventDefault(); dlg.showModal();
  });
})();
