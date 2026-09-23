// Apply revised reference defaults only to untouched, version-1 starter records.
// Edited club content and all submissions/accounts are preserved.
import { readFileSync } from 'node:fs';
const originalSummaries={
  'prompt-ops-2026':'Ideas into prompts. Prompts into possibilities. A hands-on competition exploring AI, creative thinking, and problem-solving.',
  'lumiere-2025':'Where Glam Meets Glow. A branch-entry celebration welcoming students into the Computer Science and Engineering community.'
};
export function migrateReference(db){
  migratePortraitProfiles(db);
  if(db.prepare('SELECT value FROM settings WHERE key=?').get('reference-presentation-v2'))return;
  const seed=JSON.parse(readFileSync(new URL('../content/seed.json',import.meta.url),'utf8'));
  db.exec('BEGIN');
  try{
    for(const event of seed.events){
      const row=db.prepare('SELECT payload,version FROM content WHERE kind=? AND id=?').get('events',event.id);
      if(!row||row.version!==1)continue;
      const current=JSON.parse(row.payload);
      if(current.summary!==originalSummaries[event.id])continue;
      const updated={...current,summary:event.summary,image:event.image,gallery:event.gallery,source:event.source};
      db.prepare('UPDATE content SET payload=?,version=version+1 WHERE kind=? AND id=? AND version=1').run(JSON.stringify(updated),'events',event.id);
    }
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run('reference-presentation-v2','1');db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}

// Add newly supplied people once, without replacing editor changes or restoring
// deliberately deleted profiles on later restarts.
function migratePortraitProfiles(db){
  const key='cipher-portraits-v1';
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(key))return;
  const seed=JSON.parse(readFileSync(new URL('../content/seed.json',import.meta.url),'utf8'));
  const ids=new Set(['chaitra-rm','himansh-ullal','parthipan-j','ruben-saldana','shamitha-kv']);
  db.exec('BEGIN');
  try{
    for(const member of seed.team.filter(member=>ids.has(member.id))){
      db.prepare('INSERT OR IGNORE INTO content(kind,id,payload) VALUES (?,?,?)').run('team',member.id,JSON.stringify(member));
    }
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(key,'1');
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
