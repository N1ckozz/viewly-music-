import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const js=fs.readFileSync(path.join(root,'public/v11.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/v11.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
function boot(){
 const S={page:'studio',user:{id:'owner-fixture',role:'artist'},myCampaigns:[],campaigns:[],config:{}};
 const campaign='12345678-1234-1234-1234-123456789abc';
 const budget={mode:'sandbox',funded_cents:20000,allocated_cents:7000,available_cents:13000,pending_cpm_cents:1000,
  settled_cpm_cents:4000,other_allocated_cents:2000,utilization_percent:35,platform_fee_cents:1000,
  reference_total_cents:21000,actual_paid_cents:0,projected_remaining_days:null,
  note:'Sandbox allocation. €0 paid. Non-withdrawable test credits.'};
 const counts={submissions:3,pending:1,approved:2,rejected:0,flagged:0,clipper_count:2,
  reported_views_latest:5500,cpm_credits_cents:5000,cpm_settled_cents:4000,
  last_tiktok_check:'2026-11-23T14:00:00.000Z',approval_rate_percent:100};
 const card={id:campaign,title:'Recorded test music campaign',status:'sandbox_active',
  platform:'TikTok',pricing_model:'cpm',rate_cents:100,budget,counts};
 const current=new Date();current.setUTCHours(0,0,0,0);
 const series=Array.from({length:30},(_,i)=>{
  const day=new Date(current);day.setUTCDate(day.getUTCDate()-29+i);
  return {day:day.toISOString().slice(0,10),observed_view_delta:i%4===0?null:i*10,provider_checks:i%4===0?0:1,
   credit_cents:i%6===0?100:0};
 });
 const portfolio={period_days:30,totals:{campaigns:1,funded_cents:20000,allocated_cents:7000,available_cents:13000,
  latest_reported_views:5500,submissions:3,pending:1,flagged:0,approved:2,creator_count:2},
  campaigns:[card],source_note:'Owner-only live data; tests never populate the production service.'};
 const detail={campaign:{id:campaign,title:card.title,status:card.status,platform:'TikTok',pricing_model:'cpm',
  rate_cents:100},budget,counts,series,top_clippers:[{username:'realistic-test-user',clips:2,
   reported_views_latest:4200,test_credits_cents:320,approved_clips:2,flagged_clips:0}],
  series_summary:{provider_checks:22,checked_days:22,observed_delta_in_range:2910},
  alerts:[{kind:'info',text:'1 submission pending review'}],
  methodology:{trend:'Positive changes on actual API-check days; gaps mean unknown.',views:'API reports are not certified organic.'}};
 const captured={markup:'',events:[]};
 let ctx;
 const api=async endpoint=>endpoint.startsWith('/analytics/overview')?portfolio:detail;
 const sandbox={S,isCreator:()=>true,api,esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  ico:(name)=>'<i data-icon="'+name+'"></i>',content:()=>'previous page',
  studioPage:()=>'prior studio',renderShell:()=>'<nav></nav><div class="v-sidebar-bottom"></div>',
  render:()=>{if(ctx)captured.markup=ctx.content()},closeOverlay:()=>{},toast:()=>{},
  document:{addEventListener:(type,fn)=>captured.events.push({type,fn})},
  window:{ViewlyCreatorRewards:{openCampaign:()=>{}}},Intl,Date,URL,Blob,Number,Math,Set,console};
 ctx=vm.createContext(sandbox);
 vm.runInContext(js,ctx,{filename:'public/v11.js'});
 return {ctx,S,captured,campaign};
}
test('V11 bundles into the existing site, with responsive, reduced-motion styles',()=>{
 assert.match(html,/\/v11\.js\?v=11\.0/);
 assert.match(html,/\/v11\.css\?v=11\.0/);
 assert.match(css,/\.v11-progress-track/);
 assert.match(css,/\.v11-chart/);
 assert.match(css,/prefers-reduced-motion/);
});
test('analytics renders DB-backed portfolio, charts, allocations, rankings and honest view/check semantics',async()=>{
 const {ctx,S,captured,campaign}=boot();
 S.page='analytics';
 await ctx.window.ViewlyAnalytics.reload();
 const html=ctx.content();
 assert.match(html,/Recorded test music campaign/);
 assert.match(html,/Creator intelligence/);
 assert.match(html,/€130\.00/);
 assert.match(html,/€70\.00/);
 assert.match(html,/€0 paid/);
 assert.match(html,/realistic-test-user/);
 assert.match(html,/View analytics|Selected/);
 assert.match(html,/observed views|views newly observed|Views newly observed/i);
 assert.match(html,/v11-progress-piece/);
 assert.match(html,/role="progressbar"/);
 assert.match(html,/v11-chart/);
 assert.match(html,/provider_checks|API checks|API-check/i);
 assert.match(html,/Unknown|unknown|gaps/i);
 assert.match(html,/data-v11-csv/);
 assert.match(html,/data-v11-days="90"/);
 assert.match(ctx.studioPage(),/Open Analytics/);
 assert.match(ctx.renderShell('TEST'),/Creator analytics/);
});
test('analytics does not render made-up campaign values for a fresh artist',()=>{
 const {ctx,S}=boot();
 S.page='analytics';
 const markup=ctx.content();
 assert.match(markup,/Connecting to analytics/);
 assert.doesNotMatch(markup,/1\.24M|€2500|42,000/);
});
