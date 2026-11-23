import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});
test('real follows, activity and moderation reports (no invented events)',{skip:ffmpeg.status!==0},async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-community-'));
 const port=40000+Math.floor(Math.random()*10000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:path.join(tmp,'db'),VIEWLY_UPLOAD_DIR:path.join(tmp,'uploads')},stdio:'ignore'});
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true})});
 let ready=false;for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}}assert.ok(ready,'server became healthy');
 const get=async(endpoint,method='GET',data,cookie='')=>{
  const h={};if(cookie)h.Cookie=cookie;let body;
  if(data instanceof FormData)body=data;
  else if(data!==undefined){h['Content-Type']='application/json';body=JSON.stringify(data)}
  const r=await fetch(base+'/api'+endpoint,{method,headers:h,body});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};
 };
 const a=await get('/register','POST',{email:'rap@example.test',username:'rapper_test',display_name:'Rapper Test',role:'artist',password:'SecureTestPassword#1'});
 assert.equal(a.status,201,JSON.stringify(a.body));const artist=a.body.user,artistCookie=a.cookie;
 const b=await get('/register','POST',{email:'clipper@example.test',username:'clipper_test',display_name:'Clipper Test',role:'viewer',password:'SecureTestPassword#2'});
 assert.equal(b.status,201);const viewerCookie=b.cookie;
 const profile=await get('/artists/'+artist.id);assert.equal(profile.status,200);assert.equal(profile.body.artist.followers,0);assert.equal(profile.body.artist.following,false);assert.equal('email' in profile.body.artist,false);
 assert.equal((await get('/activity','GET',undefined,viewerCookie)).body.items.length,0);
 const follow=await get('/artists/'+artist.id+'/follow','POST',{},viewerCookie);assert.equal(follow.status,200);assert.equal(follow.body.artist.followers,1);assert.equal(follow.body.artist.following,true);
 assert.equal((await get('/following','GET',undefined,viewerCookie)).body.artists.length,1);
 const artistActivity=await get('/activity','GET',undefined,artistCookie);assert.equal(artistActivity.status,200);assert.ok(artistActivity.body.items.some(x=>x.type==='follow'));
 assert.equal((await get('/artists/'+artist.id+'/follow','POST',{},artistCookie)).status,422);
 const file=path.join(tmp,'source.mp4');const gen=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=12:d=7','-f','lavfi','-i','sine=frequency=240:duration=7','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',file],{timeout:30000});assert.equal(gen.status,0);
 const form=new FormData();form.set('title','Real artist video');form.set('genre','Rap');form.set('description','Authorized test video');form.set('rights','on');form.set('video',new Blob([fs.readFileSync(file)],{type:'video/mp4'}),'source.mp4');
 const rel=await get('/releases','POST',form,artistCookie);assert.equal(rel.status,201,JSON.stringify(rel.body));
 const viewerActivity=await get('/activity','GET',undefined,viewerCookie);assert.ok(viewerActivity.body.items.some(x=>x.release_id===rel.body.release.id));
 const report=await get('/releases/'+rel.body.release.id+'/report','POST',{reason:'copyright',details:'Test report for a real created release'},viewerCookie);assert.equal(report.status,201);
 assert.equal((await get('/releases/'+rel.body.release.id+'/report','POST',{reason:'copyright'},viewerCookie)).body.status,'already_submitted');
 assert.equal((await get('/admin/reports','GET',undefined,viewerCookie)).status,403);
 const unfollow=await get('/artists/'+artist.id+'/follow','POST',{},viewerCookie);assert.equal(unfollow.body.artist.followers,0);assert.equal(unfollow.body.artist.following,false);
});
