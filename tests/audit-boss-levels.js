/* 보스 파티원이 자기 종의 진화 요구 레벨보다 낮게 설정된 케이스 전수 출력 */
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
const minLv={};
for(const sid of ALL_SIDS){const e=SPECIES[sid].evo;if(e){minLv[e.to]=Math.max(minLv[e.to]||1,e.lv);if(e.mut)minLv[e.mut.to]=Math.max(minLv[e.mut.to]||1,e.lv);}}
let n=0;
BOSSES.forEach((B,i)=>{B.party.forEach(([sid,lv])=>{const need=minLv[sid]||1;if(lv<need){n++;console.log('boss'+i+' ['+B.name+']: '+sid+'@'+lv+' < 필요 '+need);}})});
console.log('총 '+n+'건');
`,ctx);
