/* 모든 진화 라인 + 출현 차원/레벨 구간을 한눈에 추출 (재배치 설계용) */
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
const wild={};
FLOORS.forEach((f,fi)=>f.areas.forEach(a=>a.pool.forEach(sid=>{
  if(!wild[sid]) wild[sid]={min:a.lv[0],max:a.lv[1],floors:new Set()};
  wild[sid].min=Math.min(wild[sid].min,a.lv[0]);
  wild[sid].max=Math.max(wild[sid].max,a.lv[1]);
  wild[sid].floors.add(fi);
})));
function tag(sid){
  const s=SPECIES[sid];
  if(s.legend) return 'LEGEND';
  if(s.fusion) return 'FUSION';
  if(wild[sid]) return '야생'+wild[sid].min+'~'+wild[sid].max;
  // 돌연변이 대상?
  for(const x of ALL_SIDS){const e=SPECIES[x].evo;if(e&&e.mut&&e.mut.to===sid)return 'MUT(from '+x+')';}
  // 진화로만 도달?
  for(const x of ALL_SIDS){const e=SPECIES[x].evo;if(e&&e.to===sid)return '진화전용';}
  return '스타터/지급';
}
// 진화 시작점(다른 종의 evo.to/mut.to가 아닌 종)부터 라인 출력
const isTarget=new Set();
for(const sid of ALL_SIDS){const e=SPECIES[sid].evo;if(e){isTarget.add(e.to);if(e.mut)isTarget.add(e.mut.to);}}
console.log('=== 진화 라인 (시작 → 단계별 @레벨 [출현정보]) ===');
for(const sid of ALL_SIDS){
  if(isTarget.has(sid)) continue;       // 라인 시작만
  if(!SPECIES[sid].evo) continue;       // 진화 없는 종 제외
  let line=sid+'['+tag(sid)+']';
  let cur=sid;
  while(SPECIES[cur] && SPECIES[cur].evo){
    const e=SPECIES[cur].evo;
    line+=' --'+e.lv+'--> '+e.to+'['+tag(e.to)+']';
    if(e.mut) line+=' {돌연변이 '+Math.round(e.mut.p*100)+'%: '+e.mut.to+'['+tag(e.mut.to)+']}';
    cur=e.to;
  }
  console.log(line);
}
`,ctx);
