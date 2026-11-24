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
