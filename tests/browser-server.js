import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/security.js';
import { createTestDatabase } from './mongo-fixture.js';
const fixture=await createTestDatabase();
const dir=mkdtempSync(path.join(os.tmpdir(),'cipher-browser-'));
// Local fake mail transport: browser tests never contact real recipients.
// Many simulated users share one localhost IP. Production keeps its normal limits.
const app=await createApp({db:fixture.db,dataDir:dir,baseUrl:'http://localhost:3100',production:true,limits:{login:100,submissions:100},mail:{env:{MAIL_FROM:'cipher@example.com',ADMIN_NOTIFY_EMAIL:'admin@example.com'},transport:{sendMail:async message=>({accepted:[message.to.address]})}}});
// Test-only account, created in a temporary database never used by the website.
await fixture.db.collection('admins').insertOne({username:'browser-editor',password_hash:await hashPassword('browser-test-only-password-2026')});
const server=app.listen(3100,'127.0.0.1');
function close(){server.close(async()=>{await fixture.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});}
process.on('SIGTERM',close);process.on('SIGINT',close);
