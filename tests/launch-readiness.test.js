import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('account export, session revocation and launch readiness fail-closed',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-ready-')),port=41000+Math.floor(Math.random()*17000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:path.join(temp,'db'),VIEWLY_UPLOAD_DIR:path.join(temp,'uploads'),VIEWLY_REQUIRE_PERSISTENCE:'false'},stdio:'ignore'});
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true})});
 let online=false;for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){online=true;break}}catch{}}assert.equal(online,true,'server is running');
 async function req(endpoint,method='GET',body,cookie=''){
  const h={};if(cookie)h.Cookie=cookie;if(body!==undefined)h['Content-Type']='application/json';
  const r=await fetch(base+'/api'+endpoint,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 const readiness=await req('/launch/readiness');
 assert.equal(readiness.status,503,'storage cannot be considered production-ready just because a local directory exists');
 assert.equal(readiness.data.commercial_launch_ready,false);
 assert.equal(readiness.data.payouts_operational,false);
 assert.equal((await req('/account/export')).status,401);
 const register={email:'person@viewly.test',username:'artist_export',display_name:'Export Artist',role:'artist',password:'A-Protected-Pass-123'};
 const one=await req('/register','POST',register);assert.equal(one.status,201);const cookie1=one.cookie;assert.ok(cookie1);
 const exportResult=await req('/account/export','GET',undefined,cookie1);assert.equal(exportResult.status,200);assert.equal(exportResult.data.account.email,register.email);assert.equal('password_hash' in exportResult.data.account,false);assert.equal('sessions' in exportResult.data,false);assert.ok(Array.isArray(exportResult.data.releases));assert.ok(Array.isArray(exportResult.data.ledger));
 const second=await req('/login','POST',{email:register.email,password:register.password});assert.equal(second.status,200);const cookie2=second.cookie;assert.notEqual(cookie1,cookie2);
 assert.equal((await req('/account/sessions','GET',undefined,cookie1)).data.active_session_count,2);
 assert.equal((await req('/account/revoke-other-sessions','POST',{password:'incorrect'},cookie1)).status,403);
 assert.equal((await req('/account/revoke-other-sessions','POST',{password:register.password},cookie1)).status,200);
 assert.equal((await req('/me','GET',undefined,cookie1)).data.user.id,one.data.user.id);
 assert.equal((await req('/account/export','GET',undefined,cookie2)).status,401);
 assert.equal((await req('/account/sessions','GET',undefined,cookie1)).data.active_session_count,1);
});
