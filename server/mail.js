import nodemailer from 'nodemailer';

const address = value =>
  typeof value === 'string' &&
  /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);

export function createMailService(db, { env = process.env, transport } = {}) {
  const from = env.MAIL_FROM || '';
  const notify = env.ADMIN_NOTIFY_EMAIL || '';
  const port = Number(env.SMTP_PORT || 587);
  const setup = env.VERCEL === '1'
    ? 'Vercel Project Settings → Environment Variables (Production), then redeploy'
    : 'the private .env file, then restart the server';
  const required = transport ? ['MAIL_FROM'] : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
  const missing = required.filter(name => !env[name]);
  const invalid = [
    ...(from && !address(from) ? ['MAIL_FROM'] : []),
    ...(!transport && ![465, 587].includes(port) ? ['SMTP_PORT'] : [])
  ];

  const configured = Boolean(
    address(from) &&
    (transport ||
      (env.SMTP_HOST &&
        env.SMTP_USER &&
        env.SMTP_PASS &&
        [465, 587].includes(port)))
  );

  const sender =
    transport ||
    (configured
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port,
          secure: port === 465,
          requireTLS: port === 587,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          disableFileAccess: true,
          disableUrlAccess: true
        })
      : null);

  async function verify() {
    if (!configured || !sender) {
      return {
        ok: false,
        code: missing.length ? 'NOT_CONFIGURED' : 'INVALID_CONFIG',
        missing,
        invalid,
        message: `Email is not configured. ${missing.length ? `Missing: ${missing.join(', ')}. ` : ''}${invalid.length ? `Invalid: ${invalid.join(', ')}. ` : ''}Set SMTP_HOST, SMTP_PORT (587 or 465), SMTP_USER, SMTP_PASS and MAIL_FROM in ${setup}. For Gmail, SMTP_PASS must be a Google App Password, never your normal Google password.`
      };
    }

    // Test transports used by automated checks do not need a network handshake.
    if (typeof sender.verify !== 'function') {
      return {
        ok: true,
        code: 'READY',
        message: 'Mailbox connection is ready.'
      };
    }

    try {
      await sender.verify();
      return {
        ok: true,
        code: 'READY',
        message:
          'Mailbox connection verified. Individual and group messages can be sent.'
      };
    } catch (error) {
      const code = String(error?.code || '').toUpperCase();
      if (code === 'EAUTH') {
        return {
          ok: false,
          code,
          message:
            `The mail provider rejected authentication. For Gmail, SMTP_PASS must be a Google App Password, never your normal Google password. Update the SMTP settings in ${setup}.`
        };
      }
      if (['EDNS', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
        return {
          ok: false,
          code,
          message:
            'The SMTP server address could not be reached. Check SMTP_HOST and your internet connection.'
        };
      }
      return {
        ok: false,
        code: code || 'CONNECTION_FAILED',
        message:
          'The mailbox connection could not be verified. Check the SMTP host, port and provider settings, then try again.'
      };
    }
  }

  async function queue({
    id,
    submissionId,
    kind,
    recipient = '',
    subject,
    body,
    username = 'system',
    status = 'queued',
    campaignId = null,
    memberId = null
  }) {
    await db.collection('outbox').updateOne(
      { id },
      {
        $setOnInsert: {
          id,
          submission_id: submissionId,
          member_id: memberId,
          kind,
          recipient,
          subject,
          body,
          status,
          campaign_id: campaignId,
          created_at: new Date().toISOString(),
          sent_at: null,
          error: null,
          created_by: username
        }
      },
      { upsert: true }
    );

    return db.collection('outbox').findOne({ id });
  }

  async function send(id) {
    if (!configured) {
      return {
        status: 'queued',
        message:
          'Email saved in the outbox. Configure SMTP to send it.'
      };
    }

    const row = await db.collection('outbox').findOne({ id });

    if (!row) return { status: 'missing' };
    if (row.deleted_at) return { status: 'cancelled' };
    if (row.status !== 'queued') return { status: row.status };

    if (row.kind === 'bulk') {
      const source = row.member_id
        ? await db.collection('members').findOne({ id: row.member_id, deleted_at: { $exists: false } })
        : await db.collection('submissions').findOne({ id: row.submission_id });
      if (!source) {
        await db.collection('outbox').updateOne({ id, status: 'queued' }, {
          $set: { status: 'cancelled', deleted_at: new Date().toISOString() },
          $unset: { recipient: '', subject: '', body: '', error: '' }
        });
        return { status: 'cancelled' };
      }
    }

    const changed = await db.collection('outbox').updateOne(
      { id, status: 'queued' },
      {
        $set: {
          status: 'sending',
          error: null
        }
      }
    );

    if (!changed.modifiedCount) return { status: 'sending' };

    try {
      const recipient =
        row.kind === 'notification' ? notify : row.recipient;

      if (!address(recipient)) {
        throw new Error('Invalid recipient');
      }

      const result = await sender.sendMail({
        from: { name: 'CIPHER', address: from },
        to: { address: recipient },
        subject: row.subject,
        text: row.body,
        messageId: `<${row.id}@${from.split('@')[1]}>`,
        disableFileAccess: true,
        disableUrlAccess: true
      });

      if (!result.accepted?.length) {
        throw new Error('Recipient not accepted');
      }

      await db.collection('outbox').updateOne(
        { id, status:'sending', deleted_at:{$exists:false} },
        {
          $set: {
            status: 'accepted',
            recipient,
            sent_at: new Date().toISOString(),
            error: null
          }
        }
      );

      return {
        status: 'accepted',
        message:
          'Email accepted by the mail server. Final inbox delivery depends on the recipient’s provider.'
      };
    } catch {
      const message =
        'Delivery was not confirmed. Check your mailbox and SMTP settings before retrying to avoid a duplicate.';

      await db.collection('outbox').updateOne(
        { id, status:'sending', deleted_at:{$exists:false} },
        {
          $set: {
            status: 'failed',
            error: message
          }
        }
      );

      return { status: 'failed', message };
    }
  }

  async function flush() {
    if (!configured) return;

    const rows = await db
      .collection('outbox')
      .find({ status: 'queued' })
      .sort({ created_at: 1 })
      .limit(5)
      .toArray();

    for (const row of rows) {
      await send(row.id);
    }
  }

  async function sendMany(ids, concurrency = 3) {
    if (!configured || !Array.isArray(ids) || !ids.length) {
      return [];
    }

    const results = new Array(ids.length);
    let next = 0;
    const workers = Array.from(
      {
        length: Math.min(
          Math.max(1, concurrency),
          ids.length
        )
      },
      async () => {
        while (next < ids.length) {
          const index = next++;
          results[index] = await send(ids[index]);
        }
      }
    );

    await Promise.all(workers);
    return results;
  }

  return {
    configured,
    notificationsConfigured: address(notify),
    queue,
    send,
    sendMany,
    flush,
    verify
  };
}
