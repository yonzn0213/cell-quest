/* 진화 타이밍 전수 분석:
   - 각 종이 야생에 출현하는 레벨 구간(min~max)을 모으고
   - 그 종의 진화 레벨(evo.lv)과 비교한다
   분류:
   A) 진화 레벨 < 출현 최소레벨  → 잡자마자 이미 진화했어야 함(곧바로 진화). "너무 이름"
   B) 진화 레벨 > 출현 최대레벨 + 여유 → 야생에서 잡아 키워도 진화까지 한참. "너무 늦음"
   C) 진화 레벨이 다음 단계 종의 출현 레벨과 어긋남
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
function el(){return{textContent:'',className:'',value:'',innerHTML:'',style:{},dataset:{},contentEditable:'',onclick:null,onfocus:null,classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},focus(){},blur(){},click(){}}}
const tds=[];for(let r=1;r<=32;r++)for(let c=0;c<11;c++){const t=el();t.dataset={r:String(r),c:String(c)};tds.push(t);}
const ids={};['sheet','namebox','fxcontent','statustext','dlg','dlgtext','dlgok','dlgtitle','dlgdesc'].forEach(i=>ids[i]=el());
ids.sheet.querySelectorAll=s=>s==='td'?tds:[];
const sb={document:{getElementById:i=>ids[i]||el(),querySelectorAll:s=>s==='td'?tds:[],addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},fetch:async()=>({ok:true,json:async()=>null}),btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,console,escape,unescape};
const ctx=vm.createContext(sb);
vm.runInContext(m[1],ctx);
vm.runInContext(`
// 종별 야생 출현 레벨 구간 수집
const wild={};
FLOORS.forEach(f=>f.areas.forEach(a=>a.pool.forEach(sid=>{
  if(!wild[sid]) wild[sid]={min:a.lv[0],max:a.lv[1]};
  wild[sid].min=Math.min(wild[sid].min,a.lv[0]);
  wild[sid].max=Math.max(wild[sid].max,a.lv[1]);
})));
console.log('=== A) 진화 레벨이 출현 최소레벨보다 낮음 (잡자마자 진화) ===');
let a=0;
for(const sid of ALL_SIDS){
  const e=SPECIES[sid].evo, w=wild[sid];
  if(e && w && e.lv<=w.min){ a++; console.log(\`  \${sid}(\${SPECIES[sid].name}) 출현 \${w.min}~\${w.max}, 진화레벨 \${e.lv} → \${e.to}\`); }
}
if(!a) console.log('  없음');
console.log('\\n=== B) 진화 레벨이 출현 최대레벨보다 6 이상 높음 (야생포획 후 진화까지 멂) ===');
let b=0;
for(const sid of ALL_SIDS){
  const e=SPECIES[sid].evo, w=wild[sid];
  if(e && w && e.lv>w.max+6){ b++; console.log(\`  \${sid}(\${SPECIES[sid].name}) 출현 \${w.min}~\${w.max}, 진화레벨 \${e.lv} (격차 +\${e.lv-w.max}) → \${e.to}\`); }
}
if(!b) console.log('  없음');
console.log('\\n=== 참고: 진화 단계별 레벨 간격(같은 라인) ===');
for(const sid of ALL_SIDS){
  const e=SPECIES[sid].evo;
  if(!e) continue;
  const e2=SPECIES[e.to] && SPECIES[e.to].evo;
  if(e2){ const gap=e2.lv-e.lv; if(gap<5||gap>14) console.log(\`  \${sid}→\${e.to}@\${e.lv} →\${e2.to}@\${e2.lv} (2단 간격 \${gap})\`); }
}
`,ctx);
