import { rateLimit } from 'express-rate-limit';
import { saveSelectedMember } from './member-directory.js';

export function membershipRoutes(app, { db, mail, requireAdmin }) {
  app.get('/api/admin/notifications', requireAdmin, async (_req, res) => {
    const [newCount, latest, queued] = await Promise.all([
      db.collection('submissions').countDocuments({ status: 'new' }),
      db.collection('submissions').findOne(
        {},
        { sort: { created_at: -1, id: -1 }, projection: { id: 1 } }
      ),
      db.collection('outbox').countDocuments({ status: 'queued' })
    ]);

    res.json({
      newCount,
      latest: latest?.id || null,
      queued
    });
  });

  app.patch(
    '/api/admin/submissions/:id/decision',
    requireAdmin,
    async (req, res) => {
      if (!['pending', 'reviewed', 'selected', 'declined'].includes(req.body.decision)) {
        return res.status(422).json({
          error: 'Choose pending, reviewed, accepted, or rejected.'
        });
      }

      const row = await db
        .collection('submissions')
        .findOne({ id: req.params.id });

      if (!row) {
        return res.status(404).json({
          error: 'Application not found.'
        });
      }

      if (row.purpose !== 'join') {
        return res.status(422).json({
          error:
            'Selection is only available for membership applications.'
        });
      }

      if (req.body.decision !== 'selected' && await db.collection('members').findOne({ id: row.id, deleted_at: { $exists: false } })) {
        return res.status(409).json({ error: 'This person is saved as a selected member. Use Delete selected member in the Selected members section to remove their membership.' });
      }

      const reviewedAt = new Date().toISOString();
      const notes=typeof req.body.notes==='string'?req.body.notes.trim():row.notes||'';
      if(notes.length>2000||/[<>\x00-\x08]/.test(notes))return res.status(422).json({error:'Private notes must be plain text, up to 2,000 characters.'});
      const changed = await db.collection('submissions').updateOne(
        {
          id: row.id,
          version: Number(req.body.version) || 0
        },
        {
          $set: {
            decision: req.body.decision,
            notes,
            status: 'read',
            reviewed_by: req.session.username,
            reviewed_at: reviewedAt
          },
          $inc: {
            version: 1
          }
        }
      );

      if (!changed.modifiedCount) {
        return res.status(409).json({
          error:
            'Another editor reviewed this application. Reload before changing it.'
        });
      }

      if (req.body.decision === 'selected') {
        await saveSelectedMember(db, { ...row, reviewed_at: reviewedAt, reviewed_by: req.session.username });
      }
      res.json({ ok: true });
    }
  );

  const emailLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Email limit reached. Please try again later.'
    }
  });

  app.post(
    '/api/admin/submissions/:id/reply',
    requireAdmin,
    emailLimit,
    async (req, res) => {
      const row = await db
        .collection('submissions')
        .findOne({ id: req.params.id });

      if (!row) {
        return res.status(404).json({
          error: 'Application not found.'
        });
      }

      const { subject, message, key } = req.body;

      if (
        typeof subject !== 'string' ||
        !subject.trim() ||
        subject.trim().length > 160 ||
        /[\r\n\x00-\x1f]/.test(subject) ||
        typeof message !== 'string' ||
        !message.trim() ||
        message.length > 8000 ||
        /[\x00-\x08]/.test(message) ||
        typeof key !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(key)
      ) {
        return res.status(422).json({
          error:
            'Enter a subject (up to 160 characters) and message (up to 8,000 characters). Reload if your form expired.'
        });
      }

      const id = 'reply-' + key;

      const existing = await db
        .collection('outbox')
        .findOne({ id });

      if (
        existing &&
        (
          existing.submission_id !== row.id ||
          existing.subject !== subject.trim() ||
          existing.body !== message.trim()
        )
      ) {
        return res.status(409).json({
          error:
            'This reply was already saved with different contents. Reload to compose a new message.'
        });
      }

      await mail.queue({
        id,
        submissionId: row.id,
        kind: 'reply',
        recipient: row.email,
        subject: subject.trim(),
        body: message.trim(),
        username: req.session.username
      });

      const result = await mail.send(id);

      res.json({
        ok: true,
        ...result,
        message:
          result.message ||
          'This reply was already saved. Check its status in the email history.'
      });
    }
  );

  app.post(
    '/api/admin/outbox/:id/retry',
    requireAdmin,
    emailLimit,
    async (req, res) => {
      const row = await db
        .collection('outbox')
        .findOne({ id: req.params.id });

      if (!row || row.deleted_at) {
        return res.status(404).json({
          error: 'Email not found.'
        });
      }

      if (!mail.configured) {
        return res.status(503).json({
          error:
            'Configure SMTP in the private .env file and restart the server first.'
        });
      }

      if (row.status === 'sending') {
        return res.status(409).json({
          error:
            'This email is sending or its result is uncertain. Check the sender mailbox before any further action.'
        });
      }

      if (row.status === 'failed') {
        await db.collection('outbox').updateOne(
          {
            id: row.id,
            status: 'failed'
          },
          {
            $set: {
              status: 'queued'
            }
          }
        );
      }

      const result = await mail.send(row.id);

      res.json({
        ok: true,
        ...result
      });
    }
  );
}
