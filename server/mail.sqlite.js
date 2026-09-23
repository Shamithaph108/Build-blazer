import nodemailer from 'nodemailer';

const address=value=>typeof value==='string'&&/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
export function createMailService(db,{env=process.env,transport}={}){
  const from=env.MAIL_FROM || '';
  const notify=env.ADMIN_NOTIFY_EMAIL || '';
  const port=Number(env.SMTP_PORT || 587);
  const configured=Boolean(address(from)&&address(notify)&&(transport || (env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASS&&[465,587].includes(port))));
  const sender=transport || (configured?nodemailer.createTransport({
    host:env.SMTP_HOST,port,secure:port===465,requireTLS:true,
    auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    disableFileAccess:true,disableUrlAccess:true
  }):null);
  function queue({id,submissionId,kind,recipient='',subject,body,username='system'}){
    db.prepare('INSERT OR IGNORE INTO outbox(id,submission_id,kind,recipient,subject,body,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(id,submissionId,kind,recipient,subject,body,new Date().toISOString(),username);
    return db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
  }
  async function send(id){
    if(!configured)return {status:'queued',message:'Email saved in the outbox. Configure SMTP to send it.'};
    const row=db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
    if(!row)return {status:'missing'};
    if(row.status!=='queued')return {status:row.status};
    if(!db.prepare("UPDATE outbox SET status='sending',error=NULL WHERE id=? AND status='queued'").run(id).changes)return {status:'sending'};
    try{
      const recipient=row.kind==='notification'?notify:row.recipient;
      if(!address(recipient))throw new Error('Invalid recipient');
      const result=await sender.sendMail({from:{name:'CIPHER',address:from},to:{address:recipient},subject:row.subject,text:row.body,
        messageId:`<${row.id}@${from.split('@')[1]}>`,disableFileAccess:true,disableUrlAccess:true});
      if(!result.accepted?.length)throw new Error('Recipient not accepted');
      db.prepare("UPDATE outbox SET status='accepted',recipient=?,sent_at=?,error=NULL WHERE id=?").run(recipient,new Date().toISOString(),id);
      return {status:'accepted',message:'Email accepted by the mail server. Final inbox delivery depends on the recipient’s provider.'};
    }catch{
      // SMTP errors can include addresses or credentials; do not persist raw errors.
      const message='Delivery was not confirmed. Check your mailbox and SMTP settings before retrying to avoid a duplicate.';
      db.prepare("UPDATE outbox SET status='failed',error=? WHERE id=?").run(message,id);
      return {status:'failed',message};
    }
  }
  async function flush(){
    if(!configured)return;
    for(const row of db.prepare("SELECT id FROM outbox WHERE status='queued' ORDER BY created_at LIMIT 5").all())await send(row.id);
  }
  return {configured,queue,send,flush};
}
