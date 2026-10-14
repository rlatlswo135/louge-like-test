import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const art = fileURLToPath(new URL('../public/assets/art/', import.meta.url));
const paeth = (a,b,c) => { const p=a+b-c, aa=Math.abs(p-a), ab=Math.abs(p-b), ac=Math.abs(p-c); return aa<=ab&&aa<=ac?a:ab<=ac?b:c; };
// Pure Node PNG decoder: supports 8-bit RGB/RGBA assets used here; no host image tools.
async function readPng(file) {
 const bytes=await readFile(art+file); assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 let w,h,depth,type; const parts=[];
 for(let i=8;i<bytes.length;){const n=bytes.readUInt32BE(i),tag=bytes.toString('ascii',i+4,i+8),data=bytes.subarray(i+8,i+8+n);i+=12+n;
  if(tag==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];} if(tag==='IDAT')parts.push(data); if(tag==='IEND')break;}
 assert.equal(depth,8);assert.ok(type===2||type===6);const channels=type===6?4:3,bpp=channels,row=w*channels,raw=inflateSync(Buffer.concat(parts));assert.equal(raw.length,h*(row+1));const pixels=Buffer.alloc(h*row);let src=0;
 for(let y=0;y<h;y++){const f=raw[src++],off=y*row;for(let x=0;x<row;x++){const a=x>=bpp?pixels[off+x-bpp]:0,b=y?pixels[off-row+x]:0,c=y&&x>=bpp?pixels[off-row+x-bpp]:0,v=raw[src++];pixels[off+x]=(v+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?paeth(a,b,c):(()=>{throw Error(`PNG filter ${f}`)})()))&255;}}
 return {w,h,channels,pixels,alpha(x,y){return channels===4?pixels[(y*w+x)*channels+3]:255;},rgb(x,y){const k=(y*w+x)*channels;return [pixels[k],pixels[k+1],pixels[k+2]];}};
}

const dims={ 'momos-atlas-v1.png':[1024,1024], 'momos-mask-v1.png':[512,512], 'momos-theatre-v1.png':[1280,720] };
test('Momos art dimensions, transparent mask and atlas gutters',async()=>{
 for(const [file,[w,h]] of Object.entries(dims)){const png=await readPng(file);assert.deepEqual([png.w,png.h],[w,h]);}
 const mask=await readPng('momos-mask-v1.png');for(const [x,y] of [[0,0],[511,0],[0,511],[511,511],[10,10],[500,10]])assert.equal(mask.alpha(x,y),0,`mask transparent corner ${x},${y}`);
 const atlas=await readPng('momos-atlas-v1.png');for(let n=0;n<4;n++)for(let d=0;d<1024;d++){assert.equal(atlas.alpha(n*256,d),0,`vertical gutter x=${n*256},y=${d}`);assert.equal(atlas.alpha(n*256+255,d),0,`vertical gutter x=${n*256+255},y=${d}`);assert.equal(atlas.alpha(d,n*256),0,`horizontal gutter x=${d},y=${n*256}`);assert.equal(atlas.alpha(d,n*256+255),0,`horizontal gutter x=${d},y=${n*256+255}`);}
});

test('atlas has 16 actual poses with grounded bounds and distinct silhouettes',async()=>{
 const a=await readPng('momos-atlas-v1.png'), silhouettes=[];
 for(let i=0;i<16;i++){const ox=i%4*256,oy=Math.floor(i/4)*256,bits=new Uint8Array(256*256);let minY=256,maxY=-1,minX=256,maxX=-1,count=0;
  for(let y=1;y<255;y++)for(let x=1;x<255;x++)if(a.alpha(ox+x,oy+y)){bits[y*256+x]=1;count++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
  assert.ok(count>900,`pose ${i} visible`);assert.ok(minX>=12&&maxX<248,`pose ${i} transparent side gutters ${minX}..${maxX}`);assert.ok(maxY>=228&&maxY<=233,`pose ${i} grounded bottom ${maxY}`);assert.ok(minY>0&&minY<(i===14?160:20),`pose ${i} upper silhouette`);silhouettes.push(bits);
 }
 for(const [i,j,min] of [[0,1,80],[2,3,350],[4,5,500],[6,7,350],[8,9,500],[12,0,800],[13,0,800],[14,0,1000]]){let diff=0;for(let k=0;k<silhouettes[i].length;k++)diff+=silhouettes[i][k]!==silhouettes[j][k];assert.ok(diff>=min,`poses ${i}/${j} should differ beyond translation (${diff})`);}
});

test('theatre keeps opaque playable floor open and architecture peripheral',async()=>{
 const t=await readPng('momos-theatre-v1.png');
 for(let y=0;y<t.h;y++)for(let x=0;x<t.w;x++)assert.equal(t.alpha(x,y),255,`opaque scene ${x},${y}`);
 const color=(x,y)=>t.rgb(x,y).join(',');
 for(const y of [130,200,360,520,625,660])for(const x of [100,300,640,980,1180])assert.notEqual(color(x,y),'10,11,17',`floor visible in playable area ${x},${y}`);
 assert.notEqual(color(640,200),color(640,360),'floor planks/material vary down playable center');
});
