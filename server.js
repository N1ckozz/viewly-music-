import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {initAdmin,siteSettings,createAdminHandler} from './admin-core.js';
import {initializeAuthMail,createMailHandler} from './auth-mail.js';
import {initSubscriptions,createBillingHandler,assertQuota} from './billing-core.js';
import {initCampaignSandbox,campaignBalance,sandboxCampaignAllowed,createCampaignSandboxHandler,reviewSandboxSubmission} from './sandbox-campaigns.js';
import {newTotpSecret,verifyTotp,encryptSeed,decryptSeed,newRecoveryCodes,recoveryHash,validMfaKey,normalizeRecoveryCode} from './mfa.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

process.umask(0o077); // New database and upload files are private to the application user.
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,'public');
const UPLOADS=path.resolve(process.env.VIEWLY_UPLOAD_DIR||path.join(ROOT,'uploads'));
const DATA=path.resolve(process.env.VIEWLY_DATA_DIR||path.join(ROOT,'data'));
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(UPLOADS,{recursive:true});
for(const folder of [DATA,UPLOADS]){try{fs.chmodSync(folder,0o700)}catch{ /* Some managed volumes restrict chmod. */ }}
const db=new DatabaseSync(path.join(DATA,'viewly.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'viewer',password_hash TEXT,google_sub TEXT UNIQUE,bio TEXT DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS releases(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',genre TEXT NOT NULL DEFAULT 'Rap',file_name TEXT NOT NULL,cover_name TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS release_views(release_id TEXT NOT NULL REFERENCES releases(id),user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(release_id,user_id));
CREATE TABLE IF NOT EXISTS release_likes(release_id TEXT NOT NULL REFERENCES releases(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(release_id,user_id));
CREATE TABLE IF NOT EXISTS release_comments(id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES releases(id),user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),release_id TEXT NOT NULL REFERENCES releases(id),title TEXT NOT NULL,brief TEXT NOT NULL,platform TEXT NOT NULL DEFAULT 'Any',reward_cents INTEGER NOT NULL CHECK(reward_cents BETWEEN 50 AND 1000),budget_cents INTEGER NOT NULL CHECK(budget_cents >= 1000),fee_cents INTEGER NOT NULL,spent_cents INTEGER NOT NULL DEFAULT 0,paid_cents INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_orders(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),provider TEXT NOT NULL,provider_ref TEXT UNIQUE,status TEXT NOT NULL,amount_cents INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES releases(id),user_id TEXT NOT NULL REFERENCES users(id),file_name TEXT NOT NULL,start_sec REAL NOT NULL,end_sec REAL NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),user_id TEXT NOT NULL REFERENCES users(id),clip_id TEXT REFERENCES clips(id),post_url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,reviewed_at TEXT,UNIQUE(campaign_id,post_url));
CREATE TABLE IF NOT EXISTS wallet_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT REFERENCES campaigns(id),submission_id TEXT UNIQUE REFERENCES submissions(id),type TEXT NOT NULL,amount_cents INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_releases_created ON releases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_campaign ON submissions(campaign_id,created_at DESC);
`);

db.exec(`CREATE TABLE IF NOT EXISTS artist_follows(follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,artist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(follower_id,artist_id));
CREATE INDEX IF NOT EXISTS idx_artist_follows_artist ON artist_follows(artist_id,created_at DESC);
CREATE TABLE IF NOT EXISTS content_reports(id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES releases(id),reporter_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(release_id,reporter_id));`);
db.exec("CREATE TABLE IF NOT EXISTS mfa_methods(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,seed_cipher TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,last_step INTEGER NOT NULL DEFAULT -1,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS mfa_recovery(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,code_hash TEXT NOT NULL,PRIMARY KEY(user_id,code_hash)); CREATE TABLE IF NOT EXISTS mfa_tickets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);");
initAdmin(db);
initializeAuthMail(db);
initSubscriptions(db);
initCampaignSandbox(db);
const APP_URL=(process.env.APP_URL||'http://localhost:4179').replace(/\/$/,'');
const PORT=Number(process.env.PORT||4179);
const GOOGLE_ID=process.env.GOOGLE_CLIENT_ID||'';
const GOOGLE_SECRET=process.env.GOOGLE_CLIENT_SECRET||'';
const STRIPE_KEY=process.env.STRIPE_SECRET_KEY||'';
const STRIPE_WEBHOOK_SECRET=process.env.STRIPE_WEBHOOK_SECRET||'';
const MFA_MASTER_KEY=process.env.VIEWLY_MFA_MASTER_KEY||'';
const MFA_AVAILABLE=validMfaKey(MFA_MASTER_KEY);
// Default-deny real-money features until all launch prerequisites are approved.
const PAYOUT_PROVIDER_IMPLEMENTED=false; // Must be changed by an audited, genuine provider integration, NEVER by environment toggles alone.
const PAYMENT_LAUNCH_ENABLED=PAYOUT_PROVIDER_IMPLEMENTED && process.env.VIEWLY_PAID_MARKETPLACE_ENABLED==='true' && process.env.VIEWLY_PAYOUTS_OPERATIONAL==='true' && process.env.VIEWLY_LEGAL_REVIEW_COMPLETE==='true' && APP_URL.startsWith('https://');
const STRIPE_READY=PAYMENT_LAUNCH_ENABLED&&!!STRIPE_KEY&&!!STRIPE_WEBHOOK_SECRET;
const execFileAsync=promisify(execFile);
const scryptAsync=promisify(crypto.scrypt);
const HASH_SETTINGS={N:131072,r:8,p:1,maxmem:256*1024*1024};
let activePasswordDerivations=0;
async function derivePassword(password,salt,settings){
 if(activePasswordDerivations>=2)throw fail(503,'Authentication is busy. Try again shortly.');
 activePasswordDerivations++;
 try{return await scryptAsync(password,salt,64,settings)}finally{activePasswordDerivations--;}
}
const SESSION_DAYS=7;
const DUMMY_SALT='12763eccb1a924df7ba553146edf6ccd';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const clean=(s,max=400)=>String(s??'').trim().slice(0,max);
const money=n=>Math.round(Number(n)*100);
const MAX_JSON=64*1024,MAX_UPLOAD=80*1024*1024;
let uploadsInProgress=0,clipJobsInProgress=0;
const MAX_CONCURRENT_UPLOADS=1,MAX_CONCURRENT_CLIPS=2;
const mimeExt={'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
const mimeTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.ico':'image/x-icon','.woff2':'font/woff2'};
const statements={
  getUser:db.prepare('SELECT id,email,username,display_name,role,bio,created_at,status,email_verified FROM users WHERE id=?'),
  byEmail:db.prepare('SELECT * FROM users WHERE email=?'),
  byGoogle:db.prepare('SELECT * FROM users WHERE google_sub=?'),
  ownerOfRelease:db.prepare('SELECT owner_id FROM releases WHERE id=?'),
};
async function hashPassword(password){
 const salt=crypto.randomBytes(16).toString('hex');
 const key=await derivePassword(password,salt,HASH_SETTINGS);
 return 's2$'+salt+'$'+key.toString('hex');
}
async function validPassword(password,stored){
 let salt=DUMMY_SALT,hash='',legacy=false;
 if(typeof stored==='string'&&stored.startsWith('s2$')){
  const parts=stored.split('$');
  if(parts.length===3&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2])){
   salt=parts[1];hash=parts[2];
  }
 }else if(typeof stored==='string'){
  const parts=stored.split(':');
  if(parts.length===2&&/^[a-f0-9]{32}$/.test(parts[0])&&/^[a-f0-9]{128}$/.test(parts[1])){
   salt=parts[0];hash=parts[1];legacy=true;
  }
 }
 const key=await derivePassword(password,salt,legacy?{N:16384,r:8,p:1,maxmem:64*1024*1024}:HASH_SETTINGS);
 const reference=hash?Buffer.from(hash,'hex'):Buffer.alloc(64);
 return crypto.timingSafeEqual(key,reference)&&!!hash;
}
function cookieValue(req,name){const cookie=req.headers.cookie||'';const m=cookie.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function sessionUser(req){const token=cookieValue(req,'viewly_session');if(!token)return null;const row=db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(sha(token),Date.now());const user=row?statements.getUser.get(row.user_id):null;return user?.status==='active'?user:null;}
function cookie(name,value,maxAge){const sameSite=name==='viewly_oauth_state'?'Lax':'Strict';return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${APP_URL.startsWith('https://')?'; Secure':''}`;}
function createSession(res,userId,mfaVerified=false){const token=crypto.randomBytes(32).toString('base64url');const expires=Date.now()+SESSION_DAYS*86400*1000;db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,mfa_verified) VALUES (?,?,?,?,?)').run(sha(token),userId,expires,Date.now(),mfaVerified?1:0);const existing=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:existing?[existing]:[]),cookie('viewly_session',token,SESSION_DAYS*86400)]);}
function send(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));}
function error(res,status,msg){send(res,status,{error:msg});}
const fail=(status,msg)=>Object.assign(new Error(msg),{status});
function requireUser(req){const u=sessionUser(req);if(!u)throw fail(401,'Sign in to continue.');return u;}
function requireCreator(req){const u=requireUser(req);if(!['artist','label','admin'].includes(u.role))throw fail(403,'Switch to an artist/label account to publish.');return u;}
async function readBody(req,limit=MAX_JSON){let chunks=[],total=0;for await(const c of req){total+=c.length;if(total>limit)throw fail(413,'File or request exceeds size limit.');chunks.push(c);}return Buffer.concat(chunks);}
async function json(req){let v;try{v=JSON.parse((await readBody(req)).toString('utf8'))}catch{throw fail(400,'Invalid JSON.')}return v;}
function multipart(buffer,contentType){const match=contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);if(!match)throw fail(400,'Missing multipart boundary.');const boundary=Buffer.from('--'+(match[1]||match[2]));let parts=[],start=buffer.indexOf(boundary);while(start>=0){const head=start+boundary.length;if(buffer.subarray(head,head+2).toString()==='--')break;const next=buffer.indexOf(boundary,head);if(next<0)break;const part=buffer.subarray(head+2,next-2);const split=part.indexOf(Buffer.from('\r\n\r\n'));if(split>=0){const headers=part.subarray(0,split).toString();const content=part.subarray(split+4);const name=headers.match(/name="([^"]+)"/)?.[1];const fileName=headers.match(/filename="([^"]*)"/)?.[1];const type=headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim()?.toLowerCase();if(name)parts.push({name,fileName,type,content});}start=next;}return parts;}
function isRealFile(p,isVideo){if(!p||!p.content?.length)throw fail(400,'Choose a real file to upload.');if(!mimeExt[p.type])throw fail(415,'Unsupported media format.');if(isVideo&&!p.type.startsWith('video/'))throw fail(415,'An actual video file is required.');if(!isVideo&&!p.type.startsWith('image/'))throw fail(415,'A valid image file is required.');const b=p.content;
 if(p.type==='video/mp4'&&!b.subarray(4,12).toString('latin1').includes('ftyp'))throw fail(415,'Invalid MP4 file.');
 if(p.type==='video/webm'&&b.subarray(0,4).toString('hex')!=='1a45dfa3')throw fail(415,'Invalid WebM file.');
 if(p.type==='image/png'&&b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw fail(415,'Invalid PNG file.');
 if(p.type==='image/jpeg'&&b.subarray(0,2).toString('hex')!=='ffd8')throw fail(415,'Invalid JPEG file.');
 if(p.type==='image/webp'&&(b.subarray(0,4).toString('latin1')!=='RIFF'||b.subarray(8,12).toString('latin1')!=='WEBP'))throw fail(415,'Invalid WebP file.');
 return p.type;}
function publicRelease(r,u){return {...r,video_url:`/media/${r.file_name}`,cover_url:r.cover_name?`/media/${r.cover_name}`:null,liked:!!(u&&db.prepare('SELECT 1 FROM release_likes WHERE release_id=? AND user_id=?').get(r.id,u.id))};}
function getRelease(id,u){const r=db.prepare(`SELECT r.id,r.owner_id,r.title,r.description,r.genre,r.visibility,r.file_name,r.cover_name,r.created_at,u.status AS artist_status,u.display_name AS artist_name,u.username AS artist_username,(SELECT count(*) FROM release_views v WHERE v.release_id=r.id) AS plays,(SELECT count(*) FROM release_likes l WHERE l.release_id=r.id) AS likes,(SELECT count(*) FROM release_comments c WHERE c.release_id=r.id) AS comments FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.id=?`).get(id);if(!r)return null;if((r.visibility!=='public'||r.artist_status!=='active')&&u?.id!==r.owner_id&&u?.role!=='admin')return null;return publicRelease(r,u);}
function publicCampaign(r){return {...r,...campaignBalance(r)};}
function campaignRows(where='',args=[]){return db.prepare(`SELECT c.*,u.username,u.display_name AS artist_name,r.title AS release_title,r.cover_name,r.file_name FROM campaigns c JOIN users u ON u.id=c.owner_id JOIN releases r ON r.id=c.release_id ${where} ORDER BY c.created_at DESC LIMIT 100`).all(...args).map(r=>({...publicCampaign(r),cover_url:r.cover_name?`/media/${r.cover_name}`:null,video_url:`/media/${r.file_name}`}));}
function stripSensitive(user){if(!user)return null;return {id:user.id,email:user.email,username:user.username,display_name:user.display_name,role:user.role,bio:user.bio,created_at:user.created_at,status:user.status,email_verified:!!user.email_verified};}
function requireSameOrigin(req){
 if(!['POST','PATCH','DELETE','PUT'].includes(req.method))return;
 if(req.url?.split('?')[0]==='/api/stripe/webhook')return; // Signed Stripe webhook, no browser cookie auth.
 const origin=req.headers.origin;
 const site=req.headers['sec-fetch-site'];
 if(origin&&origin!==APP_URL)throw fail(403,'Cross-origin request blocked.');
 if(site&&site!=='same-origin'&&site!=='none')throw fail(403,'Cross-site request blocked.');
 // Require a non-simple request header; CORS is intentionally not enabled.
 if(req.url?.startsWith('/api/')&&req.headers['x-viewly-request']!=='1')throw fail(403,'Protected request header required.');
}
const liveClients=new Set();const MAX_LIVE_CLIENTS=120;
function broadcast(kind){const msg=`data: ${JSON.stringify({kind,at:now()})}\n\n`;for(const client of liveClients){try{client.write(msg)}catch{liveClients.delete(client)}}}
const rate=new Map();
db.exec('CREATE TABLE IF NOT EXISTS auth_throttle(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL)');
setInterval(()=>{
 const t=Date.now();
 for(const [k,v] of rate)if(v.until<t)rate.delete(k);
 db.prepare('DELETE FROM auth_throttle WHERE reset_at<?').run(t);
 db.prepare('DELETE FROM sessions WHERE expires_at<?').run(t);
 db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(t);
 db.prepare('DELETE FROM mfa_tickets WHERE expires_at<?').run(t);
},60000).unref();
function limit(req,key,cap=25,windowMs=60000){
 const ip=req.socket.remoteAddress||'unknown',k=ip+':'+key;
 let v=rate.get(k);
 if(!v||Date.now()>v.until)v={count:0,until:Date.now()+windowMs};
 v.count++;rate.set(k,v);
 if(rate.size>15000){for(const key of rate.keys()){rate.delete(key);if(rate.size<12000)break;}}
 if(v.count>cap)throw fail(429,'Too many attempts. Try again shortly.');
}
function limitAccount(action,email,max=8,windowMs=15*60*1000){
 const key=sha(action+':'+email.toLowerCase()),t=Date.now();
 const row=db.prepare('SELECT count,reset_at FROM auth_throttle WHERE key=?').get(key);
 if(!row||row.reset_at<=t){db.prepare('INSERT OR REPLACE INTO auth_throttle VALUES (?,?,?)').run(key,1,t+windowMs);return;}
 db.prepare('UPDATE auth_throttle SET count=count+1 WHERE key=?').run(key);
 if(row.count>=max)throw fail(429,'Too many sign-in attempts. Try again later.');
}

function mfaMethod(userId){return db.prepare('SELECT * FROM mfa_methods WHERE user_id=?').get(userId);}
function hasMfa(userId){return mfaMethod(userId)?.enabled===1;}
function issueMfaTicket(req,res,userId){
 if(!MFA_AVAILABLE)throw fail(503,'Multi-factor login is temporarily unavailable. Access is safely blocked.');
 const previous=cookieValue(req,'viewly_session');
 if(previous)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(previous));
 const token=crypto.randomBytes(32).toString('base64url');
 db.prepare('DELETE FROM mfa_tickets WHERE user_id=?').run(userId);
 db.prepare('INSERT INTO mfa_tickets(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token),userId,Date.now()+300000);
 const old=res.getHeader('Set-Cookie');
 res.setHeader('Set-Cookie',[...(Array.isArray(old)?old:old?[old]:[]),cookie('viewly_session','',0),cookie('viewly_mfa_ticket',token,300)]);
}
function consumeMfaFactor(userId,submitted){
 if(!MFA_AVAILABLE)return false;
 const method=mfaMethod(userId);if(!method?.enabled)return false;
 let step=-1;
 try{step=verifyTotp(decryptSeed(method.seed_cipher,MFA_MASTER_KEY),submitted,Date.now(),method.last_step)}catch{return false}
 if(step>=0){
  const outcome=db.prepare('UPDATE mfa_methods SET last_step=? WHERE user_id=? AND last_step<?').run(step,userId,step);
  return outcome.changes===1;
 }
 const normalized=normalizeRecoveryCode(submitted);
 if(!/^[A-F0-9]{24}$/.test(normalized))return false;
 const hash=recoveryHash(userId,normalized,MFA_MASTER_KEY);
 return db.prepare('DELETE FROM mfa_recovery WHERE user_id=? AND code_hash=?').run(userId,hash).changes===1;
}
function generateRecovery(userId){
 const codes=newRecoveryCodes();
 db.prepare('DELETE FROM mfa_recovery WHERE user_id=?').run(userId);
 const insert=db.prepare('INSERT INTO mfa_recovery VALUES (?,?)');
 for(const code of codes)insert.run(userId,recoveryHash(userId,code,MFA_MASTER_KEY));
 return codes;
}
function isRecentSession(req,minutes=15){
 const token=cookieValue(req,'viewly_session');if(!token)return false;
 const row=db.prepare('SELECT created_at FROM sessions WHERE token_hash=?').get(sha(token));
 return !!row&&row.created_at>=Date.now()-minutes*60000;
}
function baseUrl(req){return APP_URL;}
async function googleStart(req,res){if(!GOOGLE_ID||!GOOGLE_SECRET)throw fail(503,'Google sign-in is not configured.');const state=crypto.randomBytes(32).toString('base64url');db.prepare('INSERT INTO oauth_states VALUES (?,?)').run(sha(state),Date.now()+600000);res.setHeader('Set-Cookie',cookie('viewly_oauth_state',state,600));const q=new URLSearchParams({client_id:GOOGLE_ID,redirect_uri:APP_URL+'/auth/google/callback',response_type:'code',scope:'openid email profile',state,access_type:'online',prompt:'select_account'});res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+q});res.end();}
async function googleCallback(req,res,url){if(url.searchParams.get('error'))throw fail(400,'Google sign-in was cancelled.');const state=url.searchParams.get('state')||'';if(!state||state!==cookieValue(req,'viewly_oauth_state'))throw fail(403,'Google sign-in session mismatch.');res.setHeader('Set-Cookie',cookie('viewly_oauth_state','',0));const entry=db.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND expires_at>?').get(sha(state),Date.now());if(!entry)throw fail(403,'Invalid Google session state.');db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(sha(state));const code=url.searchParams.get('code');if(!code)throw fail(400,'Missing authentication code.');const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:GOOGLE_ID,client_secret:GOOGLE_SECRET,redirect_uri:APP_URL+'/auth/google/callback',grant_type:'authorization_code'})});if(!tokenRes.ok)throw fail(502,'Google token exchange failed.');const tk=await tokenRes.json();const infoRes=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tk.access_token}});if(!infoRes.ok)throw fail(502,'Google profile verification failed.');const info=await infoRes.json();if(!info.email_verified||!info.sub)throw fail(403,'Google email is not verified.');let user=statements.byGoogle.get(info.sub);if(user?.status==='suspended')throw fail(403,'Account access has been suspended.');if(user)db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(user.id);if(!user){const email=clean(info.email.toLowerCase(),254);user=statements.byEmail.get(email);if(user){throw fail(409,'This email already has a Viewly account. Sign in with your existing method before linking Google.');}else{let username=clean(info.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g,'').toLowerCase(),22)||'artist';while(db.prepare('SELECT 1 FROM users WHERE username=?').get(username))username=username.slice(0,16)+crypto.randomBytes(2).toString('hex');let uid=id();db.prepare('INSERT INTO users(id,email,username,display_name,role,password_hash,google_sub,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,email,username,clean(info.name,80)||username,'viewer',null,info.sub,now());db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(uid);user=statements.byEmail.get(email);}}if(hasMfa(user.id)){issueMfaTicket(req,res,user.id);res.writeHead(302,{Location:'/?mfa=1'});res.end();return;}createSession(res,user.id);res.writeHead(302,{Location:'/'});res.end();}
function stripeSignatureValid(payload,sig){if(!STRIPE_WEBHOOK_SECRET||!sig)return false;let t=sig.match(/(?:^|,)t=(\d+)/)?.[1];let vals=[...sig.matchAll(/(?:^|,)v1=([a-f0-9]+)/g)].map(x=>x[1]);if(!t||Math.abs(Date.now()/1000-Number(t))>300)return false;let actual=crypto.createHmac('sha256',STRIPE_WEBHOOK_SECRET).update(`${t}.${payload.toString('utf8')}`).digest('hex');return vals.some(s=>s.length===actual.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(actual)));}
async function stripeWebhook(req,res){const payload=await readBody(req,MAX_JSON);if(!stripeSignatureValid(payload,req.headers['stripe-signature']))throw fail(400,'Invalid Stripe signature.');const event=JSON.parse(payload.toString('utf8'));if(db.prepare('SELECT 1 FROM webhook_events WHERE id=?').get(event.id))return send(res,200,{received:true});db.exec('BEGIN IMMEDIATE');try{if(event.type==='checkout.session.completed'&&event.data?.object?.payment_status==='paid'){const sess=event.data.object;const order=db.prepare('SELECT * FROM payment_orders WHERE provider_ref=?').get(sess.id);if(order){const c=db.prepare('SELECT * FROM campaigns WHERE id=?').get(order.campaign_id);if(c&&sess.currency==='eur'&&sess.amount_total===order.amount_cents&&sess.client_reference_id===order.campaign_id&&order.status!=='paid'){db.prepare("UPDATE payment_orders SET status='paid' WHERE id=?").run(order.id);if(PAYMENT_LAUNCH_ENABLED)db.prepare("UPDATE campaigns SET paid_cents=budget_cents,status='active' WHERE id=? AND status='awaiting_payment'").run(c.id);else console.error('Stripe payment received while marketplace is disabled. Campaign remains inactive; reconcile/refund order',order.id);}}}db.prepare('INSERT INTO webhook_events VALUES (?,?)').run(event.id,now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}broadcast('payment');send(res,200,{received:true});}
async function createStripeCheckout(req,res,u){if(!STRIPE_READY)throw fail(503,'Paid campaigns are disabled until verified payouts, compliance and HTTPS are configured. No charge was made.');const {campaign_id}=await json(req);const c=db.prepare('SELECT * FROM campaigns WHERE id=? AND owner_id=?').get(campaign_id,u.id);if(!c)throw fail(404,'Campaign not found.');if(!['draft','awaiting_payment'].includes(c.status))throw fail(409,'Campaign cannot be funded in this state.');const outstanding=db.prepare("SELECT 1 FROM payment_orders WHERE campaign_id=? AND status='pending'").get(c.id);if(outstanding)throw fail(409,'A checkout session already exists for this campaign. Complete or cancel that session first.');const amount=c.budget_cents+c.fee_cents;const orderId=id();const form=new URLSearchParams({'mode':'payment','success_url':APP_URL+'/?payment=return','cancel_url':APP_URL+'/?payment=cancel','client_reference_id':campaign_id,'metadata[campaign_id]':campaign_id,'line_items[0][price_data][currency]':'eur','line_items[0][price_data][unit_amount]':String(amount),'line_items[0][price_data][product_data][name]':'Viewly funded promotion • '+clean(c.title,80),'line_items[0][quantity]':'1'});const resp=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+STRIPE_KEY,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':orderId},body:form});const result=await resp.json();if(!resp.ok||!result.id||!result.url)throw fail(502,'Payment provider did not create a checkout session.');db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO payment_orders VALUES (?,?,?,?,?,?,?)').run(orderId,campaign_id,'stripe',result.id,'pending',amount,now());db.prepare("UPDATE campaigns SET status='awaiting_payment' WHERE id=? AND status='draft'").run(c.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}send(res,200,{checkout_url:result.url,order_id:orderId});}
async function saveMedia(part,isVideo){const type=isRealFile(part,isVideo);if(!isVideo&&part.content.length>15*1024*1024)throw fail(413,'Cover image must be under 15 MB.');const newName=crypto.randomBytes(20).toString('hex')+mimeExt[type];await fsp.writeFile(path.join(UPLOADS,newName),part.content,{flag:'wx'});return newName;}
async function sanitizeCover(part){
 isRealFile(part,false);
 if(part.content.length>10*1024*1024)throw fail(413,'Cover must be under 10 MB.');
 const tmp=path.join(DATA,crypto.randomBytes(20).toString('hex')+'.incoming');
 const name=crypto.randomBytes(20).toString('hex')+'.jpg',destination=path.join(UPLOADS,name);
 await fsp.writeFile(tmp,part.content,{flag:'wx',mode:0o600});
 try{
  const probe=await execFileAsync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',tmp],{timeout:12000,maxBuffer:65536});
  const dim=JSON.parse(probe.stdout).streams?.[0];
  if(!dim||!Number.isInteger(dim.width)||!Number.isInteger(dim.height)||dim.width<1||dim.height<1||dim.width>5000||dim.height>5000||dim.width*dim.height>12000000)throw fail(415,'Invalid or oversized cover image.');
  await execFileAsync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-threads','1','-i',tmp,'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease','-map_metadata','-1','-q:v','4','-y',destination],{timeout:20000,maxBuffer:65536});
  const stat=await fsp.stat(destination);
  if(stat.size<100||stat.size>5*1024*1024)throw fail(415,'Cover image could not be safely processed.');
  return name;
 }catch(e){
  await fsp.unlink(destination).catch(()=>{});
  if(e.status)throw e;
  throw fail(415,'Cover image could not be safely processed.');
 }finally{await fsp.unlink(tmp).catch(()=>{});}
}
async function verifyUploadedVideo(name){
 const file=path.join(UPLOADS,name);
 try{
  const {stdout}=await execFileAsync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-show_entries','format=duration','-of','json',file],{timeout:15000,maxBuffer:1024*1024});
  const info=JSON.parse(stdout);const duration=Number(info.format?.duration);
  if(!info.streams?.some(x=>x.codec_type==='video')||!Number.isFinite(duration)||duration<5||duration>3600)throw fail(422,'Upload a valid video between 5 seconds and 60 minutes.');
  return duration;
 }catch(e){if(e.status)throw e;throw fail(422,'The uploaded media is not a valid playable video.');}
}
function makeThumbnail(videoName){return new Promise(resolve=>{const out=crypto.randomBytes(20).toString('hex')+'.jpg';const cmd=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-ss','00:00:01','-i',path.join(UPLOADS,videoName),'-frames:v','1','-vf','scale=960:-2','-y',path.join(UPLOADS,out)]);const timeout=setTimeout(()=>cmd.kill('SIGKILL'),12000);cmd.on('error',()=>{clearTimeout(timeout);resolve(null)});cmd.on('close',async code=>{clearTimeout(timeout);if(code===0&&fs.existsSync(path.join(UPLOADS,out)))resolve(out);else resolve(null);});});}
async function generateClip(videoName,start,end,format='vertical'){
 return new Promise((resolve,reject)=>{
  const output=crypto.randomBytes(20).toString('hex')+'.mp4';
  const args=['-nostdin','-hide_banner','-loglevel','error','-ss',String(start),'-i',path.join(UPLOADS,videoName),'-t',String(end-start)];
  if(format==='vertical'){
   args.push('-filter_complex','[0:v]split=2[bg][fg];[bg]scale=540:960:force_original_aspect_ratio=increase,crop=540:960,boxblur=25:2[back];[fg]scale=540:960:force_original_aspect_ratio=decrease[front];[back][front]overlay=(W-w)/2:(H-h)/2,format=yuv420p[out]','-map','[out]','-map','0:a?');
  }
  args.push('-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',path.join(UPLOADS,output));
  const cmd=spawn('ffmpeg',args);let done=false;
  const timeout=setTimeout(()=>cmd.kill('SIGKILL'),120000);
  cmd.on('error',()=>{if(done)return;done=true;clearTimeout(timeout);reject(fail(503,'Clip processing is unavailable.'));});
  cmd.on('close',code=>{if(done)return;done=true;clearTimeout(timeout);if(code===0)resolve(output);else reject(fail(422,'Clip generation failed. Check that the range is inside the video.'));});
 });
}
function serveFile(req,res,filepath){const ext=path.extname(filepath).toLowerCase();const mime=mimeTypes[ext]||'application/octet-stream';fs.stat(filepath,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);return res.end('Not found');}const extra={'Content-Type':mime,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':filepath.startsWith(UPLOADS)?'public, max-age=3600':'no-cache'};const range=req.headers.range;if(range){const match=/bytes=(\d*)-(\d*)/.exec(range);if(!match){res.writeHead(416);return res.end();}const start=match[1]?Number(match[1]):0;const end=match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;if(start> end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}res.writeHead(206,{...extra,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${stat.size}`});fs.createReadStream(filepath,{start,end}).pipe(res);}else{res.writeHead(200,{...extra,'Content-Length':stat.size});fs.createReadStream(filepath).pipe(res);}});}
function statsFor(u){if(!u)return {};const rel=db.prepare('SELECT count(*) AS n FROM releases WHERE owner_id=?').get(u.id).n;const views=db.prepare('SELECT count(*) AS n FROM release_views v JOIN releases r ON r.id=v.release_id WHERE r.owner_id=?').get(u.id).n;const clips=db.prepare('SELECT count(*) AS n FROM clips WHERE user_id=?').get(u.id).n;const camp=db.prepare('SELECT count(*) AS n FROM campaigns WHERE owner_id=?').get(u.id).n;const wallet=db.prepare('SELECT COALESCE(sum(amount_cents),0) AS cents FROM wallet_ledger WHERE user_id=?').get(u.id).cents;return {releases:rel,plays:views,clips,campaigns:camp,earned_cents:wallet};}
const adminHandler=createAdminHandler({db,requireUser,fail,json,send,now,id,broadcast,cookieValue,sha});
const mailHandler=createMailHandler({db,requireUser,fail,send,json,limit,limitAccount,hashPassword,now,sha});
const billingHandler=createBillingHandler({db,requireUser,fail,json,send,now,id,limit,broadcast});
const sandboxCampaignHandler=createCampaignSandboxHandler({db,requireUser,fail,json,send,now,id,limit,broadcast});
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');const pathname=url.pathname;res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Permitted-Cross-Domain-Policies','none');res.setHeader('Origin-Agent-Cluster','?1');res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'");if(APP_URL.startsWith('https://'))res.setHeader('Strict-Transport-Security','max-age=15552000; includeSubDomains');requireSameOrigin(req);
 if(pathname==='/api/stripe/webhook'&&req.method==='POST')return stripeWebhook(req,res);
 if(pathname==='/auth/google'&&req.method==='GET')return googleStart(req,res);
 if(pathname==='/auth/google/callback'&&req.method==='GET')return googleCallback(req,res,url);
 if(pathname.startsWith('/media/')&&req.method==='GET'){
  const name=pathname.slice(7);
  if(!/^[a-f0-9]{40}\.(mp4|webm|mov|jpg|png|webp)$/.test(name))throw fail(404,'File not found.');
  const actor=sessionUser(req);
  const release=db.prepare("SELECT r.owner_id,r.visibility,u.status FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.file_name=? OR r.cover_name=?").get(name,name);
  if(release){
   const allowed=release.visibility==='public'&&release.status==='active'||actor?.id===release.owner_id||actor?.role==='admin';
   if(!allowed)throw fail(404,'File not found.');
   return serveFile(req,res,path.join(UPLOADS,name));
  }
  const clip=db.prepare("SELECT c.user_id,r.owner_id,r.visibility,owner.status AS owner_status,clipper.status AS clipper_status FROM clips c JOIN releases r ON r.id=c.release_id JOIN users owner ON owner.id=r.owner_id JOIN users clipper ON clipper.id=c.user_id WHERE c.file_name=?").get(name);
  const shareable=clip?.visibility==='public'&&clip.owner_status==='active'&&clip.clipper_status==='active';
  if(!clip||!shareable&&actor?.id!==clip.user_id&&actor?.role!=='admin')throw fail(404,'File not found.');
  return serveFile(req,res,path.join(UPLOADS,name));
 }
 if(!pathname.startsWith('/api/')){if(req.method!=='GET')throw fail(405,'Method not allowed.');const file=pathname==='/'?'index.html':pathname.slice(1);if(!/^[\w.\-/]+$/.test(file)||file.includes('..'))throw fail(404,'Not found.');return serveFile(req,res,path.join(PUBLIC,file));}
 if(req.method==='GET'&&pathname==='/api/events'){if(liveClients.size>=MAX_LIVE_CLIENTS)throw fail(503,'Realtime event capacity reached.');res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');liveClients.add(res);const beat=setInterval(()=>{try{res.write(': heartbeat\n\n')}catch{}},20000);req.on('close',()=>{clearInterval(beat);liveClients.delete(res)});return;}
 if(req.method==='GET'&&pathname==='/api/site')return send(res,200,siteSettings(db));
 if(pathname.startsWith('/api/auth/'))return mailHandler(req,res,pathname);
 if(pathname.startsWith('/api/billing/'))return billingHandler(req,res,url);
 if(pathname==='/api/sandbox/rewards'||/^\/api\/campaigns\/[a-f0-9-]{36}\/sandbox-fund$/.test(pathname))return sandboxCampaignHandler(req,res,pathname);
 if(pathname.startsWith('/api/admin/'))return adminHandler(req,res,url);
 if(req.method==='GET'&&pathname==='/api/config')return send(res,200,{brand:'Viewly',mfa_available:MFA_AVAILABLE,email_delivery_ready:!!(process.env.RESEND_API_KEY&&process.env.VIEWLY_MAIL_FROM&&APP_URL.startsWith('https://')),stripe_ready:STRIPE_READY,google_ready:!!(GOOGLE_ID&&GOOGLE_SECRET),clip_editor:true,provider_integrations:false,paid_marketplace_enabled:PAYMENT_LAUNCH_ENABLED,payouts_enabled:PAYMENT_LAUNCH_ENABLED});

 const artistMatch=pathname.match(/^\/api\/artists\/([a-f0-9-]{36})(?:\/(follow))?$/);
 if(artistMatch){
  const aid=artistMatch[1],operation=artistMatch[2],actor=sessionUser(req);
  const artist=db.prepare("SELECT id,username,display_name,role,bio,created_at FROM users WHERE id=? AND status='active' AND role IN ('artist','label','admin')").get(aid);
  if(!artist)throw fail(404,'Artist not found.');
  if(operation==='follow'&&req.method==='POST'){
   const user=requireUser(req);if(user.id===aid)throw fail(422,'You cannot follow yourself.');
   const existing=db.prepare('SELECT 1 FROM artist_follows WHERE follower_id=? AND artist_id=?').get(user.id,aid);
   if(existing)db.prepare('DELETE FROM artist_follows WHERE follower_id=? AND artist_id=?').run(user.id,aid);
   else db.prepare('INSERT INTO artist_follows VALUES (?,?,?)').run(user.id,aid,now());
   broadcast('follow');
  }else if(operation||req.method!=='GET')throw fail(405,'Method not allowed.');
  const followers=db.prepare('SELECT count(*) AS n FROM artist_follows WHERE artist_id=?').get(aid).n;
  const following=actor?!!db.prepare('SELECT 1 FROM artist_follows WHERE follower_id=? AND artist_id=?').get(actor.id,aid):false;
  const releases=db.prepare('SELECT count(*) AS n FROM releases WHERE owner_id=?').get(aid).n;
  return send(res,200,{artist:{...artist,followers,releases,following}});
 }
 if(pathname==='/api/following'&&req.method==='GET'){
  const user=requireUser(req);
  const artists=db.prepare('SELECT u.id,u.username,u.display_name,u.bio,f.created_at AS followed_at FROM artist_follows f JOIN users u ON u.id=f.artist_id WHERE f.follower_id=? ORDER BY f.created_at DESC LIMIT 100').all(user.id);
  return send(res,200,{artists});
 }
 if(pathname==='/api/activity'&&req.method==='GET'){
  const user=requireUser(req);
  const comments=db.prepare('SELECT c.id,c.created_at,u.display_name AS actor,r.title AS release_title FROM release_comments c JOIN releases r ON r.id=c.release_id JOIN users u ON u.id=c.user_id WHERE r.owner_id=? AND c.user_id<>? ORDER BY c.created_at DESC LIMIT 20').all(user.id,user.id).map(x=>({id:'comment-'+x.id,type:'comment',created_at:x.created_at,title:x.actor+' commented on '+x.release_title}));
  const follows=db.prepare('SELECT f.follower_id AS id,f.created_at,u.display_name AS actor FROM artist_follows f JOIN users u ON u.id=f.follower_id WHERE f.artist_id=? ORDER BY f.created_at DESC LIMIT 20').all(user.id).map(x=>({id:'follow-'+x.id,type:'follow',created_at:x.created_at,title:x.actor+' followed you'}));
  const releases=db.prepare('SELECT r.id,r.title,r.created_at,u.display_name AS actor FROM releases r JOIN artist_follows f ON r.owner_id=f.artist_id JOIN users u ON u.id=r.owner_id WHERE f.follower_id=? ORDER BY r.created_at DESC LIMIT 20').all(user.id).map(x=>({id:'release-'+x.id,type:'release',created_at:x.created_at,title:x.actor+' released '+x.title,release_id:x.id}));
  const items=[...comments,...follows,...releases].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,30);
  return send(res,200,{items});
 }
 if(pathname==='/api/admin/reports'&&req.method==='GET'){
  const user=requireUser(req);if(user.role!=='admin')throw fail(403,'Administrator access required.');
  const reports=db.prepare('SELECT x.id,x.reason,x.details,x.created_at,x.release_id,r.title AS release_title,u.username AS reporter FROM content_reports x JOIN releases r ON r.id=x.release_id JOIN users u ON u.id=x.reporter_id ORDER BY x.created_at DESC LIMIT 100').all();
  return send(res,200,{reports});
 }
 if(req.method==='GET'&&pathname==='/api/me'){const u=sessionUser(req);return send(res,200,{user:u,stats:statsFor(u)});}
 if(pathname==='/api/register'&&req.method==='POST'){
  limit(req,'registration',50,3600000);const b=await json(req);const email=clean(b.email,254).toLowerCase(),username=clean(b.username,30).toLowerCase(),display=clean(b.display_name,80),password=String(b.password||''),role=clean(b.role,10);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(422,'Enter a valid email address.');if(!/^[a-z0-9_]{3,24}$/.test(username))throw fail(422,'Username must be 3–24 characters (letters, numbers, _).');if(display.length<2)throw fail(422,'Enter your name or artist name.');if(password.length<12||password.length>128)throw fail(422,'Choose a password with at least 12 characters.');if(!['viewer','artist','label'].includes(role))throw fail(422,'Choose a valid account type.');if(statements.byEmail.get(email)||db.prepare('SELECT 1 FROM users WHERE username=?').get(username))throw fail(409,'Email or username is already registered.');const uid=id();db.prepare('INSERT INTO users(id,email,username,display_name,role,password_hash,created_at) VALUES(?,?,?,?,?,?,?)').run(uid,email,username,display,role,await hashPassword(password),now());createSession(res,uid);return send(res,201,{user:statements.getUser.get(uid)});
 }
 if(pathname==='/api/login'&&req.method==='POST'){
   limit(req,'login-global',600,900000);
   const b=await json(req),email=clean(b.email,254).toLowerCase();
   limitAccount('login',email,8);
   const u=statements.byEmail.get(email);
   if(!await validPassword(String(b.password||''),u?.password_hash))throw fail(401,'Incorrect email or password.');if(u.status!=='active')throw fail(403,'Account access has been suspended.');
   if(!u.password_hash.startsWith('s2$'))db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await hashPassword(String(b.password)),u.id);
   const previous=cookieValue(req,'viewly_session');
   if(previous)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(previous));
   db.prepare('DELETE FROM auth_throttle WHERE key=?').run(sha('login:'+email));
   if(hasMfa(u.id)){issueMfaTicket(req,res,u.id);return send(res,200,{mfa_required:true});}
   createSession(res,u.id);
   return send(res,200,{user:stripSensitive(u)});
  }
 if(pathname==='/api/logout'&&req.method==='POST'){const tk=cookieValue(req,'viewly_session');if(tk)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(tk));res.setHeader('Set-Cookie',cookie('viewly_session','',0));res.setHeader('Clear-Site-Data','"cache", "storage"');return send(res,200,{ok:true});}
 
if(pathname==='/api/security/mfa/login'&&req.method==='POST'){
 limit(req,'mfa-login',200,15*60*1000);
 const ticket=cookieValue(req,'viewly_mfa_ticket');
 if(!ticket)throw fail(401,'Security challenge expired. Sign in again.');
 const record=db.prepare('SELECT * FROM mfa_tickets WHERE token_hash=? AND expires_at>?').get(sha(ticket),Date.now());
 if(!record||record.attempts>=6)throw fail(401,'Security challenge expired. Sign in again.');
 limitAccount('mfa',record.user_id,10);
 db.prepare('UPDATE mfa_tickets SET attempts=attempts+1 WHERE token_hash=?').run(sha(ticket));
 const b=await json(req);
 if(!consumeMfaFactor(record.user_id,String(b.code||'')))throw fail(401,'Invalid authenticator or recovery code.');if(db.prepare('SELECT status FROM users WHERE id=?').get(record.user_id)?.status!=='active')throw fail(403,'Account access suspended.');
 db.prepare('DELETE FROM mfa_tickets WHERE user_id=?').run(record.user_id);
 db.prepare('DELETE FROM auth_throttle WHERE key=?').run(sha('mfa:'+record.user_id));
 res.setHeader('Set-Cookie',cookie('viewly_mfa_ticket','',0));
 createSession(res,record.user_id,true);
 return send(res,200,{user:statements.getUser.get(record.user_id)});
}
if(pathname==='/api/security/mfa'&&req.method==='GET'){
 const u=requireUser(req),method=mfaMethod(u.id);
 return send(res,200,{available:MFA_AVAILABLE,enabled:!!method?.enabled,pending:!!method&&!method.enabled});
}
if(pathname==='/api/security/mfa/setup'&&req.method==='POST'){
 const u=requireUser(req);
 if(!MFA_AVAILABLE)throw fail(503,'MFA encryption is not configured on this server.');
 if(!isRecentSession(req))throw fail(403,'Sign out and sign in again before enabling MFA.');
 if(hasMfa(u.id))throw fail(409,'Multi-factor authentication is already enabled.');
 const b=await json(req),owner=statements.byEmail.get(u.email);
 if(owner.password_hash&&!await validPassword(String(b.current_password||''),owner.password_hash))throw fail(401,'Current password is incorrect.');
 const secret=newTotpSecret();
 db.prepare('INSERT OR REPLACE INTO mfa_methods(user_id,seed_cipher,enabled,last_step,created_at) VALUES(?,?,?,?,?)').run(u.id,encryptSeed(secret,MFA_MASTER_KEY),0,-1,now());
 const otpauth='otpauth://totp/'+encodeURIComponent('Viewly:'+u.email)+'?'+new URLSearchParams({secret,issuer:'Viewly',algorithm:'SHA1',digits:'6',period:'30'});
 return send(res,200,{secret,otpauth_url:otpauth,note:'Keep this seed private; verify it with your authenticator app before activation.'});
}
if(pathname==='/api/security/mfa/enable'&&req.method==='POST'){
 const u=requireUser(req),method=mfaMethod(u.id),b=await json(req);
 if(!MFA_AVAILABLE)throw fail(503,'MFA is not configured.');
 if(!method||method.enabled)throw fail(409,'Begin a new MFA setup.');
 if(Date.now()-Date.parse(method.created_at)>15*60*1000)throw fail(410,'MFA setup expired. Start over.');
 const step=verifyTotp(decryptSeed(method.seed_cipher,MFA_MASTER_KEY),String(b.code||''),Date.now(),-1);
 if(step<0)throw fail(401,'Invalid authenticator code.');
 db.exec('BEGIN IMMEDIATE');let codes;
 try{
  db.prepare('UPDATE mfa_methods SET enabled=1,last_step=? WHERE user_id=? AND enabled=0').run(step,u.id);
  codes=generateRecovery(u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(u.id,sha(cookieValue(req,'viewly_session')||''));
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return send(res,200,{enabled:true,recovery_codes:codes,note:'Save recovery codes now. Each works only once and will not be shown again.'});
}
if(pathname==='/api/security/mfa/disable'&&req.method==='POST'){
 const u=requireUser(req),b=await json(req),owner=statements.byEmail.get(u.email);
 if(!hasMfa(u.id))throw fail(409,'MFA is not enabled.');
 if(owner.password_hash&&!await validPassword(String(b.current_password||''),owner.password_hash))throw fail(401,'Current password is incorrect.');
 limitAccount('mfa-change',u.id,8);
 if(!consumeMfaFactor(u.id,String(b.code||'')))throw fail(401,'Authenticator or recovery code required.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('DELETE FROM mfa_recovery WHERE user_id=?').run(u.id);
  db.prepare('DELETE FROM mfa_methods WHERE user_id=?').run(u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(u.id,sha(cookieValue(req,'viewly_session')||''));
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return send(res,200,{enabled:false});
}
if(pathname==='/api/security/sessions'&&req.method==='GET'){
   const u=requireUser(req),token=cookieValue(req,'viewly_session');
   const rows=db.prepare('SELECT token_hash,created_at,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 100').all(u.id,Date.now());
   return send(res,200,{sessions:rows.map(s=>({created_at:new Date(s.created_at).toISOString(),expires_at:new Date(s.expires_at).toISOString(),current:!!token&&s.token_hash===sha(token)}))});
  }
  if(pathname==='/api/security/logout-others'&&req.method==='POST'){
   const u=requireUser(req),token=cookieValue(req,'viewly_session');
   db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(u.id,sha(token||''));
   return send(res,200,{ok:true});
  }
  if(pathname==='/api/security/change-password'&&req.method==='POST'){
   const u=requireUser(req);limit(req,'change-password',10,15*60*1000);
   const b=await json(req),current=String(b.current_password||''),next=String(b.new_password||'');
   if(next.length<12||next.length>128)throw fail(422,'Use a new password of 12–128 characters.');
   const owner=statements.byEmail.get(u.email);
   if(!owner.password_hash)throw fail(409,'This account uses Google sign-in. Password changes are not available for it.');
   if(!await validPassword(current,owner.password_hash))throw fail(401,'Current password is incorrect.');
   if(hasMfa(u.id)&&!consumeMfaFactor(u.id,String(b.mfa_code||'')))throw fail(401,'Current authenticator or recovery code required.');
   if(current===next)throw fail(422,'Choose a different password.');
   const newHash=await hashPassword(next);
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(newHash,u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   createSession(res,u.id,hasMfa(u.id));
   return send(res,200,{ok:true,other_sessions_revoked:true});
  }
  if(pathname==='/api/role'&&req.method==='PATCH'){const u=requireUser(req);const b=await json(req);if(!['artist','label'].includes(b.role))throw fail(422,'Invalid account role.');if(u.role==='admin')throw fail(403,'Administrator role cannot be modified here.');db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role,u.id);return send(res,200,{user:statements.getUser.get(u.id)});}
 if(pathname==='/api/profile'&&req.method==='PATCH'){const u=requireUser(req);const b=await json(req);db.prepare('UPDATE users SET display_name=?,bio=? WHERE id=?').run(clean(b.display_name,80)||u.display_name,clean(b.bio,500),u.id);return send(res,200,{user:statements.getUser.get(u.id)});}
 if(pathname==='/api/releases'&&req.method==='GET'){const q=clean(url.searchParams.get('q')||'',120);const genre=clean(url.searchParams.get('genre')||'',40);const rows=db.prepare(`SELECT r.id,r.owner_id,r.title,r.description,r.genre,r.file_name,r.cover_name,r.created_at,u.display_name AS artist_name,u.username AS artist_username,(SELECT count(*) FROM release_views v WHERE v.release_id=r.id) AS plays,(SELECT count(*) FROM release_likes l WHERE l.release_id=r.id) AS likes,(SELECT count(*) FROM release_comments c WHERE c.release_id=r.id) AS comments FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.visibility='public' AND u.status='active' AND (?='' OR r.title LIKE '%'||?||'%' OR u.display_name LIKE '%'||?||'%') AND (?='' OR r.genre=?) ORDER BY r.created_at DESC LIMIT 80`).all(q,q,q,genre,genre);const u=sessionUser(req);return send(res,200,{releases:rows.map(r=>publicRelease(r,u))});}
 if(pathname==='/api/releases'&&req.method==='POST'){
  limit(req,'upload',12,3600000);
  if(uploadsInProgress>=MAX_CONCURRENT_UPLOADS)throw fail(503,'An upload is already being processed. Retry shortly.');
  uploadsInProgress++;
  try{const u=requireCreator(req);assertQuota(db,u.id,'releases',fail,id,now);const parts=multipart(await readBody(req,MAX_UPLOAD),req.headers['content-type']||'');const get=n=>parts.find(x=>x.name===n);const title=clean(get('title')?.content.toString(),90),desc=clean(get('description')?.content.toString(),900),genre=clean(get('genre')?.content.toString(),30)||'Rap';if(!title||title.length<2)throw fail(422,'Release title is required.');if(!['Trap','Rap','Drill','Hip-Hop','Freestyle','Other'].includes(genre))throw fail(422,'Choose a supported genre.');if(get('rights')?.content?.toString('utf8')!=='on')throw fail(422,'You must confirm that you hold the rights and have permission for public publishing and clipping.');const vid=await saveMedia(get('video'),true);try{await verifyUploadedVideo(vid);}catch(e){await fsp.unlink(path.join(UPLOADS,vid)).catch(()=>{});throw e;}let cover;if(get('cover')?.content.length)cover=await sanitizeCover(get('cover'));else cover=await makeThumbnail(vid);const rid=id();db.prepare('INSERT INTO releases(id,owner_id,title,description,genre,file_name,cover_name,created_at) VALUES (?,?,?,?,?,?,?,?)').run(rid,u.id,title,desc,genre,vid,cover,now());broadcast('release');return send(res,201,{release:getRelease(rid,u)});
  }finally{uploadsInProgress--;}
 }
 const releaseMatch=pathname.match(/^\/api\/releases\/([a-f0-9-]{36})(?:\/(\w+))?$/);
 if(releaseMatch){const rid=releaseMatch[1],action=releaseMatch[2],u=sessionUser(req);const r=getRelease(rid,u);if(!r)throw fail(404,'Release not found.');if(!action&&req.method==='GET')return send(res,200,{release:r});

  if(action==='report'&&req.method==='POST'){
   const actor=requireUser(req),b=await json(req),reason=clean(b.reason,32),details=clean(b.details,600);
   if(!['copyright','harassment','misleading','other'].includes(reason))throw fail(422,'Select a valid report reason.');
   const prior=db.prepare('SELECT id FROM content_reports WHERE release_id=? AND reporter_id=?').get(rid,actor.id);
   if(prior)return send(res,200,{ok:true,status:'already_submitted'});
   db.prepare('INSERT INTO content_reports(id,release_id,reporter_id,reason,details,created_at) VALUES (?,?,?,?,?,?)').run(id(),rid,actor.id,reason,details,now());
   broadcast('content-report');
   return send(res,201,{ok:true,status:'recorded',note:'Queued for administrator review. No automatic takedown claimed.'});
  }
  if(action==='comments'&&req.method==='GET')return send(res,200,{comments:db.prepare('SELECT c.id,c.body,c.created_at,u.display_name,u.username FROM release_comments c JOIN users u ON u.id=c.user_id WHERE c.release_id=? ORDER BY c.created_at DESC LIMIT 100').all(rid)});
  if(action==='comments'&&req.method==='POST'){const actor=requireUser(req);const b=await json(req);const body=clean(b.body,600);if(body.length<2)throw fail(422,'Write a comment.');const cid=id();db.prepare('INSERT INTO release_comments VALUES (?,?,?,?,?)').run(cid,rid,actor.id,body,now());broadcast('comment');return send(res,201,{ok:true,id:cid});}
  if(action==='like'&&req.method==='POST'){const actor=requireUser(req);if(db.prepare('SELECT 1 FROM release_likes WHERE release_id=? AND user_id=?').get(rid,actor.id))db.prepare('DELETE FROM release_likes WHERE release_id=? AND user_id=?').run(rid,actor.id);else db.prepare('INSERT INTO release_likes VALUES (?,?)').run(rid,actor.id);broadcast('release-stats');return send(res,200,{release:getRelease(rid,actor)});}
  if(action==='view'&&req.method==='POST'){const actor=requireUser(req);db.prepare('INSERT OR IGNORE INTO release_views VALUES (?,?,?)').run(rid,actor.id,now());broadcast('release-stats');return send(res,200,{release:getRelease(rid,actor)});}
  if(action==='clip'&&req.method==='POST'){const actor=requireUser(req);limit(req,'clip',15,3600000);assertQuota(db,actor.id,'clips_per_month',fail,id,now);if(clipJobsInProgress>=MAX_CONCURRENT_CLIPS)throw fail(503,'Clip processing is busy. Retry shortly.');const b=await json(req);const start=Number(b.start),end=Number(b.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start<5||end-start>90)throw fail(422,'Choose a 5–90 second clip range.');const format=b.format==='original'?'original':'vertical';const duration=await verifyUploadedVideo(r.file_name);if(end>duration+0.05)throw fail(422,'The clip range extends beyond the source video.');clipJobsInProgress++;let output;try{output=await generateClip(r.file_name,start,end,format);}finally{clipJobsInProgress--;}const cid=id();db.prepare('INSERT INTO clips VALUES (?,?,?,?,?,?,?)').run(cid,rid,actor.id,output,start,end,now());broadcast('clip');return send(res,201,{clip:{id:cid,video_url:'/media/'+output,start,end}});}
  if(!action&&req.method==='DELETE'){const actor=requireUser(req);if(r.owner_id!==actor.id)throw fail(403,'Only the artist can delete a release.');const campaigns=db.prepare('SELECT count(*) AS n FROM campaigns WHERE release_id=?').get(rid).n;if(campaigns)throw fail(409,'Release has linked campaigns. Delete or complete those first.');db.prepare('DELETE FROM release_comments WHERE release_id=?').run(rid);db.prepare('DELETE FROM release_likes WHERE release_id=?').run(rid);db.prepare('DELETE FROM release_views WHERE release_id=?').run(rid);db.prepare('DELETE FROM clips WHERE release_id=?').run(rid);db.prepare('DELETE FROM releases WHERE id=?').run(rid);broadcast('release');return send(res,200,{ok:true});}
 }
 // The creator's own real submission history, never unverified view counts or estimated payouts.
 if(pathname==='/api/my-submissions'&&req.method==='GET'){
  const actor=requireUser(req);
  const records=db.prepare(`SELECT s.id,s.campaign_id,s.post_url,s.status,s.created_at,s.reviewed_at,
    c.title AS campaign_title,c.platform,c.reward_cents,c.status AS campaign_status,
    r.title AS release_title
    FROM submissions s JOIN campaigns c ON c.id=s.campaign_id
    JOIN releases r ON r.id=c.release_id WHERE s.user_id=?
    ORDER BY s.created_at DESC LIMIT 100`).all(actor.id);
  return send(res,200,{submissions:records,note:'Approval does not imply verified social reach or a completed cash payout.'});
 }
 if(pathname==='/api/clips'&&req.method==='GET'){const actor=requireUser(req);const clips=db.prepare('SELECT c.*,r.title AS release_title FROM clips c JOIN releases r ON r.id=c.release_id WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 100').all(actor.id);return send(res,200,{clips:clips.map(c=>({...c,video_url:'/media/'+c.file_name}))});}
 if(pathname==='/api/campaigns'&&req.method==='GET'){const mine=url.searchParams.get('mine')==='1';if(mine){const u=requireUser(req);return send(res,200,{campaigns:campaignRows('WHERE c.owner_id=?',[u.id])});}return send(res,200,{campaigns:campaignRows("JOIN users owner ON owner.id=c.owner_id JOIN releases rel ON rel.id=c.release_id WHERE c.moderation_status='visible' AND owner.status='active' AND rel.visibility='public' AND ((c.status='active' AND c.paid_cents>c.spent_cents) OR (c.status='sandbox_active' AND c.sandbox_funded_cents>c.sandbox_spent_cents AND "+(process.env.VIEWLY_BILLING_MODE==='sandbox'&&process.env.VIEWLY_BILLING_SANDBOX_ALLOWED==='true'?'1':'0')+"=1))")});}
 if(pathname==='/api/campaigns'&&req.method==='POST'){const u=requireCreator(req);assertQuota(db,u.id,'campaigns',fail,id,now);const b=await json(req);const release=db.prepare('SELECT * FROM releases WHERE id=? AND owner_id=?').get(b.release_id,u.id);if(!release)throw fail(403,'Choose a release you own.');const reward=money(b.reward_eur),budget=money(b.budget_eur),title=clean(b.title,100),brief=clean(b.brief,1200),platform=clean(b.platform,30);if(!title||brief.length<15)throw fail(422,'Add a title and clear clipping brief.');if(!Number.isInteger(reward)||reward<50||reward>1000)throw fail(422,'Clip reward must be €0.50–€10.00.');if(!Number.isInteger(budget)||budget<1000||budget>10000000)throw fail(422,'Budget must be €10–€100,000.');if(!['Any','TikTok','Instagram Reels','YouTube Shorts'].includes(platform))throw fail(422,'Choose a supported destination.');if(budget<reward)throw fail(422,'Campaign budget is too low.');const fee=Math.round(budget*0.05),cid=id();db.prepare('INSERT INTO campaigns(id,owner_id,release_id,title,brief,platform,reward_cents,budget_cents,fee_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(cid,u.id,release.id,title,brief,platform,reward,budget,fee,now());broadcast('campaign');return send(res,201,{campaign:campaignRows('WHERE c.id=?',[cid])[0]});}
 if(pathname==='/api/payments/stripe/checkout'&&req.method==='POST')return createStripeCheckout(req,res,requireCreator(req));
 const campMatch=pathname.match(/^\/api\/campaigns\/([a-f0-9-]{36})(?:\/(\w+))?$/);
 if(campMatch){const cid=campMatch[1],action=campMatch[2],camp=db.prepare('SELECT * FROM campaigns WHERE id=?').get(cid);if(!camp)throw fail(404,'Campaign not found.');const u=sessionUser(req);if(!action&&req.method==='GET'){const ownerOrAdmin=u?.id===camp.owner_id||u?.role==='admin';const publicEntry=((camp.status==='active'&&camp.paid_cents>camp.spent_cents)||(sandboxCampaignAllowed(camp)&&camp.sandbox_funded_cents>camp.sandbox_spent_cents))&&camp.moderation_status==='visible'&&db.prepare("SELECT 1 FROM users u JOIN releases r ON r.owner_id=u.id WHERE u.id=? AND u.status='active' AND r.id=? AND r.visibility='public'").get(camp.owner_id,camp.release_id);if(!ownerOrAdmin&&!publicEntry)throw fail(404,'Campaign not found.');return send(res,200,{campaign:campaignRows('WHERE c.id=?',[cid])[0]});}
 if(action==='submit'&&req.method==='POST'){if(!PAYMENT_LAUNCH_ENABLED)throw fail(503,'Paid campaign submissions are disabled until payouts are operational.');const actor=requireUser(req);if(camp.owner_id===actor.id)throw fail(403,'You cannot claim your own campaign.');if(camp.status!=='active'||camp.spent_cents+camp.reward_cents>camp.paid_cents)throw fail(409,'Campaign is not accepting submissions.');const b=await json(req),link=clean(b.post_url,800);let linkUrl;try{linkUrl=new URL(link)}catch{throw fail(422,'Paste a valid public clip link.')}if(linkUrl.protocol!=='https:'||!/(^|\.)(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)$/.test(linkUrl.hostname))throw fail(422,'Submit a public TikTok, Instagram or YouTube link.');let clipId=null;if(b.clip_id){const clip=db.prepare('SELECT * FROM clips WHERE id=? AND user_id=? AND release_id=?').get(b.clip_id,actor.id,camp.release_id);if(!clip)throw fail(403,'Select one of your own clips for this release.');clipId=clip.id;}const sid=id();try{db.prepare('INSERT INTO submissions(id,campaign_id,user_id,clip_id,post_url,created_at) VALUES(?,?,?,?,?,?)').run(sid,cid,actor.id,clipId,link,now());}catch{throw fail(409,'This clip link has already been submitted.');}broadcast('submission');return send(res,201,{submission_id:sid,status:'pending',note:'Submitted for human review. External views are not automatically verified.'});}
 if(action==='submissions'&&req.method==='GET'){const actor=requireUser(req);if(camp.owner_id!==actor.id)throw fail(403,'Only campaign owner can review submissions.');return send(res,200,{submissions:db.prepare('SELECT s.*,u.username,u.display_name,c.file_name AS clip_file FROM submissions s JOIN users u ON u.id=s.user_id LEFT JOIN clips c ON c.id=s.clip_id WHERE s.campaign_id=? ORDER BY s.created_at DESC').all(cid).map(s=>({...s,clip_url:s.clip_file?'/media/'+s.clip_file:null}))});}
 }
 const subMatch=pathname.match(/^\/api\/submissions\/([a-f0-9-]{36})\/review$/);
 if(subMatch&&req.method==='POST'){if(!PAYMENT_LAUNCH_ENABLED)throw fail(503,'Paid campaign rewards are disabled until payouts are operational.');const actor=requireCreator(req),sid=subMatch[1],b=await json(req);if(!['approved','rejected'].includes(b.status))throw fail(422,'Invalid decision.');db.exec('BEGIN IMMEDIATE');try{const sub=db.prepare('SELECT * FROM submissions WHERE id=?').get(sid);if(!sub||sub.status!=='pending')throw fail(409,'Submission already reviewed or missing.');const camp=db.prepare('SELECT * FROM campaigns WHERE id=?').get(sub.campaign_id);if(camp.owner_id!==actor.id)throw fail(403,'Only the campaign owner can review.');if(b.status==='approved'){if(camp.status!=='active'||camp.spent_cents+camp.reward_cents>camp.paid_cents)throw fail(409,'Campaign does not have sufficient verified funds.');db.prepare('UPDATE campaigns SET spent_cents=spent_cents+?,status=CASE WHEN spent_cents+?>=paid_cents THEN \'completed\' ELSE status END WHERE id=?').run(camp.reward_cents,camp.reward_cents,camp.id);db.prepare('INSERT INTO wallet_ledger VALUES (?,?,?,?,?,?,?)').run(id(),sub.user_id,camp.id,sub.id,'earned_pending_payout',camp.reward_cents,now());}db.prepare('UPDATE submissions SET status=?,reviewed_at=? WHERE id=?').run(b.status,now(),sid);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}broadcast('submission-reviewed');return send(res,200,{ok:true,status:b.status});}
 if(pathname==='/api/wallet'&&req.method==='GET'){const actor=requireUser(req);const entries=db.prepare('SELECT l.*,c.title AS campaign_title FROM wallet_ledger l LEFT JOIN campaigns c ON c.id=l.campaign_id WHERE l.user_id=? ORDER BY l.created_at DESC LIMIT 100').all(actor.id);const totals=db.prepare('SELECT COALESCE(sum(amount_cents),0) AS earned_cents FROM wallet_ledger WHERE user_id=?').get(actor.id);return send(res,200,{earned_cents:totals.earned_cents,payout_enabled:false,available_to_withdraw_cents:0,entries,note:'Rewards earned are recorded against funded campaigns. Cash withdrawals require a separately configured compliant payout provider and verification.'});}
 if(pathname==='/api/health'&&req.method==='GET')return send(res,200,{status:'ok',database:'connected',timestamp:now(),payments:'disabled_until_verified_payouts'});
 throw fail(404,'Route not found.');
}
const server=http.createServer(async(req,res)=>{try{await handle(req,res)}catch(err){const status=Number(err.status)||500;if(status>=500)console.error(err);if(!res.headersSent)error(res,status,status===500?'Internal server error.':err.message);else res.end();}});
server.requestTimeout=120000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=80;server.maxRequestsPerSocket=500;
server.listen(PORT,'0.0.0.0',()=>console.log(`VIEWLY running at ${APP_URL} (port ${PORT})`));
