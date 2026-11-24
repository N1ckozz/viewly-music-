import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {totpAt,base32Encode,base32Decode,encryptSeed,decryptSeed,newRecoveryCodes} from '../mfa.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('TOTP primitives match RFC 6238 SHA1 vector, GCM detects tampering and backup codes are unique',()=>{
 const secret=base32Encode(Buffer.from('12345678901234567890','ascii'));
 assert.equal(totpAt(secret,Math.floor(59000/30000)),'287082');
 assert.equal(base32Decode(secret).toString(),'12345678901234567890');
 const key=crypto.randomBytes(32).toString('hex'),encrypted=encryptSeed(secret,key);
 assert.equal(decryptSeed(encrypted,key),secret);
 assert.throws(()=>decryptSeed(encrypted,crypto.randomBytes(32).toString('hex')));
 assert.equal(new Set(newRecoveryCodes(10)).size,10);
});
test('MFA is a second factor: encrypted enrollment, one-time recovery, replay rejection and protected password changes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-mfa-')),databaseDir=path.join(dir,'data');
 const port=39000+Math.floor(Math.random()*14000),base='http://127.0.0.1:'+port;
 const key=crypto.randomBytes(32).toString('hex');
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{
  cwd:root,env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_MFA_MASTER_KEY:key,VIEWLY_DATA_DIR:databaseDir,VIEWLY_UPLOAD_DIR:path.join(dir,'uploads')},stdio:'pipe'
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{force:true,recursive:true})});
 let online=false;
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){online=true;break}}catch{}}
 assert.ok(online,'server should become healthy');
 async function call(endpoint,method='GET',body,cookie=''){
  const headers={};if(method!=='GET')headers['X-Viewly-Request']='1';
  if(cookie)headers.cookie=cookie;
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await fetch(base+'/api'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,body:await res.json(),cookies:res.headers.getSetCookie()};
 }
 const email='mfa@example.test',password='Long-Unusual-Password#2026';
 const reg=await call('/register','POST',{email,username:'mfa_author',display_name:'MFA Author',role:'artist',password});
 assert.equal(reg.status,201,JSON.stringify(reg.body));
 const session=reg.cookies.find(s=>s.startsWith('viewly_session=')).split(';')[0];
 let state=await call('/security/mfa','GET',undefined,session);
 assert.equal(state.body.available,true);assert.equal(state.body.enabled,false);
 const setup=await call('/security/mfa/setup','POST',{current_password:password},session);
 assert.equal(setup.status,200,JSON.stringify(setup.body));assert.equal(setup.body.secret.length,32);
 assert.match(setup.body.otpauth_url,/^otpauth:\/\/totp\//);
 const db=new DatabaseSync(path.join(databaseDir,'viewly.sqlite'));
 const stored=db.prepare('SELECT seed_cipher FROM mfa_methods WHERE user_id=?').get(reg.body.user.id).seed_cipher;
 assert.match(stored,/^v1:/);assert.ok(!stored.includes(setup.body.secret));
 const nowStep=Math.floor(Date.now()/30000),initialCode=totpAt(setup.body.secret,nowStep);
 const enable=await call('/security/mfa/enable','POST',{code:initialCode},session);
 assert.equal(enable.status,200,JSON.stringify(enable.body));
 assert.equal(enable.body.recovery_codes.length,10);
 assert.equal(db.prepare('SELECT count(*) AS n FROM mfa_recovery WHERE user_id=?').get(reg.body.user.id).n,10);
 db.close();
 const login=await call('/login','POST',{email,password});
 assert.equal(login.status,200,JSON.stringify(login.body));
 assert.equal(login.body.mfa_required,true);
 assert.equal('user' in login.body,false);
 const ticket=login.cookies.find(s=>s.startsWith('viewly_mfa_ticket=')).split(';')[0];
 assert.ok(ticket);
 assert.equal((await call('/me','GET',undefined,ticket)).body.user,null);
 const denied=await call('/security/mfa/login','POST',{code:'000000'},ticket);
 assert.equal(denied.status,401);
 const verified=await call('/security/mfa/login','POST',{code:enable.body.recovery_codes[0]},ticket);
 assert.equal(verified.status,200,JSON.stringify(verified.body));
 const authCookie=verified.cookies.find(s=>s.startsWith('viewly_session=')).split(';')[0];
 assert.equal((await call('/me','GET',undefined,authCookie)).body.user.id,reg.body.user.id);
 const badPasswordChange=await call('/security/change-password','POST',{current_password:password,new_password:'Even-Better-UniquePassword#2'},authCookie);
 assert.equal(badPasswordChange.status,401,'password changes on MFA accounts require the factor');
 const changed=await call('/security/change-password','POST',{
  current_password:password,new_password:'Even-Better-UniquePassword#2',mfa_code:enable.body.recovery_codes[1]
 },authCookie);
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 const rotated=changed.cookies.find(s=>s.startsWith('viewly_session=')).split(';')[0];
 assert.equal((await call('/me','GET',undefined,authCookie)).body.user,null);
 const disabled=await call('/security/mfa/disable','POST',{
  current_password:'Even-Better-UniquePassword#2',code:enable.body.recovery_codes[2]
 },rotated);
 assert.equal(disabled.status,200,JSON.stringify(disabled.body));
 assert.equal((await call('/security/mfa','GET',undefined,rotated)).body.enabled,false);
 const plain=await call('/login','POST',{email,password:'Even-Better-UniquePassword#2'});
 assert.equal(plain.status,200);assert.ok(plain.body.user&&!plain.body.mfa_required);
});
