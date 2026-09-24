import {initStudio,confirmAction,toast,clearDirty,hasUnsavedChanges} from './admin-studio.js';
const csrf=document.querySelector('meta[name="csrf-token"]').content;
let pageLeaving=false,pendingActions=0;
async function request(url,method,body) {
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:'The server could not complete this request. Please try again.'}));
  if(!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
// Closing a tab requests a short expiry. A reload or another open admin tab's
// heartbeat renews it, so normal navigation does not sign the editor out.
addEventListener('pagehide',event=>{
  pageLeaving=true;
  if(event.persisted)return;
  navigator.sendBeacon('/api/admin/session/closing',new URLSearchParams({_csrf:csrf}));
});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

// Smooth sliding and section transitions across admin studio sections
document.querySelectorAll('.studio-tabs a[href^="#"], a[href^="#edit-"]').forEach(link => {
  link.addEventListener('click', event => {
    const targetId = link.getAttribute('href');
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    const headerHeight = document.querySelector('.site-header')?.offsetHeight || 60;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
    window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth' });
    history.replaceState(null, '', targetId);
  });
});

for(const button of document.querySelectorAll('[data-delete-mail]'))button.addEventListener('click',async()=>{
  if(!await confirmAction('Delete this email from the outbox? Queued delivery will be cancelled. Emails already sending or sent cannot be recalled.'))return;
  action(button.closest('article'),async()=>{const result=await request('/api/admin/outbox/'+button.dataset.deleteMail,'DELETE',{});saved(result.message);});
});
for(const button of document.querySelectorAll('[data-delete-image]'))button.addEventListener('click',async()=>{
  if(!await confirmAction('Remove this image from the library? Its original file is preserved.'))return;
  action(button.closest('figure'),async()=>{const result=await request('/api/admin/media','DELETE',{path:button.dataset.deleteImage});saved(result.message);});
});

const verifyMail=document.querySelector('#verify-mail');
verifyMail?.addEventListener('click',()=>{
  const panel=verifyMail.closest('.mail-health');
  action(panel,async()=>{
    const result=await request('/api/admin/mail/verify','POST',{});
    panel.querySelector('.editor-status').textContent=result.message;
    toast(result.message);
  });
});

const bulkForm=document.querySelector('#bulk-email-form');let campaignId=null;
bulkForm?.addEventListener('input',()=>{campaignId=null;document.querySelector('#bulk-preview').hidden=true;bulkForm.elements.key.value=crypto.randomUUID();});
bulkForm?.addEventListener('submit',event=>{
  event.preventDefault();action(bulkForm,async()=>{
    const result=await request('/api/admin/bulk/preview','POST',Object.fromEntries(new FormData(bulkForm)));campaignId=result.id;
    document.querySelector('#bulk-summary').textContent=`Ready to send to ${result.count} unique email address(es).`;
    document.querySelector('#bulk-addresses').replaceChildren(...result.recipients.map(email=>{const li=document.createElement('li');li.textContent=email;return li;}));
    document.querySelector('#bulk-preview').hidden=false;bulkForm.querySelector('.editor-status').textContent='Review the recipients, then confirm below.';
  });
});
document.querySelector('#send-bulk')?.addEventListener('click',()=>{
  if(!campaignId)return;
  action(bulkForm,async()=>{const result=await request(`/api/admin/bulk/${campaignId}/send`,'POST',{});saved(result.message);});
});

async function uploadPhoto(file,label){
  if(!file||file.size>3*1024*1024)throw new Error('Choose a JPG, PNG or WebP image smaller than 3 MB.');
  const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read this image.'));reader.readAsDataURL(file);});
  return request('/api/admin/media','POST',{image,label});
}
function addImageChoice(label,path){
  document.querySelectorAll('select[name="image"]').forEach(select=>{if(![...select.options].some(option=>option.value===path))select.add(new Option(label,path));});
  document.querySelectorAll('.gallery-choices').forEach(fieldset=>{
    if([...fieldset.querySelectorAll('input')].some(input=>input.value===path))return;
    const choice=document.createElement('label');choice.className='checkbox-label';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='gallery';checkbox.value=path;
    const caption=document.createElement('span');caption.textContent=label;choice.append(checkbox,caption);fieldset.append(choice);
  });
}
function showImage(form){const preview=form.querySelector('[data-image-preview]');if(!form.elements.image||!preview)return;preview.hidden=!form.elements.image.value;if(!preview.hidden)preview.src=form.elements.image.value;else preview.removeAttribute('src');}
async function attachCover(form){
  if(!form.elements.image)return;
  const input=form.querySelector('[data-image-file]'),file=input?.files[0];if(!file)return;
  const label=(form.elements.namedItem('name')?.value||form.elements.namedItem('title')?.value||file.name).trim();
  const result=await uploadPhoto(file,label);addImageChoice(label,result.path);form.elements.image.value=result.path;input.value='';showImage(form);
}
const attachedGallery=new WeakMap();
async function attachGallery(form){
  const input=form.querySelector('[data-gallery-files]');if(!input?.files.length)return;
  const files=[...input.files],already=attachedGallery.get(input)||new Map();attachedGallery.set(input,already);
  const key=file=>`${file.name}:${file.size}:${file.lastModified}`;
  if(form.querySelectorAll('[name="gallery"]:checked').length+files.filter(file=>!already.has(key(file))).length>20)throw new Error('Choose at most 20 gallery photos in total.');
  for(const file of files){
    if(already.has(key(file)))continue;
    const result=await uploadPhoto(file,file.name);addImageChoice(file.name,result.path);
    [...form.querySelectorAll('[name="gallery"]')].find(input=>input.value===result.path).checked=true;already.set(key(file),result.path);
  }
  input.value='';attachedGallery.delete(input);
  document.dispatchEvent(new CustomEvent('cipher:photos-changed'));
}
for(const form of document.querySelectorAll('.editor-form')){
  if(form.elements.image){
    form.elements.image.addEventListener('change',()=>showImage(form));
    form.querySelector('[data-remove-image]')?.addEventListener('click',()=>{form.elements.image.value='';form.querySelector('[data-image-file]').value='';showImage(form);form.querySelector('.editor-status').textContent='Image detached. Save changes to update the website.';});
    form.querySelector('[data-upload-image]')?.addEventListener('click',()=>action(form,async()=>{if(!form.querySelector('[data-image-file]').files.length)throw new Error('Choose a photo from your device first.');await attachCover(form);form.querySelector('.editor-status').textContent='Photo attached. Save and publish to show it on the website.';}));
  }
  form.querySelector('[data-upload-gallery]')?.addEventListener('click',()=>action(form,async()=>{if(!form.querySelector('[data-gallery-files]').files.length)throw new Error('Choose gallery photos from your device first.');await attachGallery(form);form.querySelector('.editor-status').textContent='Gallery photos attached. Save changes to publish them.';}));
}

// Same green glow and decoding reveal as the homepage, with stable screen-reader text.
const adminMotion=matchMedia('(prefers-reduced-motion: reduce)');
const adminHeadings=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(!entry.isIntersecting)return;adminHeadings.unobserve(entry.target);if(adminMotion.matches)return;
  const heading=entry.target,original=heading.cloneNode(true),text=heading.textContent;
  const accessible=document.createElement('span');accessible.className='sr-only';accessible.textContent=text;
  const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');heading.replaceChildren(accessible,visual);
  const started=performance.now(),alphabet='01#_*+<>?ΩΣΦ/';
  function decode(){const progress=(performance.now()-started)/780;
    if(progress>=1||adminMotion.matches){heading.replaceChildren(...original.childNodes);return;}
    visual.textContent=[...text].map((letter,i)=>letter===' '||i<progress*text.length?letter:alphabet[Math.floor(Math.random()*alphabet.length)]).join('');requestAnimationFrame(decode);
  }decode();
}),{threshold:.5});
document.querySelectorAll('.studio-heading h1,.editor-section h2').forEach(heading=>{heading.classList.add('admin-decode');adminHeadings.observe(heading);});
function saved(message,type='success') { clearDirty();sessionStorage.setItem('cipher-editor-notice',message);sessionStorage.setItem('cipher-editor-notice-type',type);location.reload(); }
const notice=sessionStorage.getItem('cipher-editor-notice');
if(notice) { const el=document.querySelector('#studio-notice');el.textContent=notice;el.hidden=false;const failed=sessionStorage.getItem('cipher-editor-notice-type')==='error';el.classList.toggle('error',failed);el.classList.toggle('success',!failed);toast(notice,failed);sessionStorage.removeItem('cipher-editor-notice');sessionStorage.removeItem('cipher-editor-notice-type'); }
async function action(container,run) {
  document.querySelector('#studio-notice').hidden=true;document.querySelector('#studio-notice').textContent='';
  const status=container.querySelector(':scope > .editor-status') || container.querySelector('.editor-status');
  const buttons=[...container.querySelectorAll('button')],prior=buttons.map(button=>button.disabled);
  buttons.forEach(button=>button.disabled=true);status.classList.remove('field-error');status.textContent='Saving…';
  pendingActions++;
  try { await run(); } catch(error) {status.textContent=error.message;status.classList.add('field-error');toast(error.message,true);}
  finally {pendingActions--;buttons.forEach((button,index)=>button.disabled=prior[index]);document.dispatchEvent(new CustomEvent('cipher:photos-changed'));}
}
for(const form of document.querySelectorAll('.decision-form'))form.addEventListener('submit',event=>{
  event.preventDefault();action(form,async()=>{
    await request(`/api/admin/submissions/${form.dataset.id}/decision`,'PATCH',{decision:form.elements.decision.value,notes:form.elements.notes?.value||'',version:Number(form.dataset.version)});
    saved(form.elements.decision.value==='selected'?'Selected member saved. Their email stays in your mailing list until you delete that member.':'Membership decision saved. You can now write a message to the candidate.');
  });
});
for(const form of document.querySelectorAll('.reply-form'))form.addEventListener('submit',event=>{
  event.preventDefault();action(form,async()=>{
    const result=await request(`/api/admin/submissions/${form.dataset.id}/reply`,'POST',Object.fromEntries(new FormData(form)));
    saved(result.message || 'Email saved. Check its status in Email history.',result.status==='failed'?'error':'success');
  });
});
for(const button of document.querySelectorAll('[data-retry-mail]'))button.addEventListener('click',async()=>{
  if(button.dataset.failed==='true'&&!await confirmAction('Check the sender mailbox first. If the previous attempt arrived, retrying could send a duplicate. Retry this email?'))return;
  action(button.closest('article'),async()=>{const result=await request('/api/admin/outbox/'+button.dataset.retryMail+'/retry','POST',{});saved(result.message || 'Email status: '+result.status,result.status==='failed'?'error':'success');});
});
document.querySelector('[data-delete-all-mail]')?.addEventListener('click',async event=>{
  const toolbar=event.currentTarget.closest('.outbox-toolbar');
  if(!await confirmAction('Delete every outgoing email record? Queued delivery will be cancelled. Messages already accepted by the mail server cannot be recalled.'))return;
  action(toolbar,async()=>{
    const result=await request('/api/admin/outbox','DELETE',{});
    saved(result.message);
  });
});
// Refresh an open inbox only when the editor has no unsaved work or active action.
const applicationNotice=document.querySelector('#application-notice');
applicationNotice?.querySelectorAll('[data-inbox-refresh]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();location.assign('/admin?inbox='+Date.now()+'#'+link.dataset.inboxRefresh);
}));
let notificationTimer,inboxUpdated=false;
async function refreshNotifications(){
  // Background admin tabs also keep their shared session alive.
  try{
    const response=await fetch('/api/admin/notifications');if(response.status===401){clearInterval(notificationTimer);if(!pageLeaving)location.replace('/admin/login');return;}if(!response.ok||pageLeaving)return;
    const data=await response.json();document.querySelector('#inbox-count').textContent=`Inbox (${data.newCount} new)`;
    if(String(data.newCount)!==applicationNotice.dataset.count||data.latest!==applicationNotice.dataset.latest){
      applicationNotice.querySelector('span').textContent=`Inbox updated: ${data.newCount} new application(s) or enquiries.`;
      applicationNotice.dataset.count=String(data.newCount);applicationNotice.dataset.latest=data.latest || '';
      inboxUpdated=true;
    }
    if(inboxUpdated&&!document.hidden&&!hasUnsavedChanges()&&!pendingActions&&!document.querySelector('dialog[open]')&&!document.activeElement?.closest('input,textarea,select,[contenteditable]')&&['#join-requests','#contact-messages'].includes(location.hash)){
      pageLeaving=true;location.reload();
    }
  }catch{/* Keep the saved inbox visible while offline. */}
}
if(applicationNotice){notificationTimer=setInterval(refreshNotifications,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNotifications();});}
for(const form of document.querySelectorAll('.editor-form')) {
  form.addEventListener('submit',event=>{
    event.preventDefault();
    action(form,async()=>{
      await attachCover(form);await attachGallery(form);
      const data=new FormData(form), body=Object.fromEntries(data);
      body.published=data.has('published');body.gallery=data.getAll('gallery');body.version=Number(form.dataset.version);
      await request(`/api/admin/${form.dataset.kind}${form.dataset.id?'/'+form.dataset.id:''}`,form.dataset.id?'PUT':'POST',body);
      saved('Content saved. Published changes are now visible on the website.');
    });
  });
  form.querySelector('[data-delete-content]')?.addEventListener('click',async()=>{
    if(!await confirmAction('Delete this item permanently? Uncheck Published and save if you only want to hide it.')) return;
    action(form,async()=>{await request(`/api/admin/${form.dataset.kind}/${form.dataset.id}`,'DELETE',{version:Number(form.dataset.version)});saved('Item deleted.');});
  });
}
for(const button of document.querySelectorAll('[data-delete-member]'))button.addEventListener('click',async()=>{
  if(!await confirmAction('Delete this selected member and their original application? Their saved contact will be removed from the mailing list and queued emails cancelled. Already-sent emails cannot be recalled.'))return;
  action(button.closest('article'),async()=>{const result=await request('/api/admin/members/'+button.dataset.deleteMember,'DELETE',{});saved(result.message);});
});
for(const button of document.querySelectorAll('[data-read-submission],[data-delete-submission]')) button.addEventListener('click',async()=>{
  const remove=Boolean(button.dataset.deleteSubmission), id=button.dataset.deleteSubmission || button.dataset.readSubmission;
  if(remove && !await confirmAction('Delete this original enquiry and its reply history? If selected, the saved member remains on the mailing list. Use Delete selected member to remove their membership.')) return;
  action(button.closest('article'),async()=>{await request('/api/admin/submissions/'+id,remove?'DELETE':'PATCH',{status:button.dataset.status||'read'});saved(remove?'Enquiry deleted. Saved selected members remain on the mailing list.':'Message status updated.');});
});
initStudio({request,action,saved,showImage});
