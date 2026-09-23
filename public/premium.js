(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const counters=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;counters.unobserve(entry.target);
    const target=entry.target,total=Number(target.dataset.counter),start=performance.now();
    if(!Number.isFinite(total)||reduced.matches)return;
    const accessible=document.createElement('span');accessible.className='sr-only';accessible.textContent=String(total);
    const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');target.replaceChildren(accessible,visual);
    function count(now){const progress=Math.min(1,(now-start)/850);visual.textContent=Math.round(total*(1-Math.pow(1-progress,3))).toLocaleString('en-IN');if(progress<1&&!reduced.matches)requestAnimationFrame(count);else target.textContent=total.toLocaleString('en-IN');}requestAnimationFrame(count);
  }),{threshold:.25});document.querySelectorAll('[data-counter]').forEach(counter=>counters.observe(counter));
  const hero=document.querySelector('.reference-hero');let frame=0;
  hero?.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||reduced.matches)return;const rect=hero.getBoundingClientRect();
    cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{hero.style.setProperty('--hero-x',`${(event.clientX-rect.left)/rect.width*100}%`);hero.style.setProperty('--hero-y',`${(event.clientY-rect.top)/rect.height*100}%`);});
  },{passive:true});hero?.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);hero.style.removeProperty('--hero-x');hero.style.removeProperty('--hero-y');});
  const type=document.querySelector('[data-type-line]');
  if(type&&!reduced.matches){const text=type.textContent,readable=document.createElement('span'),visual=document.createElement('span');readable.className='sr-only';readable.textContent=text;visual.setAttribute('aria-hidden','true');type.replaceChildren(readable,visual);let pos=0;const timer=setInterval(()=>{visual.textContent=text.slice(0,++pos);if(pos>=text.length||reduced.matches){clearInterval(timer);type.textContent=text;}},28);}
  const nav=document.querySelector('#primary-nav');
  if(hero&&nav){
    const sectionObserver=new IntersectionObserver(entries=>{const current=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!current)return;nav.querySelectorAll('a').forEach(link=>link.classList.toggle('is-active',link.getAttribute('href')===`#${current.target.id}`));},{rootMargin:'-15% 0px -60% 0px',threshold:0});
    for(const link of nav.querySelectorAll('a[href^="#"]')){const target=document.getElementById(link.hash.slice(1));if(target)sectionObserver.observe(target);}
  }
  // Domain dialogs also work on About; the homepage retains its original handler.
  if(!document.body.classList.contains('reference-site')){
    function showDomain(card){const dialog=document.querySelector('#detail-dialog'),content=document.querySelector('#dialog-content');if(!dialog||!content)return;const title=document.createElement('h2');title.id='dialog-title';title.textContent=card.dataset.title;const body=document.createElement('p');body.textContent=card.dataset.description;content.replaceChildren(title,body);dialog.dataset.kind='information';dialog.showModal();}
    document.querySelectorAll('[data-domain-card]').forEach(card=>{card.addEventListener('click',()=>showDomain(card));card.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();showDomain(card);}});});
  }
  const authNotice=sessionStorage.getItem('cipher-auth-notice');
  if(authNotice&&location.pathname==='/admin/login'){const notice=document.createElement('p');notice.className='notice success';notice.setAttribute('role','status');notice.textContent=authNotice;document.querySelector('.form-panel')?.prepend(notice);sessionStorage.removeItem('cipher-auth-notice');}
})();
