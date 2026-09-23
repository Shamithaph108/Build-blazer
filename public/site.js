document.documentElement.classList.add('js');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const menuButton=document.querySelector('.menu-toggle'), nav=document.querySelector('#primary-nav');
function closeMenu(){menuButton?.setAttribute('aria-expanded','false');nav?.classList.remove('is-open');}
menuButton?.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && menuButton?.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus();}});
document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeMenu();});
matchMedia('(min-width: 801px)').addEventListener('change',closeMenu);

const dialog=document.querySelector('#detail-dialog'), dialogContent=document.querySelector('#dialog-content');
let dialogReturnFocus=null;
function openTemplate(id){const template=document.getElementById(id);if(!template)return;if(!dialog.open)dialogReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;dialogContent.replaceChildren(template.content.cloneNode(true));dialog.dataset.kind=id.startsWith('member-')?'profile':id.startsWith('event-')?'event':id==='join-form-template'?'join':'information';if(!dialog.open)dialog.showModal();dialog.scrollTop=0;dialogContent.scrollTop=0;prepareGalleryHover(dialogContent);document.dispatchEvent(new CustomEvent('cipher:dialog-open',{detail:{id}}));}

// A mouse resting over the photo previews the next card. Buttons and touch swipes
// remain available, including when reduced motion is enabled.
const galleryPointer=matchMedia('(hover: hover) and (pointer: fine)');
function prepareGalleryHover(root){
  root.querySelectorAll('.gallery').forEach(gallery=>{
    if(gallery.dataset.hoverReady)return;gallery.dataset.hoverReady='true';
    // Measure the stationary gallery, so a tilted card cannot feed back into its coordinates.
    gallery.addEventListener('pointermove',event=>{
      if(event.pointerType!=='mouse'||!galleryPointer.matches||reducedMotion.matches)return;
      const rect=gallery.getBoundingClientRect();
      const x=Math.max(-.5,Math.min(.5,(event.clientX-rect.left)/rect.width-.5));
      const y=Math.max(-.5,Math.min(.5,(event.clientY-rect.top)/rect.height-.5));
      gallery.style.setProperty('--card-turn',`${x*20}deg`);gallery.style.setProperty('--card-tip',`${-y*16}deg`);
      gallery.style.setProperty('--card-light',`${(x+.5)*100}%`);gallery.classList.add('card-hovering');
    },{passive:true});
    gallery.addEventListener('pointerleave',()=>{gallery.classList.remove('card-hovering');gallery.style.setProperty('--card-turn','0deg');gallery.style.setProperty('--card-tip','0deg');});
    if(gallery.querySelectorAll('.gallery-slide').length<2)return;
    let timer=0,overPhoto=false;
    const stop=()=>{clearTimeout(timer);timer=0;};
    const schedule=(delay=1700)=>{
      stop();if(!overPhoto||reducedMotion.matches||document.body.classList.contains('motion-paused')||!galleryPointer.matches||document.hidden)return;
      timer=setTimeout(()=>{
        timer=0;if(!gallery.isConnected||!overPhoto||document.hidden)return;
        gallery.querySelector('[data-gallery-step="1"]')?.click();
        schedule();
      },delay);
    };
    gallery.addEventListener('pointermove',event=>{
      const next=event.pointerType==='mouse'&&Boolean(event.target.closest('.gallery-slide'));
      if(next===overPhoto)return;overPhoto=next;if(next)schedule(900);else stop();
    });
    gallery.addEventListener('pointerleave',()=>{overPhoto=false;stop();});
    gallery.addEventListener('pointerdown',stop);
    gallery.addEventListener('click',event=>{if(event.isTrusted){overPhoto=false;stop();}});
    const reset=()=>{overPhoto=false;stop();};
    const visibility=()=>{if(document.hidden)reset();};
    reducedMotion.addEventListener('change',reset);document.addEventListener('visibilitychange',visibility);document.addEventListener('cipher:motion',reset);
    if(root===dialogContent)dialog.addEventListener('close',()=>{
      stop();reducedMotion.removeEventListener('change',reset);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('cipher:motion',reset);
    },{once:true});
  });
}
prepareGalleryHover(document);
document.addEventListener('cipher:open',event=>openTemplate(event.detail.id));
document.addEventListener('click',event=>{
  const eventButton=event.target.closest('[data-event]'), memberButton=event.target.closest('[data-member]');
  if(eventButton)openTemplate('event-'+eventButton.dataset.event);
  if(memberButton)openTemplate('member-'+memberButton.dataset.member);
  const step=event.target.closest('[data-gallery-step]');
  if(step&&!step.closest('[data-stack-gallery]')){const gallery=step.closest('.gallery'),slides=[...gallery.querySelectorAll('.gallery-slide')];if(!slides.length)return;const current=slides.findIndex(slide=>!slide.hidden);const next=(current+Number(step.dataset.galleryStep)+slides.length)%slides.length;slides.forEach((slide,index)=>slide.hidden=index!==next);gallery.querySelector('[data-gallery-count]').textContent=`${String(next+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;}
});
// Keep native focus trapping/restoration, with a short exit before closing.
let dialogCloseTimer=0;
function closeDetailDialog(){
  if(!dialog?.open||dialog.classList.contains('is-closing'))return;
  if(reducedMotion.matches||document.body.classList.contains('motion-paused')){dialog.close();return;}
  dialog.classList.add('is-closing');
  dialogCloseTimer=setTimeout(()=>dialog.close(),180);
}
dialog?.addEventListener('close',()=>{clearTimeout(dialogCloseTimer);dialog.classList.remove('is-closing');if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus({preventScroll:true});dialogReturnFocus=null;});
dialog?.querySelector('.dialog-close').addEventListener('click',closeDetailDialog);
dialog?.addEventListener('cancel',event=>{event.preventDefault();closeDetailDialog();});
dialog?.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeDetailDialog();}});
dialog?.addEventListener('keydown',event=>{
  if(event.key!=='Tab'||!dialog.open)return;
  const focusable=[...dialog.querySelectorAll('button:not([disabled]):not([hidden]),a[href]:not([hidden]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length&&element.getAttribute('aria-hidden')!=='true');
  if(!focusable.length){event.preventDefault();dialog.focus();return;}
  const first=focusable[0],last=focusable.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!dialog.contains(active))){event.preventDefault();first.focus();}
});
// Pointer swipe supplements the visible, keyboard-operable gallery buttons.
let swipeStart=null;
document.addEventListener('pointerdown',event=>{if(event.target.closest('.gallery-slide')&&!event.target.closest('[data-stack-gallery]'))swipeStart={x:event.clientX,y:event.clientY,gallery:event.target.closest('.gallery')};});
document.addEventListener('pointerup',event=>{if(swipeStart){const delta=event.clientX-swipeStart.x;if(Math.abs(delta)>60&&Math.abs(event.clientY-swipeStart.y)<60)swipeStart.gallery.querySelector(`[data-gallery-step="${delta<0?1:-1}"]`)?.click();swipeStart=null;}});

let category='All';
const search=document.querySelector('#event-search');
function filterEvents(){const query=(search?.value || '').toLowerCase().trim();let visible=0;document.querySelectorAll('.events-section .event-card').forEach(card=>{const match=(category==='All'||card.dataset.category===category)&&card.dataset.search.includes(query);card.hidden=!match;if(match)visible++;});const count=document.querySelector('#event-count');if(count)count.textContent=`${visible} ${visible===1?'event':'events'} found`;const empty=document.querySelector('#no-events');if(empty)empty.hidden=visible>0;}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filterEvents();}));
search?.addEventListener('input',filterEvents);
document.querySelector('#form-status')?.focus({preventScroll:true});
document.querySelector('#contact-form')?.addEventListener('submit',event=>{if(event.currentTarget.checkValidity()){const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;button.textContent='Saving your message…';}});
window.addEventListener('pageshow',()=>{const button=document.querySelector('#contact-form [type="submit"]');if(button){button.disabled=false;button.textContent='Send message ↗';}});

// A short optional intro preserves the reference without blocking first access.
const intro=document.body.classList.contains('reference-site')?null:document.querySelector('#intro');
document.querySelector('#replay-intro')?.addEventListener('click',()=>{intro.hidden=false;intro.showModal();});
if(intro)document.querySelector('#skip-intro')?.addEventListener('click',()=>intro.close());
intro?.addEventListener('close',()=>intro.hidden=true);

// Cosmetic Easter egg from the video. It never grants editor privileges.
let code='';
document.addEventListener('keydown',event=>{
  if(document.body.classList.contains('reference-site'))return;
  if(event.ctrlKey||event.altKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable]')||event.key.length!==1)return;
  code=(code+event.key.toLowerCase()).slice(-6);
  if(code==='cipher'&&!dialog.open){dialogContent.replaceChildren();const content=document.createElement('div');content.className='easter-egg';const tag=document.createElement('p');tag.className='eyebrow';tag.textContent='// CONNECTION ESTABLISHED';const heading=document.createElement('h2');heading.id='dialog-title';heading.textContent='ROOT ACCESS';const body=document.createElement('p');body.textContent='You found the inner circle. The real code was the curiosity you brought along.';content.append(tag,heading,body);dialogContent.append(content);dialog.showModal();code='';}
});

// Render the wordmark from small glyphs. No library, network call, or endless loop.
const canvas=document.querySelector('#matrix-wordmark');
if(canvas && !reducedMotion.matches && !document.body.classList.contains('reference-site')){
  const context=canvas.getContext('2d');
  const mask=document.createElement('canvas'), maskContext=mask.getContext('2d',{willReadFrequently:true});
  let points=[], width=0,height=0,frame=0,start=0;
  function prepare(){
    const box=canvas.getBoundingClientRect();width=Math.round(box.width);height=Math.round(box.height);
    if(!width||!height)return;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;context.setTransform(dpr,0,0,dpr,0,0);mask.width=width;mask.height=height;
    const size=Math.min(width/3.7,height*.85);maskContext.font=`bold ${size}px Consolas, monospace`;maskContext.textAlign='center';maskContext.textBaseline='middle';maskContext.fillText('CIPHER',width/2,height/2+size*.035);
    const pixels=maskContext.getImageData(0,0,width,height).data;points=[];const step=width<600?5:7;
    for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step)if(pixels[(y*width+x)*4+3]>100)points.push({x,y,n:(x*17+y*31)%29});
    canvas.parentElement.classList.add('canvas-ready');draw();
  }
  function draw(progress=1){context.clearRect(0,0,width,height);const size=Math.min(width/3.7,height*.85);context.font=`bold ${size}px Consolas,monospace`;context.textAlign='center';context.textBaseline='middle';context.fillStyle=width<600?'#9ce8b42e':'#9ce8b40c';context.fillText('CIPHER',width/2,height/2+size*.035);context.textBaseline='alphabetic';context.font=`${width<600?5:7}px Consolas,monospace`;const chars='01CIPHER{}<>/+*#';for(const p of points){context.fillStyle=p.n%5===0?'#42ef78':p.n%3===0?'#69a77b':'#b6e6c4';const offset=(1-progress)*Math.sin(p.n+progress*8)*30;context.fillText(chars[p.n%chars.length],p.x+offset,p.y);} }
  function animate(time){if(!start)start=time;const progress=Math.min(1,(time-start)/1800);draw(progress);if(progress<1&&!reducedMotion.matches&&!document.hidden)frame=requestAnimationFrame(animate);}
  prepare();frame=requestAnimationFrame(animate);new ResizeObserver(prepare).observe(canvas.parentElement);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);draw();}});
  reducedMotion.addEventListener('change',()=>{cancelAnimationFrame(frame);draw();});
}

// Scroll-driven horizontal carousel interaction
function initScrollCarousels(){
  document.querySelectorAll('[data-scroll-carousel]').forEach(carousel=>{
    const track=carousel.querySelector('.scroll-carousel-track');
    const cards=[...carousel.querySelectorAll('.scroll-carousel-card')];
    const counterCurrent=carousel.querySelector('.current-step');
    const counterTotal=carousel.querySelector('.total-steps');
    const progressFill=carousel.querySelector('.carousel-progress-fill');
    if(!track||!cards.length)return;
    const totalSteps=cards.length;
    if(counterTotal)counterTotal.textContent=String(totalSteps).padStart(2,'0');
    let currentStep=0,isAnimating=false;
    function updateStep(stepIndex,animate=true){
      currentStep=Math.max(0,Math.min(totalSteps-1,stepIndex));
      cards.forEach((card,i)=>card.classList.toggle('is-active',i===currentStep));
      if(counterCurrent)counterCurrent.textContent=String(currentStep+1).padStart(2,'0');
      if(progressFill)progressFill.style.width=`${((currentStep+1)/totalSteps)*100}%`;
      const targetCard=cards[currentStep];
      if(targetCard){
        const translateX=targetCard.offsetLeft;
        if(animate&&!reducedMotion.matches&&!document.body.classList.contains('motion-paused')){
          track.style.transition='transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        }else{
          track.style.transition='none';
        }
        track.style.transform=`translate3d(-${translateX}px,0,0)`;
      }
    }
    function syncWithScroll(){
      const rect=carousel.getBoundingClientRect();
      const headerOffset=90;
      const scrollableDist=carousel.offsetHeight-window.innerHeight;
      if(scrollableDist<=0)return;
      const scrolled=-rect.top+headerOffset;
      if(scrolled>=0&&scrolled<=scrollableDist){
        const progress=Math.min(1,Math.max(0,scrolled/scrollableDist));
        const step=Math.min(totalSteps-1,Math.floor(progress*totalSteps));
        if(step!==currentStep&&!isAnimating){
          updateStep(step);
        }
      }
    }
    carousel.addEventListener('wheel',event=>{
      const rect=carousel.getBoundingClientRect();
      const headerOffset=90;
      const inPinZone=rect.top<=headerOffset+15&&rect.bottom>=window.innerHeight-15;
      if(!inPinZone)return;
      const delta=event.deltaY;
      if(delta>0&&currentStep<totalSteps-1){
        event.preventDefault();
        if(!isAnimating){
          isAnimating=true;
          const nextStep=currentStep+1;
          updateStep(nextStep);
          const scrollableDist=carousel.offsetHeight-window.innerHeight;
          const targetY=carousel.offsetTop-headerOffset+((nextStep/(totalSteps-1))*scrollableDist);
          window.scrollTo({top:targetY,behavior:'smooth'});
          setTimeout(()=>{isAnimating=false;},400);
        }
      }else if(delta<0&&currentStep>0){
        event.preventDefault();
        if(!isAnimating){
          isAnimating=true;
          const prevStep=currentStep-1;
          updateStep(prevStep);
          const scrollableDist=carousel.offsetHeight-window.innerHeight;
          const targetY=carousel.offsetTop-headerOffset+((prevStep/(totalSteps-1))*scrollableDist);
          window.scrollTo({top:targetY,behavior:'smooth'});
          setTimeout(()=>{isAnimating=false;},400);
        }
      }
    },{passive:false});
    addEventListener('scroll',syncWithScroll,{passive:true});
    addEventListener('resize',()=>updateStep(currentStep,false),{passive:true});
    updateStep(0,false);
  });
}
// Automatic PowerPoint-style entrance slide animation on scroll (re-triggers EVERY time section is scrolled into view)
function initScrollEntranceAnimations(){
  const slideObserver = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
      } else {
        entry.target.classList.remove('is-visible');
      }
    });
  },{threshold:0.1, rootMargin:'0px 0px -20px 0px'});

  const selectors = [
    '.reference-hero-copy h2',
    '.reference-hero-copy p',
    '.reference-hero-copy .button-row',
    '#about h2',
    '.reference-about-copy',
    '.reference-collage img',
    '#domains h2',
    '.reference-domain',
    '.domain-card',
    '#leadership h2',
    '.reference-person',
    '#events h2',
    '.reference-event',
    '#activities h2',
    '.reference-activity',
    '#join h2',
    '.reference-join p'
  ];

  document.querySelectorAll(selectors.join(',')).forEach(el=>{
    el.classList.add('slide-on-scroll');
    slideObserver.observe(el);
  });
}

// The reference homepage has its own matching motion controller. Initialising
// these observers there a second time causes duplicate layout work while scrolling.
if(!document.body.classList.contains('reference-site')){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{initScrollCarousels();initScrollEntranceAnimations();});
  }else{
    initScrollCarousels();
    initScrollEntranceAnimations();
  }
}
