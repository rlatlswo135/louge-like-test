import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, createTutorialRun } from '../public/src/game.mjs';
import * as client from '../public/src/leaderboard-client.mjs';

const id='78081233-79b7-4f7f-8a1d-72e9dcf886a4';
const win=()=>Object.assign(createRun(),{status:'won',stage:19,bossesCleared:20,hitsTaken:7,time:240.125});

test('ranking payload requires a full real campaign clear and uses combat time, not wall time',()=>{
  const r=win();
  assert.deepEqual(client.buildRecord(r,'  도전자  ',id),{id,nickname:'도전자',classId:'warrior',weaponId:'sword',hits:7,durationMs:240125,clearedStages:20});
  for(const invalid of [createRun(),{...r,status:'dead'},{...r,bossesCleared:1},{...r,stage:18},{...r,tutorial:createTutorialRun().tutorial}])assert.throws(()=>client.buildRecord(invalid,'도전자',id),/20/);
  for(const name of [' ','a','<script>','가'.repeat(17)])assert.throws(()=>client.buildRecord(r,name,id),/닉네임/);
});

test('ranking client uses same-origin JSON requests with timeout and rejects malformed responses',async t=>{
  const record=client.buildRecord(win(),'도전자',id),calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json(options.method==='POST'?{entry:record,rank:1,retained:true}:{entries:[record],limit:100,unverified:true});});
  assert.deepEqual(await client.loadLeaderboard(),[record]);
  assert.equal((await client.submitRecord(record)).rank,1);
  assert.equal(calls[0].url,'/api/leaderboard/v2');assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[1].options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(calls[1].options.body),record);
  assert.ok(calls.every(c=>c.options.signal instanceof AbortSignal));
  globalThis.fetch.mock.mockImplementation(async()=>Response.json({entries:[{nickname:'missing fields'}]}));
  await assert.rejects(client.loadLeaderboard(),/응답/);
  globalThis.fetch.mock.mockImplementation(async()=>Response.json({entries:[{...record,nickname:'가'.repeat(17)}]}));
  await assert.rejects(client.loadLeaderboard(),/응답/);
  globalThis.fetch.mock.mockImplementation(async()=>Response.json({error:'요청이 너무 많습니다.'},{status:429}));
  await assert.rejects(client.submitRecord(record),/요청이 너무 많습니다/);
  globalThis.fetch.mock.mockImplementation(async()=>{throw new Error('offline');});
  await assert.rejects(client.loadLeaderboard(),/네트워크/);
});
