import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  connectMongo,
  closeMongo
} from '../server/mongo.js';

import { hashPassword } from '../server/security.js';

const directory = path.resolve(
  process.env.DATA_DIR || 'data'
);

mkdirSync(directory, { recursive: true });

const db = await connectMongo();

try {
  const username = (
    process.env.ADMIN_USERNAME || 'editor'
  ).trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,80}$/.test(username)) {
    throw new Error(
      'Use 3–80 letters, numbers, dots, underscores or hyphens for ADMIN_USERNAME.'
    );
  }

  const password =
    process.env.ADMIN_PASSWORD ||
    randomBytes(24).toString('base64url');

  if (password.length < 16 || password.length > 256) {
    throw new Error(
      'Use an admin password between 16 and 256 characters.'
    );
  }

  const passwordHash = await hashPassword(password);

  await db.collection('admins').updateOne(
    { username },
    {
      $set: {
        username,
        password_hash: passwordHash
      }
    },
    { upsert: true }
  );

  await db.collection('sessions').deleteMany({
    username
  });

  if (!process.env.ADMIN_PASSWORD) {
    writeFileSync(
      path.join(directory, 'admin-credentials.txt'),
      `CIPHER LOCAL EDITOR
Username: ${username}
Password: ${password}

This private file is gitignored. Store the password in a password manager.
Running npm run admin:setup again resets this password and logs out this editor.
`,
      { mode: 0o600 }
    );

    console.log(
      'Editor created. Read data/admin-credentials.txt locally for the generated password.'
    );
  } else {
    console.log(
      'Editor password updated from the environment. Existing sessions revoked.'
    );
  }
} finally {
  await closeMongo();
}