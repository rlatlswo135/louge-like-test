import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHandler} from '../scripts/serve.mjs';
import {createLeaderboard} from '../scripts/leaderboard.mjs';

function invoke(handler,url,method='GET',body){
 return new Promise((resolve,reject)=>{
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.url=url;req.method=method;
  req.headers={host:'localhost:5173',origin:'http://localhost:5173','content-type':'application/json'};req.socket={remoteAddress:'127.0.0.1'};
  const res={status:0,headers:{},writeHead(status,headers){this.status=status;this.headers=headers;},end(data){resolve({status:this.status,data:data?JSON.parse(String(data)):null});}};
  Promise.resolve(handler(req,res)).catch(reject);
 });
}
test('v2 routing keeps legacy records separate and durable without touching the original store',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'fusion-records-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const oldFile=path.join(dir,'leaderboard.json'),file=path.join(dir,'leaderboard-v2.json');
 const make=()=>createHandler({leaderboard:createLeaderboard({file}),legacyLeaderboard:createLeaderboard({file:oldFile})});
 const handler=make(),record={id:'2c5d5e90-7798-4a55-8af5-20b6e06218b6',nickname:'기존 기록',classId:'warrior',weaponId:'sword',hits:3,durationMs:130000,clearedStages:20};
 assert.equal((await invoke(handler,'/api/leaderboard','POST',record)).status,201);
 const original=await readFile(oldFile,'utf8');assert.deepEqual((await invoke(handler,'/api/leaderboard/v2')).data.entries,[]);
 const next={...record,id:'b11ed7ed-07c2-4a7f-b9e1-fb151c1d97d3',nickname:'합성 기록',hits:2};
 assert.equal((await invoke(handler,'/api/leaderboard/v2','POST',next)).status,201);
 assert.equal((await invoke(handler,'/api/leaderboard/v2','POST',next)).status,200);
 assert.equal(await readFile(oldFile,'utf8'),original);
 const restored=await invoke(make(),'/api/leaderboard/v2');assert.equal(restored.data.entries.length,1);assert.equal(restored.data.entries[0].nickname,'합성 기록');
 assert.equal((await invoke(handler,'/api/leaderboard')).data.entries[0].nickname,'기존 기록');
});
