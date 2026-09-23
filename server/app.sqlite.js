import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDatabase, listContent } from './db.js';
import { migrateReference } from './reference-migration.js';
import { createMailService } from './mail.js';
import { membershipRoutes } from './membership.js';
import { sessions, safeEqual, verifyPassword, hashPassword, validateSubmission, validateContent } from './security.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pages={
  '/': ['home','CIPHER — Create. Connect. Collaborate.','The student association of Computer Science and Engineering at St. Joseph Engineering College. Explore our community, events, and leadership.'],
  '/about':['about','About CIPHER','Meet the CSE student community at SJEC: technical learning, collaboration, leadership, and shared experiences.'],
  '/events':['events','Events & Workshops','Explore CIPHER’s events, from PROMPT OPS–2K26 to Lumière — The Gala. Read event details and browse photographs.'],
  '/team':['team','Our Team','Meet the leadership shown in the supplied CIPHER design reference. Current term confirmation is pending.'],
  '/join':['join','Join & Contact','Join the CIPHER community or send an enquiry to the student association of CSE at SJEC.']
};
export function createApp(options={}) {
  const app=express();
  const production=options.production ?? process.env.NODE_ENV==='production';
  const dataDir=path.resolve(options.dataDir || process.env.DATA_DIR || path.join(root,'data'));
  const baseUrl=new URL(options.baseUrl || process.env.BASE_URL || 'http://localhost:3000').origin;
  const secure=baseUrl.startsWith('https://');
  if(production && !secure && !['localhost','127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Public production requires an HTTPS BASE_URL.');
  const db=openDatabase(dataDir);
  migrateReference(db);
  const mail=createMailService(db,options.mail || {});app.locals.mail=mail;
  const assets=JSON.parse(readFileSync(path.join(root,'content/assets.json'),'utf8'));
  const reference=JSON.parse(readFileSync(path.join(root,'content/reference.json'),'utf8'));
  app.locals.reference=reference;
  const library=()=>[...assets,...db.prepare('SELECT path,label FROM media').all()];
  app.locals.db=db;
  app.locals.baseUrl=baseUrl;
  app.locals.year=new Date().getFullYear();
  app.locals.formatDate=date=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
  app.locals.production=production;
  app.locals.imageSrcset=image=>{
    const asset=assets.find(item=>item.path===image);
    return asset?.smallWidth && asset.width>asset.smallWidth ? `${image.replace('.webp','-small.webp')} ${asset.smallWidth}w, ${image} ${asset.width}w` : '';
  };
  app.locals.assetVersion=existsSync(path.join(root,'dist/version.txt')) ? readFileSync(path.join(root,'dist/version.txt'),'utf8').trim() : 'dev';
  app.set('view engine','ejs');
  app.set('views',path.join(root,'views'));
  app.disable('x-powered-by');
  if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
  // Preserve the same-origin form Origin header: no-referrer makes Chromium send "null".
  app.use(helmet({referrerPolicy:{policy:'strict-origin-when-cross-origin'},contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:','blob:'],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:secure?[]:null}},strictTransportSecurity:secure?undefined:false}));
  app.use('/assets',express.static(path.join(root,production?'dist':'public'),{maxAge:production?'1h':0}));
  app.use('/images',express.static(path.join(root,'public/images'),{maxAge:'7d',immutable:false}));
  app.use('/fonts',express.static(path.join(root,'public/fonts'),{maxAge:'30d'}));
  app.use('/uploads',express.static(path.join(dataDir,'uploads'),{maxAge:'7d',dotfiles:'deny'}));
  app.get('/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/robots.txt',(_req,res)=>res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: ${baseUrl}/sitemap.xml\n`));
  app.get('/sitemap.xml',(_req,res)=>res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(p=>`<url><loc>${baseUrl}${p}</loc></url>`).join('')}</urlset>`));
  app.use(rateLimit({windowMs:15*60*1000,limit:500,standardHeaders:'draft-8',legacyHeaders:false,message:'Too many requests. Please try again in 15 minutes.'}));
  app.use(express.json({limit:'5mb'}));
  app.use(express.urlencoded({extended:false,limit:'32kb'}));
  const auth=sessions(db,secure);
  app.use(auth.middleware);
  app.use((req,res,next)=>{
    res.locals.currentPath=req.path;
    res.locals.noindex=req.path.startsWith('/admin') || req.path.startsWith('/api');
    res.locals.errors={};res.locals.values={};res.locals.success=false;
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if(req.headers.origin!==baseUrl || !safeEqual(req.get('x-csrf-token') || req.body?._csrf,req.session?.csrf)) {
        return req.path.startsWith('/api') ? res.status(403).json({error:'Your session expired or the request came from another site. Reload this page and try again.'}) : res.status(403).render('message',{title:'Please reload the page',description:'Your session expired or this request came from another site.',message:'Reload the form and submit again.',status:403});
      }
    }
    next();
  });
  const publicData=()=>{
    const domainItems=listContent(db,'domains');
    const domains=domainItems.length?domainItems:reference.domains;
    return {events:listContent(db,'events'),team:listContent(db,'team'),activities:listContent(db,'activities'),reference:{...reference,domains}};
  };
  for(const [route,[view,title,description]] of Object.entries(pages)) {
    app.get(route,(req,res)=>res.render(view,{title,description,...publicData(),success:route==='/join' && req.query.sent==='1'}));
  }
  app.get('/events/:id',(req,res)=>{
    const event=listContent(db,'events').find(e=>e.id===req.params.id);
    if(!event) return res.status(404).render('message',{title:'Event not found',description:'This event is unavailable.',message:'This event may have been unpublished. Browse our events for the latest updates.',status:404});
    res.render('event',{title:event.title,description:event.summary,event});
  });
  app.get('/api/events',(_req,res)=>res.json(listContent(db,'events')));
  app.get('/api/activities',(_req,res)=>res.json(listContent(db,'activities')));
  function saveSubmission(value){
    const id=randomUUID();db.exec('BEGIN');
    try{
      db.prepare('INSERT INTO submissions(id,name,email,purpose,message,created_at) VALUES (?,?,?,?,?,?)').run(id,value.name,value.email,value.purpose,value.message,new Date().toISOString());
      mail.queue({id:'notice-'+id,submissionId:id,kind:'notification',subject:value.purpose==='join'?'New CIPHER membership application':'New CIPHER enquiry',
        body:`A new ${value.purpose==='join'?'membership application':'enquiry'} is ready for review.\n\nSign in to the private inbox: ${baseUrl}/admin#inbox\n\nReference: ${id}`});
      db.exec('COMMIT');return id;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  const submissionLimit=rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many submissions. Please try again in an hour.'}});
  app.post('/join',submissionLimit,(req,res)=>{
    const {errors,value}=validateSubmission(req.body || {});
    if(Object.keys(errors).length) return res.status(422).render('join',{title:'Check your message',description:pages['/join'][2],errors,values:req.body});
    saveSubmission(value);
    res.redirect(303,'/join?sent=1#form-status');
  });
  // The video-style join dialog uses the same validation and private inbox as /join.
  app.post('/api/submissions',submissionLimit,(req,res)=>{
    const {errors,value}=validateSubmission(req.body || {});
    if(Object.keys(errors).length) return res.status(422).json({error:'Please check your details.',errors});
    saveSubmission(value);
    res.status(201).json({ok:true,message:'Message saved successfully. Your enquiry is in the team’s private inbox.'});
  });
  const requireAdmin=(req,res,next)=>{
    if(!req.session?.username) return req.path.startsWith('/api') ? res.status(401).json({error:'Sign in to edit content.'}) : res.redirect('/admin/login');
    next();
  };
  app.get('/admin/login',(req,res)=>{
    if(req.session?.username) return res.redirect('/admin');
    res.render('login',{title:'Editor sign in',description:'Private CIPHER content editor.',error:null});
  });
  const dummyHash=hashPassword('not-a-real-account-password');
  const loginLimit=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:'Too many sign-in attempts. Please try again in 15 minutes.'});
  app.post('/admin/login',loginLimit,async(req,res)=>{
    const username=typeof req.body.username==='string' ? req.body.username.trim().toLowerCase().slice(0,80) : '';
    const password=typeof req.body.password==='string' ? req.body.password : '';
    const user=db.prepare('SELECT * FROM admins WHERE username=?').get(username);
    const valid=password.length<=256 && await verifyPassword(password,user?.password_hash || await dummyHash);
    if(!user || !valid) return res.status(401).render('login',{title:'Editor sign in',description:'Private CIPHER content editor.',error:'Username or password is incorrect.'});
    auth.login(req,res,username);res.redirect(303,'/admin');
  });
  app.post('/admin/logout',requireAdmin,(req,res)=>{auth.logout(req,res);res.redirect(303,'/admin/login');});
  app.get('/admin',requireAdmin,(_req,res)=>res.render('admin',{title:'Content studio',description:'Manage CIPHER events, activities, leadership, and applications.',events:listContent(db,'events',true),team:listContent(db,'team',true),activities:listContent(db,'activities',true),domains:listContent(db,'domains',true).length?listContent(db,'domains',true):reference.domains.map((d,i)=>({...d,id:`domain-${i+1}`,order:i,published:true,version:0})),assets:library(),submissions:db.prepare('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200').all(),
    outbox:db.prepare('SELECT * FROM outbox ORDER BY created_at DESC LIMIT 500').all(),mailConfigured:mail.configured,replyKey:randomUUID,
    newCount:db.prepare("SELECT COUNT(*) AS count FROM submissions WHERE status='new'").get().count}));
  membershipRoutes(app,{db,mail,requireAdmin});
  for(const kind of ['events','team','activities','domains']) {
    app.post(`/api/admin/${kind}`,requireAdmin,(req,res)=>saveContent(kind,null,req,res));
    app.put(`/api/admin/${kind}/:id`,requireAdmin,(req,res)=>saveContent(kind,req.params.id,req,res));
    app.delete(`/api/admin/${kind}/:id`,requireAdmin,(req,res)=>{
      const result=db.prepare('DELETE FROM content WHERE kind=? AND id=? AND version=?').run(kind,req.params.id,Number(req.body.version)||0);
      if(!result.changes) return res.status(409).json({error:'This item changed or was deleted. Reload before trying again.'});
      res.json({ok:true});
    });
  }
  function saveContent(kind,id,req,res) {
    const {errors,value}=validateContent(kind,req.body || {},new Set(library().map(x=>x.path)));
    if(Object.keys(errors).length) return res.status(422).json({error:Object.values(errors).join(' '),errors});
    const key=id || randomUUID();
    const payload=JSON.stringify({...value,id:key});
    if(id) {
      const result=db.prepare('UPDATE content SET payload=?,version=version+1 WHERE kind=? AND id=? AND version=?').run(payload,kind,id,Number(req.body.version)||0);
      if(!result.changes) return res.status(409).json({error:'Another editor changed this item. Reload to avoid overwriting their work.'});
    } else db.prepare('INSERT INTO content(kind,id,payload) VALUES (?,?,?)').run(kind,key,payload);
    res.json({ok:true,id:key});
  }
  app.patch('/api/admin/submissions/:id',requireAdmin,(req,res)=>{
    if(!['new','read'].includes(req.body.status)) return res.status(422).json({error:'Invalid status.'});
    const result=db.prepare('UPDATE submissions SET status=? WHERE id=?').run(req.body.status,req.params.id);
    if(!result.changes) return res.status(404).json({error:'Submission not found.'});
    res.json({ok:true});
  });
  app.delete('/api/admin/submissions/:id',requireAdmin,(req,res)=>{
    if(db.prepare("SELECT id FROM outbox WHERE submission_id=? AND status='sending'").get(req.params.id))return res.status(409).json({error:'An email is being sent. Wait before deleting this enquiry.'});
    db.exec('BEGIN');try{db.prepare('DELETE FROM outbox WHERE submission_id=?').run(req.params.id);db.prepare('DELETE FROM submissions WHERE id=?').run(req.params.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}res.json({ok:true});
  });
  app.post('/api/admin/media',requireAdmin,async(req,res)=>{
    if(typeof req.body.image!=='string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(req.body.image)) return res.status(422).json({error:'Upload a JPG, PNG, or WebP image.'});
    const bytes=Buffer.from(req.body.image.split(',')[1],'base64');
    if(bytes.length>3*1024*1024) return res.status(422).json({error:'Choose an image smaller than 3 MB.'});
    const name=randomUUID()+'.webp';mkdirSync(path.join(dataDir,'uploads'),{recursive:true});
    try {
      const image=sharp(bytes,{limitInputPixels:25e6});
      if(!['jpeg','png','webp'].includes((await image.metadata()).format)) throw new Error('Unsupported image format');
      await image.rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.join(dataDir,'uploads',name));
    }
    catch { return res.status(422).json({error:'This image could not be decoded. Choose a valid JPG, PNG, or WebP.'}); }
    const label=typeof req.body.label==='string' ? req.body.label.trim().slice(0,100) : 'Uploaded image';
    db.prepare('INSERT INTO media(path,label) VALUES (?,?)').run('/uploads/'+name,label || 'Uploaded image');
    res.json({ok:true,path:'/uploads/'+name});
  });
  app.use((_req,res)=>res.status(404).render('message',{title:'Page not found',description:'The requested page was not found.',message:'That connection leads nowhere. Return home or explore our events.',status:404}));
  app.use((error,req,res,_next)=>{
    const status=error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
    if(status===500) console.error('Request failed:',error.message);
    const message=status===413?'This request is too large.':status===400?'This request could not be read.':'We could not save or load this information. Please try again.';
    if(req.path.startsWith('/api')) return res.status(status).json({error:message});
    res.status(status).type('text').send(message);
  });
  return app;
}
