import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function suggestRanges(pcm,duration,rate=8000){
 const count=Math.min(Math.floor(pcm.length/2/rate),Math.floor(duration),180);
 if(count<5)return [];
 const levels=[];
 for(let s=0;s<count;s++){let energy=0;for(let i=0;i<rate;i++){const x=pcm.readInt16LE((s*rate+i)*2)/32768;energy+=x*x;}levels.push(Math.sqrt(energy/rate));}
 const size=Math.min(15,count),candidates=[];
 for(let s=0;s+size<=count;s+=3){const seg=levels.slice(s,s+size),mean=seg.reduce((a,b)=>a+b,0)/size,change=seg.slice(1).reduce((a,b,i)=>a+Math.abs(b-seg[i]),0)/Math.max(1,size-1);if(mean>.001)candidates.push({start:s,end:s+size,score:mean+change*.5});}
 const out=[];for(const c of candidates.sort((a,b)=>b.score-a.score||a.start-b.start)){if(out.some(x=>Math.max(x.start,c.start)<Math.min(x.end,c.end)))continue;out.push({start:c.start,end:c.end,reason:'Audio energy and dynamics'});if(out.length===3)break;}
 return out;
}
let busy=false;
export async function analyzeClip(file,duration,fail){
 if(busy)throw fail(429,'Clip analysis busy. Try again.');
 busy=true;try{
 const {stdout}=await exec('ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file,pipe','-threads','1','-i',file,'-t','180','-map','0:a:0?','-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'],{encoding:'buffer',maxBuffer:4*1024*1024,timeout:20000});
 return {ranges:suggestRanges(stdout,duration),method:'Audio signal analysis (not AI transcription). First 180 seconds only.'};
 }catch{return {ranges:[],method:'Audio analysis unavailable for this source; choose a range manually.'};}
 finally{busy=false;}
}
