import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reqJson=async(base,endpoint,method='GET',data,session='',extraHeaders={})=>{
 const headers={...extraHeaders};if(session)headers.Cookie=session;
 if(method!=='GET')headers['X-Viewly-Request']='1';
 const response=await fetch(base+endpoint,{method,headers:{...headers,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
 return {status:response.status,cookie:response.headers.get('set-cookie'),response,body:await response.json()};
};

test('auth protections: strict session cookies, changed-password invalidation, legacy hashing and per-account isolation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-hardening-'));
 const dataDir=path.join(dir,'db'),port=44000+Math.floor(Math.random()*15000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{
  cwd:root,env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:dataDir,VIEWLY_UPLOAD_DIR:path.join(dir,'uploads')},stdio:'pipe'
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})});
 let online=false;
 for(let n=0;n<100;n++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){online=true;break}}catch{}}
 assert.equal(online,true,'server should start');
 // A simple cross-origin form cannot register or mutate without a custom protected request header.
 const data={email:'secure@example.test',username:'secureuser',display_name:'Secure User',password:'MyUniquePassword#987654',role:'artist'};
 const csrf=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal(csrf.status,403);
 const cross=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json','X-Viewly-Request':'1','Origin':'https://hostile.invalid'},body:JSON.stringify(data)});
 assert.equal(cross.status,403);
 const created=await reqJson(base,'/api/register','POST',data);
 assert.equal(created.status,201,JSON.stringify(created.body));
 assert.match(created.cookie,/HttpOnly/);assert.match(created.cookie,/SameSite=Strict/);
 assert.match(created.cookie,/Max-Age=604800/);
 const oldCookie=created.cookie.split(';')[0];
 const view=await reqJson(base,'/api/security/sessions','GET',undefined,oldCookie);
 assert.equal(view.status,200);assert.equal(view.body.sessions.length,1);
 assert.equal(view.body.sessions[0].current,true);
 const bad=await reqJson(base,'/api/security/change-password','POST',{current_password:'not-current',new_password:'NewPass!123456789'},oldCookie);
 assert.equal(bad.status,401);
 const good=await reqJson(base,'/api/security/change-password','POST',{current_password:data.password,new_password:'NewPass!123456789'},oldCookie);
 assert.equal(good.status,200,JSON.stringify(good.body));
 assert.equal(good.body.other_sessions_revoked,true);
 assert.ok(good.cookie&&good.cookie!==created.cookie);
 const current=good.cookie.split(';')[0];
 assert.equal((await reqJson(base,'/api/security/sessions','GET',undefined,oldCookie)).status,401);
 assert.equal((await reqJson(base,'/api/security/sessions','GET',undefined,current)).status,200);
 assert.equal((await reqJson(base,'/api/login','POST',{email:data.email,password:data.password})).status,401);
 const login=await reqJson(base,'/api/login','POST',{email:data.email,password:'NewPass!123456789'});
 assert.equal(login.status,200,JSON.stringify(login.body));
 const nextCookie=login.cookie.split(';')[0];
 const rev=await reqJson(base,'/api/security/logout-others','POST',{},nextCookie);
 assert.equal(rev.status,200);
 assert.equal((await reqJson(base,'/api/security/sessions','GET',undefined,current)).status,401,'revoked other session');
 // Existing legacy users are transparently upgraded on their next valid login.
 const db=new DatabaseSync(path.join(dataDir,'viewly.sqlite'));
 const salt=crypto.randomBytes(16).toString('hex'),legacyPassword='OriginalLegacyPass#1';
 db.prepare('UPDATE users SET password_hash=? WHERE email=?').run(salt+':'+crypto.scryptSync(legacyPassword,salt,64).toString('hex'),data.email);
 assert.equal((await reqJson(base,'/api/login','POST',{email:data.email,password:legacyPassword})).status,200);
 const upgraded=db.prepare('SELECT password_hash FROM users WHERE email=?').get(data.email).password_hash;
 assert.match(upgraded,/^s2\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
 db.close();
 const headers=await fetch(base+'/');
 assert.equal(headers.headers.get('x-content-type-options'),'nosniff');
 assert.equal(headers.headers.get('cross-origin-opener-policy'),'same-origin');
 assert.equal(headers.headers.get('cross-origin-resource-policy'),'same-origin');
});

test('browser security assets must not expose secrets or disable response integrity',()=>{
 const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
 const secure=fs.readFileSync(path.join(root,'public/security.js'),'utf8');
 assert.match(app,/X-Viewly-Request/);
 assert.match(secure,/\/security\/change-password/);
 assert.match(secure,/\/security\/logout-others/);
 assert.doesNotMatch(secure,/localStorage|sessionStorage|document\.cookie/);
});
