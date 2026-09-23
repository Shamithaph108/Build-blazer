import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'cipher.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS content (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, purpose TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new');
    CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, username TEXT, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media (path TEXT PRIMARY KEY, label TEXT NOT NULL);
  `);
  // Additive migrations preserve existing applications and editor changes.
  const columns=new Set(db.prepare('PRAGMA table_info(submissions)').all().map(column=>column.name));
  for(const [name,type] of [['decision',"TEXT NOT NULL DEFAULT 'pending'"],['version','INTEGER NOT NULL DEFAULT 1'],['reviewed_by','TEXT'],['reviewed_at','TEXT']]){
    if(!columns.has(name))db.exec(`ALTER TABLE submissions ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, kind TEXT NOT NULL,
    recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL,
    sent_at TEXT, error TEXT, created_by TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS outbox_submission ON outbox(submission_id);`);
  if(!db.prepare('SELECT value FROM settings WHERE key=?').get('activities-v1')){
    const reference=JSON.parse(readFileSync(new URL('../content/reference.json',import.meta.url),'utf8'));
    db.exec('BEGIN');
    try{
      reference.activities.forEach((title,index)=>{
        const id=`archive-${String(index+1).padStart(2,'0')}`;
        db.prepare('INSERT OR IGNORE INTO content(kind,id,payload) VALUES (?,?,?)').run('activities',id,JSON.stringify({id,title,description:'',image:'',order:index+1,published:true}));
      });
      db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run('activities-v1','1');db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  if (!db.prepare('SELECT value FROM settings WHERE key=?').get('seeded')) {
    const seed = JSON.parse(readFileSync(new URL('../content/seed.json', import.meta.url), 'utf8'));
    const insert = db.prepare('INSERT INTO content(kind,id,payload) VALUES (?,?,?)');
    db.exec('BEGIN');
    try {
      for (const kind of ['events','team']) for (const item of seed[kind]) insert.run(kind,item.id,JSON.stringify(item));
      if (Array.isArray(seed.domains)) {
        for (const [idx, item] of seed.domains.entries()) {
          const id = item.id || `domain-${idx + 1}`;
          insert.run('domains', id, JSON.stringify({ ...item, id, order: item.order ?? idx, published: item.published ?? true }));
        }
      }
      db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run('seeded','1');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (!db.prepare("SELECT COUNT(*) AS count FROM content WHERE kind='domains'").get().count) {
    const seed = JSON.parse(readFileSync(new URL('../content/seed.json', import.meta.url), 'utf8'));
    const insert = db.prepare('INSERT OR IGNORE INTO content(kind,id,payload) VALUES (?,?,?)');
    db.exec('BEGIN');
    try {
      const initialDomains = Array.isArray(seed.domains) && seed.domains.length ? seed.domains : [
        {id:"domain-1",icon:"code",title:"Technical Skill Building",description:"Hands-on workshops, coding sessions, and tech talks that turn theory into working software.",order:0,published:true},
        {id:"domain-2",icon:"crown",title:"Leadership & Governance",description:"Annual elections for President, Secretary, and office bearers — guided by the HOD and Faculty Coordinator.",order:1,published:true},
        {id:"domain-3",icon:"people",title:"Events & Collaboration",description:"Hackathons, seminars, and department-level competitions that bring students together.",order:2,published:true},
        {id:"domain-4",icon:"rocket",title:"Industry Readiness",description:"Bridging classroom learning with real-world application to prepare students for the field.",order:3,published:true}
      ];
      for (const [idx, item] of initialDomains.entries()) {
        const id = item.id || `domain-${idx + 1}`;
        insert.run('domains', id, JSON.stringify({ ...item, id, order: item.order ?? idx, published: item.published ?? true }));
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); }
  }
  return db;
}

export function listContent(db, kind, includeDrafts = false) {
  return db.prepare('SELECT payload,version FROM content WHERE kind=?').all(kind)
    .map(row => ({ ...JSON.parse(row.payload), version: row.version }))
    .filter(item => includeDrafts || item.published)
    .sort(kind === 'events' ? (a,b) => b.date.localeCompare(a.date) : (a,b) => a.order-b.order || (a.name || a.title).localeCompare(b.name || b.title));
}
