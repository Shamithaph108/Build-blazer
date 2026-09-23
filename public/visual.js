// Decorative motion never handles form data or authorisation.
(() => {
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const stopped=()=>preference.matches;
  function updateMotion(){
    document.body.classList.toggle('motion-paused',stopped());
    document.dispatchEvent(new CustomEvent('cipher:motion',{detail:{paused:stopped()}}));
  }
  preference.addEventListener('change',()=>{updateMotion();draw(performance.now());start();});
  updateMotion();

  // Reveal once on arrival, with a normal visible document as the no-JS fallback.
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
  }),{threshold:0,rootMargin:'0px 0px -35px 0px'});
  document.querySelectorAll('main > section,.editor-section,.studio-heading,.site-footer').forEach(section=>{
    section.classList.add('reveal-target');
    if(!stopped()&&section.getBoundingClientRect().top>innerHeight*.9)section.classList.add('reveal-pending');
    section.querySelectorAll('.reference-domains,.reference-events,.reference-activity-grid,.event-grid,.team-grid,.editor-section,.footer-grid,.footer-bottom').forEach(group=>{
      [...group.children].filter(card=>card.tagName!=='TEMPLATE' && !card.classList.contains('section-heading')).forEach((card,index)=>{
        card.classList.add('reveal-card');card.style.setProperty('--arrival-delay',`${Math.min(index,5)*65}ms`);
      });
    });
    observer.observe(section);
  });

  // All native-dialog entry paths (including social information) share the same frame.
  const detail=document.querySelector('#detail-dialog');
  if(detail){
    const label=detail.querySelector('[data-dialog-label]');
    new MutationObserver(()=>{
      if(!detail.open)return;
      const names={event:'EVENT GALLERY',profile:'PEOPLE OF CIPHER',join:'JOIN THE COMMUNITY',information:'EXPLORE'};
      label.textContent=`CIPHER / ${names[detail.dataset.kind]||'EXPLORE'}`;
      detail.style.removeProperty('--light-x');detail.style.removeProperty('--light-y');
    }).observe(detail,{attributes:true,attributeFilter:['open','data-kind']});
  }

  // Pointer lighting moves on the surfaces, never the hit targets or form controls.
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  let lightFrame=0,lightTarget=null,lightX=0,lightY=0;
  document.addEventListener('pointermove',event=>{
    if(stopped()||!finePointer.matches||event.pointerType!=='mouse')return;
    const target=event.target.closest('#detail-dialog,.reference-domain,.reference-event,.reference-activity,.editor-item,.inbox-item');
    if(!target)return;
    lightTarget=target;lightX=event.clientX;lightY=event.clientY;
    if(!lightFrame)lightFrame=requestAnimationFrame(()=>{
      lightFrame=0;if(!lightTarget?.isConnected||stopped())return;
      const box=lightTarget.getBoundingClientRect();
      lightTarget.style.setProperty('--light-x',`${((lightX-box.left)/box.width*100).toFixed(1)}%`);
      lightTarget.style.setProperty('--light-y',`${((lightY-box.top)/box.height*100).toFixed(1)}%`);
    });
  },{passive:true});
  const hero=document.querySelector('.reference-hero');
  let heroVisible=true;
  function sleepAmbient(){document.body.classList.toggle('ambient-asleep',document.hidden||!heroVisible);}
  if(hero)new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;sleepAmbient();}).observe(hero);
  document.addEventListener('visibilitychange',sleepAmbient);
  addEventListener('pagehide',()=>{cancelAnimationFrame(lightFrame);lightFrame=0;});

  const canvas=document.querySelector('#ambient-matrix'),ctx=canvas?.getContext('2d');
  let width=0,height=0,columns=[],frame=0,last=0;
  const glyphs='01CIPHER{}<>/+#';
  function resize(){
    if(!ctx)return;width=innerWidth;height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,1.25);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    const spacing=width<600?27:30;
    columns=Array.from({length:Math.ceil(width/spacing)},(_,i)=>({x:i*spacing+9,seed:(i*137)%997,speed:18+(i*17)%32,length:7+i%8}));
    draw(performance.now());
  }
  function draw(time){
    if(!ctx)return;ctx.clearRect(0,0,width,height);ctx.font='13px "Cipher Mono",monospace';ctx.textAlign='center';
    const seconds=stopped()?0:time/1000;
    for(const column of columns){
      const head=(column.seed+seconds*column.speed)%(height+320)-80;
      for(let j=0;j<column.length;j++){
        const y=head-j*20;if(y<0||y>height)continue;
        const fade=(1-j/column.length)*.66;
        ctx.fillStyle=j===0?'rgba(157,255,187,.85)':`rgba(30,228,108,${fade})`;
        ctx.fillText(glyphs[(column.seed+j*3+Math.floor(seconds*.7))%glyphs.length],column.x,y);
      }
    }
  }
  function loop(time){frame=0;if(document.hidden||stopped())return;if(time-last>45){last=time;draw(time);}frame=requestAnimationFrame(loop);}
  function start(){cancelAnimationFrame(frame);frame=0;if(ctx&&!document.hidden&&!stopped())frame=requestAnimationFrame(loop);}
  resize();start();addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',start);addEventListener('pagehide',()=>cancelAnimationFrame(frame));addEventListener('pageshow',start);
})();

(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const states=new Set(),visible=new WeakMap();
  const glyphs='01CIPHER<>/{}+#';
  let frame=0,last=0;

  function hash(value){let result=17;for(const character of value)result=(result*31+character.charCodeAt(0))%10007;return result;}
  function draw(state,time){
    const {context,width,height,columns,seed}=state;if(!width||!height)return;
    context.fillStyle='#010704';context.fillRect(0,0,width,height);
    context.font='11px "Cipher Mono",monospace';context.textAlign='center';
    const seconds=reduced.matches?2.5:time/1000;
    for(const column of columns){
      const head=(column.seed+seconds*column.speed)%(height+190)-45;
      for(let row=0;row<column.length;row++){
        const y=head-row*15;if(y<0||y>height)continue;
        const alpha=Math.max(.08,(1-row/column.length)*.74);
        const glyph=glyphs[(seed+column.index*7+row*5+Math.floor(seconds))%glyphs.length];
        if(row===0){context.shadowBlur=9;context.shadowColor='#65ff8e';context.fillStyle='rgba(207,255,219,.96)';}
        else{context.shadowBlur=0;context.fillStyle=`rgba(40,239,105,${alpha})`;}
        context.fillText(glyph,column.x,y);
      }
    }
    context.shadowBlur=0;
  }

  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    for(const entry of entries)visible.set(entry.target,entry.isIntersecting);
  },{rootMargin:'100px'}):null;

  function prepare(canvas){
    if(canvas.dataset.matrixReady)return;
    const context=canvas.getContext('2d');if(!context)return;
    canvas.dataset.matrixReady='true';
    const label=canvas.closest('[data-member]')?.dataset.member||canvas.closest('.reference-person,.team-card,.profile-detail')?.textContent||'';
    const state={canvas,context,width:0,height:0,columns:[],seed:hash(label)};
    canvas._cipherMatrix=state;states.add(state);visible.set(canvas,true);observer?.observe(canvas);
    const resize=()=>{
      const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
      const ratio=Math.min(devicePixelRatio||1,1.25);state.width=box.width;state.height=box.height;
      canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
      const spacing=15;state.columns=Array.from({length:Math.ceil(box.width/spacing)},(_,index)=>({index,x:index*spacing+7,seed:(state.seed+index*97)%701,speed:15+index%9,length:8+index%7}));
      draw(state,performance.now());
    };
    state.resize=resize;
    if('ResizeObserver' in window){state.resizeObserver=new ResizeObserver(resize);state.resizeObserver.observe(canvas);}else addEventListener('resize',resize,{passive:true});
    resize();
  }

  function loop(time){
    frame=0;if(document.hidden||reduced.matches)return;
    if(time-last>70){last=time;for(const state of states)if(state.canvas.isConnected&&visible.get(state.canvas))draw(state,time);}
    frame=requestAnimationFrame(loop);
  }
  function start(){
    cancelAnimationFrame(frame);frame=0;
    for(const state of [...states])if(!state.canvas.isConnected){observer?.unobserve(state.canvas);state.resizeObserver?.disconnect();states.delete(state);}
    document.querySelectorAll('.member-matrix').forEach(prepare);
    for(const state of states)draw(state,performance.now());
    if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(loop);
  }

  start();
  document.addEventListener('cipher:dialog-open',start);
  const dialogContent=document.querySelector('#dialog-content');if(dialogContent)new MutationObserver(start).observe(dialogContent,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',start);addEventListener('pageshow',start);addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  if(reduced.addEventListener)reduced.addEventListener('change',start);else reduced.addListener(start);
})();
