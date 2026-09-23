import { rateLimit } from 'express-rate-limit';

export function membershipRoutes(app,{db,mail,requireAdmin}){
  app.get('/api/admin/notifications',requireAdmin,(_req,res)=>res.json({
    newCount:db.prepare("SELECT COUNT(*) AS count FROM submissions WHERE status='new'").get().count,
    latest:db.prepare('SELECT id FROM submissions ORDER BY created_at DESC,id DESC LIMIT 1').get()?.id || null,
    queued:db.prepare("SELECT COUNT(*) AS count FROM outbox WHERE status='queued'").get().count
  }));
  app.patch('/api/admin/submissions/:id/decision',requireAdmin,(req,res)=>{
    if(!['pending','selected','declined'].includes(req.body.decision))return res.status(422).json({error:'Choose pending, selected, or declined.'});
    const row=db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.id);
    if(!row)return res.status(404).json({error:'Application not found.'});
    if(row.purpose!=='join')return res.status(422).json({error:'Selection is only available for membership applications.'});
    const changed=db.prepare("UPDATE submissions SET decision=?,status='read',reviewed_by=?,reviewed_at=?,version=version+1 WHERE id=? AND version=?")
      .run(req.body.decision,req.session.username,new Date().toISOString(),row.id,Number(req.body.version)||0);
    if(!changed.changes)return res.status(409).json({error:'Another editor reviewed this application. Reload before changing it.'});
    res.json({ok:true});
  });
  const emailLimit=rateLimit({windowMs:60*60*1000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Email limit reached. Please try again later.'}});
  app.post('/api/admin/submissions/:id/reply',requireAdmin,emailLimit,async(req,res)=>{
    const row=db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.id);
    if(!row)return res.status(404).json({error:'Application not found.'});
    const {subject,message,key}=req.body;
    if(typeof subject!=='string'||!subject.trim()||subject.trim().length>160||/[\r\n\x00-\x1f]/.test(subject)||
       typeof message!=='string'||!message.trim()||message.length>8000||/[\x00-\x08]/.test(message)||
       typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(key))return res.status(422).json({error:'Enter a subject (up to 160 characters) and message (up to 8,000 characters). Reload if your form expired.'});
    const id='reply-'+key;
    const existing=db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
    if(existing&&(existing.submission_id!==row.id||existing.subject!==subject.trim()||existing.body!==message.trim()))return res.status(409).json({error:'This reply was already saved with different contents. Reload to compose a new message.'});
    mail.queue({id,submissionId:row.id,kind:'reply',recipient:row.email,subject:subject.trim(),body:message.trim(),username:req.session.username});
    const result=await mail.send(id);
    res.json({ok:true,...result,message:result.message || 'This reply was already saved. Check its status in the email history.'});
  });
  app.post('/api/admin/outbox/:id/retry',requireAdmin,emailLimit,async(req,res)=>{
    const row=db.prepare('SELECT * FROM outbox WHERE id=?').get(req.params.id);
    if(!row)return res.status(404).json({error:'Email not found.'});
    if(!mail.configured)return res.status(503).json({error:'Configure SMTP in the private .env file and restart the server first.'});
    if(row.status==='sending')return res.status(409).json({error:'This email is sending or its result is uncertain. Check the sender mailbox before any further action.'});
    if(row.status==='failed')db.prepare("UPDATE outbox SET status='queued' WHERE id=? AND status='failed'").run(row.id);
    const result=await mail.send(row.id);res.json({ok:true,...result});
  });
}
