import { CAMPAIGN, CLASSES } from './content.mjs';

export const isFullClear=run=>Boolean(run&&!run.tutorial&&!run.olympus&&run.status==='won'&&run.stage===CAMPAIGN.stages.length-1&&run.bossesCleared===CAMPAIGN.stages.length);

export function buildRecord(run,nickname,id) {
  if(!isFullClear(run))throw new Error('20보스를 모두 클리어한 실전 기록만 등록할 수 있습니다.');
  nickname=nickname.normalize('NFC').trim();
  if(!/^[\p{L}\p{N} _-]{2,16}$/u.test(nickname))throw new Error('닉네임은 글자·숫자·공백·_·-로 2~16자 입력하세요.');
  return {id,nickname,classId:run.cls.id,weaponId:run.weapon.id,hits:run.hitsTaken,durationMs:Math.round(run.time*1000),clearedStages:run.bossesCleared};
}

async function request(options) {
  let response;
  try {response=await fetch('/api/leaderboard/v2',{...options,signal:AbortSignal.timeout(8000)});}
  catch {throw new Error('네트워크 연결을 확인하고 다시 시도하세요. 등록 재시도는 같은 닉네임을 사용하세요.');}
  let data;
  try {data=await response.json();}catch{throw new Error('랭킹 응답을 읽지 못했습니다. 잠시 후 다시 시도하세요.');}
  if(!response.ok) {
    const messages={storage_unavailable:'기록 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',rate_limited:'등록 요청이 많습니다. 1분 후 같은 닉네임으로 다시 시도하세요.',id_conflict:'이미 다른 내용으로 등록된 기록입니다. 랭킹을 확인하세요.',invalid_record:'기록 형식이나 닉네임이 올바르지 않습니다.',origin_denied:'현재 게임 주소에서는 기록을 등록할 수 없습니다.'};
    throw new Error(messages[data?.error]||(typeof data?.error==='string'?data.error:'랭킹 서버에 연결하지 못했습니다.'));
  }
  return data;
}

export async function loadLeaderboard() {
  const data=await request({method:'GET'});
  if(!Array.isArray(data?.entries)||data.entries.length>100||!data.entries.every(e=>e&&typeof e.nickname==='string'&&[...e.nickname].length>=2&&[...e.nickname].length<=16&&Number.isSafeInteger(e.hits)&&e.hits>=0&&Number.isSafeInteger(e.durationMs)&&e.durationMs>0&&CLASSES.some(c=>c.id===e.classId&&c.weapons.some(w=>w.id===e.weaponId))))throw new Error('랭킹 응답 형식이 올바르지 않습니다.');
  return data.entries;
}

export async function submitRecord(record) {
  const data=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
  if(data?.entry?.id!==record.id||!Number.isSafeInteger(data.rank)||data.rank<1||typeof data.retained!=='boolean')throw new Error('기록 등록 응답을 확인하지 못했습니다. 같은 닉네임으로 다시 시도하세요.');
  return data;
}
