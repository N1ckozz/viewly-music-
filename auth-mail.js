/* Viewly verified email + password recovery.
   Outbound delivery is available only with a configured verified Resend sender.
   Tokens are one-time, short-lived and never stored in plaintext. */
import crypto from 'node:crypto';

export function initializeAuthMail(db){
 db.exec("CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,purpose TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL);");
 db.exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id,purpose);");
}
export function createMailHandler({db,requireUser,fail,send,json,limit,limitAccount,hashPassword,now,sha}){
 const key=process.env.RESEND_API_KEY||'';
 const sender=process.env.VIEWLY_MAIL_FROM||'';
 const app=(process.env.APP_URL||'http://localhost:4179').replace(/\/$/,'');
 const configured=Boolean(key&&/^[^@]+@[^@]+\.[^@]+$/.test(sender)&&app.startsWith('https://'));
 const address=s=>String(s||'').trim().toLowerCase().slice(0,254);
 const newToken=()=>crypto.randomBytes(32).toString('base64url');
 async function mail(to,subject,message){
  if(!configured)throw fail(503,'Email verification and recovery are not configured yet.');
  let response;
  try{
   response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({from:sender,to:[to],subject,text:message}),
    signal:AbortSignal.timeout(10000),
   });
  }catch{throw fail(503,'Email service temporarily unavailable.');}
  if(!response.ok)throw fail(503,'Email service rejected the request. Contact support.');
 }
 async function sendToken(user,purpose){
  const token=newToken(),expires=Date.now()+(purpose==='reset'?30*60*1000:24*60*60*1000);
  const link=app+'/?'+(purpose==='reset'?'reset_password':'verify_email')+'='+encodeURIComponent(token);
  const subject=purpose==='reset'?'Reset your Viewly password':'Verify your Viewly email';
  const message=purpose==='reset'?
   'A password reset was requested for your Viewly account. This link expires in 30 minutes and works only once:\n'+link+'\nIf this was not you, ignore this message.':
   'Verify your Viewly email address using this one-time link (expires in 24 hours):\n'+link+'\nIf this was not you, ignore this message.';
  db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND purpose=?').run(user.id,purpose);
  db.prepare('INSERT INTO auth_tokens VALUES (?,?,?,?,?)').run(sha(token),user.id,purpose,expires,now());
  try{await mail(user.email,subject,message);}
  catch(e){db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(sha(token));throw e;}
 }
 function checkToken(raw,purpose){
  const token=String(raw||'');
  if(!/^[A-Za-z0-9_-]{40,90}$/.test(token))throw fail(400,'Invalid or expired secure link.');
  const row=db.prepare('SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=? AND expires_at>?')
   .get(sha(token),purpose,Date.now());
  if(!row)throw fail(400,'Invalid or expired secure link.');
  return row;
 }
 return async function handleMail(req,res,path){
  if(!path.startsWith('/api/auth/'))return false;
  if(path==='/api/auth/capabilities'&&req.method==='GET')return send(res,200,{email_delivery_ready:configured,reset_password:configured,verification:configured});
  if(path==='/api/auth/send-verification'&&req.method==='POST'){
   const u=requireUser(req),account=db.prepare('SELECT id,email,email_verified,status FROM users WHERE id=?').get(u.id);
   if(account.email_verified)return send(res,200,{ok:true,already_verified:true});
   if(!configured)throw fail(503,'Email delivery has not been configured by the platform owner.');
   limit(req,'send-verification',20,3600000);
   limitAccount('verify',u.id,3,3600000);
   await sendToken(account,'verify');
   return send(res,200,{ok:true,note:'Check your inbox for a one-time verification link.'});
  }
  if(path==='/api/auth/verify-email'&&req.method==='POST'){
   limit(req,'verify-email',60,3600000);
   const body=await json(req),row=checkToken(body.token,'verify');
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
    db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
   return send(res,200,{ok:true,verified:true});
  }
  if(path==='/api/auth/password/forgot'&&req.method==='POST'){
   if(!configured)throw fail(503,'Password recovery is not configured yet.');
   limit(req,'forgot-password',30,3600000);
   const body=await json(req),email=address(body.email);
   limitAccount('forgot',email,3,3600000);
   const account=db.prepare("SELECT id,email,status,password_hash FROM users WHERE email=?").get(email);
   if(account?.status==='active'&&account.password_hash){
    try{await sendToken(account,'reset');}
    catch{ /* Never expose whether a given email exists. */ }
   }
   return send(res,200,{ok:true,note:'If an eligible account exists, a reset link has been sent.'});
  }
  if(path==='/api/auth/password/reset'&&req.method==='POST'){
   limit(req,'reset-password',50,3600000);
   const b=await json(req),newPassword=String(b.password||'');
   if(newPassword.length<12||newPassword.length>128)throw fail(422,'New password must contain 12–128 characters.');
   const row=checkToken(b.token,'reset');
   const owner=db.prepare('SELECT id,status,password_hash FROM users WHERE id=?').get(row.user_id);
   if(!owner||owner.status!=='active'||!owner.password_hash)throw fail(403,'Account is not eligible for password recovery.');
   const passwordHash=await hashPassword(newPassword);
   db.exec('BEGIN IMMEDIATE');
   try{
    const used=db.prepare('DELETE FROM auth_tokens WHERE token_hash=? AND expires_at>?').run(row.token_hash,Date.now());
    if(used.changes!==1)throw fail(409,'This recovery link was already used.');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash,owner.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(owner.id);
    db.prepare('DELETE FROM mfa_tickets WHERE user_id=?').run(owner.id);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
   return send(res,200,{ok:true,note:'Password reset. Sign in again, including MFA if enabled.'});
  }
  throw fail(404,'Authentication route not found.');
 };
}
