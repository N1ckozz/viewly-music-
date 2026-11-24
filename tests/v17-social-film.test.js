import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {publicFilmSpec,renderSocialFilm} from '../film-export.js';
const f={version:1,mode:'sandbox',payment_status:'test_confirmed',charged_cents:0,receipt_id:'PRIVATE_ORDER',artist:'Artist Ελληνικά',details:{title:'A real campaign 100% : special',cpm_rate_cents:150,platform:'TikTok',brief:'PRIVATE_BRIEF'},branding:{headline:'Listen now'},quote:{budget_cents:10000,fee_cents:500,total_cents:10500}};
test('V17 social film projection excludes private transaction details',()=>{
 const spec=publicFilmSpec(f);assert.equal(spec.rate,'€1.50');assert.equal(spec.pool,'€100.00');assert.ok(spec.test);
 assert.doesNotMatch(JSON.stringify(spec),/PRIVATE|10500|fee_cents/);
 assert.throws(()=>publicFilmSpec({...f,payment_status:'pending'}));
});
test('V17 produces actual 1080x1920 MP4 with audio from artwork',{timeout:150000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'viewly-video-test-'));
 try{
  const b={icon_file:'a'.repeat(40)+'.jpg',background_file:'b'.repeat(40)+'.jpg'};
  for(const [name,size] of [[b.icon_file,'1024x1024'],[b.background_file,'1600x900']])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s='+size,'-frames:v','1','-threads','1','-y',join(dir,name)],{timeout:20000});
  const video=await renderSocialFilm(f,b,dir,(status,msg)=>Object.assign(Error(msg),{status}));
  writeFileSync(join(dir,'out.mp4'),video);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',join(dir,'out.mp4')],{encoding:'utf8'}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  assert.equal(v.width,1080);assert.equal(v.height,1920);assert.equal(v.codec_name,'h264');assert.equal(a.codec_name,'aac');assert.ok(Number(probe.format.duration)>=11.9&&Number(probe.format.duration)<=12.2);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
