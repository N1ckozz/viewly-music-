/* Viewly MFA user interface — encrypted TOTP seeds, one-time recovery codes. */
(()=>{
'use strict';
const prevProfile=profilePage;
profilePage=function(){
 let html=prevProfile();
 if(!S.user||!html.includes('sec-center'))return html;
 const panel='<div class="mfa-manager" id="mfa-manager"><div class="mfa-head"><span class="sec-eyebrow">'+ico('shield',18)+' TWO-FACTOR AUTHENTICATION</span>'+
 '<h4>Authenticator app security</h4><p>Protect sign-ins with an extra code from your authenticator. Recovery codes are shown only once.</p></div>'+
 '<div id="mfa-body" aria-live="polite"><p class="sec-hint">Checking authenticator status…</p></div></div>';
 return html.replace(/<div class="sec-notice">[\s\S]*?<\/div>/,()=>panel);
};
async function refreshStatus(){
 const dest=document.querySelector('#mfa-body');if(!dest)return;
 try{
  const state=await api('/security/mfa');
  if(!dest.isConnected)return;
  if(!state.available){
   dest.innerHTML='<p class="mfa-warn">Authenticator enrollment is unavailable until the server encryption key is configured. Do not store irreplaceable personal or financial information here.</p>';
  }else if(state.enabled){
   dest.innerHTML='<div class="mfa-enabled"><b>Authenticator protection is ON</b><p>Signing in requires your password plus a valid authenticator or one-time recovery code.</p></div>'+
   '<form id="mfa-disable-form"><div class="sec-form-grid"><div class="field"><label>Current password (if applicable)</label><input type="password" autocomplete="current-password" name="current_password"></div>'+
   '<div class="field"><label>Authenticator or recovery code</label><input type="text" name="code" autocomplete="one-time-code" maxlength="40" required></div></div>'+
   '<button class="v-button is-subtle" type="submit">Turn off authenticator protection</button></form>';
  }else{
   dest.innerHTML='<form id="mfa-setup-form"><div class="field"><label>Confirm your current password (if applicable)</label>'+
   '<input type="password" autocomplete="current-password" name="current_password"></div>'+
   '<button type="submit" class="v-button is-primary">Set up authenticator '+ico('arrow',15)+'</button></form>'+
   '<p class="sec-hint">Use Google Authenticator, Microsoft Authenticator or another TOTP-compatible app.</p>';
  }
 }catch(e){if(dest.isConnected)dest.textContent=e.message||'Authenticator status unavailable.'}
}
const oldRender=render;
render=function(){
 oldRender();
 const root=document.querySelector('#mfa-manager');
 if(root)queueMicrotask(()=>{if(root.isConnected)refreshStatus()});
};
function viewlyOpenMfa(){
 showOverlay('<div class="mfa-login"><span class="sec-eyebrow">'+ico('shield',18)+' SECURE SIGN-IN</span>'+
 '<h2>Verify it is you.</h2><p>Enter the 6-digit code from your authenticator, or one unused recovery code.</p>'+
 '<form id="mfa-login-form"><div class="field"><label for="mfa-login-code">Authenticator or recovery code</label>'+
 '<input type="text" id="mfa-login-code" name="code" autocomplete="one-time-code" maxlength="40" required autofocus></div>'+
 '<button type="submit" class="v-button is-primary">Verify & sign in '+ico('arrow',15)+'</button>'+
 '<p id="mfa-login-msg" role="status"></p></form><p class="sec-hint">Lost your codes? Contact the account owner through a verified channel. Do not share a code with anyone.</p></div>','medium');
 document.querySelector('#mfa-login-code')?.focus();
}
window.viewlyOpenMfa=viewlyOpenMfa;
window.addEventListener('load',()=>{
 const params=new URLSearchParams(window.location.search);
 if(params.get('mfa')==='1'){
  params.delete('mfa');
  history.replaceState(null,'',window.location.pathname+(params.toString()?'?'+params:''));
  viewlyOpenMfa();
 }
});
document.addEventListener('submit',async e=>{
 const form=e.target;
 if(!['mfa-login-form','mfa-setup-form','mfa-enable-form','mfa-disable-form'].includes(form.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 const btn=form.querySelector('[type=submit]');if(btn)btn.disabled=true;
 const fd=new FormData(form);
 try{
  if(form.id==='mfa-login-form'){
   await api('/security/mfa/login','POST',{code:String(fd.get('code')||'')});
   closeOverlay();await refresh();toast('Secure sign-in completed.');
  }else if(form.id==='mfa-setup-form'){
   const setup=await api('/security/mfa/setup','POST',{current_password:String(fd.get('current_password')||'')});
   const dest=document.querySelector('#mfa-body');if(!dest)return;
   dest.innerHTML='<div class="mfa-secret"><p>1. Add a new time-based account in your authenticator app. Enter this seed manually, or open the setup link on a compatible device.</p>'+
    '<code data-viewly-selectable>'+esc(setup.secret)+'</code><a href="'+esc(setup.otpauth_url)+'">Open authenticator setup</a><p>2. Enter the 6-digit code from the app below to activate protection.</p></div>'+
    '<form id="mfa-enable-form"><div class="field"><label>6-digit setup code</label><input type="text" inputmode="numeric" autocomplete="one-time-code" name="code" pattern="[0-9]{6}" maxlength="6" required></div>'+
    '<button type="submit" class="v-button is-primary">Enable authenticator '+ico('arrow',14)+'</button></form>';
  }else if(form.id==='mfa-enable-form'){
   const enabled=await api('/security/mfa/enable','POST',{code:String(fd.get('code')||'')});
   const dest=document.querySelector('#mfa-body');if(!dest)return;
   const codes=enabled.recovery_codes||[];
   dest.innerHTML='<div class="mfa-enabled"><b>Authenticator enabled</b><p>Save every code below in a secure password manager now. Each can be used once and they will not be displayed again.</p></div>'+
    '<div class="mfa-recovery-list" data-viewly-selectable>'+codes.map(x=>'<code>'+esc(x)+'</code>').join('')+'</div>'+
    '<button class="v-button is-subtle" type="button" data-mfa-action="done">I saved my recovery codes</button>';
  }else if(form.id==='mfa-disable-form'){
   if(!window.confirm('Disable two-factor authentication for your account?'))return;
   await api('/security/mfa/disable','POST',{current_password:String(fd.get('current_password')||''),code:String(fd.get('code')||'')});
   await refreshStatus();toast('Authenticator protection disabled.');
  }
 }catch(err){
  const msg=err.message||'Authenticator action failed.';
  const target=document.querySelector('#mfa-login-msg');
  if(target&&form.id==='mfa-login-form')target.textContent=msg;
  else toast(msg,true);
 }finally{if(btn&&btn.isConnected)btn.disabled=false}
},true);
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-mfa-action="done"]');
 if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();refreshStatus();
},true);
})();