import { MongoClient } from 'mongodb';
import { attachDatabasePool } from '@vercel/functions';

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017';

const DB_NAME =
  process.env.MONGO_DB_NAME || 'cipher';

let client;
let db;

export async function connectMongo() {
  if (db) return db;

  client = new MongoClient(MONGO_URI, {
    maxIdleTimeMS: process.env.VERCEL ? 5000 : 0
  });

  if (process.env.VERCEL) {
    attachDatabasePool(client);
  }
  await client.connect();

  db = client.db(DB_NAME);
  await db.command({ ping: 1 });

  // Unique identifiers used by the existing CIPHER application.
  await Promise.all([
    db.collection('bulk_campaigns').createIndex({id:1},{unique:true}),
    db.collection('removed_media').createIndex({path:1},{unique:true}),
    db.collection('content').createIndex(
      { kind: 1, id: 1 },
      { unique: true }
    ),

    db.collection('submissions').createIndex(
      { id: 1 },
      { unique: true }
    ),

    db.collection('admins').createIndex(
      { username: 1 },
      { unique: true }
    ),

    db.collection('sessions').createIndex(
      { token_hash: 1 },
      { unique: true }
    ),

    db.collection('settings').createIndex(
      { key: 1 },
      { unique: true }
    ),

    db.collection('media').createIndex(
      { path: 1 },
      { unique: true }
    ),

    db.collection('outbox').createIndex(
      { id: 1 },
      { unique: true }
    ),

    db.collection('outbox').createIndex(
      { submission_id: 1 }
    )
  ]);

  console.log(`MongoDB connected: ${DB_NAME}`);

  return db;
}

export function getMongoDB() {
  if (!db) {
    throw new Error(
      'MongoDB is not connected. Call connectMongo() first.'
    );
  }

  return db;
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
