import {renderSocialFilm} from './film-export.js';
import {feeBenefit,consumeBenefit} from './growth-core.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isSandboxBilling} from './billing-core.js';
const exec=promisify(execFile);
const products=[
 ['home24','Homepage featured', 'home',24,1499,4],['home72','Homepage featured','home',72,3499,4],['home168','Homepage featured','home',168,6999,4],
 ['spot72','Campaign spotlight','spotlight',72,1999,8],['spot168','Campaign spotlight','spotlight',168,3999,8],
 ['top24','Top listing','top',24,799,8],['top168','Top listing','top',168,2999,8],
 ['genre72','Category featured','category',72,999,12],['card168','Premium campaign card','card',168,499,100],
 ['creator72','Creator opportunities','creator',72,1499,8],['launch24','New launch','launch',24,999,8],['recommended168','Sponsored recommendations','recommended',168,2499,8]
];
const packages=[['starter','Starter Boost',1999,['top24','card168','launch24']],['growth','Growth Boost',4999,['home72','spot72','card168']],['elite','Elite Takeover',9999,['home168','spot168','top168','genre72','creator72','card168']]];
export function initPromotions(db){
 db.exec('CREATE TABLE IF NOT EXISTS campaign_launch_films(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),owner_id TEXT NOT NULL REFERENCES users(id),snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL)');
 db.exec("CREATE TABLE IF NOT EXISTS campaign_branding(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),icon_file TEXT,background_file TEXT,headline TEXT NOT NULL DEFAULT '',selections TEXT NOT NULL DEFAULT '[]'); CREATE TABLE IF NOT EXISTS promo_products(id TEXT PRIMARY KEY,label TEXT NOT NULL,placement TEXT NOT NULL,hours INTEGER NOT NULL,price_cents INTEGER NOT NULL,capacity INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,components TEXT NOT NULL DEFAULT '[]'); CREATE TABLE IF NOT EXISTS promo_orders(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),owner_id TEXT NOT NULL REFERENCES users(id),quote_json TEXT NOT NULL,created_at TEXT NOT NULL,charged_cents INTEGER NOT NULL CHECK(charged_cents=0)); CREATE TABLE IF NOT EXISTS promo_placements(campaign_id TEXT NOT NULL REFERENCES campaigns(id),placement TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,PRIMARY KEY(campaign_id,placement)); CREATE INDEX IF NOT EXISTS promo_schedule ON promo_placements(placement,ends_at);");
 const add=db.prepare('INSERT OR IGNORE INTO promo_products(id,label,placement,hours,price_cents,capacity,components) VALUES(?,?,?,?,?,?,?)');
 for(const x of products)add.run(...x,'[]');
 for(const [id,label,price,parts] of packages)add.run(id,label,'package',0,price,0,JSON.stringify(parts));
}
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const publicProduct=x=>({...x,components:JSON.parse(x.components)});
export function catalog(db,at=new Date().toISOString()){
 const rows=db.prepare('SELECT * FROM promo_products ORDER BY rowid').all().map(publicProduct);
 return rows.map(p=>{
  const parts=p.placement==='package'?p.components.map(k=>rows.find(x=>x.id===k)):[p];
  const available=parts.length>0&&parts.every(x=>x&&x.enabled&&db.prepare('SELECT count(*) AS n FROM promo_placements WHERE placement=? AND ends_at>?').get(x.placement,at).n<x.capacity);
  return {...p,available:!!p.enabled&&available,savings_cents:p.placement==='package'?Math.max(0,parts.reduce((s,x)=>s+(x?.price_cents||0),0)-p.price_cents):0};
 });
}
export function buildQuote(db,c,b,fail,at=new Date().toISOString()){
 const choices=JSON.parse(b.selections),all=catalog(db,at),lines=[],placements=[],seen=new Set();
 for(const key of choices){
  const p=all.find(x=>x.id===key);
  if(!p?.available)throw fail(409,'A selected promotion is unavailable. Change your selection.');
  const parts=p.placement==='package'?p.components.map(k=>all.find(x=>x.id===k)):[p];
  for(const x of parts){
   if(!x?.available||seen.has(x.placement))throw fail(422,'Choose only one option per placement, including packages.');
   seen.add(x.placement);placements.push({placement:x.placement,hours:x.hours,product_id:x.id});
  }
  lines.push({id:p.id,label:p.label,hours:p.hours,price_cents:p.price_cents});
 }
 const media=db.prepare('SELECT id,sha256 FROM campaign_assets WHERE campaign_id=? AND hidden_at IS NULL ORDER BY id').all(c.id);
 const benefit=feeBenefit(db,c.owner_id,c.fee_cents,at);
 const q={campaign_id:c.id,media,budget_cents:c.budget_cents,base_fee_cents:c.fee_cents,fee_cents:c.fee_cents-benefit.discount_cents,...benefit,lines,placements,promo_cents:lines.reduce((s,x)=>s+x.price_cents,0),branding:{icon:b.icon_file,background:b.background_file,headline:b.headline}};
 q.platform_revenue_cents=q.fee_cents+q.promo_cents;
 q.total_cents=q.budget_cents+q.platform_revenue_cents;
 return {...q,quote_hash:digest(q)};
}
export function campaignBrand(db,cid){
 const b=db.prepare('SELECT * FROM campaign_branding WHERE campaign_id=?').get(cid);
 if(!b)return null;
 return {headline:b.headline,icon_url:b.icon_file?'/api/promotions/'+cid+'/image/icon':null,background_url:b.background_file?'/api/promotions/'+cid+'/image/background':null};
}
export function publicPromotions(db,at=new Date().toISOString()){
 if(!isSandboxBilling())return [];
 const rows=db.prepare("SELECT c.id,c.title,c.cpm_rate_cents,c.sandbox_funded_cents-c.sandbox_spent_cents AS remaining_cents,u.display_name AS artist_name,r.genre,b.headline,p.placement,p.ends_at FROM promo_placements p JOIN campaigns c ON c.id=p.campaign_id JOIN campaign_branding b ON b.campaign_id=c.id JOIN promo_orders o ON o.campaign_id=c.id JOIN users u ON u.id=c.owner_id JOIN releases r ON r.id=c.release_id WHERE p.starts_at<=? AND p.ends_at>? AND c.status='sandbox_active' AND c.sandbox_funded_cents>c.sandbox_spent_cents AND c.moderation_status='visible' AND u.status='active' AND r.visibility='public' AND b.icon_file IS NOT NULL AND b.background_file IS NOT NULL ORDER BY p.starts_at DESC,c.id LIMIT 100").all(at,at);
 return rows.map(x=>({...x,...campaignBrand(db,x.id),sandbox:true}));
}
let imageBusy=false;
export async function normalizeBrand(file,kind,UPLOADS,fail){
 if(!file?.content?.length||!['image/jpeg','image/png','image/webp'].includes(file.type))throw fail(415,'Choose a JPEG, PNG or WebP image.');
 if(file.content.length>(kind==='icon'?10:15)*1024*1024)throw fail(413,'Image exceeds file limit.');
 if(imageBusy)throw fail(429,'Image processing is busy; retry shortly.');
 imageBusy=true;
 let temp,output;
 try{
  temp=await fsp.mkdtemp(path.join(os.tmpdir(),'viewly-brand-'));
  const input=path.join(temp,'input'),out=path.join(temp,'normalized.jpg');
  const format={'image/jpeg':'jpeg_pipe','image/png':'png_pipe','image/webp':'webp_pipe'}[file.type];
  await fsp.writeFile(input,file.content);
  const {stdout}=await exec('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-f',format,'-select_streams','v:0','-show_entries','stream=width,height,codec_name','-of','json',input],{timeout:8000,maxBuffer:65536});
  const s=JSON.parse(stdout).streams?.[0],w=s?.width,h=s?.height;
  const target=kind==='icon'?[1024,1024]:[1600,900];
  if(!['mjpeg','png','webp'].includes(s?.codec_name)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)throw fail(422,'Image decoding failed. Choose a valid image.');
  if(w>8192||h>8192||w*h>40000000||w<target[0]||h<target[1]||Math.abs(w/h-target[0]/target[1])>.01)throw fail(422,kind==='icon'?'Icon must be square, minimum 1024 × 1024.':'Background must be 16:9, minimum 1600 × 900.');
  await exec('ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file,pipe','-f',format,'-threads','1','-i',input,'-frames:v','1','-vf','scale='+target[0]+':'+target[1],'-map_metadata','-1','-q:v','3','-threads','1','-y',out],{timeout:15000,maxBuffer:65536});
  const name=crypto.randomBytes(20).toString('hex')+'.jpg';
  output=path.join(UPLOADS,name);
  await fsp.copyFile(out,output,fs.constants.COPYFILE_EXCL);
  return name;
 }catch(e){if(output)await fsp.unlink(output).catch(()=>{});if(e.status)throw e;throw fail(422,'Image decoding failed. Choose a valid image.');}
 finally{imageBusy=false;if(temp)await fsp.rm(temp,{recursive:true,force:true}).catch(()=>{});}
}
export function createPromotionHandler({db,requireCreator,sessionUser,fail,json,send,now,id,broadcast,limit,readBody,multipart,serveFile,UPLOADS}){
 const lookup=cid=>db.prepare('SELECT * FROM campaigns WHERE id=?').get(cid);
 const branding=cid=>db.prepare('SELECT * FROM campaign_branding WHERE campaign_id=?').get(cid);
 return async function(req,res,url){
  const p=url.pathname;
  if(req.method==='GET'&&p==='/api/promotions/catalog')return send(res,200,{products:catalog(db),sandbox:isSandboxBilling(),real_payments:false});
  if(req.method==='GET'&&p==='/api/promotions/featured')return send(res,200,{items:publicPromotions(db)});
  const m=p.match(/^\/api\/promotions\/([a-f0-9-]{36})(?:\/(image\/(?:icon|background)|settings|quote|checkout|film|social-video))?$/);
  if(!m)throw fail(404,'Promotion route not found.');
  const c=lookup(m[1]),b=branding(m[1]);if(!c||!b)throw fail(404,'Campaign branding not found.');
  const a=sessionUser(req),owner=a?.id===c.owner_id,action=m[2]||'';
  const visible=c.moderation_status==='visible'&&(c.status==='active'||c.status==='sandbox_active'&&isSandboxBilling())&&db.prepare("SELECT 1 FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.id=? AND r.visibility='public' AND u.status='active'").get(c.release_id);
  if(req.method==='GET'&&action.startsWith('image/')){
   if(!owner&&!visible)throw fail(404,'Image unavailable.');
   const name=action.endsWith('/icon')?b.icon_file:b.background_file;
   if(!name)throw fail(404,'Image unavailable.');return serveFile(req,res,path.join(UPLOADS,name));
  }
  const actor=requireCreator(req);if(!owner)throw fail(404,'Campaign not found.');
  if(req.method==='POST'&&action==='social-video'){
   limit(req,'social-film-export',4,3600000);
   if(!visible||c.status!=='sandbox_active'||c.sandbox_funded_cents<=c.sandbox_spent_cents)throw fail(409,'Campaign is not available for promotion.');
   const row=db.prepare('SELECT snapshot_json FROM campaign_launch_films WHERE campaign_id=? AND owner_id=?').get(c.id,actor.id);
   if(!row)throw fail(404,'No confirmed launch film is available.');
   const video=await renderSocialFilm(JSON.parse(row.snapshot_json),b,UPLOADS,fail);
   if(sessionUser(req)?.id!==actor.id)throw fail(401,'Session expired.');
   const current=lookup(c.id);
   if(current.status!=='sandbox_active'||current.moderation_status!=='visible'||current.sandbox_funded_cents<=current.sandbox_spent_cents||!db.prepare("SELECT 1 FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.id=? AND r.visibility='public' AND u.status='active'").get(current.release_id))throw fail(409,'Campaign is no longer available.');
   res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':video.length,'Content-Disposition':'attachment; filename="VIEWLY-campaign.mp4"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(video);
  }
  if(req.method==='GET'&&action==='film'){
   const row=db.prepare('SELECT snapshot_json FROM campaign_launch_films WHERE campaign_id=? AND owner_id=?').get(c.id,actor.id);
   if(!row)throw fail(404,'No confirmed launch film is available.');
   return send(res,200,{film:JSON.parse(row.snapshot_json)});
  }
  if(req.method==='GET'&&!action)return send(res,200,{branding:campaignBrand(db,c.id),selections:JSON.parse(b.selections),status:c.status,order:db.prepare('SELECT quote_json,charged_cents FROM promo_orders WHERE campaign_id=?').get(c.id)||null});
  if(!['draft','awaiting_payment'].includes(c.status)&&!(req.method==='POST'&&action==='checkout'&&c.status==='sandbox_active'))throw fail(409,'Campaign is already funded or locked.');
  if(req.method==='POST'&&action.startsWith('image/')){
   limit(req,'promo-image',12,3600000);
   const file=multipart(await readBody(req,16*1024*1024),req.headers['content-type']||'').find(x=>x.name==='image');
   const kind=action.split('/')[1],column=kind==='icon'?'icon_file':'background_file';
   const name=await normalizeBrand(file,kind,UPLOADS,fail);
   try{const current=lookup(c.id);if(!['draft','awaiting_payment'].includes(current.status))throw fail(409,'Campaign was funded during upload.');
    db.prepare('UPDATE campaign_branding SET '+column+'=? WHERE campaign_id=?').run(name,c.id);
    // Retain replaced image temporarily; a concurrent SQLite backup may still reference it.
   }catch(e){await fsp.unlink(path.join(UPLOADS,name)).catch(()=>{});throw e;}
   return send(res,201,{branding:campaignBrand(db,c.id)});
  }
  if(req.method==='POST'&&action==='settings'){
   const data=await json(req),selections=data.selections,headline=String(data.headline||'').trim();
   if(headline.length>120||!Array.isArray(selections)||selections.length>8||selections.some(x=>typeof x!=='string')||new Set(selections).size!==selections.length)throw fail(422,'Invalid promotion selection.');
   if(!['draft','awaiting_payment'].includes(lookup(c.id).status))throw fail(409,'Campaign locked.');
   buildQuote(db,c,{...b,headline,selections:JSON.stringify(selections)},fail);
   db.prepare('UPDATE campaign_branding SET headline=?,selections=? WHERE campaign_id=?').run(headline,JSON.stringify(selections),c.id);
   return send(res,200,{ok:true});
  }
  const ready=(current,brand)=>{
   if(!brand.icon_file||!brand.background_file||!fs.existsSync(path.join(UPLOADS,brand.icon_file))||!fs.existsSync(path.join(UPLOADS,brand.background_file))||!current.rights_confirmed||current.moderation_status!=='visible'||!db.prepare("SELECT 1 FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.id=? AND r.owner_id=? AND r.visibility='public' AND u.status='active'").get(current.release_id,actor.id))throw fail(422,'Complete both branding images, rights confirmation and a public release first.');
   return buildQuote(db,current,brand,fail);
  };
  if(req.method==='GET'&&action==='quote')return send(res,200,{quote:ready(c,b),sandbox:isSandboxBilling(),real_payments:false});
  if(req.method==='POST'&&action==='checkout'){
   if(!isSandboxBilling())throw fail(503,'Real payments are disabled. No charge was made.');
   limit(req,'promo-checkout',20,3600000);
   const data=await json(req);
   db.exec('BEGIN IMMEDIATE');
   try{
    const current=lookup(c.id),brand=branding(c.id);
    if(current.status==='sandbox_active'){
     const order=db.prepare('SELECT * FROM promo_orders WHERE campaign_id=?').get(c.id);
     const q=order&&JSON.parse(order.quote_json);
     if(data.confirm===true&&q?.quote_hash===data.quote_hash){db.exec('COMMIT');return send(res,200,{ok:true,already_active:true,mode:'sandbox',charged_cents:0,quote:q,film:JSON.parse(db.prepare('SELECT snapshot_json FROM campaign_launch_films WHERE campaign_id=? AND owner_id=?').get(c.id,actor.id)?.snapshot_json||'null')});}
    }
    if(!['draft','awaiting_payment'].includes(current.status))throw fail(409,'Campaign is already funded.');
    const q=ready(current,brand);
    if(data.confirm!==true||data.quote_hash!==q.quote_hash)throw fail(409,'Quote changed or was not confirmed. Review final checkout again.');
    const at=now();
    consumeBenefit(db,q,actor.id,at);
    db.prepare('INSERT INTO promo_orders VALUES(?,?,?,?,0)').run(c.id,actor.id,JSON.stringify(q),at);
    const orderId=id();
    db.prepare('INSERT INTO sandbox_campaign_orders(id,campaign_id,user_id,quoted_amount_cents,charged_cents,created_at) VALUES(?,?,?,?,0,?)').run(orderId,c.id,actor.id,q.total_cents,at);
    const release=db.prepare('SELECT title,genre FROM releases WHERE id=?').get(current.release_id);
    const media=db.prepare('SELECT label,mime,bytes FROM campaign_assets WHERE campaign_id=? AND hidden_at IS NULL ORDER BY id').all(c.id);
    const details=Object.fromEntries(['title','brief','platform','cpm_rate_cents','min_views','max_clip_cents','tracking_days','rules','mandatory_hashtags','sample_caption','prohibited_content','spotify_track_url','rights_confirmed'].map(k=>[k,current[k]]));
    const snapshot={version:1,mode:'sandbox',payment_status:'test_confirmed',charged_cents:0,receipt_id:orderId,confirmed_at:at,campaign_id:c.id,artist:actor.display_name,release,details,media,branding:campaignBrand(db,c.id),quote:{budget_cents:q.budget_cents,base_fee_cents:q.base_fee_cents??q.fee_cents,discount_cents:q.discount_cents||0,fee_cents:q.fee_cents,promo_cents:q.promo_cents,total_cents:q.total_cents,lines:q.lines,placements:q.placements}};
    db.prepare('INSERT INTO campaign_launch_films VALUES(?,?,?,?)').run(c.id,actor.id,JSON.stringify(snapshot),at);
    for(const x of q.placements)db.prepare('INSERT INTO promo_placements VALUES(?,?,?,?)').run(c.id,x.placement,at,new Date(Date.parse(at)+x.hours*3600000).toISOString());
    db.prepare("UPDATE campaigns SET status='sandbox_active',sandbox_funded_cents=budget_cents,sandbox_spent_cents=0,launched_at=? WHERE id=?").run(at,c.id);
    db.exec('COMMIT');broadcast('sandbox-campaign');return send(res,201,{ok:true,mode:'sandbox',charged_cents:0,quote:q,film:snapshot});
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  throw fail(405,'Promotion operation unavailable.');
 };
}
