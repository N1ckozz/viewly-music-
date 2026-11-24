import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initGrowth,accessFor,joinCampaign,qualifyReferrals,feeBenefit,consumeBenefit} from '../growth-core.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,email_verified INTEGER,created_at TEXT);CREATE TABLE campaigns(id TEXT PRIMARY KEY);CREATE TABLE account_subscriptions(user_id TEXT PRIMARY KEY,provider TEXT,status TEXT,period_end_at TEXT,plan_id TEXT);INSERT INTO users VALUES('a','active',1,'2020-01-01'),('b','active',1,'2020-01-01'),('c','active',0,'2020-01-01');INSERT INTO campaigns VALUES('one'),('two'),('three'),('four');");
 initGrowth(db);return db;
}
const at=Date.parse('2026-11-24T12:00:00Z'),now=()=>new Date(at).toISOString();
const camp=(id,amount=200001,status='sandbox_active')=>({id,owner_id:'a',status,sandbox_funded_cents:amount,paid_cents:amount});
test('V15 premium threshold is strictly above €2k; first pass is unique; sandbox plan cannot unlock live access',()=>{
 const db=setup(),u={id:'b'};
 const old=[process.env.VIEWLY_BILLING_MODE,process.env.VIEWLY_BILLING_SANDBOX_ALLOWED];
 process.env.VIEWLY_BILLING_MODE='sandbox';process.env.VIEWLY_BILLING_SANDBOX_ALLOWED='true';
 try{
 assert.equal(accessFor(db,u,camp('one',200000),at).reason,'standard');
 assert.equal(accessFor(db,u,camp('one'),at).reason,'first_free');
 assert.equal(joinCampaign(db,u,camp('one'),fail,now).reason,'first_free');
 assert.equal(accessFor(db,u,camp('one'),at).joined,true);
 assert.equal(accessFor(db,u,camp('two'),at).allowed,false);
 assert.throws(()=>joinCampaign(db,u,camp('two'),fail,now),/paid plan/);
 db.prepare("INSERT INTO account_subscriptions VALUES ('b','sandbox','active',?,'creator')").run('2099-01-01');
 assert.equal(accessFor(db,u,camp('two'),at).reason,'test_plan');
 assert.equal(joinCampaign(db,u,camp('two'),fail,now).reason,'test_plan');
 db.exec("UPDATE account_subscriptions SET status='expired'");
 assert.equal(accessFor(db,u,camp('two'),at).allowed,true);
 assert.equal(accessFor(db,u,camp('three'),at).allowed,false);
 assert.equal(joinCampaign(db,u,camp('three',200001,'active'),fail,now).reason,'first_free');
 assert.equal(accessFor(db,u,camp('four',200001,'active'),at).allowed,false);
 assert.equal(accessFor(db,{id:'a'},camp('four'),at).allowed,false);
 }finally{for(const [i,k] of ['VIEWLY_BILLING_MODE','VIEWLY_BILLING_SANDBOX_ALLOWED'].entries()){if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]}db.close()}
});
test('V15 referrals require verified accounts; one discount per campaign; expiry and repeat qualification safe',()=>{
 const db=setup();
 db.prepare("INSERT INTO referrals(invitee_id,inviter_id,created_at) VALUES('b','a',?),('c','a',?)").run(now(),now());
 qualifyReferrals(db,'a',at);qualifyReferrals(db,'b',at);
 assert.equal(db.prepare('SELECT count(*) AS n FROM referral_perks').get().n,2);
 assert.equal(feeBenefit(db,'a',500,now()).discount_cents,100);
 assert.equal(feeBenefit(db,'c',500,now()).discount_cents,0);
 const perk=feeBenefit(db,'a',500,now());
 consumeBenefit(db,{...perk,campaign_id:'one'},'a',now());
 assert.equal(feeBenefit(db,'a',500,now()).discount_cents,0);
 assert.throws(()=>consumeBenefit(db,{...perk,campaign_id:'two'},'a',now()),/expired or was used/);
 assert.equal(feeBenefit(db,'b',500,'2027-01-01').discount_cents,0);
 db.exec("UPDATE users SET email_verified=1 WHERE id='c'");
 qualifyReferrals(db,'a',at);
 assert.equal(db.prepare('SELECT count(*) AS n FROM referral_perks').get().n,4);
 db.close();
});
