import {hashPassword,verifyPassword} from './security.js';
import {rateLimit} from 'express-rate-limit';

export const defaultSiteSettings = {
  tagline:'Bridging academic knowledge and practical application — a community of aspiring professionals in computing.',
  contactEmail:'',address:'Department of Computer Science & Engineering\nSt. Joseph Engineering College\nVamanjoor, Mangaluru — 575028',
  github:'',linkedin:'',instagram:'',participants:null,participantsSource:''
};
export async function readSiteSettings(db){
  const row=await db.collection('settings').findOne({key:'website'});
  return {...defaultSiteSettings,...row?.value,version:row?.version||0};
}
export const today = ()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function eventState(event){
  if(event.eventStatus && event.eventStatus!=='auto')return event.eventStatus;
  return event.date>=today()?'upcoming':'completed';
}
export function publicMetrics(events,team,activities,settings){
  const metrics=[{label:'Documented events',value:events.filter(e=>eventState(e)==='completed').length},
    {label:'Published leaders',value:team.length},{label:'Learning activities',value:activities.length}];
  if(settings.participants!==null)metrics.push({label:'Participants reached',value:settings.participants,source:settings.participantsSource});
  return metrics;
}

export function studioRoutes(app,{db,requireAdmin,auth,listContent}){
  // Store action metadata only, never submitted messages, credentials, or tokens.
  app.use((req,res,next)=>{
    const username=req.session?.username;
    if(username&&req.path.startsWith('/api/admin/')&&['POST','PUT','PATCH','DELETE'].includes(req.method)&&!req.path.includes('/session/')){
      res.on('finish',()=>{
        if(res.statusCode<400)db.collection('admin_activity').insertOne({actor:username,action:req.method,path:req.path,created_at:new Date().toISOString()}).catch(()=>{});
      });
    }
    next();
  });
  app.get('/admin/events/:id/preview',requireAdmin,async(req,res)=>{
    const event=(await listContent('events',true)).find(e=>e.id===req.params.id);
    if(!event)return res.status(404).render('message',{title:'Event not found',description:'Preview unavailable.',message:'This event was removed.',status:404});
    res.render('event',{title:`Preview: ${event.title}`,description:event.summary,event,preview:true});
  });
  app.get('/api/admin/overview',requireAdmin,async(_req,res)=>{
    const [events,team,pending,unread,recent]=await Promise.all([listContent('events',true),listContent('team',true),
      db.collection('submissions').countDocuments({purpose:'join',decision:'pending'}),
      db.collection('submissions').countDocuments({purpose:'contact',status:'new'}),
      db.collection('admin_activity').find({}).sort({created_at:-1}).limit(12).project({_id:0}).toArray()]);
    res.json({events:events.length,upcoming:events.filter(e=>eventState(e)==='upcoming').length,published:events.filter(e=>e.published).length,
      drafts:events.filter(e=>!e.published).length,team:team.length,pending,unread,recent});
  });
  app.put('/api/admin/settings',requireAdmin,async(req,res)=>{
    const errors={},value={};
    for(const [key,max] of Object.entries({tagline:350,contactEmail:254,address:500,github:300,linkedin:300,instagram:300,participantsSource:350})){
      const text=typeof req.body[key]==='string'?req.body[key].trim():'';
      if(text.length>max||/[<>\x00-\x08]/.test(text))errors[key]=`${key}: enter plain text, up to ${max} characters.`;
      value[key]=text;
    }
    if(!value.tagline)errors.tagline='A homepage tagline is required.';
    if(value.contactEmail&&!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value.contactEmail))errors.contactEmail='Enter one valid email address.';
    for(const key of ['github','linkedin','instagram'])if(value[key]){
      try{const url=new URL(value[key]);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{errors[key]=`${key}: use a complete HTTPS URL.`;}
    }
    value.participants=req.body.participants===''||req.body.participants==null?null:Number(req.body.participants);
    if(value.participants!==null&&(!Number.isInteger(value.participants)||value.participants<0||value.participants>10000000||!value.participantsSource))errors.participants='Use a verified whole-number participant count and provide its source, or leave it blank.';
    if(Object.keys(errors).length)return res.status(422).json({error:Object.values(errors).join(' '),errors});
    const version=Number(req.body.version)||0;
    try{
      const result=await db.collection('settings').updateOne({key:'website',version:version||{$exists:false}},{$set:{value},$inc:{version:1}},{upsert:version===0});
      if(!result.matchedCount&&!result.upsertedCount)return res.status(409).json({error:'Settings changed in another session. Reload before saving.'});
    }catch(error){if(error.code===11000)return res.status(409).json({error:'Settings changed in another session. Reload before saving.'});throw error;}
    res.json({ok:true});
  });
  app.post('/api/admin/password',requireAdmin,rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many password-change attempts. Try again in an hour.'}}),async(req,res)=>{
    const {currentPassword,newPassword,confirmPassword}=req.body;
    if(typeof currentPassword!=='string'||currentPassword.length>256||typeof newPassword!=='string'||newPassword.length<16||newPassword.length>256||newPassword!==confirmPassword)return res.status(422).json({error:'Use a new password of 16–256 characters and a matching confirmation.'});
    const admin=await db.collection('admins').findOne({username:req.session.username});
    if(!admin||!await verifyPassword(currentPassword,admin.password_hash))return res.status(403).json({error:'Your current password is incorrect.'});
    const result=await db.collection('admins').updateOne({username:admin.username,password_hash:admin.password_hash},{$set:{password_hash:await hashPassword(newPassword)}});
    if(!result.modifiedCount)return res.status(409).json({error:'Password changed in another session. Sign in again.'});
    await db.collection('sessions').deleteMany({username:admin.username});
    await auth.logout(req,res);
    res.json({ok:true,message:'Password changed. Sign in again with your new password.'});
  });
}
