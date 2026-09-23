import {readFileSync} from 'node:fs';

// Persist the formerly display-only defaults before the first custom domain is added.
// Run once: edits, drafts and later deliberate deletions must survive every restart.
export async function migrateDomains(db){
  const key='domains-persisted-v1';
  if(await db.collection('settings').findOne({key}))return;
  const reference=JSON.parse(readFileSync(new URL('../content/reference.json',import.meta.url),'utf8'));
  const rows=await db.collection('content').find({kind:'domains'}).toArray();
  const existing=rows.map(row=>({id:row.id,...(typeof row.payload==='string'?JSON.parse(row.payload):row.payload)}));
  const normalize=value=>String(value||'').trim().toLowerCase();
  for(const [index,domain] of reference.domains.entries()){
    const id=`domain-${index+1}`;
    if(existing.some(item=>item.id===id||normalize(item.title)===normalize(domain.title)))continue;
    const payload={...domain,id,order:index,published:true};
    try{
      await db.collection('content').updateOne({kind:'domains',id},{$setOnInsert:{kind:'domains',id,payload:JSON.stringify(payload),version:1}},{upsert:true});
    }catch(error){if(error.code!==11000)throw error;}
  }
  await db.collection('settings').updateOne({key},{$setOnInsert:{key,value:'1'}},{upsert:true});
}
