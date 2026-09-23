// Shared public carousels: native touch scrolling, mouse drag, keyboard and buttons.
// Content and forms remain server rendered; no dependencies or duplicate profiles.
(() => {
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const pad=n=>String(n).padStart(2,'0');
  let serial=0;
  document.querySelectorAll('[data-carousel]').forEach(track=>{
    const cards=[...track.children].filter(el=>['ARTICLE','BUTTON','FIGURE'].includes(el.tagName));
    if(!cards.length)return;
    const name=track.dataset.carousel,kind=track.dataset.carouselKind||'cards';
    const shell=document.createElement('div');shell.className=`carousel-shell carousel-${kind}`;
    shell.setAttribute('role','region');shell.setAttribute('aria-roledescription','carousel');shell.setAttribute('aria-label',name);
    track.before(shell);shell.append(track);track.classList.add('carousel-track');track.id||=`carousel-${++serial}`;track.tabIndex=0;
    track.setAttribute('aria-label',`${name} slides — use left and right arrow keys`);
    const slots=cards.map((card,index)=>{
      const slot=document.createElement('div');slot.className='carousel-slot';slot.setAttribute('role','group');slot.setAttribute('aria-roledescription','slide');slot.setAttribute('aria-label',`${index+1} of ${cards.length}`);
      card.before(slot);slot.append(card);card.classList.add('carousel-card');card.querySelectorAll('img').forEach(img=>img.draggable=false);return slot;
    });
    const controls=document.createElement('div');controls.className='carousel-controls';
    const hint=document.createElement('span');hint.className='carousel-hint';hint.textContent='DRAG / SWIPE TO EXPLORE';
    const count=document.createElement('span');count.className='carousel-count';count.setAttribute('role','status');
    const rail=document.createElement('span');rail.className='carousel-progress';rail.setAttribute('aria-hidden','true');const fill=document.createElement('span');rail.append(fill);
    const previous=document.createElement('button'),next=document.createElement('button');
    for(const [button,step,label] of [[previous,-1,'Previous'],[next,1,'Next']]){button.type='button';button.textContent=step<0?'←':'→';button.dataset.carouselStep=step;button.setAttribute('aria-label',`${label}: ${name}`);button.setAttribute('aria-controls',track.id);}
    controls.append(hint,rail,count,previous,next);shell.append(controls);
    let visible=[],active=0,frame=0,drag=null,suppress=false;
    const left=slot=>slot.offsetLeft-parseFloat(getComputedStyle(track).paddingLeft);
    function mark(index){
      active=Math.max(0,Math.min(index,visible.length-1));
      slots.forEach(slot=>{const i=visible.indexOf(slot);slot.classList.toggle('is-active',i===active);slot.style.setProperty('--slide-distance',Math.min(2,Math.abs(i-active)));});
      const position=visible.length?`${pad(active+1)} / ${pad(visible.length)}`:'00 / 00';if(count.textContent!==position)count.textContent=position;
      fill.style.transform=`scaleX(${visible.length?(active+1)/visible.length:0})`;
      previous.disabled=next.disabled=visible.length<2;
    }
    function go(index,instant=false){
      if(!visible.length)return;
      const target=(index+visible.length)%visible.length;mark(target);
      track.scrollTo({left:left(visible[target]),behavior:instant||motion.matches?'instant':'smooth'});
    }
    function refresh(){
      slots.forEach((slot,i)=>slot.hidden=cards[i].hidden);visible=slots.filter(slot=>!slot.hidden);
      shell.hidden=!visible.length;mark(0);go(0,true);
    }
    previous.addEventListener('click',()=>go(active-1));next.addEventListener('click',()=>go(active+1));
    track.addEventListener('keydown',event=>{
      if(event.target.closest('input,textarea,select'))return;
      const steps={ArrowLeft:-1,ArrowRight:1};
      if(event.key in steps){event.preventDefault();go(active+steps[event.key]);}
      if(event.key==='Home'||event.key==='End'){event.preventDefault();go(event.key==='Home'?0:visible.length-1);}
    });
    track.addEventListener('scroll',()=>{
      if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!visible.length)return;let closest=0;visible.forEach((slot,index)=>{if(Math.abs(left(slot)-track.scrollLeft)<Math.abs(left(visible[closest])-track.scrollLeft))closest=index;});mark(closest);});
    },{passive:true});
    track.addEventListener('focusin',event=>{
      const slot=event.target.closest('.carousel-slot');if(!slot)return;const a=slot.getBoundingClientRect(),b=track.getBoundingClientRect();
      if(a.left<b.left||a.right>b.right)go(visible.indexOf(slot),true);
    });
    track.addEventListener('pointerdown',event=>{
      suppress=false;if(event.pointerType!=='mouse'||event.button!==0)return;
      drag={x:event.clientX,left:track.scrollLeft,id:event.pointerId,moved:false};
    });
    track.addEventListener('pointermove',event=>{
      if(!drag)return;const dx=event.clientX-drag.x;
      if(Math.abs(dx)>6){drag.moved=true;suppress=true;track.classList.add('is-dragging');track.setPointerCapture(drag.id);}
      if(drag.moved){event.preventDefault();track.scrollLeft=drag.left-dx;}
    });
    const finish=()=>{if(!drag)return;const moved=drag.moved;drag=null;track.classList.remove('is-dragging');if(moved)requestAnimationFrame(()=>go(active));};
    track.addEventListener('pointerup',finish);track.addEventListener('pointercancel',finish);
    track.addEventListener('click',event=>{if(suppress){event.preventDefault();event.stopImmediatePropagation();suppress=false;}},true);
    const filtering=new MutationObserver(refresh);cards.forEach(card=>filtering.observe(card,{attributes:true,attributeFilter:['hidden']}));
    new ResizeObserver(()=>go(active,true)).observe(track);
    refresh();
  });

  // A fitted profile stage with paginated biography text, never clipped content.
  const dialog=document.querySelector('#detail-dialog');
  const profiles=[...document.querySelectorAll('template[id^="member-"]')].map(el=>el.id);
  let profileId='',bioText='',pages=[],bioIndex=0,fitFrame=0;
  function showBio(){
    const text=dialog.querySelector('[data-profile-bio]');if(!text)return;
    text.textContent=pages[bioIndex]||'';
    const paging=dialog.querySelector('.bio-pagination');paging.hidden=pages.length<2;
    paging.querySelector('[data-bio-count]').textContent=`Details ${bioIndex+1} / ${pages.length}`;
    paging.querySelector('[data-bio-step="-1"]').disabled=bioIndex===0;
    paging.querySelector('[data-bio-step="1"]').disabled=bioIndex===pages.length-1;
  }
  function fitBiography(){
    fitFrame=0;if(!dialog?.open||dialog.dataset.kind!=='profile')return;
    const text=dialog.querySelector('[data-profile-bio]'),box=dialog.querySelector('.member-bio'),paging=dialog.querySelector('.bio-pagination');
    if(!text||!box.clientHeight)return;
    // Reserve controls while measuring so a second page cannot shrink the first.
    paging.hidden=false;pages=[];let rest=bioText;
    while(rest.length){
      let low=1,high=rest.length,best=1;
      while(low<=high){const mid=Math.floor((low+high)/2);text.textContent=rest.slice(0,mid);if(box.scrollHeight<=box.clientHeight+1){best=mid;low=mid+1;}else high=mid-1;}
      let cut=best;if(best<rest.length){const space=rest.lastIndexOf(' ',best);if(space>best*.65)cut=space;}
      pages.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();
    }
    if(!pages.length)pages=[''];bioIndex=Math.min(bioIndex,pages.length-1);showBio();
  }
  function scheduleFit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fitBiography);}
  document.addEventListener('cipher:dialog-open',event=>{
    if(!event.detail.id.startsWith('member-'))return;
    profileId=event.detail.id;bioIndex=0;bioText=dialog.querySelector('[data-profile-bio]')?.textContent||'';
    dialog.querySelector('[data-profile-count]').textContent=`${pad(profiles.indexOf(profileId)+1)} / ${pad(profiles.length)}`;
    dialog.querySelectorAll('[data-profile-step]').forEach(button=>button.disabled=profiles.length<2);
    scheduleFit();document.fonts.ready.then(scheduleFit);
  });
  dialog?.addEventListener('click',event=>{
    const member=event.target.closest('[data-profile-step]'),bio=event.target.closest('[data-bio-step]');
    if(member&&profiles.length){
      const step=member.dataset.profileStep,index=(profiles.indexOf(profileId)+Number(step)+profiles.length)%profiles.length;
      document.dispatchEvent(new CustomEvent('cipher:open',{detail:{id:profiles[index]}}));
      dialog.querySelector(`[data-profile-step="${step}"]`)?.focus({preventScroll:true});
    }
    if(bio){bioIndex=Math.max(0,Math.min(pages.length-1,bioIndex+Number(bio.dataset.bioStep)));showBio();}
  });
  new ResizeObserver(scheduleFit).observe(dialog);
  addEventListener('resize',scheduleFit,{passive:true});
})();
