import { DatabaseSync } from 'node:sqlite';
import { connectMongo, closeMongo } from '../server/mongo.js';

const sqlite = new DatabaseSync('data/cipher.sqlite', {
  readOnly: true
});

const mongo = await connectMongo();

async function migrateTable(table, collection, transform = row => row) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();

  if (!rows.length) {
    console.log(`${table}: 0 records`);
    return;
  }

  const documents = rows.map(transform);

  await mongo.collection(collection).deleteMany({});
  await mongo.collection(collection).insertMany(documents);

  console.log(`${table}: ${documents.length} migrated`);
}

try {
  await migrateTable('content', 'content', row => ({
    kind: row.kind,
    id: row.id,
    payload: row.payload,
    version: row.version
  }));

  await migrateTable('submissions', 'submissions');

  await migrateTable('admins', 'admins');

  await migrateTable('settings', 'settings');

  await migrateTable('media', 'media');

  await migrateTable('outbox', 'outbox');

  // Existing browser sessions are intentionally not migrated.
  // Everyone will sign in again after the MongoDB switch.
  await mongo.collection('sessions').deleteMany({});

  console.log('sessions: skipped (fresh login required)');
  console.log('Migration complete.');
} finally {
  sqlite.close();
  await closeMongo();
}