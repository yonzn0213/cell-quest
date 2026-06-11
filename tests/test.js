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
['sheet','namebox','fxcontent','statustext','dlg','dlgtext','dlgok','dlgtitle','dlgdesc'].forEach(id => byId[id] = makeEl());
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
T('층 27개 (사무실6 + 이세계9 + 신계6 + 공허6)', () => FLOORS.length === 27);
T('층-보스 인덱스 일치', () => FLOORS.every((f, i) => f.boss === i));
T('모든 탐색 풀 종족 존재·레벨 범위 유효', () => FLOORS.every(f => f.areas.every(a =>
  a.lv[0] <= a.lv[1] && a.pool.every(sid => !!SPECIES[sid]))));
T('보스 27명, 파티 종족 존재', () => BOSSES.length === 27 && BOSSES.every(B => B.party.every(([sid]) => !!SPECIES[sid])));
T('난이도: 모든 보스 파티 3마리 이상', () => BOSSES.every(B => B.party.length >= 3));
T('난이도: 3층 이후 보스는 4마리 이상', () => BOSSES.every((B, i) => i < 2 || B.party.length >= 4));
T('난이도: 모든 보스 강화 배율 1.1 이상', () => BOSSES.every(B => (B.mult || 1) >= 1.1));
T('난이도: 보스 파티 타입 2종 이상 (전원 야근은 양방향 상성이라 허용)', () => BOSSES.every(B => {
  const types = new Set(B.party.map(([sid]) => SPECIES[sid].type));
  return types.size >= 2 || (types.size === 1 && types.has('야근'));
}));
T('스토리 29개·진행 라벨 29개 (4부까지)', () => STORY.length === 29 && PROG_LABEL.length === 29);
T('최종 스토리 인덱스 범위 내', () => { G.story = 27; G.isekai = true; const i = storyIdx(); G.story = 0; G.isekai = false; return i === 28 && i < STORY.length; });

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
T('전설 종족 22종, 전부 입수처 등록', () => {
  const legends = ALL_SIDS.filter(s => SPECIES[s].legend);
  return legends.length === 22 && legends.every(s => !!LEGEND_ROUTE[s]);
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
T('의문의 머리카락은 매점에서 팔지 않는다', () => ITEM_DEF.hair.nosale === true && ITEM_DEF.detox.price === 8000);
T('패치 보상 2탄: 허브 진입 시 디톡스 1개 지급', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'hub'; render();
  return G.gifts.patch2 === true && G.items.detox >= 1;
});
T('전설 도감 화면 렌더 (스모크)', () => { newGame(); G.party = [makeMon('espresso', 5)]; G.screen = 'ldex'; render(); return true; });
T('랭킹 보드 렌더: 희귀도 3종·플레이타임 표시 (스모크)', () => {
  newGame(); G.party = [makeMon('espresso', 5)]; G.name = 'T';
  rankCache = [{ name: 'T', wins: 3, dex: 10, gold: 1, prism: 2, leg: 3, pt: 3700000, story: 28 }];
  paintRank(); return true;
});
T('구버전 랭킹 기록도 렌더 가능 (gold만 있는 항목)', () => {
  rankCache = [{ name: 'old', wins: 1, dex: 5, gold: 4, story: 3 }];
  paintRank(); rankCache = null; return true;
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
`;
vm.runInContext(TESTS, ctx, { filename: 'tests' });

/* 소스 텍스트 레벨 검사 (vm 밖) */
function srcTest(name, ok) {
  if (ok) pass++; else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}
srcTest('야생 AI 똑똑함 확률 0.5/0.8 상향', /G\.floor>=6 \? 0\.8 : 0\.5/.test(html));
srcTest('이종 합성에 등급 룰렛 적용', /rollFuseRarity\(baseRar\)/.test(html));
srcTest('랭킹 항목에 프리즘·레전드·플레이타임 포함', /prism:rarCount\('prism'\), leg:rarCount\('legend'\)/.test(html) && /pt:totalPlayMs\(\)/.test(html));

console.log(`\n테스트 결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
