import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { hashPassword } from '../server/security.js';
const directory=path.resolve(process.env.DATA_DIR || 'data');
const db=openDatabase(directory);
const username=(process.env.ADMIN_USERNAME || 'editor').trim().toLowerCase();
if(!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error('Use 3–80 letters, numbers, dots, underscores or hyphens for ADMIN_USERNAME.');
const password=process.env.ADMIN_PASSWORD || randomBytes(24).toString('base64url');
if(password.length<16 || password.length>256) throw new Error('Use an admin password between 16 and 256 characters.');
db.prepare('INSERT INTO admins(username,password_hash) VALUES (?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash').run(username,await hashPassword(password));
db.prepare('DELETE FROM sessions WHERE username=?').run(username);
if(!process.env.ADMIN_PASSWORD) {
  writeFileSync(path.join(directory,'admin-credentials.txt'),`CIPHER LOCAL EDITOR\nUsername: ${username}\nPassword: ${password}\n\nThis private file is gitignored. Store the password in a password manager.\nRunning npm run admin:setup again resets this password and logs out this editor.\n`,{mode:0o600});
  console.log('Editor created. Read data/admin-credentials.txt locally for the generated password.');
} else console.log('Editor password updated from the environment. Existing sessions revoked.');
db.close();
