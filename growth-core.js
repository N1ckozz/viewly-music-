import crypto from 'node:crypto';
import {isSandboxBilling,PLAN_CATALOG} from './billing-core.js';
export const PREMIUM_THRESHOLD=200000;
const DAY=86400000;
export function initGrowth(db){
 db.exec("CREATE TABLE IF NOT EXISTS referral_codes(user_id TEXT PRIMARY KEY REFERENCES users(id),code TEXT UNIQUE NOT NULL); CREATE TABLE IF NOT EXISTS referrals(invitee_id TEXT PRIMARY KEY REFERENCES users(id),inviter_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,qualified_at TEXT,CHECK(invitee_id<>inviter_id)); CREATE TABLE IF NOT EXISTS referral_perks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),invitee_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL,used_campaign_id TEXT UNIQUE REFERENCES campaigns(id),UNIQUE(user_id,invitee_id)); CREATE TABLE IF NOT EXISTS campaign_memberships(user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),mode TEXT NOT NULL,access TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,campaign_id)); CREATE UNIQUE INDEX IF NOT EXISTS one_premium_pass ON campaign_memberships(user_id,mode) WHERE access='first_free'; CREATE TABLE IF NOT EXISTS onboarding_seen(user_id TEXT PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL,seen_at TEXT NOT NULL);");
}
export function accessFor(db,user,camp,at=Date.now()){
 const mode=camp.status.startsWith('sandbox_')?'sandbox':'live';
 const amount=mode==='sandbox'?camp.sandbox_funded_cents:camp.paid_cents;
 const premium=amount>PREMIUM_THRESHOLD;
 if(!user)return {premium,allowed:false,reason:'sign_in',mode};
 if(user.id===camp.owner_id)return {premium,allowed:false,reason:'owner',mode};
 const existing=db.prepare('SELECT access FROM campaign_memberships WHERE user_id=? AND campaign_id=?').get(user.id,camp.id);
 if(existing)return {premium,allowed:true,joined:true,reason:existing.access,mode};
 if(!premium)return {premium,allowed:true,reason:'standard',mode};
 const used=!!db.prepare("SELECT 1 FROM campaign_memberships WHERE user_id=? AND mode=? AND access='first_free'").get(user.id,mode);
 if(!used)return {premium,allowed:true,reason:'first_free',mode};
 const sub=db.prepare('SELECT * FROM account_subscriptions WHERE user_id=?').get(user.id);
 const paid=mode==='sandbox'&&isSandboxBilling()&&sub?.provider==='sandbox'&&sub.status==='active'&&Date.parse(sub.period_end_at)>at&&PLAN_CATALOG[sub.plan_id]?.monthly_cents>0;
 return {premium,allowed:!!paid,reason:paid?'test_plan':'plan_required',mode};
}
export function joinCampaign(db,user,camp,fail,now){
 const access=accessFor(db,user,camp);
 if(!access.allowed)throw fail(403,access.reason==='plan_required'?'A paid plan is required after your first premium campaign. In sandbox, only a test plan is needed.':'You cannot join this campaign.');
 if(!access.joined)db.prepare('INSERT INTO campaign_memberships VALUES(?,?,?,?,?)').run(user.id,camp.id,access.mode,access.reason,now());
 return access;
}
export function qualifyReferrals(db,userId,at=Date.now()){
 const rows=db.prepare("SELECT r.*,u.status,u.email_verified,u.created_at AS account_created FROM referrals r JOIN users u ON u.id=r.invitee_id JOIN users i ON i.id=r.inviter_id WHERE r.qualified_at IS NULL AND (r.invitee_id=? OR r.inviter_id=?) AND u.status='active' AND i.status='active' AND u.email_verified=1 AND i.email_verified=1").all(userId,userId);
 for(const r of rows){
  if(at-Date.parse(r.account_created)<DAY||at-Date.parse(r.created_at)>30*DAY)continue;
  if(db.prepare('SELECT count(*) AS n FROM referrals WHERE inviter_id=? AND qualified_at IS NOT NULL').get(r.inviter_id).n>=5)continue;
  db.prepare('UPDATE referrals SET qualified_at=? WHERE invitee_id=? AND qualified_at IS NULL').run(new Date(at).toISOString(),r.invitee_id);
  for(const uid of [r.invitee_id,r.inviter_id])db.prepare('INSERT OR IGNORE INTO referral_perks(id,user_id,invitee_id,expires_at) VALUES(?,?,?,?)').run(crypto.randomUUID(),uid,r.invitee_id,new Date(at+30*DAY).toISOString());
 }
}
export function feeBenefit(db,userId,base,at=new Date().toISOString()){
 // Standalone catalogue tests and legacy databases can quote with no referral schema.
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='referral_perks'").get())return {discount_cents:0,perk_id:null};
 const p=db.prepare('SELECT id FROM referral_perks WHERE user_id=? AND used_campaign_id IS NULL AND expires_at>? ORDER BY expires_at,id LIMIT 1').get(userId,at);
 return {discount_cents:p?Math.round(base*.2):0,perk_id:p?.id||null};
}
export function consumeBenefit(db,q,owner,at){
 if(!q.perk_id)return;
 const result=db.prepare('UPDATE referral_perks SET used_campaign_id=? WHERE id=? AND user_id=? AND used_campaign_id IS NULL AND expires_at>?').run(q.campaign_id,q.perk_id,owner,at);
 if(result.changes!==1)throw Object.assign(Error('Referral discount expired or was used. Refresh quote.'),{status:409});
}
export function createGrowthHandler({db,requireUser,fail,json,send,now,limit}){
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const x=fn();db.exec('COMMIT');return x}catch(e){db.exec('ROLLBACK');throw e}};
 return async(req,res,url)=>{
  const p=url.pathname;
  if(p==='/api/growth/policy'&&req.method==='GET')return send(res,200,{premium_threshold_cents:PREMIUM_THRESHOLD,first_premium_free:true,referral_fee_discount_percent:20,referral_expiry_days:30,referral_cap:5,payment_provider:'paypal_planned',real_payments:false});
  const user=requireUser(req);
  if(p==='/api/growth/me'&&req.method==='GET'){
   const answer=tx(()=>{
    qualifyReferrals(db,user.id);
    db.prepare('INSERT OR IGNORE INTO referral_codes VALUES(?,?)').run(user.id,crypto.randomBytes(16).toString('hex'));
    const at=now();
    return {code:db.prepare('SELECT code FROM referral_codes WHERE user_id=?').get(user.id).code,
     invited:db.prepare('SELECT count(*) AS n FROM referrals WHERE inviter_id=?').get(user.id).n,
     qualified:db.prepare('SELECT count(*) AS n FROM referrals WHERE inviter_id=? AND qualified_at IS NOT NULL').get(user.id).n,
     perks:db.prepare('SELECT expires_at FROM referral_perks WHERE user_id=? AND used_campaign_id IS NULL AND expires_at>? ORDER BY expires_at').all(user.id,at),
     claimed:!!db.prepare('SELECT 1 FROM referrals WHERE invitee_id=?').get(user.id),
     onboarding:db.prepare('SELECT version FROM onboarding_seen WHERE user_id=?').get(user.id)?.version||0,
     premium_pass_used:!!db.prepare("SELECT 1 FROM campaign_memberships WHERE user_id=? AND mode=? AND access='first_free'").get(user.id,isSandboxBilling()?'sandbox':'live')};
   });
   return send(res,200,answer);
  }
  if(p==='/api/growth/claim'&&req.method==='POST'){
   limit(req,'referral-claim',12,3600000);const b=await json(req);
   if(typeof b.code!=='string'||!/^[a-f0-9]{32}$/.test(b.code))throw fail(422,'Invalid invitation code.');
   if(Date.now()-Date.parse(user.created_at)>7*DAY)throw fail(409,'Invitations can only be claimed during the first seven days.');
   const inviter=db.prepare("SELECT c.user_id FROM referral_codes c JOIN users u ON u.id=c.user_id WHERE c.code=? AND u.status='active'").get(b.code);
   if(!inviter||inviter.user_id===user.id)throw fail(422,'Invalid invitation or own code.');
   const out=tx(()=>{
    if(db.prepare('SELECT 1 FROM referrals WHERE invitee_id=?').get(user.id))throw fail(409,'Invitation already claimed.');
    if(db.prepare('SELECT 1 FROM referrals WHERE invitee_id=? AND inviter_id=?').get(inviter.user_id,user.id))throw fail(409,'Reciprocal invitations are not eligible.');
    if(db.prepare('SELECT count(*) AS n FROM referrals WHERE inviter_id=?').get(inviter.user_id).n>=25)throw fail(409,'Invitation capacity reached.');
    db.prepare('INSERT INTO referrals(invitee_id,inviter_id,created_at) VALUES(?,?,?)').run(user.id,inviter.user_id,now());return {ok:true};
   });return send(res,201,out);
  }
  if(p==='/api/growth/welcome'&&req.method==='POST'){
   await json(req);db.prepare("INSERT INTO onboarding_seen VALUES(?,15,?) ON CONFLICT(user_id) DO UPDATE SET version=15,seen_at=excluded.seen_at").run(user.id,now());return send(res,200,{ok:true});
  }
  const match=p.match(/^\/api\/growth\/campaigns\/([a-f0-9-]{36})$/);
  if(match){
   const lookup=()=>db.prepare("SELECT c.* FROM campaigns c JOIN releases r ON r.id=c.release_id JOIN users u ON u.id=c.owner_id WHERE c.id=? AND c.moderation_status='visible' AND r.visibility='public' AND u.status='active' AND ((c.status='active' AND c.paid_cents>c.spent_cents) OR (c.status='sandbox_active' AND c.sandbox_funded_cents>c.sandbox_spent_cents AND ?=1))").get(match[1],isSandboxBilling()?1:0);
   if(req.method==='GET'){const c=lookup();if(!c)throw fail(404,'Campaign unavailable.');return send(res,200,accessFor(db,user,c));}
   if(req.method==='POST'){await json(req);const result=tx(()=>{const c=lookup();if(!c)throw fail(404,'Campaign unavailable.');return joinCampaign(db,user,c,fail,now)});return send(res,200,{...result,joined:true});}
  }
  throw fail(404,'Growth route unavailable.');
 };
}
