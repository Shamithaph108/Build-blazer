import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';

if (process.env.MIGRATION_CONFIRM !== 'COPY_CIPHER_DATA') {
  throw new Error(
    'Set MIGRATION_CONFIRM=COPY_CIPHER_DATA to copy the local CIPHER records.'
  );
}

const sourceUri =
  process.env.SOURCE_MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017';
const targetUri =
  process.env.TARGET_MONGODB_URI ||
  process.env.MONGODB_URI;

if (!targetUri) {
  throw new Error(
    'Set TARGET_MONGODB_URI or MONGODB_URI to the production MongoDB connection.'
  );
}

if (sourceUri === targetUri) {
  throw new Error(
    'Source and target MongoDB connections must be different.'
  );
}

const source = new MongoClient(sourceUri);
const target = new MongoClient(targetUri);
const sourceName =
  process.env.SOURCE_MONGO_DB_NAME ||
  process.env.MONGO_DB_NAME ||
  'cipher';
const targetName =
  process.env.TARGET_MONGO_DB_NAME ||
  process.env.MONGO_DB_NAME ||
  'cipher';
const dataDir = path.resolve(
  process.env.DATA_DIR || 'data'
);

const collections = new Map([
  ['admins', row => ({ username: row.username })],
  ['content', row => ({ kind: row.kind, id: row.id })],
  ['settings', row => ({ key: row.key })],
  ['submissions', row => ({ id: row.id })],
  ['members', row => ({ id: row.id })],
  ['media', row => ({ path: row.path })],
  ['removed_media', row => ({ path: row.path })],
  ['outbox', row => ({ id: row.id })],
  ['bulk_campaigns', row => ({ id: row.id })],
  ['admin_activity', row => ({ _id: row._id })]
]);

await Promise.all([source.connect(), target.connect()]);

try {
  const sourceDb = source.db(sourceName);
  const targetDb = target.db(targetName);

  for (const [name, identity] of collections) {
    const rows = await sourceDb
      .collection(name)
      .find({})
      .toArray();

    let copied = 0;
    for (const stored of rows) {
      const row = { ...stored };

      if (
        name === 'media' &&
        !row.data &&
        typeof row.path === 'string' &&
        row.path.startsWith('/uploads/')
      ) {
        try {
          row.data = await readFile(
            path.join(
              dataDir,
              'uploads',
              path.basename(row.path)
            )
          );
          row.mime = 'image/webp';
        } catch {
          console.warn(
            `Skipped missing upload bytes for ${row.path}.`
          );
        }
      }

      const filter = identity(row);
      delete row._id;
      await targetDb
        .collection(name)
        .replaceOne(filter, row, { upsert: true });
      copied += 1;
    }

    console.log(`${name}: ${copied} record(s) copied`);
  }
} finally {
  await Promise.all([source.close(), target.close()]);
}
