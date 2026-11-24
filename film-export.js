import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const clean=(v,n)=>Array.from(String(v??'').normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,n).join('');
function wrap(v,n,max){const a=Array.from(clean(v,n*max*2)),out=[];while(a.length&&out.length<max){let cut=Math.min(n,a.length);if(a.length>n){const ws=a.slice(0,n).lastIndexOf(' ');if(ws>n/2)cut=ws;}out.push(a.splice(0,cut).join('').trim());while(a[0]===' ')a.shift();}if(a.length)out[out.length-1]=Array.from(out.at(-1)).slice(0,n-1).join('')+'…';return out.join('\n');}
const euros=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format((Number(n)||0)/100);
export function publicFilmSpec(f){
 if(f?.version!==1||f.mode!=='sandbox'||f.payment_status!=='test_confirmed'||f.charged_cents!==0)throw Error('Confirmed test order required');
 return {title:wrap(f.details.title,16,3),artist:wrap(f.artist,30,2),headline:wrap(f.branding.headline||'Join the campaign on VIEWLY',27,3),rate:euros(f.details.cpm_rate_cents),pool:euros(f.quote.budget_cents),platform:clean(f.details.platform||'TikTok',30),test:true};
}
let busy=false;
export async function renderSocialFilm(f,branding,uploads,fail){
 if(busy)throw fail(429,'The film renderer is busy. Try again shortly.');
 const spec=publicFilmSpec(f);
 for(const file of [branding.icon_file,branding.background_file])if(!/^[a-f0-9]{40}\.jpg$/.test(file||''))throw fail(422,'Campaign artwork unavailable.');
 busy=true;let dir;
 try{
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'viewly-film-'));
  const text={brand:'V I E W L Y .',test:'SANDBOX / TEST CAMPAIGN',title:spec.title,artist:spec.artist,headline:spec.headline,rate:spec.rate+' / 1K VIEWS',pool:spec.pool+' TEST REWARD POOL',platform:spec.platform.toUpperCase(),cta:'DISCOVER THE CAMPAIGN',thanks:'MUSIC MOVES HERE.'};
  for(const [k,v] of Object.entries(text))await fs.writeFile(path.join(dir,k+'.txt'),v,'utf8');
  const filters=[
   "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p,zoompan=z='1.035+0.05*on/288':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=24,eq=brightness=-0.32:saturation=0.82[bg]",
   "[1:v]scale=490:490,format=rgba,pad=510:510:10:10:color=0xb0c8ff,rotate='0.032*sin(t*1.2)-0.035':ow=600:oh=600:c=none[art]",
   "[bg][art]overlay=x='(W-w)/2+12*sin(t*1.1)':y='325+20*sin(t*1.3)':format=auto,format=yuv420p,drawbox=x=54:y=54:w=972:h=1812:color=0xabc8ff@0.28:t=2,drawbox=x=110:y=1170:w=860:h=4:color=0x95b9ff@0.8:t=fill"
  ];
  function draw(key,y,size,start=0,end=12,heavy=false,color='white'){
   // User data is read from text files with expansion disabled; never interpolated into filters.
   const alpha="if(lt(t,"+(start+.35)+"),max(0,(t-"+start+")/0.35),if(gt(t,"+(end-.35)+"),max(0,("+end+"-t)/0.35),1))";
   return "drawtext=fontfile="+(heavy?bold:font)+":textfile="+key+".txt:expansion=none:fontsize="+size+":fontcolor="+color+":x=(w-tw)/2:y="+y+":line_spacing=12:shadowcolor=black@0.8:shadowx=2:shadowy=4:alpha='"+alpha+"':enable='between(t,"+start+","+end+")'";
  }
  filters[2]+=','+[
   draw('brand',112,38,0,12,true,'0xc3d9ff'),
   draw('test',178,32,0,12,true,'0xffdca3'),
   draw('title',925,58,0,4,true),draw('artist',1285,32,0,4,false,'0xc7d7f4'),
   draw('rate',985,70,4,8,true),draw('pool',1270,44,4,8,true,'0xc7d7f4'),
   draw('platform',1380,34,4,8,false,'0xc7d7f4'),
   draw('cta',970,48,8,12,true,'0xc3d9ff'),draw('headline',1230,36,8,12,true),
   draw('thanks',1660,30,0,12,true,'0xb7cfff')
  ].join(',')+'[v]';
  // Original sound design: scene-aligned three-note impacts, soft sweep and low ambient bed.
  const audio="aevalsrc=0.035*sin(2*PI*110*t)+0.018*sin(2*PI*165*t)+0.12*exp(-5*mod(t\\,4))*(sin(2*PI*82*t)+0.32*sin(2*PI*246*t))+0.025*exp(-3*mod(t\\,4))*sin(2*PI*(340*t+8*t*t)):s=48000:d=12,afade=t=in:d=0.25,afade=t=out:st=11.4:d=0.6";
  const args=['-nostdin','-v','error','-y','-threads','1','-loop','1','-framerate','24','-i',path.join(uploads,branding.background_file),'-threads','1','-loop','1','-framerate','24','-i',path.join(uploads,branding.icon_file),'-f','lavfi','-i',audio,'-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map','[v]','-map','2:a','-t','12','-r','24','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','128k','-movflags','+faststart','film.mp4'];
  await exec('ffmpeg',args,{cwd:dir,timeout:120000,maxBuffer:65536});
  const file=path.join(dir,'film.mp4'),stat=await fs.stat(file);
  if(stat.size<1000||stat.size>24*1024*1024)throw Error('Invalid film size');
  return await fs.readFile(file);
 }catch(e){console.warn('VIEWLY social film render failed:',String(e?.stderr||e.message).slice(0,300));throw fail(503,'Video rendering failed. Your campaign is safe; try again.');}
 finally{busy=false;if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
