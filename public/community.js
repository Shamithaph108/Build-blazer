(() => {
  const notices=document.querySelector('#announcements-dialog'),noticesButton=document.querySelector('[data-announcements-open]');
  if(notices){noticesButton.addEventListener('click',()=>notices.showModal());notices.querySelector('[data-announcements-close]').addEventListener('click',()=>notices.close());notices.addEventListener('close',()=>noticesButton.focus());}

  const dialog=document.querySelector('#cipher-chat');if(!dialog)return;
  const launch=document.querySelector('.cipher-chat-launch'),form=dialog.querySelector('form'),messages=dialog.querySelector('.chat-messages'),status=dialog.querySelector('[data-chat-status]');
  launch.addEventListener('click',()=>{dialog.showModal();form.elements.question.focus();});
  dialog.querySelector('[data-chat-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>launch.focus());
  function message(text,className,sources=[]){const item=document.createElement('div');item.className=className;const paragraph=document.createElement('p');paragraph.textContent=text;item.append(paragraph);for(const source of sources){const a=document.createElement('a');a.textContent=source.label;a.href=source.href;a.className='text-link';item.append(a);}messages.append(item);messages.scrollTop=messages.scrollHeight;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();const question=form.elements.question.value.trim();if(!question)return;
    message(question,'chat-question');form.reset();const button=form.querySelector('button');button.disabled=true;status.textContent='Checking published information…';
    try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name="csrf-token"]').content},body:JSON.stringify({question}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Please reload this page and try again.');message(data.answer,'chat-answer',data.sources);status.textContent='';}
    catch(error){status.textContent=error.name==='TimeoutError'?'The request took too long. Please try again.':error.message;}
    finally{button.disabled=false;form.elements.question.focus();}
  });
})();
