// Offline asset preparation. Input: licensed sources decoded to 22050 Hz stereo PCM16 WAV.
// Provenance/source filenames are recorded in public/assets/audio/v5-sources.json.
// node scripts/build-audio-v5.mjs <decoded-dir> <output-dir>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('Pass decoded input and output directories');
const RATE=22050;
function read(name){
  const b=readFileSync(join(input,name+'.wav'));let at=12,channels=0,rate=0,bits=0,data;
  while(at+8<=b.length){const tag=b.toString('ascii',at,at+4),size=b.readUInt32LE(at+4),start=at+8;
    if(tag==='fmt '){channels=b.readUInt16LE(start+2);rate=b.readUInt32LE(start+4);bits=b.readUInt16LE(start+14);}
    if(tag==='data')data=b.subarray(start,start+size);at=start+size+(size%2);
  }
  if(channels!==2||rate!==RATE||bits!==16||!data)throw new Error('Expected PCM16 stereo at 22050: '+name);
  return Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
}
function write(name,data,dir){
  const folder=join(output,dir);mkdirSync(folder,{recursive:true});
  const b=Buffer.alloc(44+data.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(RATE,24);b.writeUInt32LE(RATE*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(data.length*2,40);
  for(let i=0;i<data.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[i]))*32767),44+i*2);
  writeFileSync(join(folder,name+'.wav'),b);
}
function master(data,{peak=.8,rms=.2,fadeIn=.003,fadeOut=.035}={}){
  let sum=0,max=0,dc=0;for(const v of data)dc+=v;dc/=data.length;
  for(let i=0;i<data.length;i++){data[i]-=dc;sum+=data[i]*data[i];max=Math.max(max,Math.abs(data[i]));}
  const gain=Math.min(peak/(max||1),rms/(Math.sqrt(sum/data.length)||1),12),frames=data.length/2;
  for(let n=0;n<frames;n++){const envelope=Math.min(1,n/(RATE*fadeIn),(frames-1-n)/(RATE*fadeOut));data[n*2]*=gain*envelope;data[n*2+1]*=gain*envelope;}
  return data;
}
const durations={
  'sword-a':.29,'sword-b':.31,thrust:.2,fire:.5,flame:.26,spark:.16,arcane:.3,
  'water-a':.24,'water-b':.28,'water-burst':.6,stone:.55,wood:.24,metal:.21,
  'punch-a':.18,'punch-b':.18,kick:.26,guard:.36,glass:.25,bell:.65,
  revolver:.3,rifle:.55,shotgun:.46,machinegun:.115,pistol:.22,bow:.24,cloth2:.17,cloth4:.23,
};
const report=[];
for(const [name,seconds] of Object.entries(durations)){
  const source=read(name);let max=0;for(const x of source)max=Math.max(max,Math.abs(x));
  // Find the attack onset, retaining 3 ms of pre-roll. Gun sources contain long quiet lead-ins.
  let onset=0;while(onset<source.length/2&&Math.max(Math.abs(source[onset*2]),Math.abs(source[onset*2+1]))<max*.12)onset++;
  const start=Math.max(0,onset-Math.round(RATE*.003))*2,data=new Float32Array(Math.round(seconds*RATE)*2);
  data.set(source.subarray(start,Math.min(source.length,start+data.length)));
  write(name,master(data,{rms:name==='machinegun'?.15:.2,fadeOut:Math.min(.06,seconds*.22)}),'combat-v5');
  report.push({name,seconds,onset:+(start/2/RATE).toFixed(4),kind:'sfx'});
}
const scores={menu:'menu',iron:'battle',drums:'drums',ember:'ember',frost:'heart',storm:'storm',abyss:'abyss',final:'hope'};
for(const [name,source] of Object.entries(scores)){
  const data=read(source);
  // Preserve the original composition and pitch. Only short edge fades and a common listening level.
  write(name,master(data,{peak:.7,rms:.105,fadeIn:.025,fadeOut:.04}),'score-v5');
  report.push({name,source,seconds:data.length/2/RATE,kind:'music'});
}
const ending=read('outro');
for(const [name,seconds,hold] of [['victory',1.2,.42],['finale',2.6,1.2]]){
  const data=ending.slice(0,Math.round(seconds*RATE)*2);
  for(let i=0;i<data.length;i++){const t=i/2/RATE;if(t>hold)data[i]*=Math.exp(-5*(t-hold)/(seconds-hold));}
  write(name,master(data,{peak:.72,rms:.13,fadeIn:.005,fadeOut:.03}),'score-v5');report.push({name,seconds,source:'outro',kind:'stinger'});
}
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Prepared ${report.length} recorded audio assets`);
