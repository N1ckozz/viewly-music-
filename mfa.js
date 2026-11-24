/* Viewly TOTP (RFC 6238) primitives.
   No external authentication libraries or plaintext seeds in SQLite. */
import crypto from 'node:crypto';

const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(input){
 let acc=0,bits=0,out='';
 for(const x of input){acc=(acc<<8)|x;bits+=8;while(bits>=5){bits-=5;out+=ABC[(acc>>>bits)&31];}}
 if(bits)out+=ABC[(acc<<(5-bits))&31];
 return out;
}
export function base32Decode(input){
 const s=String(input||'').toUpperCase().replace(/\s+/g,'').replace(/=+$/,'');
 if(!/^[A-Z2-7]+$/.test(s))throw Error('Invalid TOTP secret');
 let acc=0,bits=0,bytes=[];
 for(const ch of s){acc=(acc<<5)|ABC.indexOf(ch);bits+=5;if(bits>=8){bits-=8;bytes.push((acc>>>bits)&255);acc&=(1<<bits)-1;}}
 return Buffer.from(bytes);
}
export const newTotpSecret=()=>base32Encode(crypto.randomBytes(20));
export function totpAt(secret,step){
 const key=base32Decode(secret),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const digest=crypto.createHmac('sha1',key).update(counter).digest();
 const offset=digest[digest.length-1]&15,code=(digest.readUInt32BE(offset)&0x7fffffff)%1_000_000;
 return String(code).padStart(6,'0');
}
export function verifyTotp(secret,submitted,nowMs=Date.now(),lastStep=-1){
 const entered=String(submitted||'');
 if(!/^\d{6}$/.test(entered))return -1;
 const step=Math.floor(nowMs/30000);
 for(const candidate of [step,step-1,step+1]){
  if(candidate<=lastStep||candidate<0)continue;
  const expected=totpAt(secret,candidate);
  if(crypto.timingSafeEqual(Buffer.from(entered),Buffer.from(expected)))return candidate;
 }
 return -1;
}
export function validMfaKey(hex){return typeof hex==='string'&&/^[0-9a-f]{64}$/i.test(hex)}
export function encryptSeed(secret,keyHex){
 if(!validMfaKey(keyHex))throw Error('MFA encryption key is unavailable');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),iv);
 const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return 'v1:'+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function decryptSeed(payload,keyHex){
 if(!validMfaKey(keyHex)||!String(payload).startsWith('v1:'))throw Error('MFA configuration requires recovery');
 const bytes=Buffer.from(String(payload).slice(3),'base64url');
 if(bytes.length<29)throw Error('Invalid encrypted MFA value');
 const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),bytes.subarray(0,12));
 decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
export function newRecoveryCodes(count=10){
 return Array.from({length:count},()=>crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{1,4}/g).join('-'));
}
export function normalizeRecoveryCode(code){return String(code||'').toUpperCase().replace(/-/g,'').replace(/\s+/g,'')}
export function recoveryHash(userId,code,keyHex){
 if(!validMfaKey(keyHex))throw Error('MFA encryption key is unavailable');
 return crypto.createHmac('sha256',Buffer.from(keyHex,'hex')).update(userId+':'+normalizeRecoveryCode(code)).digest('hex');
}
