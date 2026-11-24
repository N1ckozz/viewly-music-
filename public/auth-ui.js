/* Viewly V8 Auth Experience — real forms only; no made-up provider state. */
(()=>{
'use strict';
const previousModal=authModal;
authModal=function(mode='register'){
 previousModal(mode);
 const form=document.querySelector('#auth-form');if(!form)return;
 const pass=form.querySelector('input[name="password"]');
 if(pass){
  pass.setAttribute('minlength',mode==='register'?'12':'1');
  const holder=pass.parentElement;
  const show=document.createElement('button');
  show.type='button';show.className='auth8-show';show.textContent='Show password';
  show.setAttribute('aria-label','Show or hide password');
  show.setAttribute('data-auth8-show','1');
  holder.appendChild(show);
  if(mode==='register'){
   const info=document.createElement('div');info.className='auth8-strength';
   info.innerHTML='<span id="auth8-meter"><i></i></span><small id="auth8-hint" role="status">Use a long, unique password (12+ characters).</small>';
   holder.appendChild(info);
  }
 }
 const footer=document.createElement('div');footer.className='auth8-footer';
 if(mode==='login'){
  footer.innerHTML='<button type="button" class="auth8-link" data-auth8-open="forgot">Forgot password?</button>'+
   '<p>Use your password or a verified Google sign-in when available. MFA remains required when enabled.</p>';
 }else{
  footer.innerHTML='<p>Protected sessions · Authenticator support · Private account data</p>';
 }
 form.appendChild(footer);
};
const prevProfile=profilePage;
profilePage=function(){
 let html=prevProfile();
 if(!S.user)return html;
 const verified=!!S.user.email_verified;
 const ready=!!S.config?.email_delivery_ready;
 const message=verified?
  '<span class="auth8-verified">'+ico('shield',15)+' Email verified</span>':
  '<div class="auth8-verify-notice"><b>Email not verified yet.</b><p>'+
   (ready?'Verify your email to fully secure account recovery and administrative identity.':
    'Outgoing verification emails are not configured yet; email ownership remains unverified.')+'</p>'+
   (ready?'<button type="button" class="v-button is-subtle" data-auth8-open="verify">Send verification email</button>':'')+'</div>';
 return html.replace('<div class="v-settings-wrap">',message+'<div class="v-settings-wrap">');
};
function forgot(){
 const ready=!!S.config?.email_delivery_ready;
 const form=ready?'<form id="auth8-forgot"><div class="field"><label for="auth8-email">Account email</label>'+
  '<input type="email" name="email" id="auth8-email" placeholder="you@example.com" maxlength="254" autocomplete="email" required></div>'+
  '<button class="v6-btn v6-btn-primary" type="submit">Send secure reset link</button></form>':
  '<div class="auth8-offline">Password recovery by email is not configured on this deployment. Contact the platform owner, or sign in using an already connected method.</div>';
 showOverlay('<div class="auth8-modal"><span class="v7-overline">ACCOUNT RECOVERY</span>'+
  '<h2>Recover access<span>.</span></h2><p>Reset links work once, expire in 30 minutes, and never bypass authenticator security.</p>'+
  form+'<button type="button" class="auth8-link" data-auth8-open="login">Back to sign in</button></div>','medium');
}
function reset(token){
 showOverlay('<div class="auth8-modal"><span class="v7-overline">SECURE PASSWORD RESET</span>'+
  '<h2>Set a new password<span>.</span></h2><p>Choose a unique password. Your existing sessions will be revoked.</p>'+
  '<form id="auth8-reset"><div class="field"><label>New password</label>'+
  '<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required></div>'+
  '<div class="field"><label>Confirm password</label><input type="password" name="confirm" minlength="12" maxlength="128" autocomplete="new-password" required></div>'+
  '<button class="v6-btn v6-btn-primary" type="submit">Set new password</button></form>'+
  '<p id="auth8-status" role="status"></p></div>','medium');
 const form=document.querySelector('#auth8-reset');if(form)form.dataset.token=token;
}
document.addEventListener('click',async e=>{
 const show=e.target.closest('[data-auth8-show]');
 if(show){e.preventDefault();e.stopImmediatePropagation();
  const field=show.parentElement.querySelector('input[name=password]');if(!field)return;
  const visible=field.type==='password';field.type=visible?'text':'password';
  show.textContent=visible?'Hide password':'Show password';return;
 }
 const open=e.target.closest('[data-auth8-open]');if(!open)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(open.dataset.auth8Open==='forgot')forgot();
 if(open.dataset.auth8Open==='login')authModal('login');
 if(open.dataset.auth8Open==='verify'){
  open.disabled=true;
  try{await api('/auth/send-verification','POST',{});toast('Verification link sent to your email.');}
  catch(err){toast(err.message||'Verification unavailable.',true)}
  finally{open.disabled=false;}
 }
},true);
document.addEventListener('input',e=>{
 const field=e.target;
 if(field?.name!=='password'||field.closest('#auth-form')?.querySelector('input[name=mode]')?.value!=='register')return;
 const value=field.value;
 const score=[value.length>=12,value.length>=18,/[A-Z]/.test(value)&&/[a-z]/.test(value),/[0-9]/.test(value)&&/[^a-zA-Z0-9]/.test(value)].filter(Boolean).length;
 const meter=document.querySelector('#auth8-meter i'),hint=document.querySelector('#auth8-hint');
 if(meter){meter.style.width=(score/4*100)+'%';meter.dataset.level=String(score);}
 if(hint)hint.textContent=value.length<12?'At least 12 characters required.':score<3?'Good start — make it more unique.':'Strong length and character variety. Use a password manager.';
},true);
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['auth8-forgot','auth8-reset'].includes(f.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 const btn=f.querySelector('[type=submit]');if(btn)btn.disabled=true;
 try{
  const data=new FormData(f);
  if(f.id==='auth8-forgot'){
   await api('/auth/password/forgot','POST',{email:String(data.get('email')||'')});
   f.innerHTML='<p class="auth8-confirm">If an eligible account exists, a reset email has been requested. Check your inbox.</p>';
  }else{
   const pass=String(data.get('password')||'');
   if(pass!==String(data.get('confirm')||''))throw Error('Passwords do not match.');
   await api('/auth/password/reset','POST',{token:f.dataset.token,password:pass});
   closeOverlay();toast('Password changed. Sign in using your new password.');
   authModal('login');
  }
 }catch(err){
  const el=document.querySelector('#auth8-status');
  if(el)el.textContent=err.message||'Could not complete recovery.';
  else toast(err.message||'Recovery unavailable.',true);
 }finally{if(btn?.isConnected)btn.disabled=false;}
},true);
async function fromSecureLinks(){
 const params=new URLSearchParams(location.search);
 const verify=params.get('verify_email'),token=params.get('reset_password');
 if(!verify&&!token)return;
 params.delete('verify_email');params.delete('reset_password');
 history.replaceState(null,'',location.pathname+(params.toString()?'?'+params.toString():''));
 if(verify){
  try{await api('/auth/verify-email','POST',{token:verify});toast('Email verified successfully.');await refresh(true);}
  catch(err){toast(err.message||'Verification link is invalid or expired.',true);}
 }else if(token)reset(token);
}
window.addEventListener('load',()=>setTimeout(fromSecureLinks,0),{once:true});
})();
