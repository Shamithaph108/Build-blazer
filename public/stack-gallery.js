// Independent photo decks: pointer motion reveals the stack, never resets selection.
(() => {
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  function initialise(root=document){
    root.querySelectorAll('[data-stack-gallery]').forEach(gallery=>{
      if(gallery.dataset.stackReady)return;gallery.dataset.stackReady='true';
      const deck=gallery.querySelector('.stack-deck'),slides=[...gallery.querySelectorAll('.gallery-slide')];
      if(!deck||!slides.length)return;
      let selected=0,gesture=null,suppressUntil=0;
      const layers=[];
      for(let i=1;i<=Math.min(2,slides.length-1);i++){
        const layer=document.createElement('img');layer.className=`stack-behind stack-behind-${i}`;layer.alt='';layer.setAttribute('aria-hidden','true');layer.draggable=false;deck.prepend(layer);layers.push(layer);
      }
      function display(index){
        selected=(index+slides.length)%slides.length;
        slides.forEach((slide,i)=>{slide.hidden=i!==selected;slide.classList.remove('stack-arriving');});
        const slide=slides[selected],photo=slide.querySelector('img');slide.classList.add('stack-arriving');
        deck.classList.toggle('is-loading',!photo.complete);
        photo.addEventListener('load',()=>deck.classList.remove('is-loading'),{once:true});
        photo.addEventListener('error',()=>{deck.classList.remove('is-loading');photo.alt='Photograph unavailable. Try another image.';},{once:true});
        layers.forEach((layer,i)=>layer.src=slides[(selected+i+1)%slides.length].querySelector('img').src);
        for(const offset of [-1,0,1])slides[(selected+offset+slides.length)%slides.length].querySelector('img').loading='eager';
        const count=gallery.querySelector('[data-gallery-count]');
        if(count)count.textContent=`${String(selected+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;
        gallery.querySelectorAll('[data-gallery-index]').forEach(dot=>dot.setAttribute('aria-pressed',String(Number(dot.dataset.galleryIndex)===selected)));
        gallery.dataset.selected=String(selected);
      }
      display(0);if(slides.length===1)return;
      gallery.addEventListener('click',event=>{
        const step=event.target.closest('[data-gallery-step]'),dot=event.target.closest('[data-gallery-index]');
        if(step){event.stopPropagation();display(selected+Number(step.dataset.galleryStep));return;}
        if(dot){display(Number(dot.dataset.galleryIndex));return;}
        if(!event.target.closest('.stack-deck')||performance.now()<suppressUntil)return;
        const rect=deck.getBoundingClientRect();display(selected+(event.clientX<rect.left+rect.width/2?-1:1));deck.focus({preventScroll:true});
      });
      gallery.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();display(selected+(event.key==='ArrowRight'?1:-1));
      });
      deck.addEventListener('pointerdown',event=>{if(!event.target.closest('button')&&event.button<=0)gesture={id:event.pointerId,x:event.clientX,y:event.clientY};});
      deck.addEventListener('pointerup',event=>{
        if(!gesture||gesture.id!==event.pointerId)return;
        const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;
        if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){display(selected+(dx<0?1:-1));suppressUntil=performance.now()+500;}
      });
      deck.addEventListener('pointercancel',()=>gesture=null);
      gallery.addEventListener('pointerleave',()=>gesture=null);
    });
  }
  initialise();document.addEventListener('cipher:dialog-open',()=>initialise(document.querySelector('#dialog-content')));
})();
