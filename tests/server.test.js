import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/security.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { createMailService } from '../server/mail.js';
import sharp from 'sharp';
import { createTestDatabase } from './mongo-fixture.js';
import { migrateDomains } from '../server/domain-migration.js';
let fixture;

let app,server,base,cookie='',csrf='';
const directory=mkdtempSync(path.join(os.tmpdir(),'cipher-test-'));
const origin='http://localhost:3456';
const password=randomBytes(20).toString('hex');
const delivered=[];let failMail=false;
const testMail={env:{MAIL_FROM:'cipher@example.com',ADMIN_NOTIFY_EMAIL:'admin@example.com'},transport:{sendMail:async message=>{if(failMail)throw new Error('Simulated SMTP failure');delivered.push(message);return {accepted:[message.to.address]};}}};
async function get(url) {
  const response=await fetch(base+url,{headers:{Cookie:cookie},redirect:'manual'});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const text=await response.text();csrf=text.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || text.match(/name="csrf-token" content="([a-f0-9]+)"/)?.[1] || csrf;
  return {response,text};
}
async function send(url,body,method='POST',custom={}) {
  const json=url.startsWith('/api');
  const response=await fetch(base+url,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':json?'application/json':'application/x-www-form-urlencoded',...(json?{'X-CSRF-Token':csrf}:{}),...custom},body:json?JSON.stringify(body):new URLSearchParams({_csrf:csrf,...body}),redirect:'manual'});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return response;
}
before(async()=>{fixture=await createTestDatabase();app=await createApp({db:fixture.db,dataDir:directory,baseUrl:origin,mail:testMail});await fixture.db.collection('admins').insertOne({username:'test-editor',password_hash:await hashPassword(password)});server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(fixture)await fixture.close();rmSync(directory,{recursive:true,force:true});});

test('public pages render useful HTML, SEO, navigation and security headers',async()=>{
  for(const url of ['/','/about','/events','/team','/join','/contact']){const {response,text}=await get(url);assert.equal(response.status,200,url);assert.match(text,/<h1[ >]/);assert.match(text,/name="description"/);assert.match(text,/rel="canonical"/);assert.match(response.headers.get('content-security-policy'),/object-src 'none'/);assert.match(text,/Skip to content/);}
  assert.equal((await get('/missing')).response.status,404);
});

test('domain migration retains existing edits and custom domains, and does not restore deliberately deleted records',async()=>{
  const isolated=await createTestDatabase();
  try{
    const edited={id:'domain-1',title:'Approved existing domain',description:'An edited domain that must be retained.',icon:'code',order:8,published:false};
    const custom={id:'custom-domain',title:'Student innovation',description:'A custom domain added before the migration.',icon:'rocket',order:9,published:true};
    await isolated.db.collection('content').insertMany([edited,custom].map(item=>({kind:'domains',id:item.id,payload:JSON.stringify(item),version:4})));
    await migrateDomains(isolated.db);
    assert.equal(await isolated.db.collection('content').countDocuments({kind:'domains'}),5);
    for(const item of [edited,custom]){const row=await isolated.db.collection('content').findOne({kind:'domains',id:item.id});assert.deepEqual(JSON.parse(row.payload),item);assert.equal(row.version,4);}
    await isolated.db.collection('content').deleteOne({kind:'domains',id:'domain-2'});
    await migrateDomains(isolated.db);assert.equal(await isolated.db.collection('content').countDocuments({kind:'domains'}),4);
    assert.equal(await isolated.db.collection('content').findOne({kind:'domains',id:'domain-2'}),null);
  }finally{await isolated.close();}
});
test('contact form rejects invalid, forged and malicious submissions; saves valid messages privately',async()=>{
  await get('/join');
  const valid={name:'Test Student',email:'student@example.com',purpose:'join',message:'I would like to join the coding community.',consent:'yes'};
  assert.equal((await send('/join',valid,'POST',{Origin:'https://attacker.example'})).status,403);
  assert.equal((await send('/join',{...valid,_csrf:'invalid'})).status,403);
  assert.equal((await send('/join',{...valid,email:'not-an-email',message:'<script>alert(1)</script>'})).status,422);
  assert.equal((await send('/join',{...valid,consent:''})).status,422);
  assert.equal((await send('/join',valid)).status,303);
  const row=await fixture.db.collection('submissions').findOne({});assert.equal(row.email,valid.email);
  assert.equal((await get('/data/cipher.sqlite')).response.status,404);
  assert.equal((await get('/.env')).response.status,404);
  assert.equal((await get('/admin')).response.status,302);
  assert.equal((await send('/api/admin/team',{name:'Intruder'})).status,401);
});
test('video dialog endpoint rejects invalid input and persists a real enquiry',async()=>{
  await get('/');
  const body={name:'Video Student',email:'video@example.com',message:'I would like to participate in the association.',purpose:'join',consent:'yes'};
  assert.equal((await send('/api/submissions',body,'POST',{'X-CSRF-Token':'invalid'})).status,403);
  assert.equal((await send('/api/submissions',{...body,email:'invalid'})).status,422);
  const result=await send('/api/submissions',body);assert.equal(result.status,201);assert.equal((await result.json()).ok,true);
  assert.equal((await fixture.db.collection('submissions').findOne({email:body.email})).name,body.name);
});
test('editor login rotates session and allows validated persistent event and team CRUD',async()=>{
  await get('/admin/login');const beforeCookie=cookie;
  assert.equal((await send('/admin/login',{username:'test-editor',password:'wrong-password'})).status,401);
  assert.equal((await send('/admin/login',{username:'test-editor',password})).status,303);assert.notEqual(cookie,beforeCookie);
  const {text}=await get('/admin');assert.match(text,/student@example.com/);assert.match(text,/noindex,nofollow/);
  const event={title:'Verified Test Event',category:'Workshop',date:'2026-10-03',location:'Test venue',summary:'A test event for checking persistence.',description:'Verified event information for integration testing.',source:'Test fixture',image:'/images/promptops-01.webp',gallery:[],published:false};
  assert.equal((await send('/api/admin/events',{...event,date:'2026-02-31'})).status,422);
  assert.equal((await send('/api/admin/events',{...event,image:'https://untrusted.example/image.jpg'})).status,422);
  const created=await send('/api/admin/events',event);assert.equal(created.status,200);const {id}=await created.json();
  assert.ok(!(await (await fetch(base+'/api/events')).json()).some(e=>e.id===id));
  const updated=await send('/api/admin/events/'+id,{...event,published:true,version:1},'PUT');assert.equal(updated.status,200);
  assert.ok((await (await fetch(base+'/api/events')).json()).some(e=>e.id===id));
  assert.equal((await send('/api/admin/events/'+id,{...event,version:1},'PUT')).status,409);
  assert.equal((await get('/events/'+id)).response.status,200);
  const member={name:'Test Member',role:'Volunteer',bio:'Test biography.',order:8,image:'',published:true};
  const memberResult=await send('/api/admin/team',member);assert.equal(memberResult.status,200);const memberId=(await memberResult.json()).id;
  assert.match((await get('/team')).text,/Test Member/);
  assert.equal((await send('/api/admin/team/'+memberId,{version:1},'DELETE')).status,200);
  const oldDomains=await fixture.db.collection('content').find({kind:'domains'}).sort({id:1}).toArray();assert.equal(oldDomains.length,4);
  const domainItem={title:'Test Domain',description:'Domain description for test.',icon:'code',order:4,published:true};
  const domainCreated=await send('/api/admin/domains',domainItem);assert.equal(domainCreated.status,200);
  const domainId=(await domainCreated.json()).id;
  assert.equal(await fixture.db.collection('content').countDocuments({kind:'domains'}),5);
  assert.deepEqual(await fixture.db.collection('content').find({kind:'domains',id:{$ne:domainId}}).sort({id:1}).toArray(),oldDomains);
  for(const route of ['/','/about']){const html=(await get(route)).text;for(const row of oldDomains)assert.ok(html.includes(JSON.parse(row.payload).title.replaceAll('&','&amp;')));assert.match(html,/Test Domain/);}
  assert.match((await get('/')).text,/Test Domain/);
  assert.equal((await send('/api/admin/domains/'+domainId,{...domainItem,title:'Updated Domain',version:1},'PUT')).status,200);
  assert.match((await get('/')).text,/Updated Domain/);
  assert.equal((await send('/api/admin/domains/'+domainId,{version:2},'DELETE')).status,200);
  assert.equal((await send('/api/admin/events/'+id,{version:2},'DELETE')).status,200);
  assert.equal((await get('/events/'+id)).response.status,404);
  const submission=await fixture.db.collection('submissions').findOne({});
  assert.equal((await send('/api/admin/submissions/'+submission.id,{status:'read'},'PATCH')).status,200);
  assert.equal((await fixture.db.collection('submissions').findOne({id:submission.id})).status,'read');
  assert.equal((await send('/api/admin/media',{image:'data:image/jpeg;base64,aGVsbG8=',label:'Invalid'})).status,422);
  const photo=await sharp({create:{width:32,height:32,channels:3,background:'#40ff83'}}).png().toBuffer();
  const uploaded=await send('/api/admin/media',{image:'data:image/png;base64,'+photo.toString('base64'),label:'Test image'});
  assert.equal(uploaded.status,200);const uploadPath=(await uploaded.json()).path;
  assert.match(uploadPath,/^\/uploads\/[a-f0-9-]+\.webp$/);
  const downloaded=await fetch(base+uploadPath);assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-type'),/image\/webp/);
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>').toString('base64');
  assert.equal((await send('/api/admin/media',{image:'data:image/png;base64,'+svg,label:'Disguised SVG'})).status,422);
  assert.equal((await send('/api/admin/submissions/'+submission.id,{},'DELETE')).status,200);
  assert.equal((await send('/admin/logout',{})).status,303);
  assert.equal((await get('/admin')).response.status,302);
});
test('database edits survive reopening the application',async()=>{
  const event=await fixture.db.collection('content').findOne({id:'prompt-ops-2026'});
  await fixture.db.collection('content').updateOne({id:event.id},{$set:{payload:JSON.stringify({...JSON.parse(event.payload),title:'Persisted event title'})}});
  const second=await createApp({db:fixture.db,dataDir:directory,baseUrl:origin,mail:{env:{}}});
  assert.match((await second.locals.db.collection('content').findOne({id:event.id})).payload,/Persisted event title/);
});

test('membership review, private notifications and idempotent email replies',async()=>{
  await get('/admin/login');
  assert.equal((await get('/api/admin/notifications')).response.status,401);
  const candidate=await fixture.db.collection('submissions').findOne({});
  assert.equal((await send(`/api/admin/submissions/${candidate.id}/reply`,{})).status,401);
  await send('/admin/login',{username:'test-editor',password});await get('/admin');
  const verified=await send('/api/admin/mail/verify',{});assert.equal(verified.status,200);assert.equal((await verified.json()).ok,true);
  const notification=await fixture.db.collection('outbox').findOne({submission_id:candidate.id,kind:'notification'});
  assert.ok(notification);assert.equal(notification.status,'queued');
  await app.locals.mail.flush();assert.equal(delivered.at(-1).to.address,'admin@example.com');
  assert.match(delivered.at(-1).text,/\/admin#inbox/);
  assert.ok(JSON.parse((await get('/api/admin/notifications')).text).newCount>0);
  const endpoint=`/api/admin/submissions/${candidate.id}/decision`;
  assert.equal((await send(endpoint,{decision:'selected',version:1},'PATCH',{Origin:'https://attacker.example'})).status,403);
  assert.equal((await send(endpoint,{decision:'owner',version:1},'PATCH')).status,422);
  assert.equal((await send(endpoint,{decision:'selected',version:1},'PATCH')).status,200);
  assert.equal((await send(endpoint,{decision:'declined',version:1},'PATCH')).status,409);
  const reviewed=await fixture.db.collection('submissions').findOne({id:candidate.id});
  assert.equal(reviewed.decision,'selected');assert.equal(reviewed.reviewed_by,'test-editor');assert.equal(reviewed.status,'read');
  const reply={key:randomUUID(),subject:'Welcome to CIPHER',message:'You have been selected. Please meet the coordinator.'};
  const replyUrl=`/api/admin/submissions/${candidate.id}/reply`;
  assert.equal((await send(replyUrl,{...reply,subject:'bad\r\nBcc:other@example.com'})).status,422);
  let result=await send(replyUrl,{...reply,recipient:'attacker@example.com'});assert.equal((await result.json()).status,'accepted');
  assert.equal(delivered.at(-1).to.address,candidate.email);assert.equal(delivered.at(-1).text,reply.message);
  const count=delivered.length;await send(replyUrl,reply);assert.equal(delivered.length,count);
  assert.equal((await send(replyUrl,{...reply,message:'Changed message'})).status,409);
  failMail=true;
  const failed={...reply,key:randomUUID()};result=await send(replyUrl,failed);assert.equal((await result.json()).status,'failed');
  failMail=false;result=await send('/api/admin/outbox/reply-'+failed.key+'/retry',{});assert.equal((await result.json()).status,'accepted');
  const offline=createMailService(app.locals.db,{env:{}}),offlineId='reply-'+randomUUID();
  await offline.queue({id:offlineId,submissionId:candidate.id,kind:'reply',recipient:candidate.email,subject:'Offline message',body:'Saved until configured.'});
  assert.equal((await offline.send(offlineId)).status,'queued');assert.equal(offline.configured,false);
  // Deletion removes the candidate's queued mail and reply history together.
  assert.equal((await send('/api/admin/submissions/'+candidate.id,{},'DELETE')).status,200);
  assert.equal(await fixture.db.collection('outbox').countDocuments({submission_id:candidate.id}),0);
  assert.equal((await fixture.db.collection('members').findOne({id:candidate.id})).email,candidate.email);
  assert.equal((await send('/api/admin/members/'+candidate.id,{},'DELETE')).status,200);
});

test('existing activities can be edited, new activities published, with drafts and stale updates protected',async()=>{
  const original=(await (await fetch(base+'/api/activities')).json())[0];assert.equal(original.title,'Applied Machine Learning');
  assert.equal((await send('/api/admin/activities/'+original.id,{...original,title:'Machine Learning Lab',description:'Approved practical session details.'},'PUT')).status,200);
  assert.match((await get('/')).text,/Approved practical session details/);
  assert.equal((await send('/api/admin/activities/'+original.id,original,'PUT')).status,409);
  const draft={title:'New activity',description:'Confirmed information.',order:20,published:false,image:''};
  assert.equal((await send('/api/admin/activities',{...draft,description:'<script>bad</script>'})).status,422);
  const created=await send('/api/admin/activities',draft),id=(await created.json()).id;
  assert.ok(!(await (await fetch(base+'/api/activities')).json()).some(item=>item.id===id));
  await send('/api/admin/activities/'+id,{...draft,published:true,version:1},'PUT');
  assert.match((await get('/')).text,/New activity/);
  const reopened=await createApp({db:fixture.db,dataDir:directory,baseUrl:origin,mail:{env:{}}});
  assert.match((await reopened.locals.db.collection('content').findOne({kind:'activities',id:original.id})).payload,/Machine Learning Lab/);
  assert.equal((await send('/api/admin/activities/'+id,{version:2},'DELETE')).status,200);
  await send('/admin/logout',{});await get('/');assert.equal((await send('/api/admin/activities',draft)).status,401);
});

test('bulk mail previews all or selected MongoDB recipients, deduplicates and sends once',async()=>{
  assert.equal((await send('/api/admin/bulk/preview',{})).status,401);
  await get('/admin/login');const login=await send('/admin/login',{username:'test-editor',password});
  assert.doesNotMatch(login.headers.get('set-cookie'),/Max-Age|Expires=/i);await get('/admin');
  const baseRecord={name:'Database Member',purpose:'join',message:'I would like to join the club.',status:'read',version:1,created_at:new Date().toISOString()};
  await fixture.db.collection('submissions').insertMany([
    {...baseRecord,id:randomUUID(),email:'member@example.com',decision:'selected'},
    {...baseRecord,id:randomUUID(),email:'MEMBER@example.com',decision:'selected'},
    {...baseRecord,id:randomUUID(),email:'pending@example.com',decision:'pending'}
  ]);
  const body={key:randomUUID(),subject:'Club meeting',message:'Please join our next club meeting.',audience:'all'};
  let result=await send('/api/admin/bulk/preview',body);const preview=await result.json();assert.equal(preview.count,2);
  assert.equal(await fixture.db.collection('outbox').countDocuments({campaign_id:body.key}),0);
  result=await send('/api/admin/bulk/preview',{...body,key:randomUUID(),audience:'selected'});assert.equal((await result.json()).count,1);
  const before=delivered.length;result=await send('/api/admin/bulk/'+body.key+'/send',{});assert.equal(result.status,200);
  assert.equal(delivered.length-before,0);await app.locals.mail.flush();assert.equal(delivered.length-before,2);
  for(const message of delivered.slice(before)){assert.equal(typeof message.to.address,'string');assert.equal(message.bcc,undefined);}
  await send('/api/admin/bulk/'+body.key+'/send',{});await app.locals.mail.flush();assert.equal(delivered.length-before,2);
});

test('every email status can be removed, cancelled mail stays cancelled even during SMTP completion',async()=>{
  for(const status of ['queued','sending','accepted','failed']){
    const id='delete-'+randomUUID();await app.locals.mail.queue({id,submissionId:'fixture',kind:'reply',recipient:'member@example.com',subject:'Delete fixture',body:'Test email.',status});
    assert.equal((await send('/api/admin/outbox/'+id,{},'DELETE',{'X-CSRF-Token':'wrong'})).status,403);
    assert.equal((await send('/api/admin/outbox/'+id,{},'DELETE')).status,200);
    const row=await fixture.db.collection('outbox').findOne({id});assert.equal(row.status,'cancelled');assert.equal(row.recipient,undefined);
    await app.locals.mail.queue({id,submissionId:'fixture',kind:'reply',recipient:'member@example.com',subject:'Should not return',body:'Duplicate request.'});
    assert.equal((await fixture.db.collection('outbox').findOne({id})).status,'cancelled');
  }
  let release,started;
  const began=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  const service=createMailService(fixture.db,{env:testMail.env,transport:{sendMail:async()=>{started();await gate;return {accepted:['member@example.com']};}}});
  const id='inflight-'+randomUUID();await service.queue({id,submissionId:'fixture',kind:'reply',recipient:'member@example.com',subject:'In flight',body:'Test mail.'});
  const sending=service.send(id);await began;await send('/api/admin/outbox/'+id,{},'DELETE');release();await sending;
  assert.equal((await fixture.db.collection('outbox').findOne({id})).status,'cancelled');
  assert.doesNotMatch((await get('/admin')).text,/data-mail-id="inflight-/);
});

test('selected contacts persist independently of enquiries and mail, survive restarts and join every bulk audience until explicitly deleted',async()=>{
  const candidate={id:randomUUID(),name:'Permanent Membership Student',email:'permanent@example.com',purpose:'join',message:'Please save my membership contact for club updates.',created_at:'2020-01-01T00:00:00.000Z',status:'new',decision:'pending',version:1};
  await fixture.db.collection('submissions').insertOne(candidate);
  assert.equal((await send('/api/admin/submissions/'+candidate.id+'/decision',{decision:'selected',version:1},'PATCH')).status,200);
  assert.equal((await fixture.db.collection('members').findOne({id:candidate.id})).email,candidate.email);
  const preview=audience=>({key:randomUUID(),subject:'Saved membership update',message:'A private update for the saved contacts.',audience});
  const first=preview('all');assert.equal((await send('/api/admin/bulk/preview',first)).status,200);
  const deliveredBeforeFirst=delivered.length;await send('/api/admin/bulk/'+first.key+'/send',{});
  const queued=await fixture.db.collection('outbox').findOne({campaign_id:first.key,recipient:candidate.email});assert.equal(queued.member_id,candidate.id);
  await send('/api/admin/submissions/'+candidate.id,{},'DELETE');
  await app.locals.mail.flush();assert.ok(delivered.slice(deliveredBeforeFirst).some(mail=>mail.to.address===candidate.email));
  assert.equal((await fixture.db.collection('outbox').findOne({id:queued.id})).status,'accepted');
  assert.equal((await fixture.db.collection('members').findOne({id:candidate.id})).email,candidate.email);
  const before=delivered.length;await app.locals.mail.flush();assert.equal(delivered.length,before);
  await send('/api/admin/outbox/'+queued.id,{},'DELETE');
  const restarted=await createApp({db:fixture.db,dataDir:directory,baseUrl:origin,mail:{env:{}}});
  assert.equal((await restarted.locals.db.collection('members').findOne({id:candidate.id})).email,candidate.email);
  assert.ok((await fixture.db.collection('members').indexes()).every(index=>index.expireAfterSeconds===undefined));
  for(const audience of ['all','selected']){const response=await send('/api/admin/bulk/preview',preview(audience));assert.ok((await response.json()).recipients.includes(candidate.email));}
  assert.doesNotMatch((await get('/team')).text,/permanent@example.com/);
  const pending=preview('all'),oldPreview=preview('selected');
  await send('/api/admin/bulk/preview',pending);await send('/api/admin/bulk/'+pending.key+'/send',{});await send('/api/admin/bulk/preview',oldPreview);
  assert.equal((await send('/api/admin/members/'+candidate.id,{},'DELETE',{'X-CSRF-Token':'invalid'})).status,403);
  assert.equal((await send('/api/admin/members/'+candidate.id,{},'DELETE')).status,200);
  const tombstone=await fixture.db.collection('members').findOne({id:candidate.id});assert.ok(tombstone.deleted_at);assert.equal(tombstone.email,undefined);
  const count=delivered.length;await app.locals.mail.flush();assert.ok(!delivered.slice(count).some(mail=>mail.to.address===candidate.email));
  await send('/api/admin/bulk/'+oldPreview.key+'/send',{});assert.equal(await fixture.db.collection('outbox').countDocuments({campaign_id:oldPreview.key,recipient:candidate.email}),0);
  await createApp({db:fixture.db,dataDir:directory,baseUrl:origin,mail:{env:{}}});
  const next=await send('/api/admin/bulk/preview',preview('all'));assert.ok(!(await next.json()).recipients.includes(candidate.email));
});

test('published member image appears on Home and Team; member and unused image can be removed',async()=>{
  const uploaded=await fixture.db.collection('media').findOne({});assert.ok(uploaded);
  const member={name:'Photo Upload Member',role:'Volunteer',bio:'Approved club volunteer.',order:30,image:uploaded.path,published:true};
  const created=await send('/api/admin/team',member),id=(await created.json()).id;
  for(const route of ['/','/team']){const {text}=await get(route);assert.match(text,/Photo Upload Member/);assert.ok(text.includes(uploaded.path));}
  assert.equal((await send('/api/admin/media',{path:uploaded.path},'DELETE')).status,409);
  assert.equal((await send('/api/admin/team/'+id,{version:1},'DELETE')).status,200);
  assert.doesNotMatch((await get('/team')).text,/Photo Upload Member/);
  assert.equal((await send('/api/admin/media',{path:uploaded.path},'DELETE')).status,200);
  assert.ok(await fixture.db.collection('removed_media').findOne({path:uploaded.path}));
  assert.equal((await send('/api/admin/team',member)).status,422);
});

test('closing the admin app schedules logout, navigation renews it, expired sessions cannot edit',async()=>{
  assert.equal((await send('/api/admin/session/closing',{})).status,204);
  let session=await fixture.db.collection('sessions').findOne({username:'test-editor'});assert.equal(session.closing,true);assert.ok(session.expires-Date.now()<=30000);
  assert.equal((await get('/admin')).response.status,200);session=await fixture.db.collection('sessions').findOne({username:'test-editor'});assert.equal(session.closing,false);
  await send('/api/admin/session/closing',{});
  await fixture.db.collection('sessions').updateMany({username:'test-editor'},{$set:{expires:Date.now()-1}});
  assert.equal((await get('/admin')).response.status,302);
  await get('/admin/login');
  assert.equal((await send('/api/admin/outbox/any',{},'DELETE')).status,401);
});

test('studio overview uses database values, settings persist with validation, and private routes require authentication',async()=>{
  assert.equal((await get('/admin/events/prompt-ops-2026/preview')).response.status,302);
  assert.equal((await get('/admin/unknown')).response.status,302);
  assert.equal((await get('/api/admin/overview')).response.status,401);
  await send('/admin/login',{username:'test-editor',password});await get('/admin');
  const overview=JSON.parse((await get('/api/admin/overview')).text);
  assert.equal(overview.events,await fixture.db.collection('content').countDocuments({kind:'events'}));
  assert.equal(overview.team,await fixture.db.collection('content').countDocuments({kind:'team'}));
  const settings={version:0,tagline:'An approved student community tagline.',contactEmail:'office@example.com',address:'Approved campus address',github:'https://github.com/cipher-example',linkedin:'',instagram:'',participants:'',participantsSource:''};
  assert.equal((await send('/api/admin/settings',{...settings,github:'javascript:alert(1)'},'PUT')).status,422);
  assert.equal((await send('/api/admin/settings',{...settings,participants:200},'PUT')).status,422);
  assert.equal((await send('/api/admin/settings',settings,'PUT')).status,200);
  assert.equal((await send('/api/admin/settings',settings,'PUT')).status,409);
  assert.match((await get('/')).text,/An approved student community tagline/);
  assert.match((await get('/contact')).text,/office@example.com/);
  assert.equal((await fixture.db.collection('settings').findOne({key:'website'})).value.participants,null);
  assert.ok(await fixture.db.collection('admin_activity').findOne({path:'/api/admin/settings',actor:'test-editor'}));
});

test('event times, statuses, ordered photos and profile fields survive edits; private notes and contact states remain private',async()=>{
  const row=await fixture.db.collection('content').findOne({kind:'events'}),event=JSON.parse(row.payload);
  const gallery=['/images/promptops-03.webp','/images/promptops-01.webp','/images/promptops-02.webp'];
  assert.equal((await send('/api/admin/events/'+row.id,{...event,gallery,image:gallery[1],time:'15:30',eventStatus:'postponed',version:row.version},'PUT')).status,200);
  let updated=await fixture.db.collection('content').findOne({kind:'events',id:row.id}),value=JSON.parse(updated.payload);
  assert.deepEqual(value.gallery,gallery);assert.equal(value.image,gallery[1]);assert.equal(value.time,'15:30');
  assert.equal((await get('/admin/events/'+row.id+'/preview')).response.status,200);
  assert.equal((await send('/api/admin/events/'+row.id,{...event,gallery,time:'29:66',version:updated.version},'PUT')).status,422);
  assert.equal((await send('/api/admin/events/'+row.id,{...event,gallery,version:updated.version},'PUT')).status,200);
  value=JSON.parse((await fixture.db.collection('content').findOne({kind:'events',id:row.id})).payload);assert.equal(value.time,'15:30');assert.equal(value.eventStatus,'postponed');
  const profile={name:'Approved Test Leader',role:'Coordinator',bio:'A verified member profile used in isolated testing.',department:'Computer Science',github:'https://github.com/example',linkedin:'https://www.linkedin.com/in/example',website:'',order:9,image:'',published:true};
  assert.equal((await send('/api/admin/team',{...profile,github:'javascript:alert(1)'})).status,422);
  const member=await send('/api/admin/team',profile);assert.equal(member.status,200);assert.match((await get('/team')).text,/https:\/\/github.com\/example/);
  const id=randomUUID();await fixture.db.collection('submissions').insertOne({id,name:'Private Applicant',email:'private@example.com',purpose:'join',message:'This application is private.',created_at:new Date().toISOString(),decision:'pending',status:'new',version:1});
  assert.equal((await send('/api/admin/submissions/'+id+'/decision',{decision:'reviewed',notes:'Private review notes ABC987',version:1},'PATCH')).status,200);
  assert.equal((await fixture.db.collection('submissions').findOne({id})).notes,'Private review notes ABC987');
  assert.doesNotMatch((await get('/')).text,/Private review notes ABC987|private@example.com/);
  assert.equal((await send('/api/admin/submissions/'+id+'/decision',{decision:'declined',notes:'Private note',version:2},'PATCH')).status,200);
  const contactId=randomUUID();await fixture.db.collection('submissions').insertOne({id:contactId,name:'Private Contact',email:'contact-private@example.com',purpose:'contact',message:'A private contact message.',created_at:new Date().toISOString(),status:'new',version:1});
  for(const [index,status] of ['read','new','archived'].entries())assert.equal((await send('/api/admin/submissions/'+contactId,{status,version:index+1},'PATCH')).status,200);
  assert.equal((await fixture.db.collection('submissions').findOne({id:contactId})).status,'archived');
  assert.doesNotMatch((await get('/contact')).text,/contact-private@example.com/);
});

test('password changes require the current password, revoke every session and never expose hashes',async()=>{
  const newPassword=randomBytes(24).toString('hex');
  assert.equal((await send('/api/admin/password',{currentPassword:'wrong',newPassword,confirmPassword:newPassword})).status,403);
  assert.equal((await send('/api/admin/password',{currentPassword:password,newPassword:'short',confirmPassword:'short'})).status,422);
  assert.equal((await send('/api/admin/password',{currentPassword:password,newPassword,confirmPassword:newPassword})).status,200);
  assert.equal(await fixture.db.collection('sessions').countDocuments({username:'test-editor'}),0);
  assert.equal((await get('/api/admin/overview')).response.status,401);
  await get('/admin/login');assert.equal((await send('/admin/login',{username:'test-editor',password})).status,401);
  assert.equal((await send('/admin/login',{username:'test-editor',password:newPassword})).status,303);
  const page=await get('/admin');assert.doesNotMatch(page.text,/password_hash/);assert.ok(!page.text.includes(newPassword));
  await send('/admin/logout',{});
});
