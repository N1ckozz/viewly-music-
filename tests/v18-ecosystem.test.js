import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initEcosystem,ecosystemHome,ranking,createEcosystemHandler} from '../ecosystem-core.js';
const a='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',r='11111111-1111-1111-1111-111111111111',c='22222222-2222-2222-2222-222222222222';
const now=()=>new Date().toISOString();
function setup(){
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,username,display_name,role,bio,status); CREATE TABLE releases(id TEXT PRIMARY KEY,owner_id,title,genre,created_at,cover_name,file_name,visibility); CREATE TABLE release_likes(release_id,user_id); CREATE TABLE release_views(release_id,user_id,created_at); CREATE TABLE release_comments(release_id,user_id,created_at); CREATE TABLE artist_follows(artist_id,follower_id); CREATE TABLE campaigns(id TEXT PRIMARY KEY,owner_id,title,release_id,created_at,launched_at,status,pricing_model,cpm_rate_cents,reward_cents,paid_cents,spent_cents,sandbox_funded_cents,sandbox_spent_cents,moderation_status); CREATE TABLE campaign_branding(campaign_id,icon_file,background_file); CREATE TABLE cpm_submissions(submission_id,campaign_id,clipper_id,reported_views,review_status,post_access,risk_flag,last_checked_at,reviewed_at);");
 db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(a,'artist','Artist','artist','','active');
 db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(b,'clipper','Clipper','viewer','','active');
 db.prepare("INSERT INTO releases VALUES(?,?,?,?,?,?,?,?)").run(r,a,'Actual track','Rap',now(),null,'file.mp4','public');
 db.prepare("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(c,a,'Real campaign',r,now(),now(),'active','cpm',100,100,10000,100,0,0,'visible');
 db.prepare("INSERT INTO cpm_submissions VALUES(?,?,?,?,?,?,?,?,?)").run('sub',c,b,1200,'approved','visible','',now(),now());
 initEcosystem(db);return db;
}
const fail=(status,msg)=>Object.assign(Error(msg),{status});
function client(db,actor){
 const handler=createEcosystemHandler({db,sessionUser:()=>actor,requireUser:()=>{if(!actor)throw fail(401,'Sign in');return actor},requireCreator:()=>{if(actor?.role!=='artist')throw fail(403,'Creator only');return actor},fail,json:async req=>req.body,send:(res,status,body)=>({status,body}),now,id:()=> '33333333-3333-3333-3333-333333333333',limit:()=>{},broadcast:()=>{}});
 return (p,method='GET',body={})=>handler({method,body},{},new URL('http://localhost/api/ecosystem/'+p));
}
test('V18 public discovery excludes private releases, account state and drafts',()=>{
 const db=setup();try{
 const guest=ecosystemHome(db,null);assert.equal(guest.latest.length,1);assert.equal(guest.active.length,1);assert.equal(guest.personal,null);
 db.prepare("UPDATE releases SET visibility='hidden' WHERE id=?").run(r);
 const hidden=ecosystemHome(db,null);assert.equal(hidden.latest.length,0);assert.equal(hidden.active.length,0);assert.equal(hidden.artists.length,0);
 }finally{db.close()}
});
test('V18 ranks only opted-in approved visible unflagged clips',()=>{
 const db=setup();try{
 const old=process.env.VIEWLY_BILLING_MODE;process.env.VIEWLY_BILLING_MODE='disabled';
 try{assert.deepEqual(ranking(db),[]);db.prepare('INSERT INTO ecosystem_rank_optin VALUES(?,1)').run(b);
 assert.equal(ranking(db)[0].reported_views,1200);db.exec("UPDATE cpm_submissions SET risk_flag='review'");assert.deepEqual(ranking(db),[]);
 }finally{if(old===undefined)delete process.env.VIEWLY_BILLING_MODE;else process.env.VIEWLY_BILLING_MODE=old}
 }finally{db.close()}
});
test('V18 save requests are idempotent and private; only visible targets are returned',async()=>{
 const db=setup();try{
 const viewer=client(db,{id:b,role:'viewer'}),artist=client(db,{id:a,role:'artist'}),guest=client(db,null);
 await viewer('save','POST',{kind:'release',id:r,saved:true});await viewer('save','POST',{kind:'release',id:r,saved:true});
 assert.equal((await viewer('saved')).body.releases.length,1);assert.equal((await artist('saved')).body.releases.length,0);
 await assert.rejects(guest('saved'),e=>e.status===401);
 db.exec("UPDATE releases SET visibility='hidden'");
 assert.equal((await viewer('saved')).body.releases.length,0);
 await viewer('save','POST',{kind:'release',id:r,saved:false});
 assert.equal(db.prepare('SELECT count(*) AS n FROM ecosystem_saves').get().n,0);
 }finally{db.close()}
});
test('V18 owner-only invitations, recipient-only acceptance and actual search',async()=>{
 const db=setup();try{
 const artist=client(db,{id:a,role:'artist'}),viewer=client(db,{id:b,role:'viewer'}),guest=client(db,null);
 assert.equal((await guest('search?q=Actual')).body.releases.length,1);
 await assert.rejects(viewer('invite','POST',{campaign_id:c,username:'artist'}),e=>e.status===403);
 await artist('invite','POST',{campaign_id:c,username:'clipper'});
 const inv=(await viewer('notifications')).body.invites[0];assert.equal(inv.state,'pending');
 await assert.rejects(artist('respond','POST',{id:inv.id,state:'accepted'}),e=>e.status===404);
 await viewer('respond','POST',{id:inv.id,state:'accepted'});
 assert.equal((await viewer('notifications')).body.invites[0].state,'accepted');
 await assert.rejects(viewer('respond','POST',{id:inv.id,state:'declined'}),e=>e.status===404);
 }finally{db.close()}
});

import {suggestRanges} from '../clip-assistant.js';
test('V18 signal suggestions use actual audio and non-overlapping valid ranges',()=>{const rate=100,pcm=Buffer.alloc(45*rate*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(i>=15*rate&&i<30*rate?20000:1000,i*2);const ranges=suggestRanges(pcm,45,rate);assert.equal(ranges[0].start,15);assert.equal(ranges[0].end,30);assert.ok(ranges.every(x=>x.end<=45&&x.end-x.start>=5));assert.deepEqual(suggestRanges(Buffer.alloc(10*rate*2),10,rate),[]);});
