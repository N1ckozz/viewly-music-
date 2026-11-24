/* VIEWLY BILLING V9 — sandbox-only subscription lifecycle.
   A subscription activation is an entitlement test, NEVER proof of payment.
   No bank/cards/PayPal/Stripe API, no Stripe orders, no wallet changes.
*/
export const PLAN_CATALOG=Object.freeze({
 free:{id:'free',name:'Free',tagline:'Explore the sound',monthly_cents:0,yearly_cents:0,
   limits:{releases:3,clips_per_month:10,campaigns:2},features:['Music discovery','Artist profile','10 clips per month','Up to 3 releases','2 campaign drafts']},
 creator:{id:'creator',name:'Creator',tagline:'Build your presence',monthly_cents:500,yearly_cents:5000,
   limits:{releases:30,clips_per_month:100,campaigns:15},features:['Everything in Free','Up to 30 releases','100 clips per month','15 campaign drafts','Real release analytics']},
 pro:{id:'pro',name:'Creator Pro',tagline:'Take your releases further',monthly_cents:1999,yearly_cents:19900,
   limits:{releases:150,clips_per_month:500,campaigns:80},features:['Everything in Creator','Up to 150 releases','500 clips per month','80 campaign drafts','Real release analytics']},
 studio:{id:'studio',name:'Studio',tagline:'Built for a growing label',monthly_cents:4999,yearly_cents:49900,
   limits:{releases:1000,clips_per_month:2000,campaigns:500},features:['Everything in Creator Pro','Up to 1,000 releases','2,000 clips per month','500 campaign drafts','Real release analytics']}
});
const MONTH='monthly',YEAR='yearly',CYCLE=new Set([MONTH,YEAR]);
const ISO=ms=>new Date(ms).toISOString();
const safeUser=(user)=>typeof user==='string'?user:user?.id;
const safePositive=n=>Math.max(0,Number(n)||0);
function addInterval(date,period){const d=new Date(date);if(period===YEAR)d.setUTCFullYear(d.getUTCFullYear()+1);else d.setUTCMonth(d.getUTCMonth()+1);return d.getTime()}
export function initSubscriptions(db){
 db.exec("CREATE TABLE IF NOT EXISTS account_subscriptions(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,plan_id TEXT NOT NULL,period TEXT NOT NULL,status TEXT NOT NULL,provider TEXT NOT NULL,started_at TEXT NOT NULL,period_start_at TEXT NOT NULL,period_end_at TEXT NOT NULL,auto_renew INTEGER NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1)");
 db.exec("CREATE TABLE IF NOT EXISTS subscription_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,action TEXT NOT NULL,plan_id TEXT NOT NULL,period TEXT NOT NULL,quoted_price_cents INTEGER NOT NULL,charged_cents INTEGER NOT NULL DEFAULT 0,provider TEXT NOT NULL,created_at TEXT NOT NULL,note TEXT NOT NULL)");
 db.exec('CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id,created_at DESC)');
}
export function catalog(){
 return Object.values(PLAN_CATALOG).map(p=>({...p,billing_enabled:false,currency:'EUR',
  yearly_discount_percent:p.monthly_cents?Math.round((1-p.yearly_cents/(p.monthly_cents*12))*100):0}));
}
export function isSandboxBilling(env=process.env){
 return env.VIEWLY_BILLING_MODE==='sandbox'&&env.VIEWLY_BILLING_SANDBOX_ALLOWED==='true';
}
function getRow(db,userId){return db.prepare('SELECT * FROM account_subscriptions WHERE user_id=?').get(userId)}
function event(db,details){
 db.prepare('INSERT INTO subscription_events(id,user_id,action,plan_id,period,quoted_price_cents,charged_cents,provider,created_at,note) VALUES (?,?,?,?,?,?,?,?,?,?)')
 .run(details.id(),details.userId,details.action,details.planId,details.period,details.price,0,'sandbox',details.now(),details.note);
}
function atomic(db,task){
 db.exec('BEGIN IMMEDIATE');
 try{const result=task();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}
}
function reconcile(db,userId,id,now){
 const row=getRow(db,userId);if(!row)return null;
 const current=Date.now(),deadline=Date.parse(row.period_end_at);
 if(!(deadline<=current))return row;
 if(row.provider!=='sandbox'||!isSandboxBilling()){
  if(row.status!=='expired')db.prepare("UPDATE account_subscriptions SET status='expired',updated_at=? WHERE user_id=?").run(now(),userId);
  return getRow(db,userId);
 }
 if(row.auto_renew!==1||row.status!=='active'){
  if(row.status!=='expired')db.prepare("UPDATE account_subscriptions SET status='expired',updated_at=? WHERE user_id=?").run(now(),userId);
  return getRow(db,userId);
 }
 return atomic(db,()=>{
  let next=new Date(deadline).getTime(),start=deadline,cycles=0;
  // Simulate renewals only on account access; no money is collected.
  while(next<=current&&cycles<240){start=next;next=addInterval(next,row.period);cycles++;}
  if(next<=current){start=current;next=addInterval(current,row.period);}
  db.prepare('UPDATE account_subscriptions SET period_start_at=?,period_end_at=?,updated_at=?,version=version+1 WHERE user_id=?').run(ISO(start),ISO(next),now(),userId);
  event(db,{id,userId,action:'sandbox_renew',planId:row.plan_id,period:row.period,price:PLAN_CATALOG[row.plan_id][row.period+'_cents'],now,note:'Sandbox renewal. Total charged: €0.00.'});
  return getRow(db,userId);
 });
}
export function currentEntitlement(db,userId,id=()=>'',now=()=>ISO(Date.now())){
 const row=reconcile(db,safeUser(userId),id,now);
 const valid=row?.status==='active'&&Date.parse(row.period_end_at)>Date.now()&&row.provider==='sandbox'&&isSandboxBilling();
 const plan=valid?PLAN_CATALOG[row.plan_id]:PLAN_CATALOG.free;
 const response={plan_id:plan.id,plan_name:plan.name,period:valid?row.period:null,
  status:valid?'active':row?.status==='expired'?'expired':'free',
  provider:valid?'sandbox':'none',sandbox:isSandboxBilling(),limits:plan.limits,
  current_period_end:valid?row.period_end_at:null,auto_renew:valid?!!row.auto_renew:false,
  amount_charged_cents:0,notice:valid?'Sandbox entitlement only. €0.00 was charged. No payment method stored.':'Free plan. No paid subscription active.'};
 return response;
}
export function usage(db,userId){
 const start=new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);
 return {releases:db.prepare('SELECT count(*) AS n FROM releases WHERE owner_id=?').get(userId).n,
  clips_per_month:db.prepare('SELECT count(*) AS n FROM clips WHERE user_id=? AND created_at>=?').get(userId,start.toISOString()).n,
  campaigns:db.prepare('SELECT count(*) AS n FROM campaigns WHERE owner_id=?').get(userId).n};
}
export function assertQuota(db,userId,action,fail,id,now){
 const ent=currentEntitlement(db,userId,id,now);
 const limits=ent.limits,current=usage(db,userId),limit=limits[action];
 if(!Number.isInteger(limit))throw fail(422,'Unknown plan limit.');
 if(current[action]>=limit)throw fail(403,'Your '+ent.plan_name+' plan limit ('+limit+') for '+action+' has been reached. Open Plans to change your subscription.');
 return {entitlement:ent,usage:current};
}
export function createBillingHandler({db,requireUser,fail,json,send,now,id,limit,broadcast}){
 return async function handle(req,res,url){
  const path=url.pathname;
  if(!path.startsWith('/api/billing/'))return false;
  if(path==='/api/billing/plans'&&req.method==='GET')
   return send(res,200,{plans:catalog(),mode:isSandboxBilling()?'sandbox':'disabled',
    notice:'Prices are reference prices only. Sandbox activation charges €0.00. Card, PayPal and Stripe billing are not enabled.',
    verified_promo_access:{views_required:10000,enabled:false,note:'Permanent promo access requires verified external video reach; not available until real verification is integrated.'}});
  const user=requireUser(req);
  if(path==='/api/billing/me'&&req.method==='GET'){
   const entitlement=currentEntitlement(db,user.id,id,now);
   return send(res,200,{entitlement,usage:usage(db,user.id),events:db.prepare('SELECT id,action,plan_id,period,quoted_price_cents,charged_cents,provider,created_at,note FROM subscription_events WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(user.id)});
  }
  if(path==='/api/billing/sandbox/activate'&&req.method==='POST'){
   if(!isSandboxBilling())throw fail(503,'Sandbox billing is disabled on this deployment. No payment was taken.');
   limit(req,'sandbox-plan',25,3600000);
   const body=await json(req),plan=PLAN_CATALOG[String(body.plan_id||'')],period=String(body.period||'');
   if(!plan||plan.id==='free'||!CYCLE.has(period))throw fail(422,'Choose a valid paid plan and billing interval.');
   const old=getRow(db,user.id);
   if(old?.status==='active'&&old.plan_id===plan.id&&old.period===period&&Date.parse(old.period_end_at)>Date.now())
    return send(res,200,{ok:true,already_active:true,entitlement:currentEntitlement(db,user.id,id,now),charged_cents:0});
   const started=Date.now(),ends=addInterval(started,period),price=plan[period+'_cents'];
   atomic(db,()=>{
    db.prepare('INSERT INTO account_subscriptions(user_id,plan_id,period,status,provider,started_at,period_start_at,period_end_at,auto_renew,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id,period=excluded.period,status=excluded.status,provider=excluded.provider,period_start_at=excluded.period_start_at,period_end_at=excluded.period_end_at,auto_renew=1,updated_at=excluded.updated_at,version=account_subscriptions.version+1')
     .run(user.id,plan.id,period,'active','sandbox',ISO(started),ISO(started),ISO(ends),1,now());
    event(db,{id,userId:user.id,action:'sandbox_activate',planId:plan.id,period,price,now,
     note:'Test subscription activated. Reference price only. No payment made.'});
   });
   broadcast('subscription');return send(res,201,{ok:true,mode:'sandbox',charged_cents:0,quoted_price_cents:price,
    receipt:'SANDBOX ONLY — NOT A PAYMENT RECEIPT',entitlement:currentEntitlement(db,user.id,id,now)});
  }
  if(path==='/api/billing/cancel'&&req.method==='POST'){
   const old=getRow(db,user.id);
   if(!old||old.status!=='active'||old.provider!=='sandbox')throw fail(409,'No sandbox subscription to cancel.');
   const row=atomic(db,()=>{
    db.prepare('UPDATE account_subscriptions SET auto_renew=0,updated_at=?,version=version+1 WHERE user_id=?').run(now(),user.id);
    event(db,{id,userId:user.id,action:'sandbox_cancel_renewal',planId:old.plan_id,period:old.period,price:0,now,note:'Auto-renewal disabled. Benefits last until sandbox period end.'});
    return getRow(db,user.id);
   });
   broadcast('subscription');return send(res,200,{ok:true,auto_renew:false,period_end:row.period_end_at,entitlement:currentEntitlement(db,user.id,id,now)});
  }
  if(path==='/api/billing/resume'&&req.method==='POST'){
   if(!isSandboxBilling())throw fail(503,'Sandbox is disabled.');
   const old=getRow(db,user.id);
   if(!old||old.status!=='active'||old.provider!=='sandbox'||Date.parse(old.period_end_at)<=Date.now())throw fail(409,'No active sandbox subscription to resume.');
   atomic(db,()=>{
    db.prepare('UPDATE account_subscriptions SET auto_renew=1,updated_at=?,version=version+1 WHERE user_id=?').run(now(),user.id);
    event(db,{id,userId:user.id,action:'sandbox_resume_renewal',planId:old.plan_id,period:old.period,price:0,now,note:'Sandbox auto-renewal re-enabled. €0 charged.'});
   });
   broadcast('subscription');return send(res,200,{ok:true,entitlement:currentEntitlement(db,user.id,id,now)});
  }
  if(path==='/api/billing/free'&&req.method==='POST'){
   const old=getRow(db,user.id);
   if(!old||old.status==='expired')return send(res,200,{ok:true,entitlement:currentEntitlement(db,user.id,id,now)});
   atomic(db,()=>{
    db.prepare("UPDATE account_subscriptions SET status='expired',auto_renew=0,updated_at=?,version=version+1 WHERE user_id=?").run(now(),user.id);
    event(db,{id,userId:user.id,action:'sandbox_downgrade_free',planId:'free',period:old.period,price:0,now,note:'Switched to Free. €0 charged.'});
   });
   broadcast('subscription');return send(res,200,{ok:true,entitlement:currentEntitlement(db,user.id,id,now)});
  }
  if(path==='/api/billing/providers'&&req.method==='GET')
   return send(res,200,{sandbox:isSandboxBilling(),methods:[
    {id:'sandbox',label:'Test activation',ready:isSandboxBilling(),charged_cents:0},
    {id:'stripe',label:'Stripe / cards',ready:false},
    {id:'paypal',label:'PayPal',ready:false}
   ],note:'External gateways are intentionally disabled; no actual purchases can be completed.'});
  throw fail(404,'Billing endpoint not found.');
 };
}
