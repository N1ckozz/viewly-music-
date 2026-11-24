import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'public/v10.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/v10.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
function app(){
 const output={modal:'',on:{}};
 const S={page:'studio',user:{id:'artist',role:'artist'},releases:[{id:'release-id',owner_id:'artist',title:'Original track'}],
  campaigns:[],myCampaigns:[],config:{billing_sandbox_enabled:true},wallet:{}};
 const ctx={S,esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  ico:x=>'<svg data-icon="'+x+'"></svg>',eur:x=>'€'+(Number(x)/100).toFixed(2),
  isCreator:()=>true,roleModal:()=>{},authModal:()=>{},showOverlay:html=>{output.modal=html},
  campaignModal:()=>{output.oldWizard=true},campaignDetail:()=>{output.oldDetail=true},
  content:()=>'HOME',studioPage:()=>'STUDIO',
  campaignCard:()=>'legacy card',render:()=>{},toast:()=>{},closeOverlay:()=>{},refresh:async()=>{},
  api:async()=>({}),document:{addEventListener:(name,fn)=>{(output.on[name]||=[]).push(fn)}},
  window:{addEventListener:()=>{},confirm:()=>true,prompt:()=>''},
  navigator:{clipboard:{writeText:async()=>{}}},location:{search:''},history:{replaceState:()=>{}},
  URLSearchParams,FormData,URL,console,
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'v10.js'});
 return {S,ctx,output};
}
test('V10 assets are linked after prior working scripts and improve safe responsiveness',()=>{
 assert.match(html,/\/v10\.css\?v=10\.0/);
 assert.match(html,/\/v10\.js\?v=10\.0/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/\.v10-connect-card/);
 assert.match(css,/\.v10-wizard/);
});
test('artist wizard is actionable, full briefing, media asset uploads and transparent sandbox terms',()=>{
 const {ctx,output}=app();
 ctx.campaignModal();
 const page=output.modal;
 for(const term of ['v10-create-form','release_id','spotify_track_url','mandatory_hashtags',
  'prohibited_content','rights_confirmed','rate_eur_per_1000','max_per_clip_eur','min_views',
  'tracking_days','budget_eur','video/mp4','audio/mpeg','application/pdf','€0 actually charged']){
  assert.ok(page.includes(term),'missing wizard option: '+term);
 }
 assert.match(ctx.studioPage(),/Launch a CPM campaign/);
});
test('live discovery cards label per-view rates rather than guaranteed cash rewards',()=>{
 const {ctx}=app();
 assert.equal(ctx.campaignCard({pricing_model:'per_post'}),'legacy card');
 const c={id:'c',pricing_model:'cpm',title:'Test music',artist_name:'A',release_title:'Track',
  sandbox_funded_cents:10000,sandbox_spent_cents:2000,cpm_rate_cents:100,is_sandbox:true};
 const output=ctx.campaignCard(c);
 assert.match(output,/€1\.00 \/ 1K views/);
 assert.match(output,/TEST \/ €0 FUNDS RECEIVED/);
 assert.doesNotMatch(output,/reward spots left/);
});
test('TikTok identity connection uses real account status; no mock linked account',()=>{
 const {ctx,S}=app();
 S.page='connections';const body=ctx.content();
 assert.match(body,/TikTok account that posted it has granted access/i);
 assert.match(body,/Not connected/);
 assert.match(body,/Official API credentials\/approval required/);
 assert.match(body,/NOT VERIFIED OWNERSHIP/);
});
