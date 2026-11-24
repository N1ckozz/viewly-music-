import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/v5.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public/v5.js'),'utf8');
test('V5 is active, glass styles are bundled and mobile dock is intentionally single',()=>{
 assert.match(html,/v5\.css/);assert.match(html,/v5\.js/);
 assert.match(css,/backdrop-filter/);assert.match(css,/\.v-bottom-nav/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(js,/fakeBalance|fakeTransaction|mockCampaign/i);
});
function setup(){
 const S={page:'discover',user:null,stats:{},releases:[],campaigns:[],myCampaigns:[],config:{stripe_ready:false,payouts_enabled:false}};
 const events={};
 const document={addEventListener(type,fn){(events[type]??=[]).push(fn)},querySelector(){return null}};
 const ctx={S,document,ico:(s)=>'<svg data-icon="'+s+'"></svg>',esc:x=>String(x??''),
  releaseCard:()=>'',renderShell:x=>x,
  discover:()=>'<section class="v-home-discover"><p>Original release browse</p></section><section class="v-home-tools">duplicate navigation actions</section>',
  profilePage:()=>'<div class="v-settings-wrap"><div class="v-settings-panel"><h2>Payments</h2><p>Old text.</p><button disabled>Old button</button></div></div>',
  walletPage:()=>'<div>Real reward ledger</div>'};
 vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'v5.js'});return {ctx,S,events};
}
test('V5 keeps functional navigation and eliminates duplicated sidebar Account entry',()=>{
 const {ctx,S}=setup(),shell=ctx.renderShell('<div>Real server-backed content</div>');
 assert.match(shell,/v-sidebar/);assert.match(shell,/v-bottom-nav/);
 assert.match(shell,/Real server-backed content/);
 assert.equal((shell.match(/aria-label="Mobile primary navigation"/g)||[]).length,1);
 assert.doesNotMatch(shell,/<div class="v-rail-label">ACCOUNT<\/div>/);
 assert.match(shell,/data-ux-command="open"/);
 assert.match(shell,/data-page="profile"/);
 S.page='clips';
 assert.match(ctx.renderShell('x'),/v-nav is-active" data-page="clips"/);
});
test('V5 releases let clippers jump directly into a real clip action',()=>{
 const {ctx}=setup();
 const card=ctx.releaseCard({id:'r123',title:'Original video',artist_name:'Artist',genre:'Trap',cover_url:'/media/real-cover.jpg',likes:0});
 assert.match(card,/Original video/);
 assert.match(card,/data-action="clip"/);
 assert.equal((card.match(/data-action="play"/g)||[]).length,1,'only one play action per card');
 assert.match(card,/data-ux-share="r123"/);
});
test('V5 home keeps real content while replacing the duplicate shortcuts with functional search',()=>{
 const {ctx}=setup();const h=ctx.discover();
 assert.match(h,/Original release browse/);assert.match(h,/v5-search-bar/);
 assert.doesNotMatch(h,/duplicate navigation actions/);
 assert.match(h,/0 real releases/);
});
test('V5 account and wallet reflect real Stripe readiness instead of inventing it',()=>{
 const {ctx,S}=setup();
 S.user={id:'artist1',role:'artist',display_name:'Artist',username:'artist'};
 let page=ctx.profilePage();
 assert.match(page,/Not enabled on this server/);
 assert.match(page,/v-account-hub/);
 assert.doesNotMatch(page,/Old button/);
 assert.match(ctx.walletPage(),/Not configured for checkout/);
 S.config.stripe_ready=true;S.config.payouts_enabled=true;
 page=ctx.profilePage();
 assert.match(page,/Stripe checkout ready/);
 assert.match(ctx.walletPage(),/Ready for eligible campaigns/);
});
