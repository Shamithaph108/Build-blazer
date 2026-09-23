import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { mailRecipients } from './member-directory.js';

export function adminExtras(app,{db,mail,requireAdmin,library}){
  app.post('/api/admin/session/closing',requireAdmin,async(req,res)=>{
    await db.collection('sessions').updateOne({token_hash:req.session.token_hash},{$set:{closing:true,expires:Date.now()+30000}});
    res.status(204).end();
  });
  app.delete('/api/admin/outbox/:id',requireAdmin,async(req,res)=>{
    const row=await db.collection('outbox').findOne({id:req.params.id});
    if(!row)return res.status(404).json({error:'Email not found.'});
    // Keep an ID-only cancellation marker so retries cannot recreate deleted mail.
    await db.collection('outbox').updateOne({id:row.id},{$set:{status:'cancelled',deleted_at:new Date().toISOString()},$unset:{recipient:'',subject:'',body:'',error:''}});
    res.json({ok:true,message:'Email removed from the outbox. Queued delivery is cancelled. Messages already sending or accepted cannot be recalled.'});
  });
  app.delete('/api/admin/media',requireAdmin,async(req,res)=>{
    const image=req.body.path;
    if(typeof image!=='string'||!(await library()).some(asset=>asset.path===image))return res.status(404).json({error:'Image not found.'});
    const references=(await db.collection('content').find({}).toArray()).filter(row=>{
      const item=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
      return item.image===image||item.gallery?.includes(image);
    });
    if(references.length)return res.status(409).json({error:'This image is used by an event, activity or member (including drafts). Replace or remove it there first.'});
    await db.collection('removed_media').updateOne({path:image},{$set:{path:image,removed_at:new Date().toISOString()}},{upsert:true});
    res.json({ok:true,message:'Image removed from the library. Original files are preserved.'});
  });
  const mailCheckLimit=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many mailbox checks. Try again later.'}});
  app.post('/api/admin/mail/verify',requireAdmin,mailCheckLimit,async(_req,res)=>{
    const result=await mail.verify();
    if(!result.ok)return res.status(503).json({error:result.message,code:result.code});
    res.json(result);
  });
  const limit=rateLimit({windowMs:60*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Bulk email limit reached. Try again later.'}});
  app.post('/api/admin/bulk/preview',requireAdmin,limit,async(req,res)=>{
    const {key,subject,message,audience}=req.body;
    if(typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(key)||!['all','selected'].includes(audience)||
      typeof subject!=='string'||!subject.trim()||subject.length>160||/[\r\n\x00-\x1f]/.test(subject)||
      typeof message!=='string'||!message.trim()||message.length>8000||/[\x00-\x08]/.test(message))return res.status(422).json({error:'Choose recipients and enter a valid subject and message.'});
    const unique=await mailRecipients(db,audience);
    if(!unique.size)return res.status(422).json({error:'No saved email addresses match this group.'});
    const prior=await db.collection('bulk_campaigns').findOne({id:key});
    if(prior&&(prior.created_by!==req.session.username||prior.subject!==subject.trim()||prior.body!==message.trim()||prior.audience!==audience))return res.status(409).json({error:'This preview belongs to another message. Refresh to start a new one.'});
    await db.collection('bulk_campaigns').updateOne({id:key},{$setOnInsert:{id:key,subject:subject.trim(),body:message.trim(),audience,recipients:[...unique.values()],status:'preview',created_by:req.session.username,created_at:new Date().toISOString()}},{upsert:true});
    const campaign=await db.collection('bulk_campaigns').findOne({id:key});
    res.json({ok:true,id:key,count:campaign.recipients.length,recipients:campaign.recipients.map(item=>item.email)});
  });
  app.post('/api/admin/bulk/:id/send',requireAdmin,limit,async(req,res)=>{
    const campaign=await db.collection('bulk_campaigns').findOne({id:req.params.id,created_by:req.session.username});
    if(!campaign)return res.status(404).json({error:'Preview this message first.'});
    if(campaign.status==='queued')return res.json({ok:true,message:'This message was already queued. It was not sent twice.'});
    // Recheck saved contacts so an old preview cannot mail a deleted member.
    const current=await mailRecipients(db,campaign.audience);
    const recipients=campaign.recipients.filter(recipient=>current.has(recipient.email)).map(recipient=>current.get(recipient.email));
    if(!recipients.length)return res.status(422).json({error:'These recipients have been removed. Create a new preview before sending.'});
    // Stable message IDs make an interrupted confirmation safe to retry.
    const messageIds=[];
    for(const recipient of recipients){
      const messageId=`bulk-${campaign.id}-${createHash('sha256').update(recipient.email).digest('hex').slice(0,24)}`;
      messageIds.push(messageId);
      await mail.queue({id:messageId,submissionId:recipient.id,
        memberId:recipient.memberId,kind:'bulk',recipient:recipient.email,subject:campaign.subject,body:campaign.body,username:req.session.username,status:'held',campaignId:campaign.id});
    }
    await db.collection('outbox').updateMany({campaign_id:campaign.id,status:'held',deleted_at:{$exists:false}},{$set:{status:'queued'}});
    await db.collection('bulk_campaigns').updateOne({id:campaign.id},{$set:{status:'queued'}});
    let delivery=[];
    if(process.env.VERCEL&&mail.configured)delivery=await mail.sendMany(messageIds);
    const accepted=delivery.filter(result=>result.status==='accepted').length;
    const failed=delivery.filter(result=>result.status==='failed').length;
    res.json({ok:true,message:process.env.VERCEL&&mail.configured
      ?`Processed ${recipients.length} unique email addresses: ${accepted} accepted by the mail server and ${failed} failed. Each recipient received a separate message.`
      :`Queued for ${recipients.length} unique email addresses. Each recipient receives a separate email.${mail.configured?'':' Email setup is still required.'}`});
  });
}
