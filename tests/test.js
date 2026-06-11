/* cell-quest 테스트 하니스
   index.html의 <script>를 Node vm에서 실행해 데이터 정합성·핵심 로직을 검사한다.
   실행: node tests/test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('script 블록을 찾지 못했다'); process.exit(1); }

/* ── 최소 DOM 스텁 ── */
function makeEl() {
  return {
    textContent: '', className: '', value: '', _innerHTML: '',
    style: {}, dataset: {}, contentEditable: 'false', onclick: null, onfocus: null,
    set innerHTML(v) { this._innerHTML = v; }, get innerHTML() { return this._innerHTML; },
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    addEventListener(){}, focus(){}, blur(){}, click(){},
  };
}
const ROWS = 32, COLS = 11;
const tds = [];
for (let r = 1; r <= ROWS; r++) for (let c = 0; c < COLS; c++) {
  const td = makeEl();
  td.dataset = { r: String(r), c: String(c) };
  tds.push(td);
}
const byId = {};
['sheet','namebox','fxcontent','statustext','dlg','dlgtext','dlgok','dlgtitle','dlgdesc','tname'].forEach(id => byId[id] = makeEl());
byId.sheet.querySelectorAll = sel => (sel === 'td' ? tds : []);
const documentStub = {
  getElementById: id => byId[id] || makeEl(),
  querySelectorAll: sel => (sel === 'td' ? tds : []),
  addEventListener(){},
};
const localStorageStub = (() => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
})();

const sandbox = {
  document: documentStub,
  localStorage: localStorageStub,
  fetch: async () => ({ ok: true, json: async () => null }),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  setTimeout, clearTimeout, console,
  escape: global.escape, unescape: global.unescape,
};
const ctx = vm.createContext(sandbox);
vm.runInContext(m[1], ctx, { filename: 'index.html(script)' });

/* ── 테스트 러너 ── */
let pass = 0, fail = 0;
sandbox.__report = (name, ok, detail) => {
  if (ok) { pass++; }
  else { fail++; console.log(`  ✗ FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
};

const TESTS = `
const T = (name, fn) => { try { const r = fn(); __report(name, r === undefined || !!r, r === false ? '' : undefined); } catch (e) { __report(name, false, String(e && e.message || e)); } };
const TYPES = ['카페인','서류','전자','야근'];

/* ── 데이터 정합성 ── */
T('종족 수 180종 이상 (대확장 반영)', () => ALL_SIDS.length >= 180);
T('모든 종족: 타입·스탯·기술 유효', () => ALL_SIDS.every(sid => {
  const s = SPECIES[sid];
  return TYPES.includes(s.type) && s.hp > 0 && s.atk > 0 && Array.isArray(s.moves) && s.moves.length >= 2
    && s.moves.every(mv => typeof mv[0] === 'number' && typeof mv[1] === 'string' && mv[2] > 0 && (mv[3] === null || TYPES.includes(mv[3])));
}));
T('모든 진화 대상 존재', () => ALL_SIDS.every(sid => !SPECIES[sid].evo || (SPECIES[SPECIES[sid].evo.to] && SPECIES[sid].evo.lv > 0)));
T('모든 돌연변이 대상 존재', () => ALL_SIDS.every(sid => {
  const e = SPECIES[sid].evo;
  return !e || !e.mut || (SPECIES[e.mut.to] && e.mut.p > 0 && e.mut.p < 1);
}));
T('돌연변이종이 정규 진화종보다 공격력이 높다', () => ALL_SIDS.every(sid => {
  const e = SPECIES[sid].evo;
  if (!e || !e.mut) return true;
  return SPECIES[e.mut.to].atk > SPECIES[e.to].atk;
}));
T('층 42개 (사무실6 + 이세계9 + 신계6 + 공허6 + 리부트7 + 무한루프8)', () => FLOORS.length === 42);
T('층-보스 인덱스 일치', () => FLOORS.every((f, i) => f.boss === i));
T('모든 탐색 풀 종족 존재·레벨 범위 유효', () => FLOORS.every(f => f.areas.every(a =>
  a.lv[0] <= a.lv[1] && a.pool.every(sid => !!SPECIES[sid]))));
T('보스 42명, 파티 종족 존재', () => BOSSES.length === 42 && BOSSES.every(B => B.party.every(([sid]) => !!SPECIES[sid])));
T('난이도: 모든 보스 파티 3마리 이상', () => BOSSES.every(B => B.party.length >= 3));
T('난이도: 3층 이후 보스는 4마리 이상', () => BOSSES.every((B, i) => i < 2 || B.party.length >= 4));
T('난이도: 모든 보스 강화 배율 1.1 이상', () => BOSSES.every(B => (B.mult || 1) >= 1.1));
T('난이도: 보스 파티 타입 2종 이상 (전원 야근은 양방향 상성이라 허용)', () => BOSSES.every(B => {
  const types = new Set(B.party.map(([sid]) => SPECIES[sid].type));
  return types.size >= 2 || (types.size === 1 && types.has('야근'));
}));
T('스토리 44개·진행 라벨 44개 (6부까지)', () => STORY.length === 44 && PROG_LABEL.length === 44);
T('최종 스토리 인덱스 범위 내 (4부 진엔딩)', () => { G.story = 27; G.isekai = true; const i = storyIdx(); G.story = 0; G.isekai = false; return i === 28 && i < STORY.length; });
T('6부 진엔딩 스토리 인덱스 (옴니루프 격파)', () => { G.story = 42; G.isekai = true; const i = storyIdx(); G.story = 0; G.isekai = false; return i === 43 && i === STORY.length - 1; });

/* ── 등급/합성 ── */
T('야생 등급 룰렛 유효값만 반환', () => { for (let i = 0; i < 1000; i++) { if (!RARITY[rollRarity()]) return false; } return true; });
T('합성 등급 룰렛: 재료 등급보다 낮아지지 않는다', () => {
  for (let i = 0; i < 500; i++) {
    if (RARITY[rollFuseRarity('prism')].rank < RARITY.prism.rank) return false;
    if (rollFuseRarity('legend') !== 'legend') return false;
  }
  return true;
});
T('합성 레시피: 재료·결과 종족 존재, 결과는 합성 전용', () => FUSION_RECIPES.every(rc =>
  rc.mats.every(s => !!SPECIES[s]) && SPECIES[rc.to] && SPECIES[rc.to].fusion === true));
T('합성 전용종은 같은 구간 야생종보다 강하다 (카페그리핀 vs 라떼호랑이)', () =>
  SPECIES.cafegriffin.hp > SPECIES.latte.hp && SPECIES.cafegriffin.atk > SPECIES.latte.atk);
T('레전드 개체 생성 시 특성 부여', () => { const mm = makeMon('espresso', 5, 'legend'); return !!mm.trait && !!TRAITS[mm.trait]; });

/* ── 성장/전투 ── */
T('필요 경험치 단조 증가', () => { for (let l = 1; l < 140; l++) { if (expNeed(l + 1) <= expNeed(l)) return false; } return true; });
T('스탯 레벨 비례 증가', () => { const a = statsFor('espresso', 1), b = statsFor('espresso', 50); return b.maxhp > a.maxhp && b.atk > a.atk; });
T('상성 삼각: 카페인>서류, 역상성 감소, 야근 양방향 1.3', () =>
  typeMult('카페인','서류') === 1.5 && typeMult('서류','카페인') === 0.67 && typeMult('야근','전자') === 1.3 && typeMult('전자','야근') === 1.3);
T('데미지 최소 1 보장', () => { const a = makeMon('mixrat', 1), d = makeMon('phoenix', 90); return dmgCalc(a, 40, null, d).val >= 1; });
T('야생 AI 똑똑함 확률 상향 (코드 검사)', () => true /* enemyTurn 내 0.8/0.5 — 아래 소스 검사로 대체 */);

/* ── 보스전: 배율·재대결 ── */
T('보스 강화 배율 적용', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.name = 'T';
  startBossBattle(0);
  const base = statsFor(BOSSES[0].party[0][0], BOSSES[0].party[0][1]);
  const ok = G.battle && G.battle.enemyParty.length === BOSSES[0].party.length && G.battle.enemy.maxhp > base.maxhp;
  G.battle = null; return ok;
});
T('재대결: 레벨·배율 추가 상승', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.name = 'T';
  startBossBattle(0); const normalHp = G.battle.enemy.maxhp, normalLv = G.battle.enemy.lv;
  startBossBattle(0, true); const revHp = G.battle.enemy.maxhp, revLv = G.battle.enemy.lv;
  const ok = revLv === normalLv + REVENGE_LV_BONUS && revHp > normalHp && G.battle.revenge === true;
  G.battle = null; return ok;
});
T('재대결은 스토리를 진행시키지 않는다', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.name = 'T'; G.story = 5;
  startBossBattle(0, true);
  G.battle.eIdx = G.battle.enemyParty.length - 1; G.battle.enemy = G.battle.enemyParty[G.battle.eIdx];
  onTrainerMonDown();
  const ok = G.story === 5 && G.battle.over;
  G.battle = null; return ok;
});

/* ── 연승 보너스 ── */
T('연승 배율: 0연승=1.0, 10연승 이상=1.3', () => { G.streak = 0; const a = streakMult(); G.streak = 15; const b = streakMult(); G.streak = 0; return a === 1 && b === 1.3; });
T('야생 승리 시 연승 증가, 보상에 배율 반영', () => {
  newGame(); G.party = [makeMon('espresso', 30)]; G.streak = 10;
  const before = G.money;
  G.battle = { enemy: makeMon('mixrat', 10), wild: true, over: false, menu: 'main', lead: 0 };
  G.log = []; winWild();
  const gained = G.money - before;
  const ok = G.streak === 11 && gained >= Math.round(10 * 15 * 1.3);
  G.battle = null; return ok;
});

/* ── 아이템/경제 ── */
T('신규 아이템 정의 (신계클립·엘릭서)', () => ITEM_DEF.godclip && ITEM_DEF.elixir && CLIP_MULT.godclip === 6);
T('새 게임 상태에 streak·신규 아이템 포함', () => { newGame(); return G.streak === 0 && G.items.godclip === 0 && G.items.elixir === 0; });
T('구버전 저장 마이그레이션 (godclip/elixir/streak 보충)', () => {
  const old = { v: 3, party: [], box: [], items: { clip: 1 }, dex: {}, rarDex: {} };
  const mig = migrateSave(old);
  return mig.items.godclip === 0 && mig.items.elixir === 0 && mig.streak === 0 && typeof mig.playMs === 'number';
});
T('정수기 가격 차원별 차등', () => {
  newGame();
  G.floor = 0;  if (coolerRefillCost() !== 300) return false;
  G.floor = 6;  if (coolerRefillCost() !== 600) return false;
  G.floor = 11; if (coolerRefillCost() !== 900) return false;
  G.floor = 15; if (coolerRefillCost() !== 1500) return false;
  G.floor = 21; if (coolerRefillCost() !== 2500) return false;
  G.floor = 0; return true;
});
T('회복 시설 이름 차원별 변화', () => {
  newGame();
  G.floor = 0; const a = coolerName(); G.floor = 7; const b = coolerName(); G.floor = 22; const c = coolerName();
  G.floor = 0; return a === '정수기' && b === '마나샘' && c === '공허샘';
});
T('도감 보상 단계가 전체 종 수 이내', () => ALL_SIDS.length > 160);

/* ── 전설 도감/랭킹 ── */
T('전설 종족 37종, 전부 입수처 등록', () => {
  const legends = ALL_SIDS.filter(s => SPECIES[s].legend);
  return legends.length === 37 && legends.every(s => !!LEGEND_ROUTE[s]);
});
T('legend species rarity multiplier is capped', () => {
  const normalLegendSpecies = statsFor('wontaebo4', 40, 'normal');
  const rareLegendSpecies = statsFor('wontaebo4', 40, 'legend');
  const normalSpecies = statsFor('espresso', 40, 'normal');
  const rareNormalSpecies = statsFor('espresso', 40, 'legend');
  return rareLegendSpecies.atk < Math.round(normalLegendSpecies.atk * RARITY.legend.mult)
    && rareLegendSpecies.atk === Math.round(normalLegendSpecies.atk * LEGEND_SPECIES_RAR_MULT_CAP)
    && rareNormalSpecies.atk === Math.round(normalSpecies.atk * RARITY.legend.mult);
});

/* ── v6.0 5·6부 (리부트/무한루프) 확장 ── */
T('5·6부 신규 전설 앵커 15종 존재·legend 플래그', () =>
  ['rbaCacheadminVoid','rbaRollbackchiefNull','rbaSnapchiefFrost','rbaSudoadminRoot','rbbResetwyrm','rbbFormatlord','rbbRootreset',
   'lpaDeadlockus','lpaSegfaultor','lpaRacemaster','lpaSingularis','lpbTimeoutreaper','lpbDeadlocklordEternal','lpbPanickingArchon','lpbOmniloop']
   .every(s => SPECIES[s] && SPECIES[s].legend === true));
T('진엔딩 최종보스 옴니루프가 공허 의장 널보다 강하다', () =>
  SPECIES.lpbOmniloop.hp > SPECIES.nullchairman.hp && SPECIES.lpbOmniloop.atk > SPECIES.nullchairman.atk);
T('5·6부 합성 전용종 4종 존재(fusion 플래그)', () =>
  ['rbaResetcerberus','rbbPurgewight','lpaSingularitymoth','lpbBusyspecter'].every(s => SPECIES[s] && SPECIES[s].fusion === true));
T('5·6부 늦은 진화: lv150/175/200 진화 라인 존재', () => {
  const lv = sid => SPECIES[sid] && SPECIES[sid].evo && SPECIES[sid].evo.lv;
  return lv('rbaSnapfly') === 150 && lv('lpaNullpointer') === 175 &&
    ALL_SIDS.some(s => SPECIES[s].evo && SPECIES[s].evo.lv === 200);
});
T('차원 6개: 5부(need27)·6부(need34) 추가', () =>
  DIMENSIONS.length === 6 &&
  DIMENSIONS[4].from === 27 && DIMENSIONS[4].to === 33 && DIMENSIONS[4].need === 27 && DIMENSIONS[4].isekai === true &&
  DIMENSIONS[5].from === 34 && DIMENSIONS[5].to === 41 && DIMENSIONS[5].need === 34 && DIMENSIONS[5].isekai === true);
T('5·6부 보스 13층 진화레벨 정합 (보스 파티원 전부 진화 요구레벨 이상)', () => {
  const minLv = {};
  for (const sid of ALL_SIDS) { const e = SPECIES[sid].evo; if (e) { minLv[e.to] = Math.max(minLv[e.to] || 1, e.lv); if (e.mut) minLv[e.mut.to] = Math.max(minLv[e.mut.to] || 1, e.lv); } }
  return BOSSES.slice(27).every(B => B.party.every(([sid, lv]) => lv >= (minLv[sid] || 1)));
});
T('6부 진엔딩 허브 렌더 (옴니루프 직전, 41층)', () => {
  newGame(); G.party = [makeMon('espresso', 200)]; G.isekai = true; G.story = 41; G.floor = 41; G.screen = 'hub'; render(); return true;
});
T('6부 진엔딩 화면 렌더 (옴니루프 격파)', () => {
  newGame(); G.party = [makeMon('espresso', 200)]; G.isekai = true; G.story = 42; G.screen = 'ending'; render(); return true;
});
T('5·6부 합성 레시피 8종 추가 (결과 fusion:true · 재료 존재)', () => {
  const news = ['rbaResetcerberus', 'rbbPurgewight', 'rbRebirthphoenix', 'rbSudowyrm', 'lpaSingularitymoth', 'lpbBusyspecter', 'lpInfinitedragon', 'lpHaltingangel'];
  return news.every(r => {
    const rc = FUSION_RECIPES.find(x => x.to === r);
    return rc && rc.mats.every(s => !!SPECIES[s]) && SPECIES[r] && SPECIES[r].fusion === true;
  });
});

/* ── v6.0 비동기 PvP 아레나 ── */
T('아레나: reconstructMon — 스냅샷 복원(종족·레벨·등급·특성·도핑)', () => {
  const m = reconstructMon({ s: 'espresso', l: 50, r: 'gold', t: '흡혈', d: 1.5 });
  const base = statsFor('espresso', 50, 'gold');
  return m && m.sid === 'espresso' && m.lv === 50 && m.rar === 'gold' && m.trait === '흡혈'
    && m.dope === 1.5 && m.atk === Math.max(1, Math.round(base.atk * 1.5)) && m.hp === m.maxhp;
});
T('아레나: 잘못된 스냅샷 null · 도핑 상한 적용', () =>
  reconstructMon({ s: '없는종' }) === null && reconstructMon(null) === null
  && reconstructMon({ s: 'espresso', l: 50, d: 99 }).dope === ARENA_DOPE_CAP);
T('아레나: 그림자 사원 폴백 — 항상 내 파티 거울 생성', () => {
  newGame(); G.party = [makeMon('espresso', 30), makeMon('gyeoljae', 28)];
  const foe = arenaShadowFoe();
  return foe.party.length === 2 && foe.party[0].s === 'espresso' && foe.shadow === true;
});
T('아레나: 전투 시작 — arena 플래그·적 파티·전투 화면·보상>0', () => {
  newGame(); G.party = [makeMon('espresso', 50)];
  startArenaBattle({ name: '테스트사원', party: [{ s: 'wifi', l: 40, r: 'normal', t: null, d: 1 }, { s: 'gyeoljae', l: 42, r: 'normal', t: null, d: 1 }] });
  return G.battle && G.battle.arena === true && G.battle.enemyParty.length === 2 && G.screen === 'battle' && G.battle.foeReward > 0;
});
T('아레나: 승리 보상 — arenaWins↑·복지P↑·스토리 진행도 불변', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.story = 3;
  const money0 = G.money, story0 = G.story;
  startArenaBattle({ name: '테스트사원', party: [{ s: 'wifi', l: 10, r: 'normal', t: null, d: 1 }] });
  G.battle.eIdx = G.battle.enemyParty.length - 1;
  onTrainerMonDown();
  return G.arenaWins === 1 && G.money > money0 && G.story === story0 && G.battle.over === true;
});
T('아레나 화면 렌더 (보드 비었을 때 그림자 폴백)', () => {
  newGame(); G.party = [makeMon('espresso', 40)]; rankCache = []; G.screen = 'arena'; render(); return true;
});
T('migrateSave: arenaWins 기본값 보충', () => {
  const o = {}; migrateSave(o); return o.arenaWins === 0;
});
T('v6.0 버전 — 패치노트 최신·위장 제목 자동 반영', () =>
  PATCH_NOTES[0].ver === 'v6.0' && GAME_VERSION === 'v6.0');

/* ── v6.1 일일 도전 + 출석 스트릭 ── */
function ymd(offsetDays) { const d = new Date(); d.setDate(d.getDate() + offsetDays); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
T('일일: rollDailyMissions 결정론적·3개·중복 없음', () => {
  const a = rollDailyMissions('2026-06-11'), b = rollDailyMissions('2026-06-11');
  return a.length === 3 && JSON.stringify(a.map(m => m.type + (m.sub || ''))) === JSON.stringify(b.map(m => m.type + (m.sub || '')))
    && new Set(a.map(m => m.type + (m.sub || ''))).size === 3;
});
T('일일: dailyCheck — 날짜 바뀌면 미션 갱신·스트릭+1(연속)', () => {
  newGame(); G.daily = { date: ymd(-1), streak: 5, missions: [] };
  dailyCheck();
  return G.daily.date === todayStr() && G.daily.missions.length === 3 && G.daily.streak === 6;
});
T('일일: 스트릭 끊김(2일+ 공백)이면 1로 리셋', () => {
  newGame(); G.daily = { date: '2000-01-01', streak: 9, missions: [] };
  dailyCheck();
  return G.daily.streak === 1;
});
T('일일: 같은 날 재호출은 무변경(중복 보상 없음)', () => {
  newGame(); dailyCheck(); const m0 = G.money, ms = G.daily.missions;
  dailyCheck();
  return G.money === m0 && G.daily.missions === ms;
});
T('일일: dailyProgress — 목표 도달 시 done, 타입 불일치는 무시', () => {
  newGame(); G.daily = { date: todayStr(), streak: 1, missions: [{ id: 0, type: 'win', sub: null, target: 2, prog: 0, done: false, claimed: false, label: 'x', money: 1000, item: null, qty: 0 }] };
  dailyProgress('catch', 5);
  const mid = G.daily.missions[0].prog;
  dailyProgress('win', 1); dailyProgress('win', 1);
  return mid === 0 && G.daily.missions[0].prog === 2 && G.daily.missions[0].done === true;
});
T('일일: typecatch는 타입 일치할 때만 진행', () => {
  newGame(); G.daily = { date: todayStr(), streak: 1, missions: [{ id: 0, type: 'typecatch', sub: '카페인', target: 1, prog: 0, done: false, claimed: false, label: 'x', money: 1, item: null, qty: 0 }] };
  dailyProgress('typecatch', 1, { type: '서류' });
  const a = G.daily.missions[0].prog;
  dailyProgress('typecatch', 1, { type: '카페인' });
  return a === 0 && G.daily.missions[0].done === true;
});
T('일일: claimDaily — 완료 미션 보상 1회만 지급', () => {
  newGame(); G.money = 0; G.daily = { date: todayStr(), streak: 1, missions: [{ id: 0, type: 'win', sub: null, target: 1, prog: 1, done: true, claimed: false, label: 'x', money: 1000, item: 'clip', qty: 2 }] };
  const clip0 = G.items.clip || 0;
  claimDaily(0); const after = G.money;
  claimDaily(0);
  return G.daily.missions[0].claimed === true && after > 0 && G.money === after && (G.items.clip || 0) === clip0 + 2;
});
T('migrateSave: daily 기본값 보충', () => { const o = {}; migrateSave(o); return o.daily && o.daily.date === '' && Array.isArray(o.daily.missions); });
T('일일 도전 화면 렌더', () => { newGame(); G.party = [makeMon('espresso', 10)]; G.screen = 'daily'; render(); return true; });

/* ── v6.1 탐색 랜덤 이벤트 ── */
T('이벤트: 버려진 몬스터 무료 포획 — 합류·도감·일일진행', () => {
  newGame(); G.party = []; G.daily = { date: todayStr(), streak: 1, missions: [{ id: 0, type: 'catch', sub: null, target: 1, prog: 0, done: false, claimed: false, label: 'x', money: 1, item: null, qty: 0 }] };
  const toParty = eventTakeAbandon({ type: 'abandon', sid: 'wifi', lv: 10 });
  return toParty === true && G.party.length === 1 && G.party[0].sid === 'wifi' && G.dex.wifi === 2 && G.daily.missions[0].prog === 1;
});
T('이벤트: 수수께끼 상인 — 구매 차감·지급, 특가<정상', () => {
  newGame(); G.money = 100000;
  const normal = merchantPrice({ good: ['goldclip', 2], bargain: false });
  const bargain = merchantPrice({ good: ['goldclip', 2], bargain: true });
  const g0 = G.items.goldclip || 0, m0 = G.money;
  const ok = eventBuy({ good: ['goldclip', 2], bargain: true });
  return bargain < normal && ok === true && (G.items.goldclip || 0) === g0 + 2 && G.money === m0 - bargain;
});
T('이벤트: 상인 — 포인트 부족 시 구매 불가', () => {
  newGame(); G.money = 0; return eventBuy({ good: ['dimclip', 1], bargain: false }) === false;
});
T('이벤트: 도박꾼 — 승리 2배·패배 차감(음수 없음)', () => {
  newGame(); G.money = 5000; eventGamble(3000, true); const win = G.money;
  G.money = 1000; eventGamble(3000, false); const lose = G.money;
  return win === 8000 && lose === 0;
});
T('이벤트: 행운의 상자 — 보상(P 또는 아이템) 지급', () => {
  newGame(); const m0 = G.money, items0 = Object.values(G.items).reduce((a, b) => a + b, 0);
  eventLuckyOpen();
  return G.money > m0 || Object.values(G.items).reduce((a, b) => a + b, 0) > items0;
});
T('이벤트: eventLead — 살아있는 선두 반환', () => {
  newGame(); G.party = [makeMon('espresso', 10)]; G.active = 0;
  return eventLead() === G.party[0];
});
T('이벤트 화면 렌더 — 5종 + 결과 화면 크래시 없음', () => {
  newGame(); G.party = [makeMon('espresso', 30)];
  for (const ev of [{ type: 'lucky' }, { type: 'abandon', sid: 'wifi', lv: 10 }, { type: 'merchant', good: ['goldclip', 2], bargain: true }, { type: 'gamble', bet: 3000 }, { type: 'peddler' }]) {
    curEvent = ev; G.screen = 'event'; render();
  }
  curEvent.done = true; curEvent.msg = 'x'; render();
  return true;
});

/* ── 패치 이벤트 2: 디톡스 + 의문의 머리카락 ── */
T('디톡스 앰플: 도핑 배율·횟수 초기화', () => {
  newGame(); const mm = makeMon('espresso', 20);
  const baseAtk = mm.atk;
  applyDope(mm, { mult: 1.2, msg: '' }); applyDope(mm, { mult: 1.2, msg: '' });
  if (mm.dopeN !== 2 || mm.atk <= baseAtk) return false;
  applyDetox(mm);
  return mm.dope === 1 && mm.dopeN === 0 && mm.atk === baseAtk;
});
T('머리카락 진화 성공: 장발 원태보 탄생 + 머리카락 5개 소모', () => {
  newGame(); const mm = makeMon('wontaebo3', 40, 'legend'); G.party = [mm]; G.items.hair = 7;
  const orig = Math.random; Math.random = () => 0.1; /* 40% 미만 → 성공 */
  const msg = tryHairEvolution(mm);
  Math.random = orig;
  return mm.sid === 'wontaebo4' && G.items.hair === 2 && /최종 진화/.test(msg) && G.dex.wontaebo4 === 2;
});
T('머리카락 진화 실패: 머리카락만 소모, 종족 유지', () => {
  newGame(); const mm = makeMon('wontaebo3', 40); G.party = [mm]; G.items.hair = 5;
  const orig = Math.random; Math.random = () => 0.9; /* 40% 이상 → 실패 */
  const msg = tryHairEvolution(mm);
  Math.random = orig;
  return mm.sid === 'wontaebo3' && G.items.hair === 0 && /실패/.test(msg);
});
T('머리카락 부족/대상 아님이면 진화 시도 불가', () => {
  newGame(); const mm = makeMon('wontaebo3', 40); G.items.hair = 4;
  if (tryHairEvolution(mm) !== null) return false;
  G.items.hair = 5; return tryHairEvolution(makeMon('espresso', 40)) === null;
});
T('의문의 머리카락은 매점에서 팔지 않는다', () => ITEM_DEF.hair.nosale === true && ITEM_DEF.detox.price > 0);
T('패치 보상 2탄: 허브 진입 시 디톡스 1개 지급', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'hub'; render();
  return G.gifts.patch2 === true && G.items.detox >= 1;
});
T('전설 도감 화면 렌더 (스모크)', () => { newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'ldex'; render(); return true; });
T('랭킹 보드 렌더: 희귀도 3종·플레이타임 표시 (스모크)', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.name = 'T';
  rankCache = [{ name: 'T', wins: 3, dex: 10, gold: 1, prism: 2, leg: 3, money: 12345, pt: 3700000, story: 28 }];
  paintRank(); return true;
});
T('구버전 랭킹 기록도 렌더 가능 (gold만 있는 항목)', () => {
  rankCache = [{ name: 'old', wins: 1, dex: 5, gold: 4, story: 3 }];
  rankSel = -1; paintRank(); rankCache = null; return true;
});
T('랭킹 상세: 파티 스냅샷 렌더 (선두·등급·특성·도핑)', () => {
  rankCache = [{ name: 'T', wins: 9, dex: 20, story: 10, money: 7777, pt: 120000, lead: 1,
    party: [{ s: 'espresso', l: 12, r: 'gold', t: null, d: 1 }, { s: 'phoenix', l: 30, r: 'legend', t: '흡혈', d: 1.21 }] }];
  rankSel = 0; paintRank(); rankSel = -1; rankCache = null; return true;
});
T('랭킹 상세: 알 수 없는 종족·파티 없는 구기록도 안전', () => {
  rankCache = [
    { name: 'A', story: 2, party: [{ s: 'not_a_species', l: 5, r: 'weird_rar' }], lead: 0 },
    { name: 'B', story: 2 },
  ];
  rankSel = 0; paintRank();
  rankSel = 1; paintRank();
  rankSel = -1; rankCache = null; return true;
});
T('플레이타임 포맷', () => fmtPlayTime(3600000) === '1시간 0분' && fmtPlayTime(59000) === '0분');

/* ── 화면 스모크 ── */
T('허브 렌더 (1층)', () => { newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'hub'; G.floor = 0; render(); return true; });
T('허브 렌더 (공허 26층 · 재대결 노출)', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.isekai = true; G.story = 27; G.floor = 26; G.screen = 'hub'; render(); return true;
});
T('차원 이동: 신계·공허는 해금 전 숨김', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.isekai = true; G.story = 11; G.screen = 'moveFloor'; render(); return true;
});
T('엔딩 렌더 (4부 진엔딩)', () => { newGame(); G.party = [makeMon('espresso', 99)]; G.isekai = true; G.story = 27; G.screen = 'ending'; render(); return true; });
T('도감 렌더 (3페이지 분할)', () => { newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'dex'; render(); return true; });
T('백업 코드 왕복 (인코딩/디코딩)', () => {
  newGame(); G.party = [makeMon('espresso', 7)]; G.name = '테스트';
  const code = encodeSave(); const back = decodeSave(code);
  return back.name === '테스트' && back.party.length === 1;
});
T('게임오버 화면: 렌더 반복해도 포인트 중복 차감 없음', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.money = 1000; G.screen = 'gameover';
  render(); const a = G.money; render(); const b = G.money;
  return a === 1000 && b === 1000;
});

/* ── v5.3: 핫픽스 / 밸런스 / 보안 ── */
T('탐색 화면 세이브 복원 시 허브로 폴백 (영구 먹통 방지)', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'explore';
  const d = migrateSave(JSON.parse(JSON.stringify(G)));
  resumeSave(d);
  return G.screen === 'hub';
});
T('마이그레이션: dexRewards·dex·items·log 보충 + 닉네임 정제', () => {
  const mig = migrateSave({ v: 3, party: [], name: '<b>해커..#$1234567890' });
  return Array.isArray(mig.dexRewards) && !!mig.dex && !!mig.items && Array.isArray(mig.log)
    && mig.name.length <= 12 && !mig.name.includes('<') && typeof mig.money === 'number';
});
T('마이그레이션: 저장 개체를 현재 HP 곡선으로 재계산 + 최신 버전으로', () => {
  const mig = migrateSave({ v: 3, party: [{ sid: 'espresso', lv: 50, rar: 'normal', maxhp: 384, hp: 384, atk: 99, exp: 0 }], box: [] });
  return mig.v === SAVE_VERSION && mig.party[0].maxhp === statsFor('espresso', 50).maxhp && mig.party[0].hp === mig.party[0].maxhp;
});
T('버전 호환: 과거(v2)·현재·미래(v6) 캐시 모두 유효 판정', () =>
  isValidSave({ v: 2, party: [] }) && isValidSave({ v: 5, party: [] }) && isValidSave({ v: 6, party: [] })
  && !isValidSave({ v: 1, party: [] }) && !isValidSave({ party: [] }) && !isValidSave(null));
T('v5 같은 미래 캐시도 정규화되어 복원 (요아정 케이스)', () => {
  const v5save = { v: 5, name: '요아정박사님', party: [{ sid: 'wontaebo4', lv: 53, rar: 'legend', maxhp: 2460, hp: 2226, atk: 408, dope: 1.757, trait: '흡혈' }], box: [], items: { clip: 1 }, story: 11, isekai: true };
  if (!isValidSave(v5save)) return false;
  const mig = migrateSave(v5save);
  const st = statsFor('wontaebo4', 53, 'legend');
  return mig.v === SAVE_VERSION && mig.party[0].maxhp === Math.round(st.maxhp * 1.757) && mig.party[0].sid === 'wontaebo4';
});
T('전투 중 저장은 전투 직전 스냅샷 (새로고침 무한 파밍 차단)', () => {
  newGame(); G.party = [makeMon('espresso', 30)]; G.name = 'T'; G.money = 1000; G.screen = 'hub';
  startWildBattle(makeMon('mixrat', 5));
  G.money = 99999; /* 전투 중 보상 획득 가정 */
  localSave();
  const saved = JSON.parse(localStorage.getItem('cellquest_save'));
  const ok = saved.money === 1000 && saved.battle === undefined;
  G.battle = null; return ok;
});
T('차원 이동 2단 메뉴: 4부 해금 상태에서도 렌더 (잘림 방지)', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.isekai = true; G.story = 27; G.floor = 26;
  moveDim = -1; G.screen = 'moveFloor'; render();
  moveDim = 3; render();
  moveDim = -1; return true;
});
T('전투 수학: 동레벨 TTK 1.2~8턴 (원턴킬 메타 방지)', () => {
  const samples = [['mixrat',10],['ghost',20],['manaslime',30],['golemknight',40],['pegasusporter',50],
    ['timewraith',60],['seraphmanager',75],['bigbangslime',90],['voidclerk',105],['archiveghoul',118],['omegaslime',130]];
  return samples.every(([sid, lv]) => {
    const st = statsFor(sid, lv);
    const power = Math.max(...SPECIES[sid].moves.filter(mv => mv[0] <= lv).map(mv => mv[2]));
    const ttk = st.maxhp / (st.atk * power / 40);
    return ttk >= 1.2 && ttk <= 8;
  });
});
T('경험치 공유: 선두 100% + 파티원 30% (동레벨, 페널티 없음)', () => {
  newGame(); const a = makeMon('espresso', 10), b = makeMon('gyeoljae', 10);
  G.party = [a, b]; G.active = 0; G.log = [];
  grantExpAndMoney({ lv: 10, rar: 'normal' }, 1);  /* 적 lv10 = 내 lv10, 페널티 없음 */
  return a.exp === 130 && b.exp === 39;
});
T('seraphista keeps four moves after evolution', () => {
  const mon = makeMon('seraphista', 31, 'prism');
  return knownMoves(mon).length === 4;
});
T('돌연변이 천장: 3회 실패 누적 후 확정 발동', () => {
  newGame(); G.mutFail = { kingslime: 3 };
  const evoLv = SPECIES.kingslime.evo.lv;  /* 재배치로 바뀐 진화 레벨을 직접 참조 */
  const mon = makeMon('kingslime', evoLv - 1); G.party = [mon]; G.log = [];
  const orig = Math.random; Math.random = () => 0.99; /* 평소라면 12% 실패 */
  gainExp(mon, expNeed(mon.lv) - mon.exp);
  Math.random = orig;
  return mon.sid === 'chaosslime' && G.mutFail.kingslime === 0;
});
T('재대결 보상 체감: 80% → 40% → … → 최저 10%', () => {
  newGame();
  const r0 = revengeRate(3); G.revN = { 3: 1 }; const r1 = revengeRate(3); G.revN = { 3: 10 }; const r2 = revengeRate(3);
  G.revN = {};
  return Math.abs(r0 - 0.8) < 1e-9 && Math.abs(r1 - 0.4) < 1e-9 && r2 === 0.1;
});
T('연수원 로직: 정확히 1레벨 상승', () => {
  newGame(); const mon = makeMon('espresso', 20); G.party = [mon]; G.log = [];
  gainExp(mon, expNeed(20) - mon.exp);
  return mon.lv === 21;
});
T('연수원·위키 화면 렌더 (스모크)', () => {
  newGame(); G.party = [makeMon('espresso', 20)]; G.money = 99999;
  G.screen = 'academy'; render(); G.screen = 'wiki'; render(); return true;
});
T('보스 파티원은 전부 진화 요구 레벨 이상', () => {
  const minLv = {};
  for (const sid of ALL_SIDS) { const e = SPECIES[sid].evo; if (e) { minLv[e.to] = Math.max(minLv[e.to] || 1, e.lv); if (e.mut) minLv[e.mut.to] = Math.max(minLv[e.mut.to] || 1, e.lv); } }
  return BOSSES.every(B => B.party.every(([sid, lv]) => lv >= (minLv[sid] || 1)));
});
T('normalizeEntry: 악성 랭킹 항목 정규화', () => {
  const e = normalizeEntry({ name: '<b>해커해커해커해커', wins: '많이', story: 9999, money: -1, pt: -5,
    party: [{ s: 'espresso', l: '백', r: 'weird', t: { a: 1 }, d: '2.00' }, null, 'x'] });
  return e.name.length <= 12 && e.wins === 0 && e.story === PROG_LABEL.length - 1 && e.money === 0 && e.pt === 0
    && e.party.length === 1 && e.party[0].l === 0 && e.party[0].r === 'normal' && e.party[0].t === null && e.party[0].d === 1;
});
T('rankCompare: rarity, wins, money, shorter playtime order', () => {
  const base = { name: 'A', story: 5, dex: 10, gold: 1, prism: 1, leg: 1, wins: 1, money: 1, pt: 1000, ts: 1 };
  const betterLegend = { ...base, name: 'B', leg: 2 };
  const betterWins = { ...base, name: 'C', wins: 2 };
  const betterMoney = { ...base, name: 'D', money: 2 };
  const faster = { ...base, name: 'E', pt: 500 };
  return rankCompare(betterLegend, base) < 0 && rankCompare(betterWins, base) < 0
    && rankCompare(betterMoney, base) < 0 && rankCompare(faster, base) < 0;
});
T('박카스: 최대 HP 비율 회복 (정의 갱신)', () => ITEM_DEF.bacchus.desc.includes('35%'));

/* ── v5.4: 경험치 바 + 사내 경품 응모(뽑기) ── */
T('경험치 바: 진행률 표시', () => {
  const m = makeMon('espresso', 10); m.exp = Math.floor(expNeed(10) / 2);
  const bar = expBar(m, 8);
  return bar.length === 8 && bar.includes('▓') && bar.includes('░')
    && expPct(m) === Math.floor(m.exp / expNeed(10) * 100);
});
T('뽑기 가중치 합 = 1000 (0.1% 단위)', () => GACHA_TABLE.reduce((s, r) => s + r[0], 0) === 1000);
T('뽑기: 미해금 클립은 해금된 최고 클립으로 대체', () => {
  newGame(); /* story 0 — 사무실만 해금 */
  if (bestUnlockedClip('godclip') !== 'goldclip' || bestUnlockedClip('prismclip') !== 'goldclip') return false;
  G.isekai = true;
  if (bestUnlockedClip('prismclip') !== 'prismclip' || bestUnlockedClip('godclip') !== 'prismclip') return false;
  G.story = 15;
  return bestUnlockedClip('godclip') === 'godclip';
});
T('뽑기: 꽝·레전드 등급 몬스터 당첨 (확률 구간 검증)', () => {
  newGame(); G.party = [makeMon('espresso', 5)];
  const pools = gachaPools();
  const orig = Math.random;
  let seq = [0.1]; Math.random = () => (seq.length ? seq.shift() : 0.5);
  const miss = drawGachaOnce(pools);
  seq = [0.99, 0];
  const legend = drawGachaOnce(pools);
  Math.random = orig;
  const won = [...G.party, ...G.box].pop();
  return miss.startsWith('꽝') && legend.includes('레전드 등급') && won.rar === 'legend' && won.lv === 1 && !!won.trait;
});
T('뽑기: 특별종 풀 — 초반엔 비어 대체 지급, 전해금 시 합성·돌연변이종만', () => {
  newGame(); G.party = [makeMon('espresso', 5)];
  const early = gachaPools();
  newGame(); G.party = [makeMon('espresso', 99)]; G.isekai = true; G.story = 27;
  const late = gachaPools();
  return early.special.length === 0 && late.special.length >= 15
    && late.special.every(s => !SPECIES[s].legend)
    && late.base.every(s => !SPECIES[s].legend);
});
T('뽑기 화면 렌더 (스모크)', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.money = 5000; G.screen = 'gacha'; render(); return true;
});

/* ── v5.5: 연수원 밸런스 + 확장 단축키 ── */
T('연수원 밸런스: 비용 곡선(제곱)·차원별 레벨 한도', () => {
  newGame();
  const lowCap = academyLvCap();      /* 사무실 1층만 해금 */
  G.isekai = true; G.story = 27;
  const highCap = academyLvCap();     /* 전 차원 해금 */
  const c10 = academyCost(makeMon('espresso', 10)), c100 = academyCost(makeMon('espresso', 100));
  return lowCap < 15 && highCap >= 140 && c10 >= 500 && c100 > c10 * 20;
});
T('연수원: 한도 도달 몬스터는 수강 불가 표시 (렌더)', () => {
  newGame(); G.party = [makeMon('espresso', 99)]; G.money = 999999; G.screen = 'academy'; render(); return true;
});
T('확장 단축키: 1~9 + Q~H, 25개 중복 없음', () =>
  CHOICE_KEYS.length === 25 && new Set(CHOICE_KEYS).size === 25
  && choiceKey(0) === '1' && choiceKey(9) === 'Q' && choiceKey(24) === 'H');

/* ── v5.6: 진화 타이밍 전면 재배치 ── */
T('진화 재배치: 야생종은 출현 최소레벨보다 낮은 진화 없음 (잡자마자 진화 0건)', () => {
  const wild = {};
  FLOORS.forEach(f => f.areas.forEach(a => a.pool.forEach(sid => {
    if (!wild[sid]) wild[sid] = { min: a.lv[0], max: a.lv[1] };
    wild[sid].min = Math.min(wild[sid].min, a.lv[0]);
    wild[sid].max = Math.max(wild[sid].max, a.lv[1]);
  })));
  return ALL_SIDS.every(sid => {
    const e = SPECIES[sid].evo, w = wild[sid];
    return !e || !w || e.lv > w.min;  /* 출현 최소보다는 높아야 = 잡자마자 진화 방지 */
  });
});
T('진화 재배치: 스타터 진화가 늦춰짐 (1차 15, 2차 27)', () =>
  SPECIES.espresso.evo.lv === 15 && SPECIES.latte.evo.lv === 27
  && SPECIES.gyeoljae.evo.lv === 15 && SPECIES.wifi.evo.lv === 15);
T('진화 재배치: 오크십장 오류 수정 (출현 38~41 < 진화 44)', () =>
  SPECIES.orcforeman.evo.lv === 44);
T('진화 재배치: 후반 종 진화가 출현 상단 이상으로 이동 (예시 검증)', () =>
  SPECIES.cherubintern.evo.lv === 77 && SPECIES.voidclerk.evo.lv === 111
  && SPECIES.omegaslime.evo.lv === 135 && SPECIES.pegasusporter.evo.lv === 55);
T('진화 재배치: 2단 진화 라인은 1단보다 충분히 뒤 (간격 ≥5)', () => {
  return ALL_SIDS.every(sid => {
    const e = SPECIES[sid].evo;
    if (!e) return true;
    const e2 = SPECIES[e.to] && SPECIES[e.to].evo;
    return !e2 || (e2.lv - e.lv) >= 5;
  });
});

/* ── v5.7: 앰플 가격·야생 난이도·레벨 차 경험치·조합표 ── */
T('앰플 가격: 수상한 5000P / 디톡스 80000P (재굴림 남용 억제)', () =>
  ITEM_DEF.ample.price === 5000 && ITEM_DEF.detox.price === 80000);
T('레벨 차 경험치 페널티: 양방향 (저레벨 학살·고레벨 사냥 모두 감소)', () => {
  return expLevelFactor(10, 10) === 1 && expLevelFactor(12, 10) === 1
    && expLevelFactor(20, 10) < 0.5 && expLevelFactor(60, 10) === 0.12
    && expLevelFactor(10, 13) === 1            /* 적이 3 높음: 아직 패널티 없음 */
    && expLevelFactor(10, 20) < 1              /* 적이 10 높음: 경험치 감소 */
    && expLevelFactor(10, 100) === 0.4;        /* 너무 높은 적: 최저 0.4 */
});
T('야생 강화: 일반 야생 적 HP/공격 상향, 전설은 소폭', () => {
  newGame(); G.party = [makeMon('espresso', 30)];
  const base = makeMon('mixrat', 20), baseHp = base.maxhp, baseAtk = base.atk;
  startWildBattle(makeMon('mixrat', 20));
  const e = G.battle.enemy;
  const ok = e.maxhp > baseHp && e.atk > baseAtk && e.maxhp === Math.round(baseHp * WILD_HP_MULT);
  G.battle = null; return ok;
});
T('야생 강화분은 포획 시 정상 스탯으로 복원', () => {
  newGame(); G.party = [makeMon('espresso', 50)]; G.items.clip = 99;
  startWildBattle(makeMon('mixrat', 20));
  const buffedHp = G.battle.enemy.maxhp;
  const orig = Math.random; Math.random = () => 0;  /* 포획 확정 */
  throwClip('clip');
  Math.random = orig;
  const caught = [...G.party, ...G.box].find(m => m.sid === 'mixrat');
  const normalHp = statsFor('mixrat', 20).maxhp;
  G.battle = null;
  return caught && caught.maxhp === normalHp && caught.maxhp < buffedHp;
});
T('합성 조합표 화면 렌더 (스모크)', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.dex.latte = 1; G.dex.gian = 2;
  G.screen = 'recipe'; render(); return true;
});

/* ── v5.8: 클라우드 계정 코드 (UUID) ── */
T('UUID 생성: 36자 형식·매번 다름', () => {
  const a = makeUUID(), b = makeUUID();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a) && a !== b;
});
T('코드 set/clear: localStorage 연동', () => {
  setCloudCode('test-uuid-1234567890abcdef');
  const saved = localStorage.getItem('cellquest_cloudcode');
  setCloudCode(null);
  return saved === 'test-uuid-1234567890abcdef' && cloudCode === null
    && localStorage.getItem('cellquest_cloudcode') === null;
});
T('클라우드 계정 화면 렌더 — 미로그인/로그인 양쪽 (스모크)', () => {
  newGame(); G.party = [makeMon('espresso', 5)];
  setCloudCode(null); G.screen = 'cloud'; render();
  setCloudCode('zzzz-uuid-abcdefghijklmnop'); render();
  setCloudCode(null); return true;
});
T('클라우드 코드는 RESUME_SAFE_SCREENS에 포함 (복원 안전)', () =>
  RESUME_SAFE_SCREENS.includes('cloud'));
T('발급 가드: 빈 파티면 저장할 진행 없음으로 판단', () => {
  newGame(); G.party = [];
  if (hasProgressToSave()) return false;
  G.party = [makeMon('espresso', 5)];
  return hasProgressToSave() === true;
});

/* ── v5.9: 전투 중 회복 버그 + 인덱스/세이브 방어 ── */
T('전투 중 모닝커피: 기절한 파티원을 HP 50%로 부활', () => {
  newGame(); G.party = [makeMon('espresso', 20), makeMon('latte', 20)];
  G.items.coffee = 1; G.active = 0;
  startWildBattle(makeMon('mixrat', 5));
  G.party[1].hp = 0;
  useBattleHeal('coffee');
  const ok = G.items.coffee === 0 && G.party[1].hp === Math.ceil(G.party[1].maxhp / 2);
  G.battle = null; return ok;
});
T('전투 중 엘릭서: 가장 상태 나쁜 파티원 완전 회복', () => {
  newGame(); G.party = [makeMon('espresso', 20), makeMon('latte', 20)];
  G.items.elixir = 1; G.active = 0;
  startWildBattle(makeMon('mixrat', 5));
  G.party[1].hp = 1;
  useBattleHeal('elixir');
  const ok = G.items.elixir === 0 && G.party[1].hp === G.party[1].maxhp;
  G.battle = null; return ok;
});
T('removeMon: 선두보다 앞 인덱스 제거 시 active 보정 (같은 선두 유지)', () => {
  newGame(); G.party = [makeMon('espresso', 5), makeMon('latte', 5), makeMon('gian', 5), makeMon('mixrat', 5)];
  G.active = 2; const lead = G.party[2];   /* 선두는 가운데(gian), 마지막이 아님 */
  removeMon(G.party[0]);                    /* 선두보다 앞(espresso) 제거 */
  return G.party[G.active] === lead;
});
T('migrateSave: 손상된 floor/active 범위 보정', () => {
  const mig = migrateSave({ v: 5, party: [makeMon('espresso', 5)], box: [], floor: 999, active: 50 });
  return mig.floor === FLOORS.length - 1 && mig.active === 0;
});

/* ── v5.9: 도핑 너프 + 레벨차 데미지 패널티 ── */
T('도핑 너프: 5회 유지·확률 합 1·기대값 1 미만·실패 확률 우세(>50%)', () => {
  const sumP = DOPE_OUTCOMES.reduce((s, o) => s + o.p, 0);
  const ev = DOPE_OUTCOMES.reduce((s, o) => s + o.p * o.mult, 0);
  const failP = DOPE_OUTCOMES.filter(o => o.mult < 1).reduce((s, o) => s + o.p, 0);
  const maxGain = Math.max(...DOPE_OUTCOMES.map(o => o.mult));
  return DOPE_MAX === 5 && Math.abs(sumP - 1) < 1e-9 && ev < 1 && failP > 0.5 && maxGain <= 1.15;
});
T('레벨차 데미지 패널티 함수: 고레벨 적이면 감소, 동급 이하는 1', () => {
  return levelDmgFactor(10, 10) === 1 && levelDmgFactor(20, 10) === 1
    && levelDmgFactor(10, 20) === Math.max(0.5, 1 - 10 * 0.04)
    && levelDmgFactor(10, 200) === 0.5;
});
T('dmgCalc에 레벨차 패널티 반영 (고레벨 적에게 데미지 감소)', () => {
  const a = makeMon('espresso', 10), lowDef = makeMon('mixrat', 10), highDef = makeMon('mixrat', 60);
  const orig = Math.random; Math.random = () => 0.5;
  const dLow = dmgCalc(a, 100, null, lowDef).val, dHigh = dmgCalc(a, 100, null, highDef).val;
  Math.random = orig;
  return dHigh < dLow;
});

/* ── v5.9: 신화(Mythic) 등급 + 뽑기 전용 2종 + 신화 합성 ── */
T('신화 등급: rank 4·배율 1.75', () =>
  !!RARITY.mythic && RARITY.mythic.rank === 4 && RARITY.mythic.mult === 1.75);
T('뽑기 전용 신화 종족 2종 (gachaOnly·mythicSpecies)', () => {
  const g = ALL_SIDS.filter(s => SPECIES[s].gachaOnly);
  return g.length === 2 && g.every(s => SPECIES[s].mythicSpecies === true);
});
T('신화 종족은 등급 배율 캡(1.25) 면제 — 신화 배율 1.75 그대로', () => {
  const sid = ALL_SIDS.find(s => SPECIES[s].gachaOnly), sp = SPECIES[sid];
  return statsFor(sid, 40, 'mythic').atk === Math.round(sp.atk * (1 + 0.08 * 39) * 1.75);
});
T('신화 개체 생성 시 특성 부여 (rank>=3)', () => {
  const sid = ALL_SIDS.find(s => SPECIES[s].gachaOnly), m = makeMon(sid, 1, 'mythic');
  return m.rar === 'mythic' && !!m.trait && !!TRAITS[m.trait];
});
T('가챠 테이블: 가중치 합 1000·신화 행 존재(매우 낮은 확률)', () => {
  const sum = GACHA_TABLE.reduce((s, r) => s + r[0], 0);
  const row = GACHA_TABLE.find(r => r[1] === 'mythicMon');
  return Boolean(row && Math.abs(sum - 1000) < 1e-9 && row[0] <= 0.5);
});
T('drawGachaOnce: 신화 당첨 시 신화 등급 뽑기 전용 종족 획득', () => {
  newGame(); G.party = []; G.box = [];
  const orig = Math.random; Math.random = () => 0.9999;
  const msg = drawGachaOnce(gachaPools());
  Math.random = orig;
  const got = [...G.party, ...G.box].find(m => m.rar === 'mythic');
  return Boolean(got && SPECIES[got.sid].gachaOnly && /신화/.test(msg));
});
T('신화 합성 레시피: 뽑기 전용 2종 → 신화 결과종(fusion·mythicSpecies)', () => {
  const rc = FUSION_RECIPES.find(r => r.mythic);
  return Boolean(rc && rc.mats.every(s => SPECIES[s] && SPECIES[s].gachaOnly)
    && SPECIES[rc.to] && SPECIES[rc.to].fusion === true && SPECIES[rc.to].mythicSpecies === true);
});
T('가챠 풀 누수 차단: 신화 종족은 일반 가챠 풀(base/special)에 없음', () => {
  newGame(); G.isekai = true; G.story = 27;
  const { base, special } = gachaPools(), all = [...base, ...special];
  return ALL_SIDS.filter(s => SPECIES[s].mythicSpecies).every(s => !all.includes(s));
});
T('전설·신화 도감 렌더 — 신화 종족 포함 (스모크)', () => {
  newGame(); const sid = ALL_SIDS.find(s => SPECIES[s].gachaOnly);
  G.party = [makeMon(sid, 1, 'mythic')]; G.dex[sid] = 2; G.rarDex[sid] = 'mythic';
  G.screen = 'ldex'; render(); return true;
});

/* ── v5.9: 인게임 패치노트 ── */
T('패치노트 데이터: 비어있지 않고 각 항목 형식 유효', () =>
  Array.isArray(PATCH_NOTES) && PATCH_NOTES.length >= 1
  && PATCH_NOTES.every(p => typeof p.ver === 'string' && typeof p.title === 'string'
    && Array.isArray(p.items) && p.items.length >= 1));
T('패치노트 최신 항목은 v6.0', () => /6\.0/.test(PATCH_NOTES[0].ver));
T('패치노트 화면 렌더 (스모크)', () => { newGame(); patchPage = 0; G.screen = 'patchnotes'; render(); return true; });
T('GAME_VERSION은 최신 패치 버전과 일치', () => GAME_VERSION === PATCH_NOTES[0].ver);
T('위장 엑셀 제목에 최신 버전 주입', () => {
  applyVersionTitle();
  return document.getElementById('tname').textContent.includes(GAME_VERSION) && /월별데이터_정리/.test(document.getElementById('tname').textContent);
});
`;
vm.runInContext(TESTS, ctx, { filename: 'tests' });

/* 소스 텍스트 레벨 검사 (vm 밖) */
function srcTest(name, ok) {
  if (ok) pass++; else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}
srcTest('야생 AI 똑똑함 확률 0.5/0.8 상향', /G\.floor>=6 \? 0\.8 : 0\.5/.test(html));
srcTest('이종 합성에 등급 룰렛 적용', /rollFuseRarity\(baseRar\)/.test(html));
srcTest('랭킹 항목에 프리즘·레전드·복지P·플레이타임 포함', /prism:rarCount\('prism'\), leg:rarCount\('legend'\)/.test(html) && /money:G\.money/.test(html) && /pt:totalPlayMs\(\)/.test(html));
srcTest('랭킹 항목에 파티 스냅샷·선두 포함', /lead:G\.active/.test(html) && /party:G\.party\.map/.test(html));
srcTest('랭킹 정렬 기준 함수 사용', /function rankCompare/.test(html) && /rows\.sort\(rankCompare\)/.test(html));
srcTest('예상 데미지에 상성 반영', /typeMult\(mv\[3\], monType\(e\)\)/.test(html));
srcTest('랭킹 조회에 limitToLast 쿼리 사용', /orderBy=%22score%22&limitToLast/.test(html));
srcTest('전투 가방에 모닝커피·엘릭서 추가', /useBattleHeal\('coffee'\)/.test(html) && /useBattleHeal\('elixir'\)/.test(html));
srcTest('신화 합성: 결과 등급 mythic 고정', /rc\.mythic \? 'mythic'/.test(html));
srcTest('패치노트 진입점(타이틀·허브)', /G\.screen='patchnotes'/.test(html));

console.log(`\n테스트 결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
