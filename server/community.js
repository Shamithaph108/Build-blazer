import {rateLimit} from 'express-rate-limit';
import {readSiteSettings,eventState} from './studio.js';

export async function readAnnouncement(db){
  const row=await db.collection('settings').findOne({key:'announcement'});
  const value={title:'',message:'',link:'',published:false,...row?.value,version:row?.version||0};
  return {...value,entries:[...(value.title?[{title:value.title,message:value.message,link:value.link,published:value.published}]:[]),...(value.history||[])]};
}
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const reply=(answer,label,href)=>({answer,sources:label?[{label,href}]:[]});

export function answerWebsiteQuestion(question,{events,team,activities,domains,settings,announcement}){
  const q=normalize(question);
  const names=events.some(e=>normalize(e.title).split(' ').filter(t=>t.length>3&&!['event','events','workshop','workshops','competition'].includes(t)).some(t=>q.split(' ').includes(t)));
  if(/^(hi|hello|hey|help|thanks|thank you)$/.test(q))return reply('Hello! Ask me about CIPHER, joining, events, leadership, announcements or contact details. I answer from published website content only.');
  if(/\b(password|secret|token|database|applicants|private|admin|smtp)\b/.test(q))return reply('I can only help with public CIPHER website information. I cannot access private admin details, applications or messages.');
  if(/\b(announcement|announcements|notice|notices)\b/.test(q))return announcement.entries.some(a=>a.published)
    ?reply(announcement.entries.filter(a=>a.published).map(a=>`${a.title}\n${a.message}`).join('\n\n'),'Homepage announcement','/#announcement')
    :reply('There is no published announcement right now.','Home','/');
  if(/\b(join|membership|apply|application|register|registration)\b/.test(q)&&!names)return reply('Use Join / Contact to submit your name, email and message, and select the membership option. The team reviews applications privately. Event-specific registration details are only available when published in that event.','Join / Contact','/join');
  if(/\b(contact|email|address|location|where|reach)\b/.test(q)&&!names)return reply(`CIPHER is the CSE student association at St. Joseph Engineering College.\n${settings.address}\n${settings.contactEmail?`Email: ${settings.contactEmail}`:'Use the Contact form to reach the team; a public email address has not been supplied.'}`,'Contact the team','/contact');
  const namedMember=team.find(m=>q.includes(normalize(m.name)))||[...team].sort((a,b)=>b.role.length-a.role.length).find(m=>normalize(m.role)&&q.includes(normalize(m.role)));
  if(namedMember)return reply(`${namedMember.name} — ${namedMember.role}\n${namedMember.department||''}\n${namedMember.bio}`,'Leadership','/team');
  if(/\b(leadership|leaders|team|members|president|coordinator|secretary)\b/.test(q))return reply(team.length?team.map(m=>`${m.name} — ${m.role}`).join('\n'):'No leaders are published yet.','Leadership','/team');
  const stop=new Set('what when where who is are was were a an the about tell me please cipher of for and in on do does can you it this how'.split(' '));
  const terms=q.split(' ').filter(t=>t.length>2&&!stop.has(t));
  const records=[
    ...events.map(e=>({title:e.title,description:`${e.date}${e.time?' · '+e.time+' IST':''} · ${e.location} · ${eventState(e)}\n${e.summary}\n${e.description}`,href:'/events/'+encodeURIComponent(e.id)})),
    ...activities.map(a=>({title:a.title,description:a.description||'Further details have not been published.',href:'/#activities'})),
    ...domains.map(d=>({title:d.title,description:d.description,href:'/about'}))
  ];
  const genericEvents=/\b(upcoming|latest|next)\b/.test(q)||/^(show |list |all |what are the )?(events|workshops)$/.test(q);
  const matches=records.map(record=>({...record,score:terms.reduce((sum,term)=>sum+(normalize(record.title).split(' ').includes(term)?5:normalize(record.description).split(' ').includes(term)?1:0),0)})).filter(r=>r.score>=3).sort((a,b)=>b.score-a.score);
  if(matches.length&&!genericEvents){const record=matches[0];return reply(`${record.title}\n\n${record.description.slice(0,2400)}${record.description.length>2400?'\nRead the linked page for the full details.':''}`,record.title,record.href);}
  if(/\b(event|events|workshop|workshops|upcoming|latest|next)\b/.test(q)){
    const upcoming=/\b(upcoming|next)\b/.test(q);const list=events.filter(e=>!upcoming||eventState(e)==='upcoming').slice(0,8);
    return reply(list.length?list.map(e=>`${e.title} — ${e.date} — ${e.location} (${eventState(e)})`).join('\n'):upcoming?'There are no upcoming events published right now.':'No events are published yet.','Events & Workshops','/events');
  }
  if(/\b(cipher|club|association|about|sjec)\b/.test(q)&&/\b(what|about|meaning|purpose|is|tell)\b/.test(q))return reply(`CIPHER is the Computer Science & Engineering student association at St. Joseph Engineering College, Mangaluru.\n\n${settings.tagline}`,'About CIPHER','/about');
  return reply('I could not find that answer in the published CIPHER website. Try asking about an event by name, leadership, joining, announcements or contact details. For anything not published, please ask the team.','Contact the team','/contact');
}

export function communityRoutes(app,{db,requireAdmin,listContent}){
  app.delete('/api/admin/announcement',requireAdmin,async(req,res)=>{
    const {version}=req.body;
    if(!Number.isSafeInteger(version)||version<1)return res.status(422).json({error:'Reload the announcement before deleting.'});
    const result=await db.collection('settings').updateOne({key:'announcement',version},{$set:{value:{title:'',message:'',link:'',published:false,history:[]}},$inc:{version:1}});
    if(!result.matchedCount)return res.status(409).json({error:'Announcement changed. Reload before deleting.'});
    await db.collection('admin_activity').insertOne({actor:req.session.username,action:'DELETE_ANNOUNCEMENT',path:'/api/admin/announcement',created_at:new Date().toISOString()});
    res.json({ok:true,message:'Announcement deleted.'});
  });
  app.put('/api/admin/announcement',requireAdmin,async(req,res)=>{
    const {title,message,link='',published,version}=req.body;
    if(typeof title!=='string'||typeof message!=='string'||typeof link!=='string'||title.trim().length>120||message.trim().length>1500||link.length>500||/[<>\x00-\x08]/.test(title+message)||typeof published!=='boolean'||!Number.isSafeInteger(version)||version<0||published&&(!title.trim()||!message.trim()))return res.status(422).json({error:'Use a title (up to 120 characters) and message (up to 1,500 characters) before publishing.'});
    if(link){try{const url=new URL(link,'https://cipher.invalid');if((!(link.startsWith('/')&&!link.startsWith('//'))&&!link.startsWith('https://'))||url.username||url.password||/[\s\\<>]/.test(link))throw Error();}catch{return res.status(422).json({error:'Use a website path such as /events, or a complete HTTPS link.'});}}
    const current=await readAnnouncement(db);
    const history=req.body.append===true?current.entries:(current.history||[]);
    if(history.length>=50)return res.status(422).json({error:'Up to 50 announcements are supported. Delete old announcements before adding more.'});
    const value={title:title.trim(),message:message.trim(),link:link.trim(),published,history};
    try{
      const result=await db.collection('settings').updateOne({key:'announcement',version:version||{$exists:false}},{$set:{value},$inc:{version:1}},{upsert:version===0});
      if(!result.matchedCount&&!result.upsertedCount)return res.status(409).json({error:'Announcement changed in another session. Reload before saving.'});
    }catch(error){if(error.code===11000)return res.status(409).json({error:'Announcement changed in another session. Reload before saving.'});throw error;}
    await db.collection('admin_activity').insertOne({actor:req.session.username,action:'UPDATE_ANNOUNCEMENT',path:'/api/admin/announcement',created_at:new Date().toISOString()});
    res.json({ok:true,message:published?'Announcement published in the announcements popup.':'Announcement saved and hidden from visitors.'});
  });
  app.post('/api/chat',rateLimit({windowMs:15*60*1000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Please wait before asking more questions.'}}),async(req,res)=>{
    if(typeof req.body.question!=='string'||!req.body.question.trim()||req.body.question.length>500)return res.status(422).json({error:'Ask a question of 1–500 characters.'});
    const [events,team,activities,domains,settings,announcement]=await Promise.all([listContent('events'),listContent('team'),listContent('activities'),listContent('domains'),readSiteSettings(db),readAnnouncement(db)]);
    res.json(answerWebsiteQuestion(req.body.question,{events,team,activities,domains,settings,announcement}));
  });
}
