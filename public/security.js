/* VIEWLY ACCOUNT SECURITY — real server-backed controls; never displays or saves credentials. */
(()=>{
'use strict';
const original=profilePage;
profilePage=function(){
 const output=original();
 if(!S.user||!output.includes('<h2>Sign-in & security</h2>'))return output;
 const center='<section class="sec-center"><div class="sec-center-head"><span class="sec-eyebrow">'+ico('shield',18)+' ACCOUNT SECURITY</span><h3>Protect your account</h3><p>Manage your password and revoke other signed-in browser sessions. Passwords never appear in activity logs.</p></div>'+
 '<form id="sec-password-form" autocomplete="on"><h4>Change password</h4>'+
 '<div class="sec-form-grid"><div class="field"><label for="sec-current">Current password</label><input id="sec-current" type="password" name="current_password" autocomplete="current-password" required></div>'+
 '<div class="field"><label for="sec-new">New password</label><input id="sec-new" type="password" name="new_password" autocomplete="new-password" minlength="12" maxlength="128" required></div>'+
 '<div class="field"><label for="sec-mfa-code">Authenticator or recovery code (when MFA is enabled)</label><input id="sec-mfa-code" name="mfa_code" autocomplete="one-time-code" maxlength="40"></div></div>'+
 '<p class="sec-hint">Use a unique password of at least 12 characters; a password manager is recommended.</p>'+
 '<button type="submit" class="v-button is-primary">Update password & sign out other devices '+ico('arrow',15)+'</button><p class="sec-form-response" id="sec-password-status" role="status"></p></form>'+
 '<div class="sec-session-manage"><h4>Signed-in devices</h4><p>Review active browser sessions and revoke every session except this one.</p>'+
 '<div id="sec-session-list" aria-live="polite"><button type="button" class="v-button is-subtle" data-sec-action="sessions">'+ico('search',15)+' Show active sessions</button></div>'+
 '<button type="button" class="v-button is-subtle sec-revoke" data-sec-action="revoke">'+ico('logout',15)+' Sign out all other devices</button></div>'+
 '<div class="sec-notice"><strong>Two-factor authentication</strong><p>Not yet configured on this deployment. Until it is available, do not treat Viewly as a secure payment or identity vault.</p></div></section>';
 return output.replace('<div class="v-settings-content">','<div class="v-settings-content">'+center);
};
document.addEventListener('submit',async e=>{
 if(e.target?.id!=='sec-password-form')return;
 e.preventDefault();e.stopImmediatePropagation();
 const form=e.target,button=form.querySelector('[type="submit"]'),status=document.querySelector('#sec-password-status');
 const fd=new FormData(form),current=String(fd.get('current_password')||''),next=String(fd.get('new_password')||'');
 if(next.length<12){if(status)status.textContent='Choose a password of at least 12 characters.';return}
 button.disabled=true;
 if(status)status.textContent='Updating credentials securely…';
 try{
  await api('/security/change-password','POST',{current_password:current,new_password:next,mfa_code:String(fd.get('mfa_code')||'')});
  form.reset();if(status)status.textContent='Password updated. Other sessions have been revoked.';
  toast('Password changed; other devices signed out.');
 }catch(err){if(status)status.textContent=err.message||'Password change failed.'}
 finally{button.disabled=false;}
},true);
document.addEventListener('click',async e=>{
 const target=e.target.closest('[data-sec-action]');
 if(!target)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(!S.user)return;
 const action=target.dataset.secAction;
 if(action==='revoke'&&!window.confirm('Sign out all other devices? Your current browser will stay signed in.'))return;
 target.disabled=true;
 try{
  if(action==='revoke'){
   await api('/security/logout-others','POST',{});
   toast('Other sessions revoked successfully.');
  }
  const data=await api('/security/sessions');
  const root=document.querySelector('#sec-session-list');
  if(root)root.innerHTML=data.sessions.length?
    '<div class="sec-sessions">'+data.sessions.map(s=>'<div class="sec-session"><span>'+ico('shield',17)+' <b>'+(s.current?'This browser':'Other browser')+'</b><small>Started '+esc(new Date(s.created_at).toLocaleString())+'</small></span><strong>'+(s.current?'CURRENT':'ACTIVE')+'</strong></div>').join('')+'</div>'+
    '<button type="button" class="v-button is-subtle" data-sec-action="sessions">Refresh sessions</button>':
    '<p class="sec-hint">No active sessions found.</p>';
 }catch(err){toast(err.message||'Could not manage sessions.',true)}
 finally{target.disabled=false;}
},true);
})();