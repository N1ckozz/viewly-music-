import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ffmpeg=spawnSync('ffmpeg',['-version']);
test('moderation is admin-only, auditable, reversible and protects direct media URLs',{skip:ffmpeg.status!==0},async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-mod-')),port=44000+Math.floor(Math.random()*12000),base='http://127.0.0.1:'+port;
 const dbpath=path.join(temp,'db'),uploads=path.join(temp,'uploads');
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:dbpath,VIEWLY_UPLOAD_DIR:uploads,VIEWLY_REQUIRE_PERSISTENCE:'false'},stdio:'ignore'});
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true})});
 let up=false;for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){up=true;break}}catch{}}
 assert.ok(up);
 async function req(endpoint,method='GET',body,cookie=''){
  const headers={};if(cookie)headers.Cookie=cookie;if(body!==undefined&&!(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch(base+endpoint,{method,headers,body:body instanceof FormData?body:body!==undefined?JSON.stringify(body):undefined});
  const isJson=(r.headers.get('content-type')||'').includes('json');
  return {status:r.status,body:isJson?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 const artist=await req('/api/register','POST',{email:'artist@v.test',username:'artist_mod',display_name:'Artist Mod',role:'artist',password:'A-Long-Password#1'});
 const viewer=await req('/api/register','POST',{email:'viewer@v.test',username:'viewer_mod',display_name:'Viewer Mod',role:'viewer',password:'A-Long-Password#2'});
 assert.equal(artist.status,201);assert.equal(viewer.status,201);
 const file=path.join(temp,'test.mp4');const gen=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=12:d=7','-f','lavfi','-i','sine=frequency=240:duration=7','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',file],{timeout:30000});assert.equal(gen.status,0);
 const form=new FormData();form.set('title','Real rights test');form.set('description','Original artist video');form.set('genre','Rap');form.set('rights','on');form.set('video',new Blob([fs.readFileSync(file)],{type:'video/mp4'}),'test.mp4');
 const uploaded=await req('/api/releases','POST',form,artist.cookie);assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
 const id=uploaded.body.release.id,url=uploaded.body.release.video_url;
 assert.equal((await req('/api/releases')).body.releases.length,1);
 const report=await req('/api/releases/'+id+'/report','POST',{reason:'copyright',details:'A rights holder requested review'},viewer.cookie);
 assert.equal(report.status,201);
 const reportsBefore=await req('/api/admin/reports','GET',undefined,artist.cookie);assert.equal(reportsBefore.status,403);
 const db=new DatabaseSync(path.join(dbpath,'viewly.sqlite'));
 db.prepare("UPDATE users SET role='admin' WHERE id=?").run(viewer.body.user.id);db.close();
 const reports=await req('/api/admin/reports','GET',undefined,viewer.cookie);assert.equal(reports.status,200);assert.equal(reports.body.reports.length,1);
 const rid=reports.body.reports[0].id;
 const hide=await req('/api/admin/reports/'+rid+'/review','POST',{decision:'hide',reason:'Human reviewer confirmed rights question'},viewer.cookie);assert.equal(hide.status,200);
 assert.equal((await req('/api/releases')).body.releases.length,0);
 assert.equal((await req('/api/releases/'+id)).status,404);
 assert.equal((await req(url)).status,404);
 assert.equal((await req('/api/admin/reports/'+rid+'/review','POST',{decision:'hide',reason:'Attempt second review'},viewer.cookie)).status,409);
 assert.equal((await req('/api/admin/moderation-log','GET',undefined,viewer.cookie)).body.actions.length,1);
 const restore=await req('/api/admin/releases/'+id+'/restore','POST',{reason:'Release cleared after human appeal'},viewer.cookie);assert.equal(restore.status,200);
 assert.equal((await req('/api/releases')).body.releases.length,1);
 assert.equal((await req(url)).status,200);
 assert.equal((await req('/api/admin/moderation-log','GET',undefined,viewer.cookie)).body.actions.length,2);
});
