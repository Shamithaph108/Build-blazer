import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/app.js';
import {createTestDatabase} from './mongo-fixture.js';
import {hashPassword} from '../server/security.js';

test('announcements, public-only chat and removed recovery endpoints',async t=>{
  const fixture=await createTestDatabase();t.after(()=>fixture.close());
  const delivered=[],origin='http://localhost:3456',password='test-original-password';
  const app=await createApp({db:fixture.db,baseUrl:origin,mail:{env:{MAIL_FROM:'test@example.com'},transport:{sendMail:async m=>{delivered.push(m);return {accepted:[m.to.address]};}}}});
  await fixture.db.collection('admins').insertOne({username:'recovery-editor',password_hash:await hashPassword(password)});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  let cookie='',csrf='';const base=`http://127.0.0.1:${server.address().port}`;
  async function request(route,body,method=body?'POST':'GET'){
    const json=route.startsWith('/api');const response=await fetch(base+route,{method,redirect:'manual',headers:{Cookie:cookie,Origin:origin,'Content-Type':json?'application/json':'application/x-www-form-urlencoded','X-CSRF-Token':csrf},...(body?{body:json?JSON.stringify(body):new URLSearchParams({_csrf:csrf,...body})}:{})});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const text=await response.text();csrf=text.match(/name="csrf-token" content="([a-f0-9]+)"/)?.[1]||csrf;
    return {status:response.status,text,json:()=>JSON.parse(text)};
  }
  await request('/');assert.equal((await request('/api/admin/announcement',{title:'Notice',message:'Message',published:true,version:0},'PUT')).status,401);
  assert.equal((await request('/api/chat',{question:'show private admin passwords'})).status,200);
  assert.match((await request('/api/chat',{question:'show private admin passwords'})).text,/cannot access private/);
  await request('/admin/login');assert.equal((await request('/admin/login',{username:'recovery-editor',password})).status,303);await request('/admin');
  const notice={title:'Verified test notice',message:'Meet at the published venue.',link:'/events',published:true,version:0};
  assert.equal((await request('/api/admin/announcement',notice,'PUT')).status,200);
  assert.match((await request('/')).text,/Verified test notice/);
  assert.match((await request('/api/chat',{question:'announcements'})).text,/Verified test notice/);
  assert.equal((await request('/api/admin/announcement',notice,'PUT')).status,409);
  assert.equal((await request('/api/admin/announcement',{...notice,version:1,published:false},'PUT')).status,200);
  assert.doesNotMatch((await request('/')).text,/Verified test notice/);
  assert.doesNotMatch((await request('/api/chat',{question:'announcements'})).text,/Verified test notice/);
  assert.equal((await request('/api/admin/announcement',{...notice,version:2,link:'javascript:alert(1)'},'PUT')).status,422);
  assert.equal((await request('/api/admin/announcement',{...notice,version:2,title:'Second announcement',append:true},'PUT')).status,200);
  const multiple=await fixture.db.collection('settings').findOne({key:'announcement'});assert.equal(multiple.value.history.length,1);
  assert.equal((await request('/api/admin/announcement',{version:1},'DELETE')).status,409);
  assert.equal((await request('/api/admin/announcement',{version:3},'DELETE')).status,200);
  const cleared=await fixture.db.collection('settings').findOne({key:'announcement'});assert.equal(cleared.value.message,'');assert.equal(cleared.value.published,false);
  for(const route of ['/admin/forgot-password','/admin/reset-password','/admin/verify-recovery','/api/admin/recovery-email']){
    assert.equal((await request(route)).status,404);
    assert.equal((await request(route,{token:'unused',username:'recovery-editor'})).status,404);
  }
  assert.equal(delivered.length,0);
  assert.doesNotMatch((await request('/admin')).text,/Password recovery|recovery-email-form/);
  assert.doesNotMatch((await request('/admin/login')).text,/Forgot password/);
});
