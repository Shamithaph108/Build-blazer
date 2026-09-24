export function confirmAction(message){
  const dialog=document.querySelector('#confirm-dialog');
  return new Promise(resolve=>{
    dialog.querySelector('[data-confirm-message]').textContent=message;dialog.returnValue='cancel';
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();dialog.querySelector('[value="cancel"]').focus();
  });
}
export function toast(message,error=false){
  const region=document.querySelector('#toast-region');region.textContent=message;region.classList.toggle('toast-error',error);region.classList.add('toast-visible');
  clearTimeout(region.hideTimer);region.hideTimer=setTimeout(()=>region.classList.remove('toast-visible'),6500);
}
let dirty=false;
export function clearDirty(){dirty=false;}
export function hasUnsavedChanges(){return dirty;}
export function initStudio({request,action,saved,showImage}){
  const panels=[...document.querySelectorAll('[data-admin-panel]')],menu=document.querySelector('[data-admin-menu]'),sidebar=document.querySelector('#admin-sidebar');
  const mobile=matchMedia('(max-width:800px)');
  function closeMenu(){menu?.setAttribute('aria-expanded','false');sidebar?.classList.remove('is-open');if(sidebar)sidebar.inert=mobile.matches;}
  function panelFor(hash){const target=document.getElementById(hash.slice(1));return target?.closest('[data-admin-panel]')||panels[0];}
  function activate(hash=location.hash){
    if(!panels.length)return;
    const selected=panelFor(hash);panels.forEach(panel=>panel.hidden=panel!==selected);
    document.querySelectorAll('[data-admin-link]').forEach(link=>{if(link.dataset.adminLink===selected.id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    closeMenu();
    if(hash&&hash!==`#${selected.id}`)document.getElementById(hash.slice(1))?.scrollIntoView({block:'start',behavior:'instant'});
    else window.scrollTo({top:0,behavior:'instant'});
    document.dispatchEvent(new CustomEvent('cipher:panel-visible'));
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link)return;
    const url=new URL(link.href);if(link.hasAttribute('data-inbox-refresh')||url.origin!==location.origin||url.pathname!=='/admin'||!url.hash)return;
    if(!document.getElementById(url.hash.slice(1)))return;
    event.preventDefault();history.pushState(null,'',url.hash);activate(url.hash);
  });
  addEventListener('popstate',()=>activate());activate();
  menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));sidebar.classList.toggle('is-open',open);sidebar.inert=!open&&mobile.matches;});
  mobile.addEventListener('change',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sidebar?.classList.contains('is-open')){closeMenu();menu.focus();}});
  document.addEventListener('click',event=>{if(!event.target.closest('.admin-sidebar,.admin-mobile-bar'))closeMenu();});
  document.querySelectorAll('form:not([action="/admin/logout"])').forEach(form=>{
    form.addEventListener('input',()=>dirty=true);form.addEventListener('change',()=>dirty=true);
  });
  addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  document.querySelector('form[action="/admin/logout"]')?.addEventListener('submit',async event=>{
    if(!dirty)return;event.preventDefault();if(await confirmAction('Discard unsaved changes and sign out?')){clearDirty();event.target.submit();}
  });
  for(const list of document.querySelectorAll('[data-record-list]')){
    const holder=list.querySelector('[data-record-items]'),records=[...holder.querySelectorAll(':scope > [data-record]')];
    const input=selector=>list.querySelector(selector)?.value||'';
    function filter(){
      const query=input('[data-record-search]').trim().toLowerCase(),status=input('[data-record-status]'),category=input('[data-record-category]'),from=input('[data-record-from]'),to=input('[data-record-to]'),sort=input('[data-record-sort]');let count=0;
      for(const record of records){const match=(!query||record.dataset.search.includes(query))&&(!status||record.dataset.status===status)&&(!category||record.dataset.category===category)&&(!from||record.dataset.date>=from)&&(!to||record.dataset.date.slice(0,10)<=to);record.hidden=!match;if(match)count++;}
      const ordered=[...records];if(sort==='name')ordered.sort((a,b)=>a.dataset.name.localeCompare(b.dataset.name));if(['newest','oldest'].includes(sort))ordered.sort((a,b)=>(a.dataset.date||'').localeCompare(b.dataset.date||'')*(sort==='newest'?-1:1));ordered.forEach(record=>holder.append(record));
      list.querySelector('[data-record-count]').textContent=`${count} ${count===1?'record':'records'}`;list.querySelector('[data-no-records]').hidden=count>0;
    }
    list.querySelectorAll('.record-filters input,.record-filters select').forEach(control=>control.addEventListener('input',filter));
    list.querySelector('[data-reset-filters]').addEventListener('click',()=>{list.querySelectorAll('.record-filters input,.record-filters select').forEach(control=>control.value=control.hasAttribute('data-record-sort')?'default':'');filter();});filter();
  }
  function decoratePhotos(form){
    const choices=form.querySelector('.gallery-choices');if(!choices)return;
    for(const checkbox of choices.querySelectorAll('input[name="gallery"]')){
      if(checkbox.closest('[data-photo-option]'))continue;
      const label=checkbox.closest('label'),option=document.createElement('div');option.className='photo-option';option.dataset.photoOption='';option.draggable=true;label.before(option);option.append(label);
      const image=document.createElement('img');image.src=checkbox.value;image.alt='';image.width=150;image.height=100;image.loading='lazy';label.insertBefore(image,label.querySelector('span'));
      const actions=document.createElement('div');actions.className='photo-actions';
      for(const [key,value,text,labelText] of [['photoMove','-1','←','Move photo earlier'],['photoCover','','Set as cover','Set as cover'],['photoMove','1','→','Move photo later'],['photoRemove','','×','Remove photo from event']]){const button=document.createElement('button');button.type='button';button.dataset[key]=value;button.textContent=text;button.setAttribute('aria-label',labelText);actions.append(button);}option.append(actions);
    }
    const selected=[...choices.querySelectorAll('[data-photo-option]')].filter(item=>item.querySelector('input').checked);
    form.querySelector('[data-photo-count]').textContent=`${selected.length} / 20 photos selected`;
    selected.forEach((option,index)=>{option.querySelector('[data-photo-move="-1"]').disabled=index===0;option.querySelector('[data-photo-move="1"]').disabled=index===selected.length-1;option.querySelector('[data-photo-cover]').textContent=option.querySelector('input').value===form.elements.image.value?'Cover photo':'Set as cover';});
  }
  for(const form of document.querySelectorAll('.editor-form[data-kind="events"]')){
    const choices=form.querySelector('.gallery-choices');let dragged=null;
    form.querySelector('[data-gallery-library]').addEventListener('click',event=>{const show=choices.classList.toggle('show-library');event.target.setAttribute('aria-expanded',String(show));event.target.textContent=show?'Hide unused photos':'Choose existing photos';});
    choices.addEventListener('change',()=>{dirty=true;decoratePhotos(form);});
    choices.addEventListener('click',event=>{
      const button=event.target.closest('.photo-actions button');if(!button)return;const option=button.closest('[data-photo-option]'),input=option.querySelector('input');
      if(button.hasAttribute('data-photo-remove'))input.checked=false;
      if(button.hasAttribute('data-photo-cover')){form.elements.image.value=input.value;showImage(form);}
      if(button.hasAttribute('data-photo-move')){const selected=[...choices.querySelectorAll('[data-photo-option]')].filter(p=>p.querySelector('input').checked),index=selected.indexOf(option),next=selected[index+Number(button.dataset.photoMove)];if(next){if(Number(button.dataset.photoMove)<0)next.before(option);else next.after(option);}}
      dirty=true;decoratePhotos(form);
    });
    choices.addEventListener('dragstart',event=>{const option=event.target.closest('[data-photo-option]');if(!option?.querySelector('input').checked){event.preventDefault();return;}dragged=option;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','event-photo');option.classList.add('is-dragging');});
    choices.addEventListener('dragover',event=>{if(dragged&&event.target.closest('[data-photo-option]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
    choices.addEventListener('drop',event=>{event.preventDefault();const target=event.target.closest('[data-photo-option]');if(dragged&&target&&target!==dragged){const before=[...choices.children].indexOf(dragged)>[...choices.children].indexOf(target);if(before)target.before(dragged);else target.after(dragged);dirty=true;decoratePhotos(form);}});
    choices.addEventListener('dragend',()=>{dragged?.classList.remove('is-dragging');dragged=null;});
    form.addEventListener('change',()=>decoratePhotos(form));decoratePhotos(form);
  }
  document.addEventListener('cipher:photos-changed',()=>document.querySelectorAll('.editor-form[data-kind="events"]').forEach(decoratePhotos));
  document.querySelectorAll('[data-publish-toggle]').forEach(button=>button.addEventListener('click',async()=>{
    const form=button.closest('.record-item').querySelector('.editor-form');
    if(!await confirmAction(`${form.elements.published.checked?'Unpublish':'Publish'} this event with the values currently in its form?`))return;
    form.elements.published.checked=!form.elements.published.checked;form.requestSubmit();
  }));
  document.querySelector('[data-new-announcement]')?.addEventListener('click',event=>{const form=event.currentTarget.closest('form');form.elements.title.value='';form.elements.message.value='';form.elements.link.value='';form.elements.published.checked=true;form.dataset.append='true';form.elements.title.focus();});
  document.querySelector('[data-delete-announcement]')?.addEventListener('click',async event=>{const form=event.currentTarget.closest('form');if(!await confirmAction('Delete all announcements from the homepage and admin editor?'))return;action(form,async()=>{const result=await request('/api/admin/announcement','DELETE',{version:Number(form.dataset.version)});saved(result.message);});});
  document.querySelector('.announcement-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.target;action(form,async()=>{const result=await request('/api/admin/announcement','PUT',{...Object.fromEntries(new FormData(form)),published:form.elements.published.checked,append:form.dataset.append==='true',version:Number(form.dataset.version)});saved(result.message);});});
  document.querySelector('.recovery-email-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.target;action(form,async()=>{const result=await request('/api/admin/recovery-email','POST',Object.fromEntries(new FormData(form)));clearDirty();form.reset();toast(result.message);form.querySelector('.editor-status').textContent=result.message;});});
  document.querySelector('.settings-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.target;action(form,async()=>{await request('/api/admin/settings','PUT',{...Object.fromEntries(new FormData(form)),version:Number(form.dataset.settingsVersion)});saved('Website settings saved.');});});
  document.querySelector('.password-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.target;action(form,async()=>{const result=await request('/api/admin/password','POST',Object.fromEntries(new FormData(form)));clearDirty();sessionStorage.setItem('cipher-auth-notice',result.message);location.assign('/admin/login');});});
}
