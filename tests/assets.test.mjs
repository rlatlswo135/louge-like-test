import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MUSIC } from '../public/src/audio.mjs';

const assets=new URL('../public/assets/',import.meta.url);
test('bundled licensed assets match recorded provenance hashes and playable format signatures',async()=>{
  for(const [file,signature] of [['audio/Ominous.mp3','ID3'],['audio/Volatile Reaction.mp3','ID3'],['audio/Fanfare for Space - clear.m4a','ftyp'],['audio/Fanfare for Space - final.m4a','ftyp'],['art/monastery-stone.jpg','jpg']]){
    const bytes=await readFile(new URL(file,assets));
    const credits=await readFile(new URL(file.startsWith('audio/')?'audio/CREDITS.txt':'art/CREDITS.txt',assets),'utf8');
    assert.ok(credits.includes(createHash('sha256').update(bytes).digest('hex')),file);
    assert.ok(bytes.length>100000&&bytes.length<7000000,file);
    if(signature==='jpg')assert.equal(bytes.readUInt16BE(0),0xffd8);
    else assert.equal(bytes.toString('ascii',signature==='ftyp'?4:0,signature==='ftyp'?8:3),signature);
  }
  const html=await readFile(new URL('../public/credits.html',import.meta.url),'utf8');
  for(const required of ['Kevin MacLeod','Ominous','Volatile Reaction','Fanfare for Space','Amal Kumar','CC0','CC BY 4.0'])assert.ok(html.includes(required),required);
});

function movieDuration(bytes,from=0,to=bytes.length){
  for(let offset=from;offset+8<=to;){
    const size=bytes.readUInt32BE(offset),tag=bytes.toString('ascii',offset+4,offset+8);
    if(size<8||offset+size>to)throw Error('Malformed MP4 atom');
    if(tag==='mvhd'){
      const p=offset+8,version=bytes[p];
      return version===0?bytes.readUInt32BE(p+16)/bytes.readUInt32BE(p+12):Number(bytes.readBigUInt64BE(p+24))/bytes.readUInt32BE(p+20);
    }
    if(tag==='moov'){const duration=movieDuration(bytes,offset+8,offset+size);if(duration)return duration;}
    offset+=size;
  }
}
test('current music and foley have provenance, real playable files and concise victory durations',async()=>{
  const credits=await readFile(new URL('audio/CREDITS.txt',assets),'utf8');
  for(const [name,[file,loop,type]] of Object.entries(MUSIC)){
    const bytes=await readFile(new URL('audio/'+file,assets));
    assert.ok(credits.includes(createHash('sha256').update(bytes).digest('hex')),name);
    if(type==='sfx')assert.equal(bytes.toString('ascii',0,4),file.endsWith('.wav')?'RIFF':'OggS');
    else{
      const wav=file.endsWith('.wav');
      assert.equal(bytes.toString('ascii',wav?0:4,wav?4:8),wav?'RIFF':'ftyp');
      const duration=wav?bytes.readUInt32LE(40)/bytes.readUInt32LE(28):movieDuration(bytes);
      if(loop)assert.ok(duration>=50&&duration<=160,`${name}/${duration}`);
      else assert.ok(name==='victory'?duration>=1.19&&duration<=1.25:duration>=2.59&&duration<=2.65,`${name}/${duration}`);
    }
  }
  const artCredits=await readFile(new URL('art/CREDITS.txt',assets),'utf8');
  for(const file of ['arena-atlas-v3.png','arena-gate-v3.png','boss-atlas-v3.png','hero-atlas-v4.png','boss-windup-v4.png','weapon-atlas-v4.png']){
    const bytes=await readFile(new URL('art/'+file,assets));assert.equal(bytes.toString('ascii',1,4),'PNG');
    assert.ok(artCredits.includes(createHash('sha256').update(bytes).digest('hex')),file);
    if(file.startsWith('boss-')||file.includes('hero-atlas')||file.startsWith('weapon-atlas'))assert.equal(bytes[25],6,'actor sheets include alpha');
  }
});
