import { BOSSES, CAMPAIGN, CARDS, SPECIAL_UNIQUE_CHANCE, UNIQUE_CHANCE } from '../content.mjs';
import { CLASS_UNIQUES } from '../builds.mjs';
import { cleanupEncounter } from '../encounters.mjs';
import { getStats } from '../systems/stats.mjs';
import type { RunState, CardDefinition } from '../types.mjs';
import { Boss } from '../entities.mjs';
/** 카드 제안·미리보기·다음 스테이지 */
export class RewardSystem {
  offers(state: RunState): CardDefinition[] {
    if(state.tutorial||state.stage>=state.stageCount-1)return [];
    const owned=Object.values(CLASS_UNIQUES).flat().filter(id=>(state.cards[id]||0)>0);
    const eligible=owned.length<2?CLASS_UNIQUES[state.cls.id].filter(id=>!(state.cards[id]||0)).map(id=>CARDS.find(c=>c.id===id)):[];
    const berserks=CARDS.filter(c=>c.rarity==='berserk'&&!(state.cards[c.id]||0));
    const forced=(state.stage+1)%5===0;
    const guaranteed=forced?(owned.length>=2?berserks:eligible):[];
    const available=CARDS.filter(card=>(state.cards[card.id]||0)<card.maxStacks
    &&(!card.classId||card.classId===state.cls.id)
    &&(card.category!=='heal'||state.player.hp<getStats(state).maxHp));
    const normal=available.filter(card=>card.rarity!=='unique'&&card.rarity!=='berserk');
    for(let i=normal.length-1;i>0;i--){
      const j=Math.floor(state.rng()*(i+1));
      [normal[i], normal[j]]=[normal[j], normal[i]];
    }
    const offers=normal.slice(0, 3);
    if(guaranteed.length){
      const guarantee=guaranteed[Math.floor(state.rng()*guaranteed.length)];
      offers[0]=guarantee;
    }
    else if(eligible.length&&state.rng()<(state.boss.def.special?SPECIAL_UNIQUE_CHANCE:UNIQUE_CHANCE))offers[0]=eligible[Math.floor(state.rng()*eligible.length)];
    return [...new Map(offers.filter(Boolean).map(c=>[c.id, c])).values()];
  }
  preview(state: RunState, cardId: string): RunState | null {
    if (state.status !== 'reward') return null;
    const preview = cloneWithPrototype(state);
    preview.cards = { ...state.cards };
    preview.player = cloneWithPrototype(state.player);
    preview.boss = cloneWithPrototype(state.boss);
    preview.feedback = { ...state.feedback };
    preview.offers = [...state.offers];
    preview.hazards = [];
    preview.projectiles = [];
    preview.attacks = state.attacks.map(attack => ({ ...attack }));
    preview.particles = [];
    preview.events = [...state.events];
    return this.choose(preview, cardId) ? preview : null;
  }
  choose(state: RunState, cardId: string): boolean {
    if(state.status!=='reward'||state.stage>=state.stageCount-1) return false;
    const card=state.offers.find(c=>c.id===cardId);
    if(!card || (state.cards[cardId]||0)>=card.maxStacks) return false;
    if(card.rarity==='unique'&&(!CLASS_UNIQUES[state.cls.id]?.includes(card.id)||Object.values(CLASS_UNIQUES).flat().filter(id=>(state.cards[id]||0)>0).length>=2))return false;
    const before=getStats(state);
    state.cards[cardId]=(state.cards[cardId]||0)+1;
    const after=getStats(state);
    state.player.maxHp=after.maxHp;
    const heal=card.category==='maxHP'?Math.max(0, after.maxHp-before.maxHp):card.category==='heal'?20:0;
    state.player.hp=Math.min(after.maxHp, state.player.hp+heal*after.healingMultiplier);
    cleanupEncounter(state);
    state.stage++;
    state.stageTime = 0;
    state.stormExposure = 0;
    state.stormContact = false;
    const def=BOSSES[CAMPAIGN.stages[state.stage]];
    state.boss = new Boss(def);
    state.boss.slowTime = 0;
    state.status='playing';
    state.offers=[];
    state.hazards.length=0;
    state.projectiles.length=0;
    state.attacks.length=0;
    state.particles.length=0;
    state.player.resetForStage(getStats(state).magazine);
    state.feedback={shake:0, flash:0, impact:0, melee:0};
    return true;
  }
}
// Preview shares only immutable content and RNG functions; choosing a card consumes no RNG.
// ── 고정 스텝 시계 ────────────────────────────────────────
/** Keep the entity API in previews while isolating mutable state. */
function cloneWithPrototype<T extends object>(source: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(source)), source);
}
const rewards = new RewardSystem();
export function makeOffers(state: RunState): CardDefinition[] {
return rewards.offers(state);
}
export function chooseCard(state: RunState, cardId: string): boolean {
return rewards.choose(state, cardId);
}
export function previewReward(state: RunState, cardId: string): RunState | null {
return rewards.preview(state, cardId);
}
