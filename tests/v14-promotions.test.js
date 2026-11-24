import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initPromotions,buildQuote,catalog,publicPromotions,normalizeBrand} from '../promotions-core.js';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const fail=(status,msg)=>Object.assign(Error(msg),{status});
test('V14 server pricing, package overlaps, capacity, quote changes and hidden promotions',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE campaigns(id PRIMARY KEY,owner_id,release_id,title,cpm_rate_cents,budget_cents,fee_cents,status,sandbox_funded_cents,sandbox_spent_cents,moderation_status); CREATE TABLE users(id PRIMARY KEY,display_name,status); CREATE TABLE releases(id PRIMARY KEY,owner_id,genre,visibility); CREATE TABLE campaign_assets(id,campaign_id,sha256,hidden_at); INSERT INTO users VALUES ('a','Artist','active'); INSERT INTO releases VALUES ('r','a','Rap','public'); INSERT INTO campaigns VALUES ('c','a','r','Title',100,10000,500,'draft',0,0,'visible');");
 initPromotions(db);
 const c=db.prepare('SELECT * FROM campaigns').get();
 db.prepare("INSERT INTO campaign_branding VALUES('c','i.jpg','b.jpg','Headline','[\"growth\"]')").run();
 const b=db.prepare('SELECT * FROM campaign_branding').get(),q=buildQuote(db,c,b,fail);
 assert.equal(q.promo_cents,4999);assert.equal(q.total_cents,15499);assert.equal(q.placements.length,3);assert.equal(q.budget_cents,10000);
 assert.equal(catalog(db).find(x=>x.id==='growth').savings_cents,998);
 assert.throws(()=>buildQuote(db,c,{...b,selections:'["growth","home24"]'},fail),/one option per placement/);
 db.exec("UPDATE promo_products SET price_cents=5000 WHERE id='growth'");
 assert.notEqual(buildQuote(db,c,b,fail).quote_hash,q.quote_hash);
 db.exec("INSERT INTO campaign_assets VALUES('a1','c','newhash',NULL)");
 const q2=buildQuote(db,c,b,fail);
 assert.notEqual(q2.quote_hash,q.quote_hash);
 db.exec("INSERT INTO promo_placements VALUES('c','home','2000-01-01','2099-01-01'); UPDATE promo_products SET capacity=1 WHERE placement='home'");
 assert.throws(()=>buildQuote(db,c,b,fail),/unavailable/);
 assert.deepEqual(publicPromotions(db),[]);
 db.close();
});
test('V14 actual image processing rejects dimensions and malformed bytes and normalizes valid square art',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'v14-brand-test-'));
 try{
  const image=join(dir,'square.png');
  execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=1024x1024','-frames:v','1','-threads','1','-y',image],{timeout:15000});
  const file={type:'image/png',content:readFileSync(image)};
  await assert.rejects(normalizeBrand(file,'background',dir,fail),/16:9/);
  await assert.rejects(normalizeBrand({type:'image/png',content:Buffer.from('fake image')},'icon',dir,fail),/decoding failed/);
  const output=await normalizeBrand(file,'icon',dir,fail);
  assert.match(output,/^[0-9a-f]{40}\.jpg$/);assert.equal(readFileSync(join(dir,output)).subarray(0,2).toString('hex'),'ffd8');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import net from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
test('V14 real API: private draft, mandatory images, final quote, atomic sandbox activation and public placement',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'v14-api-'));mkdirSync(join(dir,'data'));mkdirSync(join(dir,'uploads'));
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:join(dir,'data'),VIEWLY_UPLOAD_DIR:join(dir,'uploads'),VIEWLY_BILLING_MODE:'sandbox',VIEWLY_BILLING_SANDBOX_ALLOWED:'true',VIEWLY_V14_REQUIRED:'true'},stdio:['ignore','ignore','pipe']});
 let logs='';child.stderr.on('data',b=>{logs=(logs+b).slice(-4000)});
 const request=async(p,method='GET',body,token)=>{
  const headers={'x-viewly-request':'1'};if(token)headers.cookie='viewly_session='+token;
  if(body&&!(body instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(body);}
  const res=await fetch(base+'/api'+p,{method,headers,body,signal:AbortSignal.timeout(25000)});
  const type=res.headers.get('content-type')||'';
  return {status:res.status,body:type.includes('json')?await res.json():await res.arrayBuffer()};
 };
 try{
  let healthy=false;for(let i=0;i<120;i++){try{if((await request('/health')).status===200){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(healthy,logs);
  const db=new DatabaseSync(join(dir,'data','viewly.sqlite'));const uid=randomUUID(),other=randomUUID(),rid=randomUUID(),at=new Date().toISOString();
  for(const [id,token,name] of [[uid,'artist-test','artist'],[other,'other-test','other']]){
   db.prepare('INSERT INTO users(id,email,username,display_name,role,created_at) VALUES(?,?,?,?,?,?)').run(id,name+'@example.test',name,name,'artist',at);
   db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,mfa_verified) VALUES(?,?,?,?,0)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000,Date.now());
  }
  db.prepare('INSERT INTO releases(id,owner_id,title,file_name,created_at) VALUES(?,?,?,?,?)').run(rid,uid,'Song','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp4',at);db.close();
  const body={release_id:rid,title:'V14 campaign',brief:'A complete creative brief with a detailed description of all clip requirements for this campaign.',rate_eur_per_1000:1,budget_eur:100,max_per_clip_eur:20,min_views:1000,tracking_days:30,rights_confirmed:true};
  assert.equal((await request('/campaigns/v10','POST',body,'artist-test')).status,409);
  const created=await request('/campaigns/v14','POST',body,'artist-test');assert.equal(created.status,201,JSON.stringify(created.body));
  const cid=created.body.campaign.id,p='/promotions/'+cid;
  assert.equal((await request(p+'/quote','GET',undefined,'artist-test')).status,422);
  assert.equal((await request('/campaigns/'+cid+'/sandbox-fund','POST',{},'artist-test')).status,409);
  assert.equal((await request(p,'GET',undefined,'other-test')).status,404);
  for(const [kind,size] of [['icon','1024x1024'],['background','1600x900']]){
   const img=join(dir,kind+'.png');
   execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s='+size,'-frames:v','1','-threads','1','-y',img],{timeout:15000});
   const form=new FormData();form.append('image',new Blob([readFileSync(img)],{type:'image/png'}),kind+'.png');
   const uploaded=await request(p+'/image/'+kind,'POST',form,'artist-test');assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
   assert.equal((await request(p+'/image/'+kind)).status,404);
  }
  assert.equal((await request(p+'/settings','POST',{headline:'Real promo',selections:['growth']},'artist-test')).status,200);
  const quote=(await request(p+'/quote','GET',undefined,'artist-test')).body.quote;assert.equal(quote.total_cents,15499);
  assert.deepEqual((await request('/promotions/featured')).body.items,[]);
  assert.equal((await request(p+'/checkout','POST',{confirm:true,quote_hash:'fake'},'artist-test')).status,409);
  const checkout=await request(p+'/checkout','POST',{confirm:true,quote_hash:quote.quote_hash},'artist-test');assert.equal(checkout.status,201,JSON.stringify(checkout.body));assert.equal(checkout.body.charged_cents,0);
  assert.equal((await request(p+'/checkout','POST',{confirm:true,quote_hash:quote.quote_hash},'artist-test')).status,200);
  const visible=(await request('/promotions/featured')).body.items;assert.equal(visible.length,3);assert.ok(visible.every(x=>x.id===cid&&x.sandbox&&x.remaining_cents===10000));
  assert.equal((await request(p+'/image/icon')).status,200);
  const check=new DatabaseSync(join(dir,'data','viewly.sqlite'));assert.equal(check.prepare('SELECT paid_cents FROM campaigns WHERE id=?').get(cid).paid_cents,0);assert.equal(check.prepare('SELECT count(*) AS n FROM wallet_ledger').get().n,0);assert.equal(check.prepare('SELECT count(*) AS n FROM promo_orders').get().n,1);check.close();
 }finally{child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve)});rmSync(dir,{recursive:true,force:true});}
});
