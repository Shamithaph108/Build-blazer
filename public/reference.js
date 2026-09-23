/* Visual behaviour reconstructed from the supplied video. No animation changes permissions. */
(() => {
  if(!document.body.classList.contains('reference-site'))return;
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  const motion={get matches(){return motionPreference.matches||document.body.classList.contains('motion-paused');}};
  const finePointer=matchMedia('(pointer: fine)');
  const header=document.querySelector('.site-header');
  const cursor=document.querySelector('#reference-cursor');
  const detail=document.querySelector('#detail-dialog');
  const detailContent=document.querySelector('#dialog-content');
  const pointer={x:-1000,y:-1000,ringX:-1000,ringY:-1000,active:false,hover:false};
  let lastTime=0,animationFrame=0,viewWidth=innerWidth,viewHeight=innerHeight;
  const timers=new Set();
  const later=(fn,delay)=>{const id=setTimeout(()=>{timers.delete(id);fn();},delay);timers.add(id);return id;};

  function openTemplate(id){document.dispatchEvent(new CustomEvent('cipher:open',{detail:{id}}));}
  function information(title,message){
    detail.dataset.kind='information';detailContent.replaceChildren();
    const heading=document.createElement('h2');heading.id='dialog-title';heading.textContent=title;
    const paragraph=document.createElement('p');paragraph.textContent=message;
    detailContent.append(heading,paragraph);detail.showModal();
  }

  // Anchor navigation stays on this page, as in the recording.
  document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{
    const target=document.querySelector(link.getAttribute('href'));if(!target)return;
    event.preventDefault();document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false');document.querySelector('#primary-nav')?.classList.remove('is-open');
    const top=target.id==='home'?0:target.getBoundingClientRect().top+scrollY-header.offsetHeight;
    window.scrollTo({top,behavior:motion.matches?'instant':'smooth'});history.replaceState(null,'',link.getAttribute('href'));
  }));
  const onScroll=()=>header.classList.toggle('is-scrolled',scrollY>30);
  addEventListener('scroll',onScroll,{passive:true});onScroll();

  // Modal forms save to exactly the same inbox as the standalone Join page.
  document.addEventListener('click',event=>{
    const domain=event.target.closest('[data-domain-card],.reference-domain,.domain-card');
    if(domain && !event.target.closest('a,button,input,textarea,select')){
      const title=domain.dataset.title || domain.querySelector('h3')?.textContent || 'Our Domain';
      const desc=domain.dataset.description || domain.querySelector('p')?.textContent || '';
      information('CIPHER // ' + title.toUpperCase(), desc);
      return;
    }
    const member=event.target.closest('.reference-person,[data-member],.profile-button');
    if(member && !event.target.closest('a,button[data-profile-link]')){
      const id=member.dataset.member || member.querySelector('[data-member]')?.dataset.member || member.querySelector('.profile-button')?.dataset.member;
      if(id)openTemplate('member-'+id);
      return;
    }
    const join=event.target.closest('[data-join-modal]');
    if(join){event.preventDefault();openTemplate('join-form-template');}
    const activity=event.target.closest('[data-activity]');
    if(activity)openTemplate('activity-'+activity.dataset.activity);
    const profile=event.target.closest('[data-profile-link]');
    if(profile)information(profile.dataset.profileName,`The verified ${profile.dataset.profileLink} profile link has not been supplied yet.`);
    const social=event.target.closest('[data-social]');
    if(social){if(social.dataset.social==='email')openTemplate('join-form-template');else information('CIPHER · '+social.dataset.social,'The official account link is awaiting confirmation. You can contact the team using the Join form.');}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){
      const domain=event.target.closest('[data-domain-card],.reference-domain,.domain-card');
      if(domain && event.target===domain){event.preventDefault();domain.click();}
    }
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-modal-form]');if(!form)return;
    event.preventDefault();const status=form.querySelector('[role="status"]'),button=form.querySelector('[type="submit"]');
    const values=Object.fromEntries(new FormData(form));
    form.querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
    button.disabled=true;button.textContent='SENDING…';status.classList.remove('error');status.textContent='Saving your message…';
    try{
      const response=await fetch('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':values._csrf},body:JSON.stringify(values)});
      const result=await response.json().catch(()=>({error:'The server could not save your message. Please try again.'}));
      if(!response.ok){for(const key of Object.keys(result.errors || {}))form.elements.namedItem(key)?.setAttribute('aria-invalid','true');throw new Error(Object.values(result.errors || {}).join(' ') || result.error);}
      form.reset();status.textContent=result.message;
    }catch(error){status.classList.add('error');status.textContent=error.message || 'Connection failed. Your message was not saved. Please try again.';}
    finally{button.disabled=false;button.textContent='SEND →';}
  });

  // Gallery card rotation, pagination dots, and pointer tilt.
  function galleryDecorations(){
    detail.querySelectorAll('.gallery').forEach(gallery=>{
      if(gallery.hasAttribute('data-stack-gallery'))return;
      const slides=[...gallery.querySelectorAll('.gallery-slide')];
      const hint=document.createElement('p');hint.className='gallery-hint';hint.textContent=finePointer.matches&&!motion.matches?'HOVER TO EXPLORE · USE ARROWS →':'SWIPE TO EXPLORE →';
      const dots=document.createElement('div');dots.className='gallery-dots';dots.setAttribute('aria-hidden','true');
      slides.forEach((_,i)=>{const dot=document.createElement('span');dot.classList.toggle('active',i===0);dots.append(dot);});gallery.append(hint,dots);
      const observer=new MutationObserver(()=>{const current=slides.findIndex(slide=>!slide.hidden);dots.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('active',i===current));slides.forEach(slide=>slide.classList.remove('is-arriving'));const visible=slides[current];if(visible&&!motion.matches){void visible.offsetWidth;visible.classList.add('is-arriving');}});
      slides.forEach(slide=>observer.observe(slide,{attributes:true,attributeFilter:['hidden']}));detail.addEventListener('close',()=>observer.disconnect(),{once:true});
    });
  }
  document.addEventListener('cipher:dialog-open',galleryDecorations);

  // Headings decode EVERY TIME scrolled into view; their accessible text stays stable.
  const decodeCharacters='01#_*+<>?ΩΣΦ/';
  const activeDecodes = new WeakSet();
  const headingObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    const element=entry.target;
    if(!element.dataset.originalText) element.dataset.originalText = element.textContent;
    const text = element.dataset.originalText;

    if(entry.isIntersecting){
      if(activeDecodes.has(element)) return;
      activeDecodes.add(element);
      if(motion.matches){ element.textContent = text; return; }
      const accessible=document.createElement('span');accessible.className='sr-only';accessible.textContent=text;
      const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');element.replaceChildren(accessible,visual);
      const started=performance.now();
      const decode=()=>{
        const progress=(performance.now()-started)/780;
        visual.textContent=[...text].map((letter,i)=>letter===' '||i<progress*text.length?letter:decodeCharacters[Math.floor(Math.random()*decodeCharacters.length)]).join('');
        if(progress<1)later(decode,40);
        else visual.textContent=text;
      };
      decode();
    } else {
      activeDecodes.delete(element);
    }
  }),{threshold:.4});document.querySelectorAll('[data-decode]').forEach(heading=>headingObserver.observe(heading));


  // Animated lines fill the viewport, bend around the pointer, and move with scrolling.
  const field=document.querySelector('#contour-field'),fieldContext=field.getContext('2d');
  const word=document.querySelector('#matrix-wordmark'),wordContext=word.getContext('2d');
  const wordMask=document.createElement('canvas'),maskContext=wordMask.getContext('2d',{willReadFrequently:true});
  let particles=[],wordWidth=0,wordHeight=0,wordVisible=true,wordPointer={x:-1000,y:-1000},fieldDpr=1;
  const colors=['#9dffb8','#dbffe5','#65f791','#8fffb0','#bcffd2'];
  function resizeField(){viewWidth=innerWidth;viewHeight=innerHeight;fieldDpr=Math.min(devicePixelRatio||1,1.5);field.width=Math.round(viewWidth*fieldDpr);field.height=Math.round(viewHeight*fieldDpr);fieldContext.setTransform(fieldDpr,0,0,fieldDpr,0,0);drawField(0);document.body.classList.add('field-ready');}
  function drawField(time){
    const ctx=fieldContext;ctx.clearRect(0,0,viewWidth,viewHeight);const scale=viewWidth/1920,spacing=Math.max(8,viewWidth/140),scroll=scrollY*.19;
    for(let line=-12;line<viewWidth/spacing+12;line++){
      const base=line*spacing;ctx.beginPath();
      for(let y=-40;y<=viewHeight+40;y+=22){
        const phase=(y+scroll)/(Math.max(viewWidth,800)*.17)+time*.000075;
        const broad=Math.sin(phase+base/viewWidth*5)*Math.sin(base/viewWidth*7+1.2)*120*scale;
        const tight=(Math.sin(phase*2.8+base/viewWidth*9)*24+Math.asin(Math.sin(phase*2.1+base/viewWidth*6))*21)*scale;
        let x=base+broad+tight;const distance=Math.hypot(x-pointer.x,y-pointer.y),radius=Math.max(130,viewWidth*.13);
        if(pointer.active&&!motion.matches&&distance<radius)x+=(x-pointer.x)*Math.pow(1-distance/radius,2)*.52;
        if(y===-40)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=line%5===0?'rgba(40,183,100,.38)':'rgba(50,143,109,.43)';ctx.lineWidth=line%9===0?.9:.65;ctx.stroke();
    }
  }
  function prepareWord(){
    const rect=word.getBoundingClientRect();wordWidth=Math.round(rect.width);wordHeight=Math.round(rect.height);if(!wordWidth||!wordHeight)return;
    const dpr=Math.min(devicePixelRatio||1,2);word.width=wordWidth*dpr;word.height=wordHeight*dpr;wordContext.setTransform(dpr,0,0,dpr,0,0);wordMask.width=wordWidth;wordMask.height=wordHeight;
    const size=Math.min(wordWidth*.185,wordHeight*1.1);maskContext.font=`600 ${size}px "Cipher Sans",sans-serif`;maskContext.textAlign='center';maskContext.textBaseline='middle';maskContext.translate(wordWidth/2,0);maskContext.scale(1.18,1);maskContext.fillText('CIPHER',0,wordHeight*.58);
    const data=maskContext.getImageData(0,0,wordWidth,wordHeight).data,step=Math.max(4,wordWidth/169);particles=[];
    for(let y=0;y<wordHeight;y+=step)for(let x=0;x<wordWidth;x+=step){if(data[(Math.floor(y)*wordWidth+Math.floor(x))*4+3]>90)particles.push({homeX:x,homeY:y,x,y,vx:0,vy:0,seed:Math.floor(x*3+y*7)%37});}
    if(!motion.matches)word.parentElement.classList.add('canvas-ready');else word.parentElement.classList.remove('canvas-ready');drawWord(0);
  }
  function drawWord(time){
    if(!wordWidth||!wordVisible||motion.matches)return;const ctx=wordContext,step=Math.max(4,wordWidth/169);ctx.clearRect(0,0,wordWidth,wordHeight);ctx.font=`${step*.94}px "Cipher Mono",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const p of particles){const dx=p.x-wordPointer.x,dy=p.y-wordPointer.y,distance=Math.hypot(dx,dy),radius=Math.max(55,wordWidth*.1);if(pointer.active&&distance<radius&&distance>0){const force=(1-distance/radius)*2.4;p.vx+=dx/distance*force;p.vy+=dy/distance*force;}p.vx+=(p.homeX-p.x)*.035;p.vy+=(p.homeY-p.y)*.035;p.vx*=.84;p.vy*=.84;p.x+=p.vx;p.y+=p.vy;ctx.fillStyle=colors[p.seed%colors.length];const glyph='CIPHER01#@%+*';ctx.fillText(glyph[(p.seed+Math.floor(time/900+p.seed/3))%glyph.length],p.x,p.y);}
  }
  new IntersectionObserver(entries=>{wordVisible=entries[0].isIntersecting;},{rootMargin:'60px'}).observe(word);
  new ResizeObserver(prepareWord).observe(word.parentElement);document.fonts.ready.then(prepareWord);resizeField();prepareWord();
  addEventListener('resize',resizeField);

  // A seamless, slow-moving leadership strip; pause on hover/focus and drag to inspect.
  const track=document.querySelector('.reference-team-track'),trackWindow=document.querySelector('.reference-team-window');
  let trackVisible=false;
  new IntersectionObserver(entries=>trackVisible=entries[0].isIntersecting).observe(trackWindow);
  const originals=[...track.children];let trackOffset=0,trackLength=0,trackPaused=false,manualTrackPause=false,drag=null;
  const carouselManaged=track.hasAttribute('data-carousel');
  if(!carouselManaged&&originals.length>1){originals.forEach(card=>{const clone=card.cloneNode(true);clone.dataset.clone='true';clone.setAttribute('aria-hidden','true');clone.querySelectorAll('template').forEach(t=>t.remove());clone.querySelectorAll('button,a').forEach(control=>control.tabIndex=-1);track.append(clone);});}
  function measureTrack(){const firstClone=track.querySelector('[data-clone]');trackLength=firstClone?firstClone.offsetLeft-originals[0].offsetLeft:0;}
  if(!carouselManaged){
    new ResizeObserver(measureTrack).observe(track);measureTrack();
    track.addEventListener('pointerenter',()=>trackPaused=true);track.addEventListener('pointerleave',()=>{if(!drag)trackPaused=false;});
    track.addEventListener('focusin',event=>{trackPaused=true;const card=event.target.closest('.reference-person');if(card){const rect=card.getBoundingClientRect(),windowRect=trackWindow.getBoundingClientRect();if(rect.left<windowRect.left||rect.right>windowRect.right){trackOffset=card.offsetLeft-originals[0].offsetLeft;track.style.transform=`translateX(${-trackOffset}px)`;}}});track.addEventListener('focusout',()=>{trackPaused=false;});
    trackWindow.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;drag={x:event.clientX,start:trackOffset,moved:false};trackPaused=true;});
    addEventListener('pointermove',event=>{if(drag){const delta=event.clientX-drag.x;drag.moved ||= Math.abs(delta)>5;if(drag.moved){trackOffset=drag.start-delta;if(trackLength)trackOffset=(trackOffset%trackLength+trackLength)%trackLength;track.style.transform=`translateX(${-trackOffset}px)`;}}});
    let suppressClick=false;addEventListener('pointerup',()=>{if(drag){suppressClick=drag.moved;drag=null;trackPaused=false;later(()=>suppressClick=false,0);}});
    trackWindow.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();}},true);
  }
  const collage=document.querySelector('.reference-collage'),collageCarousel=collage.hasAttribute('data-carousel');let collageVisible=true;new IntersectionObserver(entries=>collageVisible=entries[0].isIntersecting).observe(collage);
  const collagePhotos=[...collage.querySelectorAll('img')];
  const collagePointer={x:0,y:0,targetX:0,targetY:0};
  const about=document.querySelector('.reference-about');
  about.addEventListener('pointermove',event=>{
    if(collageCarousel||motion.matches||!finePointer.matches||event.pointerType!=='mouse')return;
    // Use the stationary section, avoiding feedback from the tilted photo bounds.
    const rect=about.getBoundingClientRect();
    collagePointer.targetX=Math.max(-1,Math.min(1,(event.clientX-rect.left)/rect.width*2-1));
    collagePointer.targetY=Math.max(-1,Math.min(1,(event.clientY-rect.top)/rect.height*2-1));
  },{passive:true});
  about.addEventListener('pointerleave',()=>{collagePointer.targetX=0;collagePointer.targetY=0;});

  // Mouse-following ring and magnifier hover, including inside native top-layer dialogs.
  addEventListener('pointermove',event=>{
    if(intro.open){pointer.active=false;cursor.style.opacity='0';document.body.classList.remove('cursor-active');return;}
    if(!finePointer.matches||motion.matches)return;pointer.active=true;pointer.x=event.clientX;pointer.y=event.clientY;pointer.hover=Boolean(event.target.closest('a,button,input,textarea,summary,.reference-domain,.reference-collage'));
    const rect=word.getBoundingClientRect();wordPointer={x:event.clientX-rect.left,y:event.clientY-rect.top};document.body.classList.add('cursor-active');cursor.style.opacity='1';cursor.classList.toggle('is-hovering',pointer.hover);
    if(detail.open&&cursor.parentElement!==detail)detail.append(cursor);else if(!detail.open&&cursor.parentElement!==document.body)document.body.append(cursor);
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{pointer.active=false;cursor.style.opacity='0';document.body.classList.remove('cursor-active');wordPointer={x:-1000,y:-1000};});
  detail.addEventListener('close',()=>document.body.append(cursor));

  function animate(time){
    animationFrame=requestAnimationFrame(animate);if(document.hidden||time-lastTime<32)return;const delta=Math.min(60,time-lastTime);lastTime=time;
    if(!motion.matches){drawField(time);drawWord(time);if(trackVisible&&trackLength&&!trackPaused&&!manualTrackPause&&!detail.open&&!intro.open){trackOffset=(trackOffset+delta*.036)%trackLength;track.style.transform=`translateX(${-trackOffset}px)`;}
      if(collageVisible&&!collageCarousel){
        collagePointer.x+=(collagePointer.targetX-collagePointer.x)*.12;
        collagePointer.y+=(collagePointer.targetY-collagePointer.y)*.12;
        const rx=Math.sin(time*.0004)*4-collagePointer.y*15,ry=Math.cos(time*.0003)*5+collagePointer.x*19;
        collage.style.transform=`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        collagePhotos.forEach((photo,index)=>{const depth=[24,-15,-22,32,14][index%5];photo.style.translate=`${collagePointer.x*depth}px ${collagePointer.y*depth}px`;});
      }
      if(pointer.active){pointer.ringX+=(pointer.x-pointer.ringX)*.3;pointer.ringY+=(pointer.y-pointer.ringY)*.3;const size=pointer.hover?38:24;cursor.style.transform=`translate3d(${pointer.ringX-size/2}px,${pointer.ringY-size/2}px,0)`;}
    }
  }
  function updateMotion(){document.body.classList.remove('cursor-active');cursor.style.opacity='0';prepareWord();drawField(0);if(motion.matches||collageCarousel){collage.style.transform='';collagePhotos.forEach(photo=>photo.style.translate='');Object.assign(collagePointer,{x:0,y:0,targetX:0,targetY:0});}}
  motionPreference.addEventListener('change',updateMotion);document.addEventListener('cipher:motion',updateMotion);

  // Five-second automatic opening sequence, with Skip and Escape available immediately.
  const intro=document.querySelector('#intro'),rain=document.querySelector('#intro-rain'),rainContext=rain.getContext('2d');
  const boot=document.querySelector('.reference-boot-text'),introWord=document.querySelector('.reference-intro-word');
  let introFrame=0,introStarted=0,introLast=0,columns=[],introClosed=false;
  const letters='CIPHER';for(const letter of letters){const span=document.createElement('span');span.textContent=letter;introWord.append(span);}
  function opening(time){
    if(!intro.open)return;if(!introStarted)introStarted=time;const elapsed=time-introStarted;
    if(time-introLast>45){introLast=time;rainContext.fillStyle='#02080235';rainContext.fillRect(0,0,rain.width,rain.height);rainContext.font=`${Math.max(10,innerWidth/120)}px monospace`;columns.forEach((drop,i)=>{rainContext.fillStyle=i%5===0?'#32984b':'#13552d';rainContext.fillText('01CIPHER#*<>アイ'[Math.floor(Math.random()*14)],i*Math.max(14,innerWidth/100),drop);columns[i]=drop>rain.height&&Math.random()>.96?0:drop+Math.max(8,innerHeight/110);});}
    boot.querySelectorAll('div').forEach((line,i)=>line.classList.toggle('boot-visible',elapsed>i*190));
    if(elapsed>1100){intro.classList.add('word-phase');introWord.querySelectorAll('span').forEach((span,i)=>{const solved=elapsed>1700+i*420;span.textContent=solved?letters[i]:elapsed>1100+i*170?decodeCharacters[Math.floor(elapsed/90+i)%decodeCharacters.length]:'';});}
    if(elapsed>4500)intro.classList.add('is-leaving');if(elapsed>5050){finishIntro();return;}introFrame=requestAnimationFrame(opening);
  }
  function finishIntro(){if(introClosed)return;introClosed=true;cancelAnimationFrame(introFrame);if(intro.open)intro.close();intro.hidden=true;document.body.classList.add('opening-complete');if(!location.hash)scrollTo(0,0);}
  function startIntro(){introClosed=false;introStarted=0;introLast=0;intro.hidden=false;intro.classList.remove('word-phase','is-leaving');rain.width=innerWidth;rain.height=innerHeight;columns=Array.from({length:Math.ceil(innerWidth/Math.max(14,innerWidth/100))},()=>Math.random()*innerHeight);intro.showModal();document.body.classList.remove('opening-complete');if(motion.matches){intro.classList.add('word-phase');introWord.querySelectorAll('span').forEach((s,i)=>s.textContent=letters[i]);later(finishIntro,500);}else introFrame=requestAnimationFrame(opening);}
  document.querySelector('#skip-intro').addEventListener('click',finishIntro);intro.addEventListener('cancel',event=>{event.preventDefault();finishIntro();});intro.addEventListener('close',()=>{cancelAnimationFrame(introFrame);intro.hidden=true;});
  if(!location.hash)startIntro();else document.body.classList.add('opening-complete');
  animationFrame=requestAnimationFrame(animate);

  let code='';document.addEventListener('keydown',event=>{if(event.ctrlKey||event.altKey||event.metaKey||event.key.length!==1||event.target.closest('input,textarea,select,[contenteditable]'))return;code=(code+event.key.toLowerCase()).slice(-6);if(code==='cipher'&&!detail.open&&!intro.open){information('ROOT ACCESS','› You found the backdoor. Welcome to the inner circle of CIPHER. The real code was inside you all along.');code='';}});
  addEventListener('pagehide',()=>{cancelAnimationFrame(animationFrame);cancelAnimationFrame(introFrame);timers.forEach(clearTimeout);});
  addEventListener('pageshow',event=>{if(event.persisted){lastTime=0;animationFrame=requestAnimationFrame(animate);if(intro.open)finishIntro();}});

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
          if(animate&&!motion.matches){
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

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{initScrollCarousels();initScrollEntranceAnimations();});
  }else{
    initScrollCarousels();
    initScrollEntranceAnimations();
  }
})();
