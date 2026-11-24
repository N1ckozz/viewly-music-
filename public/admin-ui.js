/* Viewly Command Center — all data loaded from /api/admin/*, no mock accounts or balances. */
(()=>{
'use strict';
const A={tab:'overview',query:'',data:null,loading:false,seq:0};
const defs=[
 ['overview','Overview','discover'],['users','Accounts','user'],['releases','Music','releases'],
 ['campaigns','Campaigns','campaigns'],['submissions','Submissions','scissors'],
 ['reports','Reports','shield'],['comments','Comments','campaigns'],['payments','Payments','wallet'],['subscriptions','Subscriptions','bolt'],['cpm','CPM verification','shield'],
 ['promotions','Promotions','bolt'],['settings','Site control','studio'],['audit','Audit trail','shield']
];
const icon=(k,n=17)=>ico(k,n);
const fmtDate=s=>s?String(s).slice(0,16).replace('T',' '):'—';
const fmtEur=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(Number(n||0)/100);
const tag=s=>'<span class="adm-tag adm-tag-'+esc(String(s??'unknown').replace(/[^a-z_]/g,''))+'">'+esc(String(s??'unknown').replaceAll('_',' '))+'</span>';
const cell=s=>'<span class="adm-truncate" title="'+esc(String(s??''))+'">'+esc(String(s??'—'))+'</span>';
const btn=(label,action,id,tone='quiet',arg='')=>'<button type="button" class="adm-btn '+tone+'" data-adm-action="'+esc(action)+'" data-adm-id="'+esc(id)+'"'+(arg?' data-adm-extra="'+esc(arg)+'"':'')+'>'+label+'</button>';
function panel(){
 if(S.user?.role!=='admin')return '<section class="adm-denied"><h2>Restricted workspace</h2><p>Administrator access is never granted by public registration.</p></section>';
 return '<section class="adm-console">'+
  '<header class="adm-head"><div><span class="adm-kicker">'+icon('shield',16)+' VIEWLY / CONTROL CENTER <span class="adm-dot"></span> LIVE DATABASE</span>'+
  '<h1>Command <em>center.</em></h1><p>Manage the live platform with role checks, authenticator verification and an audit history for every change.</p></div>'+
  '<div class="adm-head-actions">'+btn(icon('search',15)+' Refresh','refresh','')+
  '<button class="adm-btn primary" data-page="discover">'+icon('arrow',15)+' Back to site</button></div></header>'+
  '<nav class="adm-tabs" aria-label="Admin console sections">'+defs.map(([key,label,glyph])=>
    '<button type="button" class="adm-tab '+(A.tab===key?'current':'')+'" data-adm-tab="'+key+'" aria-current="'+(A.tab===key?'page':'false')+'">'+
    icon(glyph,15)+' '+label+'</button>').join('')+'</nav>'+
  '<div class="adm-toolbar"><div><span class="adm-hint">DATABASE CONTROL / '+A.tab.toUpperCase()+'</span><h2>'+defs.find(x=>x[0]===A.tab)[1]+'</h2></div>'+
   (['overview','audit','settings','payments','reports','promotions'].includes(A.tab)?'':'<label class="adm-search">'+icon('search',16)+
    '<input id="adm-query" type="search" placeholder="Search '+A.tab+'..." value="'+esc(A.query)+'" autocomplete="off"></label>')+'</div>'+
  '<div id="adm-body" aria-live="polite"><div class="adm-skeleton">Loading verified records…</div></div>'+
  '<footer class="adm-footer">'+icon('shield',14)+' Protected by admin role, MFA session, same-origin API and immutable application-side audit actions.'+
   '<span>No financial balances can be edited here.</span></footer></section>';
}
const beforeContent=content;
content=function(){return S.page==='admin'?panel():beforeContent()};
const beforeShell=renderShell;
renderShell=function(inner){
 let html=beforeShell(inner);
 if(S.user?.role==='admin'){
  const active=S.page==='admin';
  const nav='<div class="v-rail-group adm-sidebar-group"><div class="v-rail-label">PLATFORM</div>'+
   '<button class="v-nav v7-side-link adm-sidebar-link '+(active?'is-active':'')+'" data-page="admin" aria-label="Admin control center" '+(active?'aria-current="page"':'')+'>'+
    '<span class="v7-side-icon">'+icon('shield',18)+'</span><span class="v7-side-label">Control center</span><span class="adm-admin-pip"></span></button></div>';
  html=html.replace('</nav><div class="v-sidebar-bottom">',nav+'</nav><div class="v-sidebar-bottom">');
 }
 const site=S.site||{};
 if(site.announcement_enabled&&site.announcement_text){
  const banner='<div class="adm-site-banner" role="status"><span class="adm-banner-label">VIEWLY UPDATE</span>'+
   '<span>'+esc(site.announcement_text)+'</span></div>';
  html=html.replace('<main class="v-main"',banner+'<main class="v-main"');
 }
 return html;
};
const beforeDiscover=discover;
discover=function(){
 let html=beforeDiscover();
 const picked=(S.site?.homepage_featured_release_id||'');
 const rel=picked&&(S.releases||[]).find(x=>x.id===picked);
 if(rel){
  const cover=rel.cover_url?'<img loading="lazy" alt="" src="'+esc(rel.cover_url)+'">':'<span class="adm-feature-placeholder">V.</span>';
  const featured='<section class="adm-featured"><span class="adm-feature-kicker">HANDPICKED / FEATURED RELEASE</span>'+
   '<div class="adm-feature-body"><div class="adm-feature-art">'+cover+'</div><div><span class="adm-feature-label">CURATED BY VIEWLY</span>'+
   '<h2>'+esc(rel.title)+'</h2><p>'+esc(rel.artist_name)+' · '+esc(rel.genre)+'</p>'+
   '<button type="button" class="v6-btn v6-btn-primary" data-action="play" data-id="'+esc(rel.id)+'">'+icon('play',16)+' Play release</button></div></div></section>';
  html=featured+html;
 }
 return html;
};
const beforeRender=render;
render=function(){
 beforeRender();
 if(S.page==='admin')paint();
};
function paint(){
 const root=document.querySelector('#adm-body');
 if(!root)return;
 if(A.data?.section===A.tab){
  root.innerHTML=view(A.data.response);
 }else load();
}
async function load(){
 if(S.page!=='admin')return;
 const root=document.querySelector('#adm-body');if(!root)return;
 const sequence=++A.seq;
 A.loading=true;
 root.innerHTML='<div class="adm-skeleton">'+icon('shield',18)+' Fetching secure '+esc(A.tab)+' data…</div>';
 try{
  const suffix=['users','releases','campaigns','comments','submissions'].includes(A.tab)?'?q='+encodeURIComponent(A.query):'';
  const response=await api('/admin/'+A.tab+suffix);
  if(sequence!==A.seq||S.page!=='admin')return;
  A.data={section:A.tab,response};root.innerHTML=view(response);
 }catch(e){
  if(sequence!==A.seq)return;
  root.innerHTML='<div class="adm-error"><b>Admin access or data unavailable</b><p>'+esc(e.message||'Unable to load secure data.')+'</p>'+
   '<p>For access, your owner account must be explicitly provisioned, email-verified and signed in using MFA.</p>'+
   btn('Retry','refresh','')+'</div>';
 }finally{if(sequence===A.seq)A.loading=false}
}
function metric(label,value,sub,iconName,format){
 return '<article class="adm-metric"><span class="adm-metric-icon">'+icon(iconName,19)+'</span>'+
  '<span class="adm-metric-label">'+label+'</span><b>'+ (format?format(value):Number(value||0).toLocaleString())+'</b><small>'+sub+'</small></article>';
}
function overview(data){
 const n=data.counts||{};
 const values=[
  ['Accounts',n.users,'Registered profiles','user'],
  ['Live users',n.active_users,'Not suspended','shield'],
  ['Releases',n.public_releases,'Available in public library','releases'],
  ['Campaigns',n.campaigns,'Real artist briefs','campaigns'],
  ['Funded campaigns',n.funded_campaigns,'Provider-recorded funding','wallet'],
  ['Clips',n.clips,'Server-generated exports','scissors'],
  ['Open reports',n.reports_open,'Waiting for moderation','shield'],
  ['Active sessions',n.active_sessions,'Valid browser sessions','user'],
  ['Internal plays',n.internal_plays,'Viewly signed-in play events','play'],
  ['Submissions',n.submissions,'Real posted links','campaigns'],
  ['Comments',n.comments,'Current public comments','campaigns'],
  ['Payment orders',n.payment_orders,'Read-only provider orders','wallet']
 ];
 const quick=['users','releases','reports','campaigns'].map(x=>'<button type="button" class="adm-quick" data-adm-tab="'+x+'">'+
  icon(defs.find(d=>d[0]===x)?.[2]||'shield',18)+' <b>'+defs.find(d=>d[0]===x)?.[1]+'</b>'+icon('arrow',16)+'</button>').join('');
 return '<div class="adm-metrics">'+values.map(x=>metric(x[0],x[1],x[2],x[3])).join('')+'</div>'+
  '<div class="adm-duo"><section class="adm-panel"><div class="adm-panel-head"><h3>Quick operations</h3><small>Act on real records</small></div><div class="adm-quick-grid">'+quick+'</div></section>'+
  '<section class="adm-panel"><div class="adm-panel-head"><h3>System integrity</h3><small>Operational constraints</small></div>'+
   '<div class="adm-integrity"><div><span>Creator payout edits</span>'+tag('disabled')+'</div>'+
   '<div><span>Verified payment overrides</span>'+tag('disabled')+'</div>'+
   '<div><span>Admin actions</span>'+tag('audited')+'</div>'+
   '<div><span>Administrative MFA</span>'+tag('required')+'</div></div></section></div>'+
   '<section class="adm-panel"><div class="adm-panel-head"><h3>Latest administrator actions</h3>'+
   '<button class="adm-inline" data-adm-tab="audit">Open complete audit '+icon('arrow',15)+'</button></div>'+auditTable(data.recent||[])+'</section>';
}
function table(headers,rows,empty='No records in this section.'){
 if(!rows.length)return '<div class="adm-empty">'+icon('search',22)+'<h3>'+empty+'</h3><p>Viewly is showing actual database records, not generated examples.</p></div>';
 return '<div class="adm-table-scroll"><table class="adm-table"><thead><tr>'+
  headers.map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
const row=(...cols)=>'<tr>'+cols.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
function users(data){
 return table(['Account','Role','Status','Releases','Controls'],(data.rows||[]).map(u=>
  row('<b>@'+esc(u.username)+'</b><small>'+esc(u.email)+'</small>',
   tag(u.role),tag(u.status),String(u.releases_count||0),
   u.role==='admin'?'<span class="adm-locked">'+icon('shield',14)+' Managed offline</span>':
   '<div class="adm-actions">'+btn('Edit role','edit-user',u.id)+
   btn(u.status==='active'?'Suspend':'Reactivate','user-status',u.id,u.status==='active'?'danger':'good',u.status==='active'?'suspended':'active')+'</div>'
  )), 'No matching accounts');
}
function releases(data){
 return table(['Release','Genre','Visibility','Date','Actions'],(data.rows||[]).map(r=>
  row('<b>'+esc(r.title)+'</b><small>@'+esc(r.username)+'</small>',
   tag(r.genre),tag(r.visibility),fmtDate(r.created_at),
   '<div class="adm-actions">'+btn('Edit','edit-release',r.id)+
    btn(r.visibility==='public'?'Hide':'Restore','release-visibility',r.id,r.visibility==='public'?'danger':'good',r.visibility==='public'?'hidden':'public')+'</div>'
  )), 'No matching releases');
}
function campaigns(data){
 return '<div class="adm-warning">Campaign budget, funding status and payouts are linked to verified payment records. They cannot be manually edited in this panel.</div>'+
  table(['Campaign','Status','Funded / spent','Moderation','Actions'],(data.rows||[]).map(c=>
   row('<b>'+esc(c.title)+'</b><small>@'+esc(c.username)+' · '+esc(c.platform)+'</small>',
   tag(c.status),'<span class="adm-money">'+fmtEur(c.paid_cents)+' / '+fmtEur(c.spent_cents)+'</span>',tag(c.moderation_status),
   '<div class="adm-actions">'+btn('Edit','edit-campaign',c.id)+
   btn(c.moderation_status==='visible'?'Hide':'Restore','campaign-visibility',c.id,c.moderation_status==='visible'?'danger':'good',c.moderation_status==='visible'?'hidden':'visible')+'</div>'
  )), 'No campaigns yet');
}
function submissions(data){
 return '<div class="adm-warning">Flagging a submission does not approve a reward or record a payout.</div>'+
  table(['Submission','Campaign','Review','Moderation','Actions'],(data.rows||[]).map(s=>
   row('<b>@'+esc(s.username)+'</b><small>'+fmtDate(s.created_at)+'</small>',
    cell(s.campaign_title),tag(s.status),tag(s.moderation_flag),
    btn(s.moderation_flag==='flagged'?'Clear flag':'Flag for review','submission-flag',s.id,s.moderation_flag==='flagged'?'good':'quiet',s.moderation_flag==='flagged'?'clear':'flagged')
  )), 'No reward submissions have been recorded');
}
function reports(data){
 return table(['Report','Reason','Status','Created','Actions'],(data.rows||[]).map(r=>
  row('<b>'+esc(r.release_title)+'</b><small>By @'+esc(r.reporter)+'</small><small>'+esc(r.details||'No additional details')+'</small>',
   tag(r.reason),tag(r.status),fmtDate(r.created_at),
   '<div class="adm-actions">'+btn('Reviewed','report-status',r.id,'quiet','reviewed')+
    btn('Dismiss','report-status',r.id,'quiet','dismissed')+
    btn('Hide release','release-visibility',r.release_id,'danger','hidden')+'</div>'
  )), 'No reports received');
}
function comments(data){
 return table(['Comment','Author','Date','Action'],(data.rows||[]).map(c=>
  row('<b>'+esc(c.release_title)+'</b><small>'+esc(c.body)+'</small>',
   '@'+esc(c.username),fmtDate(c.created_at),
   btn('Remove comment','delete-comment',c.id,'danger')
  )), 'No comments to moderate');
}
function payments(data){
 return '<div class="adm-warning">'+icon('shield',16)+' Read-only provider order registry. No editing balances or charging cards here.</div>'+
  table(['Order','Campaign','Provider','Amount','Status'],(data.rows||[]).map(p=>
   row('<span class="adm-id">'+esc(p.id.slice(0,13))+'…</span><small>'+fmtDate(p.created_at)+'</small>',
    cell(p.campaign_title),tag(p.provider),'<b class="adm-money">'+fmtEur(p.amount_cents)+'</b>',tag(p.status)
   )), 'No real payment orders have been recorded')+
  '<section class="adm-panel" style="margin-top:18px"><div class="adm-panel-head"><h3>Campaign test checkouts</h3><small>Quoted totals · €0 actually charged</small></div>'+
  table(['Campaign','Reference price','Actual charge','Date'],(data.sandbox_orders||[]).map(o=>
   row('<b>'+esc(o.campaign_title)+'</b>',fmtEur(o.quoted_amount_cents),'<b class="adm-money">'+fmtEur(o.charged_cents)+'</b>',fmtDate(o.created_at)
   )),'No sandbox campaign checkouts yet')+'</section>';
}
function cpmReview(data){
 return '<div class="adm-warning">'+icon('shield',16)+' Only official TikTok API-reported views, not independent bot-free certification. Staff can clear or impose holds after reviewing evidence; never manually invent views or financial credits.</div>'+
  table(['Clipper / Campaign','TikTok post','API views','Review','Risk / Availability','Actions'],(data.rows||[]).map(s=>
   row('<b>@'+esc(s.clipper_name)+'</b><small>'+esc(s.campaign_title)+'</small>',
    '<a href="'+esc(s.post_url)+'" rel="noopener noreferrer" target="_blank">Open original post</a><small>'+esc(s.tiktok_video_id)+'</small>',
    '<b class="adm-money">'+Number(s.highest_views||0).toLocaleString('en-GB')+'</b><small>'+fmtEur(s.accrued_cents)+' test credits · €0 cash</small>',
    tag(s.review_status),
    tag(s.post_access)+'<small>'+esc(s.risk_flag||'No heuristic flag')+'</small><small>'+fmtDate(s.last_checked_at)+'</small>',
    '<div class="adm-actions">'+btn('Hold','cpm-hold',s.submission_id,'danger')+
    btn('Clear hold','cpm-clear',s.submission_id,'good')+'</div>'
   )),'No TikTok CPM submissions yet');
}
function subscriptions(data){
 return '<div class="adm-warning">'+icon('shield',16)+' Test entitlements only. All charges are €0 and this section cannot invent payments, credits or payouts.</div>'+
  table(['Account','Plan','Interval','Status','Expires','History'],(data.rows||[]).map(s=>
   row('<b>@'+esc(s.username)+'</b><small>'+esc(s.email)+'</small>',
    '<b>'+esc(s.plan_id)+'</b>',tag(s.period),tag(s.status),fmtDate(s.period_end_at),
    '<span class="adm-money">'+Number(s.events_count||0)+' sandbox events</span>'
   )),'No test subscriptions have been activated')+
  '<section class="adm-panel" style="margin-top:17px"><div class="adm-panel-head"><h3>Recent sandbox subscription events</h3><small>€0 actually charged</small></div>'+
  table(['Date','Account','Event','Quoted price','Charged'],(data.recent||[]).map(e=>
   row(fmtDate(e.created_at),'<b>@'+esc(e.username)+'</b>',tag(e.action),fmtEur(e.quoted_price_cents),
    '<b class="adm-money">'+fmtEur(e.charged_cents)+'</b>')),'No sandbox events yet')+'</section>';
}
function auditTable(items){
 return table(['Time','Administrator','Action','Target'],items.map(a=>
  row(fmtDate(a.created_at),'<b>@'+esc(a.actor||'system')+'</b>',
   '<b>'+esc(a.action)+'</b>',tag(a.target_type)+' <span class="adm-id">'+esc(a.target_id.slice(0,12))+'</span>'
  )), 'No administrator changes recorded');
}
function settings(data){
 const s=data.settings||{};
 const opt=(id,title,content,desc)=>'<div class="adm-setting"><label for="adm-set-'+id+'">'+title+'</label><p>'+desc+'</p>'+content+'</div>';
 const releaseOptions='<option value="">No featured release</option>'+(S.releases||[]).map(r=>
  '<option value="'+esc(r.id)+'" '+(s.homepage_featured_release_id===r.id?'selected':'')+'>'+esc(r.title)+' — '+esc(r.artist_name)+'</option>').join('');
 return '<div class="adm-settings-layout"><form id="adm-settings-form" class="adm-panel">'+
  '<div class="adm-panel-head"><h3>Site content & announcements</h3><small>Updates apply to the public site</small></div>'+
  opt('announcement_enabled','Announcement visibility','<select id="adm-set-announcement_enabled" name="announcement_enabled"><option value="false" '+(!s.announcement_enabled?'selected':'')+'>Hidden</option><option value="true" '+(s.announcement_enabled?'selected':'')+'>Visible</option></select>','Show or hide the announcement bar across Viewly.')+
  opt('announcement_text','Announcement text','<textarea id="adm-set-announcement_text" name="announcement_text" maxlength="180" rows="3">'+esc(s.announcement_text)+'</textarea>','Editable text displayed above the main content.')+
  opt('homepage_featured_release_id','Featured homepage release','<select id="adm-set-homepage_featured_release_id" name="homepage_featured_release_id">'+releaseOptions+'</select>','Choose a real published release already present in the music library.')+
  opt('support_email','Support contact','<input id="adm-set-support_email" name="support_email" type="email" maxlength="254" value="'+esc(s.support_email)+'" placeholder="Optional public support email">','A public contact address. This does not enable outgoing email or password recovery.')+
  '<button class="v6-btn v6-btn-primary" type="submit">'+icon('shield',16)+' Save site settings</button>'+
  '<p class="adm-feedback" id="adm-settings-feedback" role="status"></p></form>'+
  '<section class="adm-panel"><div class="adm-panel-head"><h3>Preview</h3><small>Actual published values</small></div>'+
  '<div class="adm-preview"><span>VIEWLY / LIVE SITE</span><h4>'+esc(s.announcement_text||'No announcement currently published')+'</h4>'+
  '<p>Announcement: '+(s.announcement_enabled?'Visible':'Hidden')+'</p>'+
  '<p>Featured release: '+esc((S.releases||[]).find(r=>r.id===s.homepage_featured_release_id)?.title||'None')+'</p></div>'+
  '<div class="adm-integrity"><div><span>Money configuration</span>'+tag('locked')+'</div>'+
  '<div><span>Account permissions</span>'+tag('audited')+'</div></div></section></div>';
}
function view(response){
 switch(A.tab){
  case 'overview':return overview(response);
  case 'users':return users(response);
  case 'releases':return releases(response);
  case 'campaigns':return campaigns(response);
  case 'submissions':return submissions(response);
  case 'reports':return reports(response);
  case 'comments':return comments(response);
  case 'payments':return payments(response);
  case 'subscriptions':return subscriptions(response);
  case 'cpm':return cpmReview(response);
  case 'promotions':return '<div class="v14-admin-grid">'+(response.products||[]).map(p=>'<form class="v14-admin-form adm-panel" data-promo-admin="'+esc(p.id)+'"><h3>'+esc(p.label)+'</h3><p>'+esc(p.id)+' · '+esc(p.placement)+'</p><label>Price (€)<input name="price" type="number" min="0" max="10000" step=".01" value="'+(p.price_cents/100).toFixed(2)+'" required></label><label>Duration (hours)<input name="hours" type="number" min="'+(p.placement==='package'?0:1)+'" max="720" value="'+p.hours+'" '+(p.placement==='package'?'readonly':'')+' required></label><label>Inventory capacity<input name="capacity" type="number" min="'+(p.placement==='package'?0:1)+'" max="10000" value="'+p.capacity+'" '+(p.placement==='package'?'readonly':'')+' required></label><label><input type="checkbox" name="enabled" '+(p.enabled?'checked':'')+'> Enabled</label><button class="adm-btn primary" type="submit">Save promotion</button><p role="status"></p></form>').join('')+'</div>';
  case 'settings':return settings(response);
  case 'audit':return auditTable(response.rows||[]);
  default:return '<div class="adm-empty">Section unavailable</div>';
 }
}
function editModal(type,rec){
 if(type==='users'){
  return '<h2>Edit account</h2><p>Changes to account roles and suspension take effect on the server.</p>'+
   '<form id="adm-edit" data-type="users" data-id="'+esc(rec.id)+'"><div class="adm-form-grid">'+
   '<label>Account <input disabled value="@'+esc(rec.username)+'"></label>'+
   '<label>Role <select name="role">'+['viewer','artist','label'].map(x=>'<option value="'+x+'" '+(rec.role===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label></div>'+
   '<button type="submit" class="v6-btn v6-btn-primary">Save role</button></form>';
 }
 if(type==='releases'){
  return '<h2>Edit music release</h2><p>Updates are immediately reflected in the public music library.</p>'+
   '<form id="adm-edit" data-type="releases" data-id="'+esc(rec.id)+'">'+
   '<label>Title <input name="title" maxlength="90" minlength="2" required value="'+esc(rec.title)+'"></label>'+
   '<label>Genre <select name="genre">'+['Trap','Rap','Drill','Hip-Hop','Freestyle','Other'].map(x=>'<option '+(rec.genre===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
   '<label>Description <textarea name="description" maxlength="900" rows="4">'+esc(rec.description||'')+'</textarea></label>'+
   '<button type="submit" class="v6-btn v6-btn-primary">Save release</button></form>';
 }
 if(type==='campaigns'){
  return '<h2>Edit campaign brief</h2><p>Real funding, reward amounts and payout ledgers are read-only.</p>'+
   '<form id="adm-edit" data-type="campaigns" data-id="'+esc(rec.id)+'">'+
   '<label>Campaign name <input name="title" maxlength="100" required value="'+esc(rec.title)+'"></label>'+
   '<label>Destination <select name="platform">'+['Any','TikTok','Instagram Reels','YouTube Shorts'].map(x=>'<option '+(rec.platform===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
   '<label>Brief <textarea name="brief" maxlength="1200" minlength="15" required rows="6">'+esc(rec.brief||'')+'</textarea></label>'+
   '<button type="submit" class="v6-btn v6-btn-primary">Save campaign</button></form>';
 }
 return '';
}
function activeRecord(type,id){
 return (A.data?.response?.rows||[]).find(r=>r.id===id&&type===A.tab);
}
async function mutate(type,id,payload,method='PATCH'){
 try{
  const result=await api('/admin/'+type+'/'+encodeURIComponent(id),method,payload);
  toast('Admin change saved and audit entry recorded.');
  A.data=null;load();
  if(type==='releases'||type==='campaigns'||type==='users')refresh(true);
  return result;
 }catch(e){toast(e.message||'Admin operation failed.',true);return null}
}
document.addEventListener('submit',async e=>{
 const f=e.target.closest('[data-promo-admin]');if(!f)return;
 e.preventDefault();e.stopImmediatePropagation();const b=f.querySelector('button'),out=f.querySelector('[role="status"]');b.disabled=true;
 try{await api('/admin/promotions','PATCH',{id:f.dataset.promoAdmin,price_cents:Math.round(Number(f.elements.price.value)*100),hours:Number(f.elements.hours.value),capacity:Number(f.elements.capacity.value),enabled:f.elements.enabled.checked});out.textContent='Saved and audited.';}
 catch(err){out.textContent=err.message;}finally{b.disabled=false;}
},true);
let debounced;
document.addEventListener('click',async e=>{
 const section=e.target.closest('[data-adm-tab]');
 if(section){e.preventDefault();e.stopImmediatePropagation();
  A.tab=section.dataset.admTab;A.query='';A.data=null;
  if(S.page==='admin')render();else{S.page='admin';render()}
  return;
 }
 const node=e.target.closest('[data-adm-action]');
 if(!node)return;
 e.preventDefault();e.stopImmediatePropagation();
 const action=node.dataset.admAction,id=node.dataset.admId,extra=node.dataset.admExtra;
 if(action==='refresh'){A.data=null;load();return}
 if(action==='cpm-hold'||action==='cpm-clear'){
  const decision=action==='cpm-hold'?'hold':'clear';
  const note=window.prompt(decision==='hold'?'Explain the evidence for holding this CPM submission (15+ characters):':'Explain the recent official evidence that justifies lifting the hold (15+ characters):','');
  if(note===null)return;
  if(note.trim().length<15)return toast('An evidence-based review note of at least 15 characters is required.',true);
  try{await api('/admin/cpm/'+encodeURIComponent(id)+'/risk','POST',{decision,note:note.trim()});
   toast('Audit-logged risk review saved. No views or cash balance changed.');A.data=null;load();}
  catch(err){toast(err.message||'Risk review failed.',true)}
  return;
 }
 const kind={
  'user-status':'users','edit-user':'users',
  'release-visibility':'releases','edit-release':'releases',
  'campaign-visibility':'campaigns','edit-campaign':'campaigns',
  'submission-flag':'submissions','report-status':'reports','delete-comment':'comments'
 }[action];
 if(!kind)return;
 if(action.startsWith('edit-')){
  const r=activeRecord(kind,id);if(!r)return toast('Record no longer available. Refresh first.',true);
  showOverlay('<section class="adm-editor">'+editModal(kind,r)+'</section>','medium');return;
 }
 if(['user-status','release-visibility','campaign-visibility','delete-comment'].includes(action)){
  const msg={'user-status':extra==='suspended'?'Suspend this account and revoke its sessions?':'Reactivate this account?',
   'release-visibility':extra==='hidden'?'Hide this release from the public site?':'Restore this release to public discovery?',
   'campaign-visibility':extra==='hidden'?'Hide this campaign from public discovery?':'Restore this campaign?',
   'delete-comment':'Permanently delete this comment? This cannot be undone.'}[action];
  if(!window.confirm(msg))return;
 }
 const payload={
  'user-status':{status:extra},
  'release-visibility':{visibility:extra},
  'campaign-visibility':{moderation_status:extra},
  'submission-flag':{moderation_flag:extra,moderation_note:extra==='flagged'?'Flagged by admin for human review':''},
  'report-status':{status:extra}
 }[action];
 await mutate(kind,id,payload,action==='delete-comment'?'DELETE':'PATCH');
},true);
document.addEventListener('submit',async e=>{
 const form=e.target;
 if(!['adm-edit','adm-settings-form'].includes(form.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 const button=form.querySelector('[type=submit]');if(button)button.disabled=true;
 try{
  const data=new FormData(form);
  if(form.id==='adm-edit'){
   const type=form.dataset.type,id=form.dataset.id;
   const fields=type==='users'?['role']:type==='releases'?['title','description','genre']:['title','brief','platform'];
   const payload=Object.fromEntries(fields.map(x=>[x,String(data.get(x)||'')]));
   const result=await mutate(type,id,payload);
   if(result)closeOverlay();
  }else{
   const settings=A.data?.response?.settings||{};
   const next={
    announcement_enabled:String(data.get('announcement_enabled'))==='true',
    announcement_text:String(data.get('announcement_text')||'').trim(),
    homepage_featured_release_id:String(data.get('homepage_featured_release_id')||''),
    support_email:String(data.get('support_email')||'')
   };
   const changed=Object.entries(next).filter(([key,v])=>v!==settings[key]);
   for(const [key,value] of changed){
    await api('/admin/settings','PATCH',{key,value:String(value)});
   }
   const live=await api('/admin/settings');
   A.data={section:'settings',response:live};S.site=live.settings;
   const el=document.querySelector('#adm-body');if(el)el.innerHTML=settingsView(live);
   toast(changed.length?'Public site settings updated.':'No settings changed.');
  }
 }catch(err){toast(err.message||'Unable to save settings.',true)}
 finally{if(button?.isConnected)button.disabled=false;}
},true);
function settingsView(data){return settings(data)}
document.addEventListener('input',e=>{
 if(e.target?.id!=='adm-query')return;
 A.query=e.target.value;
 clearTimeout(debounced);debounced=setTimeout(()=>{if(S.page==='admin'&&A.tab!=='settings'){A.data=null;load()}},260);
},true);
function loadPublicSite(){
 api('/site').then(s=>{if(!S.site||JSON.stringify(S.site)!==JSON.stringify(s)){S.site=s;render();}}).catch(()=>{});
}
loadPublicSite();
window.ViewlyAdmin={refresh:()=>{A.data=null;if(S.page==='admin')load()},isAdmin:()=>S.user?.role==='admin'};
})();