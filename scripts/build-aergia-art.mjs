// Offline palette/prop edit. Requires ImageMagick; runtime still draws a plain PNG.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const art=fileURLToPath(new URL('../public/assets/art/',import.meta.url));
const magick=(args,input)=>{
  const r=spawnSync('magick',args,{input,maxBuffer:32*1024*1024});
  if(r.error)throw r.error;
  if(r.status!==0)throw new Error(r.stderr.toString());
  return r.stdout;
};
const size=magick(['identify','-format','%wx%h',art+'aergia-atlas-v2.png']).toString();
assert.equal(size,'1254x1254','Recheck hand coordinates if the source atlas changes.');
const pixels=magick([art+'aergia-atlas-v2.png','-depth','8','rgba:-']);
const unit=x=>Math.max(0,Math.min(1,x));
let before=0,after=0;
for(let i=0;i<pixels.length;i+=4){
  if(!pixels[i+3])continue;
  const [r,g,b]=pixels.subarray(i,i+3),max=Math.max(r,g,b),min=Math.min(r,g,b);
  const l=.2126*r+.7152*g+.0722*b,skin=unit(((max-min)/(max||1)-.16)/.16),red=unit((r/(g||1)-1.25)/.3);
  const cold=[l*.37,l*.4,l*.45],ash=[(.8*l+.2*r)*.68,(.8*l+.2*g)*.65,(.8*l+.2*b)*.63],cloth=[r*.5,g*.36,b*.4];
  before+=l;
  for(let c=0;c<3;c++)pixels[i+c]=Math.round((cold[c]*(1-skin)+ash[c]*skin)*(1-red)+cloth[c]*red);
  after+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
}
assert.ok(after/before<.58&&after/before>.45,'Keep a substantially darker but readable palette.');
// A faceted marble chip replaces the apple, including its round silhouette.
const out=art+'aergia-atlas-v4.png';
magick(['-size',size,'-depth','8','rgba:-',
  '(',art+'olympus-warrior-v1.png','-crop','40x40+740+915','+repage','-resize','42x44!','-modulate','70,35,100',
    '(','-size','42x44','xc:none','-fill','white','-draw','polygon 2,9 14,1 33,6 41,25 30,43 7,39 0,24',')',
    '-alpha','off','-compose','CopyOpacity','-composite','-strip','-write','PNG32:'+art+'temple-shard-v1.png',')',
  '-geometry','+66+648','-compose','Over','-composite','-depth','8','-strip','PNG32:'+out],pixels);
console.log(`${out} (mean palette luminance ${(after/before).toFixed(3)} × v2)`);
