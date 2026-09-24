import {rateLimit} from 'express-rate-limit';
import {waitUntil} from '@vercel/functions';
import {randomToken,digest,hashPassword,verifyPassword} from './security.js';

export function recoveryRoutes(app,{db,mail,auth,requireAdmin,baseUrl}){
  const admins=db.collection('admins');
  const makeLimit=()=>rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
  const setupLimit=makeLimit(),verifyLimit=makeLimit(),forgotLimit=makeLimit(),resetLimit=makeLimit();
  const render=(res,mode,message='',token='',status=200)=>res.status(status).set('Referrer-Policy','strict-origin').render('recovery',{title:'Admin account recovery',description:'Secure CIPHER editor account recovery.',mode,message,token});
  const valid=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
  const lookup=(kind,token)=>valid(token)?admins.findOne({[`${kind}.hash`]:digest(token),[`${kind}.expires`]:{$gt:Date.now()}}):null;
  app.post('/api/admin/recovery-email',requireAdmin,setupLimit,async(req,res)=>{
    const {email,currentPassword}=req.body;
    if(typeof email!=='string'||email.length>254||!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)||typeof currentPassword!=='string'||currentPassword.length>256)return res.status(422).json({error:'Enter a valid recovery email and your current password.'});
    const user=await admins.findOne({username:req.session.username});
    if(!user||!await verifyPassword(currentPassword,user.password_hash))return res.status(422).json({error:'Current password is incorrect.'});
    if(!mail.configured)return res.status(503).json({error:'Email delivery is not configured. Recovery email cannot be verified yet.'});
    const token=randomToken(),pending={hash:digest(token),expires:Date.now()+15*60*1000,email:email.toLowerCase(),binding:digest(user.password_hash)};
    await admins.updateOne({_id:user._id,password_hash:user.password_hash},{$set:{pending_recovery:pending}});
    try{await mail.sendSecurityEmail({recipient:pending.email,subject:'Verify your CIPHER recovery email',body:`Confirm your recovery email within 15 minutes:\n${baseUrl}/admin/verify-recovery?token=${token}\n\nIf you did not request this, ignore this email.`});}
    catch{await admins.updateOne({_id:user._id,'pending_recovery.hash':pending.hash},{$unset:{pending_recovery:''}});return res.status(503).json({error:'Verification email could not be sent. Your existing recovery email is unchanged.'});}
    res.json({ok:true,message:'Verification email sent. Open its link and confirm within 15 minutes.'});
  });
  app.get('/admin/verify-recovery',verifyLimit,(req,res)=>render(res,'verify','',valid(req.query.token)?req.query.token:''));
  app.post('/admin/verify-recovery',verifyLimit,async(req,res)=>{
    const user=await lookup('pending_recovery',req.body.token);
    if(!user||user.pending_recovery.binding!==digest(user.password_hash))return render(res,'done','This link is invalid or expired. Request a new link from Settings.','',400);
    const result=await admins.updateOne({_id:user._id,password_hash:user.password_hash,'pending_recovery.hash':digest(req.body.token),'pending_recovery.expires':{$gt:Date.now()}},{$set:{recovery_email:user.pending_recovery.email},$unset:{pending_recovery:'',pending_reset:''}});
    render(res,'done',result.modifiedCount?'Recovery email verified. You can now use Forgot password.':'This link has already been used.');
  });
  app.get('/admin/forgot-password',(req,res)=>render(res,'forgot'));
  app.post('/admin/forgot-password',forgotLimit,(req,res)=>{
    // Respond identically without waiting for SMTP, so account existence is not disclosed.
    const task=(async()=>{
      const username=typeof req.body.username==='string'?req.body.username.trim().slice(0,80):'';
      if(!mail.configured||!username)return;
      const user=await admins.findOneAndUpdate({username,recovery_email:{$type:'string'},$or:[{reset_requested_at:{$lt:Date.now()-60000}},{reset_requested_at:{$exists:false}}]},{$set:{reset_requested_at:Date.now()}},{returnDocument:'after'});
      if(!user)return;
      const token=randomToken(),pending={hash:digest(token),expires:Date.now()+15*60*1000,binding:digest(user.password_hash),email:user.recovery_email};
      const stored=await admins.updateOne({_id:user._id,password_hash:user.password_hash,recovery_email:user.recovery_email},{$set:{pending_reset:pending}});
      if(!stored.modifiedCount)return;
      try{await mail.sendSecurityEmail({recipient:user.recovery_email,subject:'Reset your CIPHER admin password',body:`Reset your password within 15 minutes:\n${baseUrl}/admin/reset-password?token=${token}\n\nIf you did not request this, ignore this email. Your password has not changed.`});}
      catch{await admins.updateOne({_id:user._id,'pending_reset.hash':pending.hash},{$unset:{pending_reset:''}});}
    })().catch(()=>{});
    if(process.env.VERCEL)waitUntil(task);
    render(res,'done','If that account has a verified recovery email, a reset link will arrive shortly. Check spam too. If recovery was never configured, ask another authorised administrator for help.');
  });
  app.get('/admin/reset-password',resetLimit,(req,res)=>render(res,'reset','',valid(req.query.token)?req.query.token:''));
  app.post('/admin/reset-password',resetLimit,async(req,res)=>{
    const {token,password,confirmPassword}=req.body;
    if(typeof password!=='string'||password.length<8||password.length>256||password!==confirmPassword)return render(res,'reset','Use matching passwords of 8–256 characters.',valid(token)?token:'',422);
    const user=await lookup('pending_reset',token);
    if(!user||user.pending_reset.binding!==digest(user.password_hash)||user.pending_reset.email!==user.recovery_email)return render(res,'done','This reset link is invalid or expired. Request another link.','',400);
    const password_hash=await hashPassword(password);
    const changed=await admins.updateOne({_id:user._id,password_hash:user.password_hash,recovery_email:user.recovery_email,'pending_reset.hash':digest(token),'pending_reset.expires':{$gt:Date.now()}},{$set:{password_hash},$unset:{pending_reset:'',pending_recovery:''}});
    if(!changed.modifiedCount)return render(res,'done','This reset link has already been used.','',400);
    await db.collection('sessions').deleteMany({username:user.username});await auth.logout(req,res);
    await db.collection('admin_activity').insertOne({actor:user.username,action:'PASSWORD_RESET',path:'/admin/reset-password',created_at:new Date().toISOString()});
    render(res,'done','Password changed. All previous sessions have been signed out. Sign in with your new password.');
  });
}
