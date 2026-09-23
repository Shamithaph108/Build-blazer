import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Tests always use a fresh, local database, never MONGO_URI or the live cipher DB.
export async function createTestDatabase(){
  const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await client.connect();
  const name='cipher_test_'+randomUUID().replaceAll('-',''),db=client.db(name);
  for(const [collection,key] of [['outbox','id'],['bulk_campaigns','id'],['sessions','token_hash'],['admins','username'],['submissions','id'],['settings','key'],['removed_media','path']])await db.collection(collection).createIndex({[key]:1},{unique:true});
  await db.collection('content').createIndex({kind:1,id:1},{unique:true});
  const seed=JSON.parse(readFileSync(new URL('../content/seed.json',import.meta.url),'utf8'));
  const reference=JSON.parse(readFileSync(new URL('../content/reference.json',import.meta.url),'utf8'));
  for(const kind of ['events','team'])await db.collection('content').insertMany(seed[kind].map(item=>({kind,id:item.id,payload:JSON.stringify(item),version:1})));
  await db.collection('content').insertMany(reference.activities.map((title,index)=>{const id='archive-'+String(index+1).padStart(2,'0');return {kind:'activities',id,version:1,payload:JSON.stringify({id,title,description:'',order:index+1,image:'',published:true})};}));
  return {db,async close(){if(!/^cipher_test_[a-f0-9]{32}$/.test(name))throw new Error('Unsafe test database name');await db.dropDatabase();await client.close();}};
}
