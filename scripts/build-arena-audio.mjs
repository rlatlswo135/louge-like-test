// Offline sampled arrangements. Runtime only plays bounded decoded buffers.
// Sources: Ominous / Volatile Reaction, Kevin MacLeod, CC BY 4.0; see CREDITS.txt.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const rate=22050,root=resolve(import.meta.dirname,'..'),work=process.argv[2]||join(tmpdir(),'rift-arena-audio-build');
const output=join(root,'public/assets/audio/arena');mkdirSync(work,{recursive:true});mkdirSync(output,{recursive:true});
function read(file,alias){
 const target=join(work,process.argv[2]?alias+'.wav':file+'.wav');
 if(!process.argv[2])execFileSync('afconvert',[join(root,'public/assets/audio',file),target,'-f','WAVE','-d','LEI16@22050']);
 const b=readFileSync(target);let channels=2,data;
 for(let o=12;o+8<b.length;){const name=b.toString('ascii',o,o+4),size=b.readUInt32LE(o+4);if(name==='fmt ')channels=b.readUInt16LE(o+10);if(name==='data')data=b.subarray(o+8,o+8+size);o+=8+size+(size%2);}
 const frames=data.length/2/channels,left=new Float32Array(frames),right=new Float32Array(frames);
 for(let i=0;i<frames;i++){left[i]=data.readInt16LE(i*channels*2)/32768;right[i]=data.readInt16LE((i*channels+channels-1)*2)/32768;}return [left,right];
}
function save(name,channels){
 let energy=0,peak=0;for(let i=0;i<channels[0].length;i++)for(const c of channels){energy+=c[i]*c[i];peak=Math.max(peak,Math.abs(c[i]));}
 const rms=Math.sqrt(energy/channels[0].length/2),gain=Math.min(.68/(peak||1),.12/(rms||1));
 const n=channels[0].length,b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++)for(let c=0;c<2;c++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[c][i]*gain))*32767),44+i*4+c*2);
 const wav=join(work,name+'.wav');writeFileSync(wav,b);
 if(!process.argv[2])execFileSync('afconvert',[wav,join(output,name+'.m4a'),'-f','m4af','-d','aac','-b','112000']);
 console.log(`${name}: ${(n/rate).toFixed(2)}s, peak ${(peak*gain).toFixed(3)}, RMS ${(rms*gain).toFixed(3)}`);
}
const bed=read('Ominous.mp3','ominous'),orchestra=read('Volatile Reaction.mp3','volatile');
const fanfare=read('Fanfare for Space - clear.m4a','fanfare');
// Keep full musical phrases, instead of repeating the same 240ms string grain.
// Volatile Reaction's seven-beat phrases keep their original rhythmic structure.
const originalBeat=60/155;
const themes=[
 {name:'menu',source:bed,start:0,speed:1,bars:0,cutoff:9000,level:.64,pattern:[]},
 {name:'iron',source:orchestra,start:originalBeat*7*8,speed:.9,bars:16,cutoff:4200,level:.7,pattern:[1,0,0,.4,0,0,.3]},
 {name:'drums',source:orchestra,start:originalBeat*7*4,speed:.98,bars:16,cutoff:2500,level:.62,pattern:[1,0,.35,0,.65,.25,0]},
 {name:'ember',source:orchestra,start:originalBeat*7*20,speed:.94,bars:16,cutoff:3200,level:.72,pattern:[1,0,0,0,.5,0,.25]},
 {name:'frost',source:bed,start:0,speed:.94,bars:0,cutoff:6500,level:.68,pattern:[.3,0,0,0,0,0,0]},
 {name:'storm',source:orchestra,start:originalBeat*7*32,speed:1.04,bars:16,cutoff:6800,level:.76,pattern:[.8,0,.25,.55,0,.3,0]},
 {name:'abyss',source:bed,start:0,speed:.76,bars:0,cutoff:1800,level:.72,pattern:[.45,0,0,0,0,0,.2]},
 {name:'final',source:orchestra,start:originalBeat*7*40,speed:1,bars:16,cutoff:8500,level:.78,pattern:[1,0,.3,0,.6,0,.3]},
];
for(const theme of themes){
 const {name,source,start,speed,cutoff,level,pattern}=theme;
 const length=theme.bars?originalBeat*7*theme.bars/speed:source[0].length/rate/speed;
 const n=Math.floor(length*rate),seam=Math.round(.55*rate),mix=[new Float32Array(n+seam),new Float32Array(n+seam)];
 const alpha=1-Math.exp(-2*Math.PI*cutoff/rate);
 for(let ch=0;ch<2;ch++){
  let low=0,rumble=0;
  for(let i=0;i<n+seam;i++){
   const pos=(start*rate+i*speed)%source[ch].length,base=Math.floor(pos),fraction=pos-base;
   const sample=source[ch][base]*(1-fraction)+source[ch][(base+1)%source[ch].length]*fraction;
   low+=alpha*(sample-low);rumble+=.002*(low-rumble);
   mix[ch][i]=(low-rumble*.65)*level;
  }
 }
 // Sparse, differing accents support the source's meter and leave room for attack cues.
 const beat=theme.bars?originalBeat/speed:60/(name==='abyss'?66:78);
 let seed=773;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 if(pattern.length)for(let k=0;k*beat<length+.55;k++){
  const accent=pattern[k%7]*(Math.floor(k/7)%4===3?.68:1);if(!accent)continue;
  const at=Math.round(k*beat*rate),duration=.55,weight=name==='drums'?.18:.085;
  for(let j=0;j<duration*rate&&at+j<n+seam;j++){
   const t=j/rate,env=Math.exp(-t*11),tone=Math.sin(2*Math.PI*(46*t+1.2*(1-Math.exp(-t*32))));
   const sample=(tone*.78+random()*.13)*env*accent*weight;
   for(let ch=0;ch<2;ch++)mix[ch][at+j]+=sample;
  }
 }
 // Join an entire phrase with a short equal-gain crossfade; never drop to silence at a loop.
 const loop=[new Float32Array(n),new Float32Array(n)];
 for(let ch=0;ch<2;ch++){
  loop[ch].set(mix[ch].subarray(0,n));
  for(let i=0;i<seam;i++){
   const weight=(1-Math.cos(Math.PI*i/(seam-1)))/2;
   loop[ch][i]=mix[ch][n+i]*(1-weight)+mix[ch][i]*weight;
  }
 }
 save(name,loop);
}
// A recorded brass attack with a deliberately short release; no long victory music.
for(const [name,length,offset,phrase] of [['victory',1.45,4.8,.52],['finale',2.8,4.8,1.65]]){
 const n=Math.round(rate*length),mix=[new Float32Array(n),new Float32Array(n)];
 for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++){
  const t=i/rate,release=Math.exp(-Math.max(0,t-phrase)*11);
  const end=Math.min(1,(length-t)/.13),fade=Math.min(1,t/.008);
  mix[ch][i]=fanfare[ch][Math.min(fanfare[ch].length-1,Math.floor(offset*rate)+i)]*release*fade*end;
 }
 // Bounded stereo early reflections supply a natural tail after the brass stops.
 for(let ch=0;ch<2;ch++)for(const [delay,gain] of [[.047,.15],[.089,.1],[.143,.075]]){
  const d=Math.round((delay+ch*.007)*rate);
  for(let i=n-1;i>=d;i--)mix[ch][i]+=mix[1-ch][i-d]*gain*Math.min(1,(n-i)/(rate*.13));
 }
 save(name,mix);
}
