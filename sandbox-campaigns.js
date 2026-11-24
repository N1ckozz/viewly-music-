/* Viewly campaign sandbox — test full campaign/reward lifecycle with €0 actual payments.
   All test funds/rewards are SEPARATE from Stripe orders, wallet_ledger and paid_cents.
 */
import {isSandboxBilling} from './billing-core.js';
export function initCampaignSandbox(db){
 const cols=db.prepare('PRAGMA table_info(campaigns)').all().map(x=>x.name);
 if(!cols.includes('sandbox_funded_cents'))db.exec('ALTER TABLE campaigns ADD COLUMN sandbox_funded_cents INTEGER NOT NULL DEFAULT 0');
 if(!cols.includes('sandbox_spent_cents'))db.exec('ALTER TABLE campaigns ADD COLUMN sandbox_spent_cents INTEGER NOT NULL DEFAULT 0');
 db.exec("CREATE TABLE IF NOT EXISTS sandbox_campaign_orders(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id),user_id TEXT NOT NULL REFERENCES users(id),quoted_amount_cents INTEGER NOT NULL,charged_cents INTEGER NOT NULL DEFAULT 0 CHECK(charged_cents=0),created_at TEXT NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS sandbox_creator_rewards(id TEXT PRIMARY KEY,submission_id TEXT UNIQUE NOT NULL REFERENCES submissions(id),user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),quoted_reward_cents INTEGER NOT NULL,withdrawable_cents INTEGER NOT NULL DEFAULT 0 CHECK(withdrawable_cents=0),created_at TEXT NOT NULL)");
}
export function sandboxCampaignAllowed(camp){return isSandboxBilling()&&camp?.status==='sandbox_active'}
export function campaignBalance(camp){
 const test=sandboxCampaignAllowed(camp);
 const remaining=Math.max(0,test?camp.sandbox_funded_cents-camp.sandbox_spent_cents:camp.paid_cents-camp.spent_cents);
 return {is_sandbox:test,remaining_cents:remaining,eligible_spots:Math.floor(remaining/Math.max(1,camp.reward_cents)),
  quoted_total_cents:camp.budget_cents+camp.fee_cents,actually_charged_cents:test?0:null,
  reward_type:test?'sandbox_non_withdrawable':'verified_provider_only'};
}
function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}
export function createCampaignSandboxHandler({db,requireUser,fail,json,send,limit,id,now,broadcast}){
 return async function handle(req,res,pathname){
  if(pathname==='/api/sandbox/rewards'&&req.method==='GET'){
   const actor=requireUser(req);
   const rows=db.prepare('SELECT r.id,r.campaign_id,r.submission_id,r.quoted_reward_cents,r.withdrawable_cents,r.created_at,c.title AS campaign_title FROM sandbox_creator_rewards r JOIN campaigns c ON c.id=r.campaign_id WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 50').all(actor.id);
   const total=db.prepare('SELECT COALESCE(sum(quoted_reward_cents),0) AS n FROM sandbox_creator_rewards WHERE user_id=?').get(actor.id).n;
   return send(res,200,{sandbox:true,test_earned_cents:total,withdrawable_cents:0,rows,
    notice:'Test reward approvals only. These are not earnings or cash balances and cannot be withdrawn.'});
  }
  const m=pathname.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/sandbox-fund$/);
  if(!m||req.method!=='POST')return false;
  if(!isSandboxBilling())throw fail(503,'Sandbox payments are disabled. No real payment is available.');
  const actor=requireUser(req),camp=db.prepare('SELECT * FROM campaigns WHERE id=?').get(m[1]);
  if(!camp)throw fail(404,'Campaign not found.');
  if(camp.owner_id!==actor.id)throw fail(403,'Only the campaign owner may test the funding process.');
  if(camp.status==='sandbox_active'){
   const saved=db.prepare('SELECT * FROM sandbox_campaign_orders WHERE campaign_id=?').get(camp.id);
   return send(res,200,{ok:true,already_active:true,order:saved,charged_cents:0,mode:'sandbox'});
  }
  if(!['draft','awaiting_payment'].includes(camp.status))throw fail(409,'Campaign is not eligible for sandbox funding.');
  const valid=db.prepare("SELECT 1 FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.id=? AND r.visibility='public' AND u.status='active'").get(camp.release_id);
  if(!valid)throw fail(409,'Campaign release must be publicly available.');
  limit(req,'sandbox-campaign-fund',20,3600000);
  await json(req);
  const order={id:id(),campaign_id:camp.id,quoted_amount_cents:camp.budget_cents+camp.fee_cents,charged_cents:0,created_at:now()};
  transaction(db,()=>{
   db.prepare('INSERT INTO sandbox_campaign_orders(id,campaign_id,user_id,quoted_amount_cents,charged_cents,created_at) VALUES (?,?,?,?,0,?)')
    .run(order.id,camp.id,actor.id,order.quoted_amount_cents,order.created_at);
   db.prepare("UPDATE campaigns SET status='sandbox_active',sandbox_funded_cents=budget_cents,sandbox_spent_cents=0 WHERE id=?")
    .run(camp.id);
  });
  broadcast('sandbox-campaign');
  return send(res,201,{ok:true,mode:'sandbox',order,charged_cents:0,quoted_amount_cents:order.quoted_amount_cents,
   campaign_status:'sandbox_active',notice:'Test campaign funded on paper. No actual funds received, paid, or available for withdrawal.'});
 };
}
export function reviewSandboxSubmission({db,fail,send,now,id,broadcast},req,res,actor,subId,decision){
 if(!isSandboxBilling())throw fail(503,'Sandbox is off.');
 if(!['approved','rejected'].includes(decision))throw fail(422,'Invalid decision.');
 const result=transaction(db,()=>{
  const sub=db.prepare('SELECT * FROM submissions WHERE id=?').get(subId);
  if(!sub||sub.status!=='sandbox_pending')throw fail(409,'Test submission not pending.');
  const camp=db.prepare('SELECT * FROM campaigns WHERE id=?').get(sub.campaign_id);
  if(!camp||camp.owner_id!==actor.id)throw fail(403,'Only the campaign owner can review submissions.');
  if(camp.status!=='sandbox_active')throw fail(409,'Test campaign is no longer active.');
  if(decision==='approved'){
   if(camp.sandbox_spent_cents+camp.reward_cents>camp.sandbox_funded_cents)throw fail(409,'Not enough remaining test credit.');
   db.prepare('UPDATE campaigns SET sandbox_spent_cents=sandbox_spent_cents+? WHERE id=?').run(camp.reward_cents,camp.id);
   db.prepare('INSERT INTO sandbox_creator_rewards(id,submission_id,user_id,campaign_id,quoted_reward_cents,withdrawable_cents,created_at) VALUES (?,?,?,?,?,0,?)')
    .run(id(),sub.id,sub.user_id,camp.id,camp.reward_cents,now());
  }
  const next='sandbox_'+decision;
  db.prepare('UPDATE submissions SET status=?,reviewed_at=? WHERE id=?').run(next,now(),sub.id);
  return {status:next,reward_quote_cents:decision==='approved'?camp.reward_cents:0,charged_cents:0};
 });
 broadcast('sandbox-submission-reviewed');
 return send(res,200,{ok:true,mode:'sandbox',...result,withdrawable_cents:0,
  note:'Test review only. No wallet ledger or real payout has been created.'});
}
