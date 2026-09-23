import { readFileSync } from 'node:fs';

const originalSummaries = {
  'prompt-ops-2026':
    'Ideas into prompts. Prompts into possibilities. A hands-on competition exploring AI, creative thinking, and problem-solving.',
  'lumiere-2025':
    'Where Glam Meets Glow. A branch-entry celebration welcoming students into the Computer Science and Engineering community.'
};

export async function migrateReference(db) {
  await migratePortraitProfiles(db);

  const alreadyMigrated = await db
    .collection('settings')
    .findOne({ key: 'reference-presentation-v2' });

  if (alreadyMigrated) return;

  const seed = JSON.parse(
    readFileSync(
      new URL('../content/seed.json', import.meta.url),
      'utf8'
    )
  );

  for (const event of seed.events) {
    const row = await db.collection('content').findOne({
      kind: 'events',
      id: event.id
    });

    if (!row || row.version !== 1) continue;

    const current =
      typeof row.payload === 'string'
        ? JSON.parse(row.payload)
        : row.payload;

    if (current.summary !== originalSummaries[event.id]) {
      continue;
    }

    const updated = {
      ...current,
      summary: event.summary,
      image: event.image,
      gallery: event.gallery,
      source: event.source
    };

    await db.collection('content').updateOne(
      {
        kind: 'events',
        id: event.id,
        version: 1
      },
      {
        $set: {
          payload: JSON.stringify(updated)
        },
        $inc: {
          version: 1
        }
      }
    );
  }

  await db.collection('settings').updateOne(
    { key: 'reference-presentation-v2' },
    {
      $setOnInsert: {
        key: 'reference-presentation-v2',
        value: '1'
      }
    },
    { upsert: true }
  );
}

async function migratePortraitProfiles(db) {
  const key = 'cipher-portraits-v1';

  const alreadyMigrated = await db
    .collection('settings')
    .findOne({ key });

  if (alreadyMigrated) return;

  const seed = JSON.parse(
    readFileSync(
      new URL('../content/seed.json', import.meta.url),
      'utf8'
    )
  );

  const ids = new Set([
    'chaitra-rm',
    'himansh-ullal',
    'parthipan-j',
    'ruben-saldana',
    'shamitha-kv'
  ]);

  for (const member of seed.team.filter(member =>
    ids.has(member.id)
  )) {
    await db.collection('content').updateOne(
      {
        kind: 'team',
        id: member.id
      },
      {
        $setOnInsert: {
          kind: 'team',
          id: member.id,
          payload: JSON.stringify(member),
          version: 1
        }
      },
      { upsert: true }
    );
  }

  await db.collection('settings').updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        value: '1'
      }
    },
    { upsert: true }
  );
}