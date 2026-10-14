import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MOMOS_ART } from '../public/src/momos-art.mjs';

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

const dims={ [MOMOS_ART.boss]:[1254,1254], [MOMOS_ART.mask]:[1254,1254], 'momos-theatre-v1.png':[1280,720] };
test('Momos art dimensions, transparent mask and atlas gutters',async()=>{
 for(const [file,[w,h]] of Object.entries(dims)){const png=await readPng(file);assert.deepEqual([png.w,png.h],[w,h]);}
 const mask=await readPng(MOMOS_ART.mask);for(const [x,y] of [[0,0],[1253,0],[0,1253],[1253,1253],[10,10],[1243,10]])assert.equal(mask.alpha(x,y),0,`mask transparent corner ${x},${y}`);
 const atlas=await readPng(MOMOS_ART.boss);
 // Ignore faint generation noise below the loader's alpha threshold, but never
 // let a visible crown, wheel or hammer cross its actual source rectangle.
 for(let i=0;i<16;i++){
  const x0=Math.round(i%4*atlas.w/4),x1=Math.round((i%4+1)*atlas.w/4),y0=MOMOS_ART.rowEdges[Math.floor(i/4)],y1=MOMOS_ART.rowEdges[Math.floor(i/4)+1];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(x<x0+7||x>=x1-7||y<y0+7||y>=y1-7)assert.ok(atlas.alpha(x,y)<=40,`pose ${i} visible clipping at ${x},${y}`);
 }
});

test('painted atlas has 16 distinct poses, consistent standing scale and lower collapsed silhouettes',async()=>{
 const a=await readPng(MOMOS_ART.boss),silhouettes=[],heights=[];
 for(let i=0;i<16;i++){
  const x0=Math.round(i%4*a.w/4),x1=Math.round((i%4+1)*a.w/4),y0=MOMOS_ART.rowEdges[Math.floor(i/4)],y1=MOMOS_ART.rowEdges[Math.floor(i/4)+1];
  const points=[];let minX=x1,minY=y1,maxY=-1;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(a.alpha(x,y)>40){points.push([x,y]);minX=Math.min(minX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  assert.ok(points.length>9000,`pose ${i} visible`);assert.ok(points.length<(x1-x0)*(y1-y0)*.65,`pose ${i} isolated cutout`);
  const bits=new Uint8Array(330*330);for(const [x,y] of points)bits[(y-minY)*330+x-minX]=1;
  silhouettes.push(bits);heights.push(maxY-minY+1);
 }
 for(const i of [1,2,3,4,5,10,11,13])assert.ok(heights[i]/heights[0]>.9&&heights[i]/heights[0]<1.1,`pose ${i} consistent body scale`);
 assert.ok(heights[12]<heights[0]*.75,'kneeling pose stays low');assert.ok(heights[14]<heights[0]*.5,'defeated pose lies on the floor');
 for(const [i,j] of [[0,1],[2,3],[4,5],[6,7],[8,9],[12,0],[13,0],[14,0]]){let diff=0;for(let k=0;k<silhouettes[i].length;k++)diff+=silhouettes[i][k]!==silhouettes[j][k];assert.ok(diff>=1500,`poses ${i}/${j} differ beyond translation (${diff})`);}
});

test('theatre keeps opaque playable floor open and architecture peripheral',async()=>{
 const t=await readPng('momos-theatre-v1.png');
 for(let y=0;y<t.h;y++)for(let x=0;x<t.w;x++)assert.equal(t.alpha(x,y),255,`opaque scene ${x},${y}`);
 const color=(x,y)=>t.rgb(x,y).join(',');
 for(const y of [130,200,360,520,625,660])for(const x of [100,300,640,980,1180])assert.notEqual(color(x,y),'10,11,17',`floor visible in playable area ${x},${y}`);
 assert.notEqual(color(640,200),color(640,360),'floor planks/material vary down playable center');
});
