// Private membership contacts are independent of the public Team page and inbox.
// No expiry is set: only the explicit member-delete action removes a contact.
const active = { deleted_at: { $exists: false } };
const validEmail = email => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email);

export async function saveSelectedMember(db, application) {
  await db.collection('members').updateOne(
    { id: application.id },
    { $setOnInsert: {
      id: application.id,
      name: application.name,
      email: application.email.trim().toLowerCase(),
      message: application.message,
      applied_at: application.created_at,
      selected_at: application.reviewed_at || application.created_at,
      selected_by: application.reviewed_by || null
    } },
    { upsert: true }
  );
}

export async function migrateSelectedMembers(db) {
  await db.collection('members').createIndex({ id: 1 }, { unique: true });
  // Add existing selections without overwriting contacts or reviving deleted IDs.
  for await (const application of db.collection('submissions').find({ purpose: 'join', decision: 'selected' })) {
    await saveSelectedMember(db, application);
  }
}

export async function mailRecipients(db, audience) {
  const [members, submissions] = await Promise.all([
    db.collection('members').find({}).toArray(),
    db.collection('submissions').find(audience === 'selected' ? { purpose: 'join', decision: 'selected' } : {})
      .sort({ created_at: -1 }).toArray()
  ]);
  const removed = new Set(members.filter(member => member.deleted_at).map(member => member.id));
  const recipients = new Map();
  // Prefer permanent member contacts when the same email is also in the inbox.
  for (const row of [...members.filter(member => !member.deleted_at).map(member => ({ ...member, memberId: member.id })), ...submissions]) {
    if (removed.has(row.id) || typeof row.email !== 'string') continue;
    const email = row.email.trim().toLowerCase();
    if (validEmail(email) && !recipients.has(email)) recipients.set(email, { email, id: row.id, memberId: row.memberId || null });
  }
  return recipients;
}

export function memberDirectoryRoutes(app, { db, requireAdmin }) {
  app.delete('/api/admin/members/:id', requireAdmin, async (req, res) => {
    const member = await db.collection('members').findOne({ id: req.params.id, ...active });
    if (!member) return res.status(404).json({ error: 'Selected member not found.' });

    // Retain an ID-only marker so a restart or interrupted migration cannot
    // recreate the deleted member. Remove the contact's personal information.
    await db.collection('members').updateOne({ id: member.id }, {
      $set: { deleted_at: new Date().toISOString() },
      $unset: { name: '', email: '', message: '', applied_at: '', selected_at: '', selected_by: '' }
    });
    await db.collection('submissions').deleteOne({ id: member.id });
    await db.collection('outbox').updateMany({ $or: [{ member_id: member.id }, { submission_id: member.id }] }, {
      $set: { status: 'cancelled', deleted_at: new Date().toISOString() },
      $unset: { recipient: '', subject: '', body: '', error: '' }
    });
    await db.collection('bulk_campaigns').updateMany({}, { $pull: { recipients: { id: member.id } } });
    res.json({ ok: true, message: 'Selected member deleted. Their saved contact and original application were removed, and queued emails were cancelled. Already-sent emails cannot be recalled.' });
  });
}
