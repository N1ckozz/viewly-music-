import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PLAN_CATALOG,catalog} from '../billing-core.js';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('catalog preserves €5 creator pricing with yearly savings and honest provider availability',()=>{
 assert.equal(PLAN_CATALOG.creator.monthly_cents,500);
 assert.equal(PLAN_CATALOG.creator.yearly_cents,5000);
 assert.equal(catalog().find(x=>x.id==='creator').yearly_discount_percent,17);
 assert.equal(PLAN_CATALOG.free.monthly_cents,0);
 assert.equal(PLAN_CATALOG.pro.monthly_cents,1999);
 assert.ok(catalog().every(x=>x.billing_enabled===false));
});

test('sandbox checkout persists real entitlements, quotas, cancellations and €0 events without touching payments',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-billing-'));
 const database=path.join(folder,'data'),port=35000+Math.floor(Math.random()*14000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(project,'server.js')],{
  cwd:project,stdio:'pipe',
  env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:database,
   VIEWLY_UPLOAD_DIR:path.join(folder,'uploads'),VIEWLY_BILLING_MODE:'sandbox',VIEWLY_BILLING_SANDBOX_ALLOWED:'true'}
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(folder,{force:true,recursive:true})});
 let ready=false;
 for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,75));try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}}
 assert.ok(ready,'billing test server starts');
 let cookie='';
 async function request(url,method='GET',payload,overrideCookie){
  const headers={};if(cookie||overrideCookie)headers.Cookie=overrideCookie||cookie;
  if(!['GET','HEAD'].includes(method))headers['X-Viewly-Request']='1';
  if(payload!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(base+'/api'+url,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
  const result=await response.json();
  const match=response.headers.getSetCookie().find(x=>x.startsWith('viewly_session='));
  if(match)cookie=match.split(';')[0];
  return {status:response.status,body:result};
 }
 const catalogResponse=await request('/billing/plans');
 assert.equal(catalogResponse.status,200);
 assert.equal(catalogResponse.body.mode,'sandbox');
 assert.equal(catalogResponse.body.verified_promo_access.enabled,false);
 assert.equal(catalogResponse.body.plans.length,4);
 assert.equal((await request('/billing/me')).status,401);
 const reg=await request('/register','POST',{email:'pricing@example.test',username:'pricingtest',display_name:'Pricing Test',
  password:'UniqueBillingPassword#123',role:'artist'});
 assert.equal(reg.status,201,JSON.stringify(reg.body));
 const owner=reg.body.user.id;
 let state=await request('/billing/me');
 assert.equal(state.body.entitlement.plan_id,'free');
 assert.equal(state.body.entitlement.limits.releases,3);
 const db=new DatabaseSync(path.join(database,'viewly.sqlite'));
 // Test-only fixture, not in production: user already used all three free release slots.
 for(let i=0;i<3;i++)db.prepare('INSERT INTO releases(id,owner_id,title,description,genre,file_name,created_at) VALUES(?,?,?,?,?,?,?)')
   .run(crypto.randomUUID(),owner,'Original music '+i,'Music for tests','Trap',crypto.randomBytes(20).toString('hex')+'.mp4',new Date().toISOString());
 const blocked=await request('/releases','POST',{title:'attempt'});
 assert.equal(blocked.status,403);
 assert.match(blocked.body.error,/Free plan limit/);
 const plan=await request('/billing/sandbox/activate','POST',{plan_id:'creator',period:'monthly'});
 assert.equal(plan.status,201,JSON.stringify(plan.body));
 assert.equal(plan.body.charged_cents,0);
 assert.equal(plan.body.quoted_price_cents,500);
 assert.equal(plan.body.entitlement.plan_id,'creator');
 state=await request('/billing/me');
 assert.equal(state.body.entitlement.limits.releases,30);
 assert.equal(state.body.entitlement.period,'monthly');
 assert.equal(state.body.usage.releases,3);
 assert.equal(state.body.events[0].charged_cents,0);
 // Paid-plan quota check has passed; now validation of missing file must be reached.
 const upload=await request('/releases','POST',{title:'attempt'});
 assert.notEqual(upload.status,403);
 // Test yearly plan switching and real renewal state
 const yearly=await request('/billing/sandbox/activate','POST',{plan_id:'pro',period:'yearly'});
 assert.equal(yearly.status,201);assert.equal(yearly.body.quoted_price_cents,19900);
 assert.equal(yearly.body.entitlement.period,'yearly');
 assert.equal(yearly.body.entitlement.limits.campaigns,80);
 const same=await request('/billing/sandbox/activate','POST',{plan_id:'pro',period:'yearly'});
 assert.equal(same.body.already_active,true);
 const cancel=await request('/billing/cancel','POST',{});
 assert.equal(cancel.status,200);assert.equal(cancel.body.entitlement.auto_renew,false);
 assert.equal(cancel.body.entitlement.plan_id,'pro','plan stays active until expiry');
 const resume=await request('/billing/resume','POST',{});
 assert.equal(resume.status,200);assert.equal(resume.body.entitlement.auto_renew,true);
 assert.equal((await request('/billing/sandbox/activate','POST',{plan_id:'nonexistent',period:'monthly'})).status,422);
 assert.equal((await request('/billing/sandbox/activate','POST',{plan_id:'pro',period:'decade'})).status,422);
 // No money movement is recorded in existing provider or reward tables.
 assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_ledger').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM subscription_events WHERE charged_cents<>0').get().n,0);
 assert.ok(db.prepare('SELECT count(*) AS n FROM subscription_events').get().n>=4);
 const free=await request('/billing/free','POST',{});
 assert.equal(free.status,200);assert.equal(free.body.entitlement.plan_id,'free');
 assert.equal((await request('/releases','POST',{title:'attempt'})).status,403);
 const methods=await request('/billing/providers');
 assert.equal(methods.body.methods.find(x=>x.id==='stripe').ready,false);
 assert.equal(methods.body.methods.find(x=>x.id==='paypal').ready,false);
 db.close();
});

test('sandbox activation is fail-closed when flags are missing',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-billing-off-'));
 const port=36000+Math.floor(Math.random()*14000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(project,'server.js')],{
  cwd:project,stdio:'pipe',env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_BILLING_MODE:'disabled',
   VIEWLY_BILLING_SANDBOX_ALLOWED:'false',VIEWLY_DATA_DIR:path.join(folder,'db'),VIEWLY_UPLOAD_DIR:path.join(folder,'uploads')}
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(folder,{recursive:true,force:true})});
 let ready=false;for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,75));try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}}
 assert.ok(ready);
 const request=async(ep,data)=>{
  const res=await fetch(base+'/api'+ep,{method:'POST',headers:{'X-Viewly-Request':'1','Content-Type':'application/json'},
   body:JSON.stringify(data)});
  return {status:res.status,json:await res.json(),cookie:res.headers.getSetCookie()};
 };
 const reg=await request('/register',{email:'inactive@example.test',username:'disabledtest',display_name:'Disabled test',role:'viewer',password:'LongDisabledPassword#123'});
 assert.equal(reg.status,201,JSON.stringify(reg.json));
 const cookie=reg.cookie.find(x=>x.startsWith('viewly_session=')).split(';')[0];
 const denied=await fetch(base+'/api/billing/sandbox/activate',{method:'POST',
  headers:{'X-Viewly-Request':'1','Content-Type':'application/json',Cookie:cookie},
  body:JSON.stringify({plan_id:'creator',period:'monthly'})});
 assert.equal(denied.status,503);
 const plans=await (await fetch(base+'/api/billing/plans')).json();
 assert.equal(plans.mode,'disabled');
});
