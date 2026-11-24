import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {workspaceSummary} from '../workspace-core.js';
test('V13 exact public totals, UTC series, private owner scope and separate sandbox balances',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id,display_name,status); CREATE TABLE releases(id,owner_id,title,genre,visibility,created_at); CREATE TABLE release_views(release_id,user_id,created_at); CREATE TABLE campaigns(id,owner_id,release_id,title,status,moderation_status,budget_cents,paid_cents,spent_cents,sandbox_funded_cents,sandbox_spent_cents,created_at); CREATE TABLE clips(user_id); CREATE TABLE submissions(user_id,campaign_id,status); CREATE TABLE social_connections(user_id,provider,status); CREATE TABLE wallet_ledger(user_id,amount_cents); CREATE TABLE sandbox_creator_rewards(user_id,quoted_reward_cents); CREATE TABLE cpm_submissions(clipper_id,accrued_cents);");
 db.exec("INSERT INTO users VALUES ('a','Artist A','active'),('b','Artist B','active'),('s','Suspended','suspended'); INSERT INTO releases VALUES ('r1','a','Public A','Trap','public','2026-11-20'),('r2','b','Public B','Rap','public','2026-11-19'),('private','a','Private','Rap','private','2026-11-20'),('hidden','s','Hidden','Rap','public','2026-11-20'); INSERT INTO release_views VALUES ('r1','u1','2026-11-24T04:00:00.000Z'),('r1','u2','2026-11-23T04:00:00.000Z'),('r2','u1','2026-11-01T04:00:00.000Z'),('private','u1','2026-11-24T04:00:00.000Z'),('hidden','u1','2026-11-24T04:00:00.000Z'); INSERT INTO campaigns VALUES ('c1','a','r1','Funded A','active','visible',10000,10000,1000,0,0,'2026-11-20'),('c2','b','r2','Test B','sandbox_active','visible',20000,0,0,20000,3000,'2026-11-20'),('c3','a','r1','Private draft','draft','visible',30000,0,0,0,0,'2026-11-21'); INSERT INTO submissions VALUES ('b','c1','pending'),('a','c2','pending'); INSERT INTO clips VALUES ('a'),('b'),('b'); INSERT INTO social_connections VALUES ('b','tiktok','active'); INSERT INTO wallet_ledger VALUES ('a',500),('b',900); INSERT INTO sandbox_creator_rewards VALUES ('b',600); INSERT INTO cpm_submissions VALUES ('b',400);");
 const at=new Date('2026-11-24T12:00:00Z');
 const guest=workspaceSummary(db,null,7,true,at);
 assert.equal(guest.personal,null);assert.equal(guest.public.published,2);assert.equal(guest.public.artists,2);assert.equal(guest.public.funded,1);assert.equal(guest.public.sandbox,1);assert.equal(guest.public.views,2);assert.equal(guest.public.series.length,7);assert.equal(guest.public.series.at(-1).views,1);assert.deepEqual(guest.public.trending.map(x=>x.id),['r1']);
 const a=workspaceSummary(db,{id:'a',role:'artist'},7,true,at).personal;
 assert.equal(a.account_id,'a');assert.equal(a.review_queue,1);assert.equal(a.drafts,1);assert.equal(a.own_views,3);assert.equal(a.recorded_reward_cents,500);assert.equal(a.tiktok_connected,false);assert.equal(a.withdrawable_cents,0);assert.deepEqual(a.campaigns.map(x=>x.id),['c3','c1']);
 const b=workspaceSummary(db,{id:'b',role:'artist'},30,true,at);
 assert.equal(b.public.views,3);assert.equal(b.personal.review_queue,1);assert.equal(b.personal.sandbox_reward_cents,1000);assert.equal(b.personal.recorded_reward_cents,900);assert.equal(b.personal.tiktok_connected,true);assert.equal(b.personal.campaigns[0].mode,'sandbox');assert.equal(b.personal.campaigns[0].funded_cents,20000);assert.equal(b.personal.campaigns[0].spent_cents,3000);
 const clipper=workspaceSummary(db,{id:'b',role:'clipper'},7,false,at);
 assert.equal(clipper.public.sandbox,0);assert.equal(clipper.personal.creator,false);assert.equal(clipper.personal.campaigns,undefined);assert.equal(clipper.personal.clips,2);
 db.close();
});
