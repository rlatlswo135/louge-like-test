import test from 'node:test';import assert from 'node:assert/strict';
import {createRun,makeOffers,chooseCard,previewReward,getStats} from '../public/src/game.mjs';
import {CLASS_UNIQUES} from '../public/src/builds.mjs';
import {CARDS,CLASSES} from '../public/src/content.mjs';

test('catalog has only normal/unique/berserk; 24,320 reachable reward draws preserve three-card rules',()=>{
 const types=new Set(CARDS.map(c=>c.rarity||'normal'));
 assert.deepEqual([...types].sort(),['berserk','normal','unique']);
 assert.deepEqual(['normal','unique','berserk'].map(type=>CARDS.filter(c=>(c.rarity||'normal')===type).length),[12,25,3]);
 const seen=new Set();
 for(const cls of CLASSES)for(let seed=1;seed<=256;seed++){
  const s=createRun({classId:cls.id,seed});
  for(let stage=0;stage<19;stage++){
   s.status='reward';s.offers=makeOffers(s);
   assert.equal(s.offers.length,3);assert.equal(new Set(s.offers.map(c=>c.id)).size,3);
   const special=(stage+1)%5===0,owned=getStats(s).uniqueIds.length;
   const rares=s.offers.filter(c=>c.rarity);
   assert.ok(rares.length<=1,'three types do not mean one of each on every reward');
   if(special)assert.equal(rares[0]?.rarity,owned>=2?'berserk':'unique');
   else assert.ok(rares.every(c=>c.rarity==='unique'));
   for(const card of s.offers){
    seen.add(card.rarity||'normal');assert.ok(CARDS.includes(card));
    assert.ok((s.cards[card.id]||0)<card.maxStacks);
    if(card.rarity==='unique'){assert.equal(card.classId,cls.id);assert.ok(owned<2);}
    if(card.id==='healing')assert.ok(s.player.hp<getStats(s).maxHp);
   }
   const before=JSON.stringify(s),card=rares[0]||s.offers[(seed+stage)%3];
   const preview=previewReward(s,card.id);assert.ok(preview);
   assert.equal(JSON.stringify(s),before,'preview cannot change live offers or cards');
   assert.equal(chooseCard(s,card.id),true);
   assert.equal(s.stage,stage+1);assert.deepEqual(s.cards,preview.cards);
  }
  assert.deepEqual(makeOffers(s),[],'no reward after stage 20');
 }
 assert.deepEqual([...seen].sort(),['berserk','normal','unique']);
});
test('ordinary unique chance remains 6%; duplicate uniques and exhausted berserks never reappear',()=>{
 const s=createRun();s.rng=()=>.059999;assert.equal(makeOffers(s).filter(c=>c.rarity==='unique').length,1);
 s.rng=()=>.06;assert.ok(makeOffers(s).every(c=>!c.rarity));
 s.cards[CLASS_UNIQUES.warrior[0]]=s.cards[CLASS_UNIQUES.warrior[1]]=1;
 s.stage=4;
 for(const c of CARDS.filter(c=>c.rarity==='berserk'))s.cards[c.id]=1;
 assert.equal(makeOffers(s).length,3);assert.ok(makeOffers(s).every(c=>!c.rarity));
});

test('stage 5/10/15 guarantees unique; two unique build guarantees berserk',()=>{
 for(const stage of [4,9,14]){const s=createRun({stage});s.status='playing';s.stage=stage;s.rng=()=>.99;s.boss.def.special=true;const offers=makeOffers(s);assert.ok(offers.some(c=>c.rarity==='unique'||c.rarity==='berserk'));}
 const s=createRun({classId:'mage',stage:4});s.cards[CLASS_UNIQUES.mage[0]]=1;s.cards[CLASS_UNIQUES.mage[1]]=1;s.rng=()=>.99;assert.ok(makeOffers(s).some(c=>c.rarity==='berserk'));
});
test('reject other class, duplicate, and third unique; preview leaves live HP/RNG alone',()=>{
 const s=createRun({classId:'mage'});s.status='reward';s.cards[CLASS_UNIQUES.mage[0]]=1;s.cards[CLASS_UNIQUES.mage[1]]=1;s.offers=[{id:'multishot',maxStacks:1,rarity:'unique'},{id:CLASS_UNIQUES.mage[2],maxStacks:1,rarity:'unique'}];assert.equal(chooseCard(s,'multishot'),false);
 assert.equal(chooseCard(s,CLASS_UNIQUES.mage[2]),false,'third unique is rejected even in a forged offer');
 const hp=s.player.hp, rng=s.rng;s.offers=[{id:'healing',category:'heal',maxStacks:3}];const p=previewReward(s,'healing');assert.ok(p);assert.equal(s.player.hp,hp);assert.equal(s.rng,rng);
});
