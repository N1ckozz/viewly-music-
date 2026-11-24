import crypto from 'node:crypto';
const base=(process.env.APP_URL||'http://localhost:4179').replace(/\/$/,'');
const key=process.env.VIEWLY_SOCIAL_TOKEN_KEY||'';
const tk=process.env.TIKTOK_CLIENT_KEY||'',ts=process.env.TIKTOK_CLIENT_SECRET||'';
const sp=process.env.SPOTIFY_CLIENT_ID||'',ss=process.env.SPOTIFY_CLIENT_SECRET||'';
const secure=base.startsWith('https://');
const hasKey=/^[a-fA-F0-9]{64}$/.test(key);
const enabled=p=>secure&&hasKey&&(p==='tiktok'?!!(tk&&ts):!!(sp&&ss));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const nonce=()=>crypto.randomBytes(32).toString('base64url');
const when=()=>new Date().toISOString();
const failLocal=(status,message)=>Object.assign(new Error(message),{status});
const socialCookie=(val,age)=>'viewly_social_state='+encodeURIComponent(val)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':'');
function encrypt(input){
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 const data=Buffer.concat([c.update(JSON.stringify(input),'utf8'),c.final()]);
 return iv.toString('hex')+':'+c.getAuthTag().toString('hex')+':'+data.toString('hex');
}
function decrypt(value){
 const [iv,auth,data]=String(value).split(':');
 const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));
 d.setAuthTag(Buffer.from(auth,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(data,'hex')),d.final()]).toString());
}
async function request(url,opts={},source='Provider'){
 let res;try{res=await fetch(url,{...opts,signal:AbortSignal.timeout(12000),redirect:'error'});}
 catch{throw failLocal(503,source+' is temporarily unavailable.');}
 if(!res.ok)throw failLocal(502,source+' returned '+res.status+'.');
 try{return await res.json();}catch{throw failLocal(502,'Invalid provider response.');}
}
const form=(url,values,source)=>request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)},source);
function checkTikTok(response){
 if(response?.error&&!['ok','OK',0,'0'].includes(response.error.code))throw failLocal(502,'TikTok rejected this verification request.');
}
export function initSocial(db){
 db.exec("CREATE TABLE IF NOT EXISTS social_connections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL,provider_user_id TEXT NOT NULL,display_name TEXT NOT NULL,avatar_url TEXT NOT NULL DEFAULT '',scopes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',encrypted_token TEXT NOT NULL DEFAULT '',token_expires_at INTEGER NOT NULL DEFAULT 0,connected_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,provider),UNIQUE(provider,provider_user_id));");
 db.exec("CREATE TABLE IF NOT EXISTS social_oauth_states(state_hash TEXT PRIMARY KEY,provider TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),session_hash TEXT NOT NULL,expires_at INTEGER NOT NULL);");
 db.exec("CREATE TABLE IF NOT EXISTS spotify_artist_links(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,artist_url TEXT NOT NULL,artist_id TEXT NOT NULL,updated_at TEXT NOT NULL);");
}
export function socialAvailability(){
 return {tiktok:enabled('tiktok'),spotify:enabled('spotify'),spotify_artist_ownership_verified:false,
  note:'TikTok requires an approved Login Kit and video.list. Spotify OAuth identifies a user, not ownership of an artist page.'};
}
export function connectedTikTok(db,userId){
 const row=db.prepare("SELECT id,display_name,status,scopes FROM social_connections WHERE provider='tiktok' AND user_id=?").get(userId);
 return row?.status==='active'&&row.scopes.split(',').includes('video.list')?row:null;
}
export function parseTikTokUrl(value,fail){
 let url;try{url=new URL(value)}catch{throw fail(422,'Paste a full TikTok video URL.');}
 if(url.protocol!=='https:'||!['www.tiktok.com','tiktok.com','m.tiktok.com'].includes(url.hostname))throw fail(422,'Only official TikTok video URLs are accepted.');
 const match=url.pathname.match(/^\/@([a-zA-Z0-9._]{2,32})\/video\/([0-9]{15,24})\/?$/);
 if(!match)throw fail(422,'Use a complete https://www.tiktok.com/@username/video/123... URL, not a short link.');
 return {videoId:match[2],canonical:'https://www.tiktok.com/@'+match[1]+'/video/'+match[2]};
}
async function tokenFor(db,conn,fail){
 if(!enabled(conn.provider))throw fail(503,'Official connection verification has not been configured.');
 const old=decrypt(conn.encrypted_token);
 if(Date.now()+60000<conn.token_expires_at)return old.access_token;
 if(!old.refresh_token)throw fail(403,'This social permission expired. Reconnect the account.');
 const next=conn.provider==='tiktok'?
  await form('https://open.tiktokapis.com/v2/oauth/token/',{grant_type:'refresh_token',client_key:tk,client_secret:ts,refresh_token:old.refresh_token},'TikTok'):
  await form('https://accounts.spotify.com/api/token',{grant_type:'refresh_token',client_id:sp,client_secret:ss,refresh_token:old.refresh_token},'Spotify');
 if(!next.access_token)throw fail(502,'Social token refresh failed.');
 db.prepare('UPDATE social_connections SET encrypted_token=?,token_expires_at=?,updated_at=? WHERE id=? AND user_id=?')
  .run(encrypt({access_token:next.access_token,refresh_token:next.refresh_token||old.refresh_token}),Date.now()+Math.max(120,Number(next.expires_in)||3600)*1000,when(),conn.id,conn.user_id);
 return next.access_token;
}
export async function verifyTikTokVideo(db,userId,value,fail){
 const conn=db.prepare("SELECT * FROM social_connections WHERE user_id=? AND provider='tiktok' AND status='active' AND encrypted_token<>''").get(userId);
 if(!conn||!conn.scopes.split(',').includes('video.list'))throw fail(403,'Link your TikTok account and approve video access first.');
 const vid=/^[0-9]{15,24}$/.test(String(value))?String(value):parseTikTokUrl(value,fail).videoId;
 const access=await tokenFor(db,conn,fail);
 const result=await request('https://open.tiktokapis.com/v2/video/query/?fields=id,create_time,share_url,view_count,like_count,comment_count,share_count',{
  method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({filters:{video_ids:[vid]}})
 },'TikTok');
 checkTikTok(result);
 const post=result?.data?.videos?.find(v=>String(v.id)===vid);
 if(!post)return {owned:false,available:false,video_id:vid,connection_id:conn.id,verified_at:when()};
 if(!Number.isSafeInteger(Number(post.view_count))||Number(post.view_count)<0)throw fail(502,'TikTok views are not available.');
 return {owned:true,available:true,video_id:vid,connection_id:conn.id,provider_user_id:conn.provider_user_id,
  display_name:conn.display_name,views:Number(post.view_count),created_at:new Date(Number(post.create_time)*1000).toISOString(),
  share_url:String(post.share_url||'').slice(0,500),verified_at:when(),source:'TikTok Display API: reported views, not independent fraud certification'};
}
export function createSocialHandler({db,requireUser,fail,json,send,id,now,cookieValue,sha,broadcast}){
 async function begin(req,res,provider){
  const user=requireUser(req);
  if(!enabled(provider))throw fail(503,provider+' OAuth is not ready. Official app approval, client credentials, HTTPS callback and token encryption key are required.');
  const session=cookieValue(req,'viewly_session');
  if(!session)throw fail(401,'Sign in before connecting.');
  const state=nonce();
  db.prepare('INSERT INTO social_oauth_states VALUES (?,?,?,?,?)').run(sha(state),provider,user.id,sha(session),Date.now()+600000);
  res.setHeader('Set-Cookie',socialCookie(state,600));
  const url=provider==='tiktok'?
   'https://www.tiktok.com/v2/auth/authorize/?'+new URLSearchParams({client_key:tk,response_type:'code',scope:'user.info.basic,video.list',redirect_uri:base+'/connect/tiktok/callback',state}):
   'https://accounts.spotify.com/authorize?'+new URLSearchParams({client_id:sp,response_type:'code',scope:'user-read-private',redirect_uri:base+'/connect/spotify/callback',state,show_dialog:'true'});
  res.writeHead(302,{Location:url});res.end();
 }
 async function finish(req,res,provider,url){
  const state=url.searchParams.get('state')||'';
  const cookieState=cookieValue(req,'viewly_social_state');
  res.setHeader('Set-Cookie',socialCookie('',0));
  if(!state||!cookieState||state!==cookieState)throw fail(403,'Social account linking state mismatch.');
  const pending=db.prepare('SELECT * FROM social_oauth_states WHERE state_hash=? AND provider=? AND expires_at>?').get(sha(state),provider,Date.now());
  if(!pending)throw fail(403,'Account linking expired.');
  db.prepare('DELETE FROM social_oauth_states WHERE state_hash=?').run(sha(state));
  if(!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?').get(pending.session_hash,pending.user_id,Date.now()))
   throw fail(401,'Viewly login expired during linking.');
  if(url.searchParams.get('error')){res.writeHead(302,{Location:base+'/?social='+provider+'_cancelled'});return res.end();}
  const code=url.searchParams.get('code')||'';
  if(code.length<5||code.length>2048)throw fail(422,'Provider authorization code missing.');
  let token,identity,externalId,scopes;
  if(provider==='tiktok'){
   token=await form('https://open.tiktokapis.com/v2/oauth/token/',{client_key:tk,client_secret:ts,code,grant_type:'authorization_code',redirect_uri:base+'/connect/tiktok/callback'},'TikTok');
   scopes=String(token.scope||'');
   if(!token.access_token||!token.open_id||!scopes.split(',').includes('video.list'))throw fail(403,'TikTok authorization must grant video.list.');
   const data=await request('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers:{Authorization:'Bearer '+token.access_token}},'TikTok');
   checkTikTok(data);
   identity=data?.data?.user;
   if(identity?.open_id!==token.open_id)throw fail(502,'TikTok user identity mismatch.');
   externalId=identity.open_id;
  }else{
   token=await form('https://accounts.spotify.com/api/token',{grant_type:'authorization_code',code,redirect_uri:base+'/connect/spotify/callback',client_id:sp,client_secret:ss},'Spotify');
   if(!token.access_token)throw fail(502,'Spotify auth failed.');
   identity=await request('https://api.spotify.com/v1/me',{headers:{Authorization:'Bearer '+token.access_token}},'Spotify');
   if(!identity?.id)throw fail(502,'Spotify user identity not returned.');
   externalId=identity.id;scopes=token.scope||'user-read-private';
  }
  const claimed=db.prepare('SELECT user_id FROM social_connections WHERE provider=? AND provider_user_id=?').get(provider,externalId);
  if(claimed&&claimed.user_id!==pending.user_id)throw fail(409,'This social identity is already linked to a different Viewly account.');
  db.prepare("INSERT INTO social_connections(id,user_id,provider,provider_user_id,display_name,avatar_url,scopes,status,encrypted_token,token_expires_at,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET provider_user_id=excluded.provider_user_id,display_name=excluded.display_name,avatar_url=excluded.avatar_url,scopes=excluded.scopes,status='active',encrypted_token=excluded.encrypted_token,token_expires_at=excluded.token_expires_at,connected_at=excluded.connected_at,updated_at=excluded.updated_at")
   .run(id(),pending.user_id,provider,String(externalId),String(identity.display_name||'Connected account').slice(0,90),String(identity.avatar_url||identity.images?.[0]?.url||'').slice(0,500),
    String(scopes),encrypt({access_token:token.access_token,refresh_token:token.refresh_token||''}),Date.now()+Math.max(120,Number(token.expires_in)||3600)*1000,now(),now());
  broadcast('social-connected');
  res.writeHead(302,{Location:base+'/?social='+provider+'_connected'});res.end();
 }
 return async function handler(req,res,url){
  const path=url.pathname;
  const start=path.match(/^\/connect\/(tiktok|spotify)$/);
  if(start&&req.method==='GET')return begin(req,res,start[1]);
  const callback=path.match(/^\/connect\/(tiktok|spotify)\/callback$/);
  if(callback&&req.method==='GET')return finish(req,res,callback[1],url);
  if(path==='/api/social/available'&&req.method==='GET')return send(res,200,socialAvailability());
  if(path==='/api/social/connections'&&req.method==='GET'){
   const user=requireUser(req),linked=db.prepare('SELECT artist_url FROM spotify_artist_links WHERE user_id=?').get(user.id);
   return send(res,200,{connections:db.prepare("SELECT id,provider,provider_user_id,display_name,avatar_url,scopes,status,connected_at,updated_at FROM social_connections WHERE user_id=?").all(user.id),
    spotify_artist_url:linked?.artist_url||'',ready:socialAvailability()});
  }
  if(path==='/api/social/tiktok/verify-video'&&req.method==='POST'){
   const user=requireUser(req),body=await json(req);
   return send(res,200,await verifyTikTokVideo(db,user.id,body.url,fail));
  }
  if(path==='/api/social/spotify/artist'&&req.method==='PATCH'){
   const user=requireUser(req),body=await json(req);
   const raw=String(body.artist_url||'');let artistId='',url='';
   if(raw){let link;try{link=new URL(raw)}catch{throw fail(422,'Invalid Spotify artist link.');}
    const m=link.pathname.match(/^\/artist\/([a-zA-Z0-9]{22})\/?$/);
    if(link.protocol!=='https:'||link.hostname!=='open.spotify.com'||!m)throw fail(422,'Enter an open.spotify.com/artist/ID URL.');
    artistId=m[1];url='https://open.spotify.com/artist/'+artistId;}
   if(!url)db.prepare('DELETE FROM spotify_artist_links WHERE user_id=?').run(user.id);
   else db.prepare('INSERT INTO spotify_artist_links VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET artist_url=excluded.artist_url,artist_id=excluded.artist_id,updated_at=excluded.updated_at').run(user.id,url,artistId,now());
   broadcast('spotify-artist-link');return send(res,200,{ok:true,artist_url:url,artist_ownership_verified:false});
  }
  if(path==='/api/social/disconnect'&&req.method==='POST'){
   const user=requireUser(req),body=await json(req);
   if(!['tiktok','spotify'].includes(body.provider))throw fail(422,'Unknown provider.');
   db.prepare("UPDATE social_connections SET status='disconnected',encrypted_token='',token_expires_at=0,updated_at=? WHERE user_id=? AND provider=?").run(now(),user.id,body.provider);
   broadcast('social-disconnected');return send(res,200,{ok:true,note:'Future verification requires reconnection. Past evidence is retained.'});
  }
  return false;
 };
}
