#!/usr/bin/env node
/* Offline/privileged owner provisioning. Never make this available as an HTTP route.
   Only an operator who verified identity + email should run it on the real data volume. */
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args=process.argv.slice(2);
const emailArg=args.find(x=>x.startsWith('--email='));
const email=emailArg?.slice('--email='.length).trim().toLowerCase();
const confirm=args.includes('--verified-owner-identity')&&args.includes('--verified-email-ownership');
const revoke=args.includes('--revoke');
if(!email||!confirm){
 console.error('Usage: node scripts/provision-admin.js --email=owner@example.com --verified-owner-identity --verified-email-ownership [--revoke]');
 console.error('Run only after independently verifying account ownership and email access. Never put the email in a public issue.');
 process.exit(2);
}
const dbPath=path.resolve(process.env.VIEWLY_DATA_DIR||'./data','viewly.sqlite');
if(!fs.existsSync(dbPath))throw new Error('Database does not exist at '+dbPath+'. Ensure persistent storage is attached.');
const db=new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON');
const user=db.prepare('SELECT id,username,role,status FROM users WHERE email=?').get(email);
if(!user)throw new Error('Account does not exist. Register normally first, then enable authenticator MFA.');
if(user.status!=='active')throw new Error('Suspended user cannot become an administrator.');
const mfa=db.prepare('SELECT enabled FROM mfa_methods WHERE user_id=?').get(user.id);
if(!revoke&&mfa?.enabled!==1)throw new Error('The owner account must enable authenticator MFA before provisioning.');
const newRole=revoke?'artist':'admin';
db.exec('BEGIN IMMEDIATE');
try{
 db.prepare('UPDATE users SET role=?,email_verified=1 WHERE id=?').run(newRole,user.id);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
 const previous={role:user.role};
 const entry={role:newRole,email_verified:true,all_sessions_revoked:true,operator_approved:true};
 db.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?,?)').run(
  crypto.randomUUID(),user.id,revoke?'offline.admin.revoke':'offline.admin.provision','user',user.id,
  JSON.stringify(previous),JSON.stringify(entry),new Date().toISOString()
 );
 db.exec('COMMIT');
}catch(err){db.exec('ROLLBACK');throw err}
console.log('Offline role provisioned for @'+user.username+'. Previous sessions revoked.');
console.log('The user must sign in again with password or linked Google identity AND authenticator MFA.');
db.close();
