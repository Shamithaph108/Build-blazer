import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const randomToken = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function safeEqual(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left=Buffer.from(a), right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
export async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt,hash] = stored.split(':');
  return safeEqual((await scrypt(password,salt,64)).toString('hex'),hash);
}

export function sessions(db, production) {
  const cookieName = production ? '__Host-cipher-session' : 'cipher-session';
  const cookieOptions = { httpOnly:true, sameSite:'strict', secure:production, path:'/', maxAge:8*60*60*1000 };
  function create(res, username=null) {
    const token=randomToken(), csrf=randomToken(), expires=Date.now()+cookieOptions.maxAge;
    db.prepare('INSERT INTO sessions(token_hash,csrf,username,expires) VALUES (?,?,?,?)').run(digest(token),csrf,username,expires);
    res.cookie(cookieName,token,cookieOptions);
    return {token_hash:digest(token),csrf,username,expires};
  }
  return {
    middleware(req,res,next) {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
      const token=(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      req.session = token && /^[a-f0-9]{64}$/.test(token) ? db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now()) : null;
      if (!req.session && req.method==='GET') req.session=create(res);
      res.locals.csrf=req.session?.csrf || '';
      res.locals.admin=Boolean(req.session?.username);
      next();
    },
    login(req,res,username) {
      if(req.session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
      req.session=create(res,username);
    },
    logout(req,res) {
      if(req.session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
      res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});
    }
  };
}

export function validateSubmission(body) {
  const errors={};
  const text=(key,max,min=1) => {
    const value=typeof body[key]==='string' ? body[key].trim() : '';
    if(value.length<min || value.length>max || /[<>\x00-\x08]/.test(value)) errors[key]=`Use ${min}–${max} characters of plain text.`;
    return value;
  };
  const name=text('name',100,2), email=text('email',254,3), message=text('message',3000,10);
  if(!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) errors.email='Enter one valid email address.';
  if(!['join','contact'].includes(body.purpose)) errors.purpose='Choose membership or a general enquiry.';
  if(body.consent!=='yes') errors.consent='Please consent to storing this enquiry so the team can respond.';
  if(body.website) errors.website='Submission could not be accepted.';
  return {errors,value:{name,email,message,purpose:body.purpose}};
}

export function validateContent(kind,body,allowedImages) {
  const errors={};
  const plain=(key,max,required=true) => {
    const value=typeof body[key]==='string' ? body[key].trim() : '';
    if((required && !value) || value.length>max || /[<>\x00-\x08]/.test(value)) errors[key]=`${key}: enter plain text, at most ${max} characters.`;
    return value;
  };
  const image=plain('image',200,false);
  if(image && !allowedImages.has(image)) errors.image='Choose an image from the asset library.';
  const common={image,published:body.published===true || body.published==='on'};
  let value;
  if(kind==='events') {
    const date=plain('date',10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) errors.date='Enter a valid calendar date.';
    const gallery=Array.isArray(body.gallery) ? body.gallery : typeof body.gallery==='string' ? body.gallery.split(',').map(x=>x.trim()).filter(Boolean) : [];
    if(gallery.length>20 || gallery.some(x=>!allowedImages.has(x))) errors.gallery='Choose up to 20 library images.';
    const category=plain('category',50);
    if(!['Competition','Community','Workshop','Talk'].includes(category)) errors.category='Choose a listed category.';
    value={...common,title:plain('title',120),category,date,location:plain('location',160),summary:plain('summary',350),description:plain('description',8000),source:plain('source',500),gallery};
  } else if(kind==='activities') {
    const order=Number(body.order);
    if(!Number.isInteger(order)||order<0||order>999)errors.order='Order must be a whole number between 0 and 999.';
    value={...common,title:plain('title',120),description:plain('description',8000,false),order};
  } else if(kind==='domains') {
    const order=Number(body.order);
    if(!Number.isInteger(order)||order<0||order>999)errors.order='Order must be a whole number between 0 and 999.';
    const icon=plain('icon',50,false)||'code';
    value={...common,title:plain('title',120),description:plain('description',1000),icon:plain('icon',50,false)||'code',order};
  } else {
    const order=Number(body.order);
    if(!Number.isInteger(order) || order<0 || order>999) errors.order='Order must be a whole number between 0 and 999.';
    value={...common,name:plain('name',100),role:plain('role',100),bio:plain('bio',1500),order};
  }
  return {errors,value};
}
