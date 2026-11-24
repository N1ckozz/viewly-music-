/* VIEWLY V5 — shipping UX on the real API, never mock payments or content. */
(()=>{
'use strict';
const glyph=(name,n=18)=>ico(name,n);
const navItem=(page,label,icon,mobile=false)=>{
 const active=mobile&&(page==='profile'?['profile','studio','wallet'].includes(S.page):S.page===page)||(!mobile&&S.page===page);
 return '<button type="button" class="v-nav '+(active?'is-active':'')+'" data-page="'+page+'" aria-label="'+esc(label)+'" '+(active?'aria-current="page"':'')+'>'+glyph(icon,mobile?20:17)+'<span>'+label+'</span></button>';
};
const isArtist=()=>!!S.user&&['artist','label','admin'].includes(S.user.role);
const accountTop=()=>{
 if(!S.user)return '<div class="v-top-auth"><button type="button" class="v-button is-subtle" data-action="login">Log in</button><button type="button" class="v-button is-primary" data-action="register">Join Viewly '+glyph('arrow',14)+'</button></div>';
 const n=esc(S.user.display_name||'Account');
 return '<button type="button" class="v-user" data-page="profile" aria-label="Account settings"><span class="v-user-avatar">'+esc((S.user.display_name||'V')[0].toUpperCase())+'</span><span class="v-user-info"><b>'+n+'</b><small>@'+esc(S.user.username)+'</small></span></button>';
};
const desktopGroup=(heading,items)=>'<div class="v-rail-group"><div class="v-rail-label">'+heading+'</div>'+items.map(a=>navItem(a[0],a[1],a[2])).join('')+'</div>';
renderShell=function(inner){
 const primary=desktopGroup('DISCOVER',[['discover','Home','discover'],['campaigns','Campaigns','campaigns'],['releases','Music library','releases']]);
 const workspace=desktopGroup('CREATE',[['studio','Artist studio','studio'],['clips','Clip editor','scissors'],['wallet','Rewards & ledger','wallet']]);
 const title=esc(({discover:'Home',campaigns:'Campaigns',releases:'Music library',clips:'Clip editor',studio:'Artist studio',wallet:'Rewards',profile:'Account'})[S.page]||'Home');
 const dock=[['discover','Home','discover'],['campaigns','Campaigns','campaigns'],['releases','Music','releases'],['clips','Clip','scissors'],['profile','Account','user']].map(a=>navItem(a[0],a[1],a[2],true)).join('');
 return '<div class="v-app-shell">'+
 '<aside class="v-sidebar"><div class="v-sidebar-head"><a href="/" data-page="discover" aria-label="Viewly home" class="v-logo"><span class="v-logo-identity">V<span class="v-logo-dot">.</span></span><span class="v-logo-word">VIEWLY<small>MUSIC NETWORK</small></span></a></div>'+
 '<nav class="v-rail" aria-label="Desktop primary navigation">'+primary+workspace+'</nav>'+
 '<div class="v-sidebar-bottom"><div class="v-system-indicator"><span class="v-led"></span><span>VIEWLY LIVE <b> / STAGING</b></span></div></div></aside>'+
 '<div class="v-workspace"><header class="v-topbar"><div class="v-top-left"><span class="v-top-location">VIEWLY <span>/</span> '+title+'</span></div>'+
 '<div class="v-top-right"><button type="button" class="v-search-trigger" data-ux-command="open" aria-label="Search music and actions">'+glyph('search',18)+'<span>Search Viewly</span><kbd>⌘ K</kbd></button>'+
 (S.user?'<button type="button" class="v-icon-button" data-ux-command="activity" aria-label="Account activity">'+glyph('bell',18)+'</button>':'')+
 accountTop()+'</div></header>'+
 '<main class="v-main" id="main-content" tabindex="-1">'+inner+'<footer class="v-footer"><span>VIEWLY MUSIC © 2026</span><span>Real releases. Artist-owned content. Verified activity only.</span></footer></main></div>'+
 '<nav class="v-bottom-nav" aria-label="Mobile primary navigation">'+dock+'</nav></div>';
};
releaseCard=function(r){
 const id=esc(r.id),cover=r.cover_url?'<img loading="lazy" src="'+esc(r.cover_url)+'" alt="">':'<span class="v-cover-fallback">V<span>.</span></span>';
 const likes=Number(r.likes||0);
 return '<article class="v-release"><button class="v-release-art" type="button" data-action="play" data-id="'+id+'" aria-label="Play '+esc(r.title)+'">'+cover+'<span class="v-release-play">'+glyph('play',20)+'</span></button>'+
 '<div class="v-release-info"><div class="v-release-genre">'+esc(r.genre||'Music')+'</div><h3 title="'+esc(r.title)+'">'+esc(r.title)+'</h3><p>'+esc(r.artist_name)+'</p>'+
 '<div class="v-release-footer"><button type="button" class="v-text-button" data-action="clip" data-id="'+id+'">'+glyph('scissors',14)+' Clip now</button>'+
 '<button type="button" class="v-icon-button v-share" data-ux-share="'+id+'" aria-label="Share '+esc(r.title)+'">'+glyph('arrow',14)+'</button></div></div></article>';
};
const oldDiscover=discover;
discover=function(){
 let s=oldDiscover();
 s=s.replace(/<section class="v-home-tools">[\s\S]*?<\/section>/,'');
 const search='<div class="v5-search-row"><button type="button" class="v5-search-bar" data-ux-command="open">'+glyph('search',18)+' <span>Search tracks, artists, and campaigns</span><kbd>Ctrl / ⌘ K</kbd></button>'+
 '<span class="v5-on-air"><i></i> '+S.releases.length+' real releases · '+S.campaigns.length+' active campaigns</span></div>';
 s=s.replace('<section class="v-home-discover">',search+'<section class="v-home-discover">');
 return s;
};
const oldProfile=profilePage;
profilePage=function(){
 let s=oldProfile();
 if(!S.user)return s;
 const hub='<div class="v-account-hub"><h2>YOUR WORKSPACE</h2><div class="v-account-grid">'+
 '<button type="button" data-page="studio">'+glyph('studio',19)+' Artist studio '+glyph('arrow',14)+'</button>'+
 '<button type="button" data-page="wallet">'+glyph('wallet',19)+' Rewards '+glyph('arrow',14)+'</button></div></div>';
 s=s.replace('<div class="v-settings-wrap">',hub+'<div class="v-settings-wrap">');
 if(s.includes('<h2>Payments</h2>')){
  const connected=!!S.config?.stripe_ready;
  const payouts=!!S.config?.payouts_enabled;
  const pay='<div class="v-settings-panel"><h2>Payment operations</h2><p>Actual service configuration, not a simulated payment account.</p>'+
   '<div class="v-payment-grid"><div><small>CAMPAIGN CHECKOUT</small><b>'+(connected?'Stripe checkout ready':'Not enabled on this server')+'</b></div>'+
   '<div><small>CREATOR PAYOUTS</small><b>'+(payouts?'Operational':'Not enabled')+'</b></div></div>'+
   '<div class="v-payment-state"><div class="v-payment-kicker">FUNDING STATUS</div><h3>'+(connected?'Campaign funding is available':'Campaign funding is not available yet')+'</h3>'+
   '<p>'+(connected?'Eligible artist campaigns can open verified Stripe Checkout. Funding is confirmed only by a signed webhook.':'Connecting a Stripe account outside Viewly does not activate checkout by itself. This deployment still needs audited processor credentials, signed webhooks, compliant payouts and production approval.')+'</p></div>'+
   '<button class="v-button is-subtle" data-page="studio">Open campaign studio '+glyph('arrow',14)+'</button></div>';
  s=s.replace(/<div class="v-settings-panel"><h2>Payments<\/h2>[\s\S]*?<\/div>/,pay);
 }
 return s;
};
const oldWallet=walletPage;
walletPage=function(){
 const body=oldWallet();
 if(!S.user)return body;
 const checkout=!!S.config?.stripe_ready,payouts=!!S.config?.payouts_enabled;
 const drafts=(S.myCampaigns||[]).filter(c=>['draft','awaiting_payment'].includes(c.status));
 const status='<section class="v-payment-state"><div class="v-payment-kicker">PAYMENT PROVIDER STATUS</div><h3>Real campaign funding & payout status</h3>'+
 '<div class="v-payment-grid"><div><small>STRIPE CHECKOUT</small><b>'+(checkout?'Ready for eligible campaigns':'Not configured for checkout')+'</b></div>'+
 '<div><small>REWARDS CASH-OUT</small><b>'+(payouts?'Enabled':'Unavailable')+'</b></div></div>'+
 '<p style="margin-top:13px">This is not a bank balance. Only confirmed rewards from funded, approved submissions appear in your reward ledger.</p>'+
 (isArtist()?'<p>Unfunded campaign drafts: <b>'+drafts.length+'</b>. Funding is available only when the payment provider and payout controls are verified.</p><button class="v-button is-subtle" data-page="studio">Manage artist campaigns '+glyph('arrow',14)+'</button>':'')+'</section>';
 return body+status;
};
document.addEventListener('keydown',e=>{
 if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.matches('input,textarea,[contenteditable],select')){
  e.preventDefault();document.querySelector('[data-ux-command="open"]')?.click();
 }
});
})();
