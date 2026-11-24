import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public','v6.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public','v6.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

test('V6 ships animated button system and real tracking API with safety gates',()=>{
 assert.match(html,/v6\.css\?v=6\.0/);
 assert.match(html,/v6\.js\?v=6\.0/);
 assert.match(html,/v6\.motion\.js\?v=6\.0/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/v6-ripple/);
 assert.match(css,/\.v6-campaign-card/);
 assert.match(server,/pathname==='\/api\/my-submissions'/);
 assert.match(server,/const actor=requireUser\(req\)/);
 assert.doesNotMatch(js,/fake\s+(?:views|payouts|submissions)/i);
});

function boot(){
 const S={page:'campaigns',user:{id:'u1',role:'artist',display_name:'Creator'},
  campaigns:[],myCampaigns:[],releases:[],myClips:[],wallet:{},config:{},stats:{}};
 const callbacks={};
 const elements={};
 const doc={addEventListener(type,fn){(callbacks[type]??=[]).push(fn)},
  querySelector(sel){return elements[sel]||null}};
 const ctx={S,document:doc,ico:(x)=>'<svg data-icon="'+x+'"/>',
  esc:x=>String(x??'').replace(/</g,'&lt;').replace(/"/g,'&quot;'),eur:n=>'€'+(Number(n)/100).toFixed(2),
  isCreator:()=>S.user?.role==='artist',campaignsPage:()=>'',clipsPage:()=>'<div>Real clip exports</div>',
  walletPage:()=>'<div>Recorded reward ledger</div>',api:async()=>({submissions:[]}),
  showOverlay(){},authModal(){},render(){this.renderCalls++},renderCalls:0};
 vm.createContext(ctx);
 vm.runInContext(js,ctx);
 return {ctx,S,callbacks,elements};
}
function item(id,rate,platform='TikTok'){
 return {id,title:'Campaign '+id,release_title:'Original '+id,artist_name:'Artist '+id,
  status:'active',platform,reward_cents:rate,paid_cents:10000,spent_cents:1500,
  budget_cents:10000,remaining_cents:8500,eligible_spots:8,created_at:'2026-11-24T00:00:00Z'};
}
test('explore displays true funded budgets, per-clip rewards and filters campaigns',()=>{
 const {ctx,S,callbacks,elements}=boot();
 S.campaigns=[item('a',100),item('b',200,'Instagram Reels')];
 let html=ctx.campaignsPage();
 assert.match(html,/Campaign a/);
 assert.match(html,/Campaign b/);
 assert.match(html,/€15\.00 \/ €100\.00/);
 assert.match(html,/REWARD \/ APPROVED CLIP/);
 assert.equal((html.match(/data-action="campaign"/g)||[]).length,2);
 const results={innerHTML:''};elements['#v6-results']=results;
 elements['#v6-result-count']={textContent:''};
 const input={id:'v6-campaign-search',value:'Artist b'};
 callbacks.input[0]({target:input});
 assert.match(results.innerHTML,/Campaign b/);
 assert.doesNotMatch(results.innerHTML,/Campaign a/);
 assert.match(ctx.campaignsPage(),/Artist b/);
});
test('creator can access real submissions from clipping and wallet',()=>{
 const {ctx,S}=boot();
 assert.match(ctx.clipsPage(),/data-v6-submissions/);
 assert.match(ctx.walletPage(),/data-v6-submissions/);
 assert.match(ctx.clipsPage(),/Real clip exports/);
 S.user=null;
 assert.doesNotMatch(ctx.clipsPage(),/data-v6-submissions/);
});
test('campaign cards and filters do not fabricate view-based payouts',()=>{
 const {ctx,S}=boot();
 S.campaigns=[item('a',300)];
 const h=ctx.campaignsPage();
 assert.match(h,/€3\.00/);
 assert.doesNotMatch(h,/1K views|CPM|estimated earnings|fake views/i);
 assert.match(h,/Only genuinely funded campaigns/i);
});
