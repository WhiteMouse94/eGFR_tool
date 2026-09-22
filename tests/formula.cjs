const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=readFileSync(require('node:path').join(__dirname,'../egfr_tool_mobile_demo.html'),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function calcEGFR'));
const ctx={window:{addEventListener(){}},document:{addEventListener(){}}};
vm.createContext(ctx);vm.runInContext(script,ctx);
// Independent piecewise 2009 equations: both sexes, above/below the SCr knot.
for(const sex of ['M','F']) for(const scr of [0.4,0.7,0.9,1.5,3]) for(const age of [20,58,80]) {
  const k=sex==='F'?0.7:0.9;
  const exponent=scr<=k?(sex==='F'?-.329:-.411):-1.209;
  const expected=141*(sex==='F'?1.018:1)*(scr/k)**exponent*.993**age;
  assert.ok(Math.abs(ctx.calcEGFR(scr*88.4,age,sex)-expected)<1e-10);
}
function row(type,date,cr,status='included'){
  const [y='',m='',d='']=(date||'').split('-');
  return {dataset:{type},querySelector(s){return {value:({'.dt-year':y.slice(-2),'.dt-month':m,'.dt-day':d,'.scr-inp':String(cr||''),'.quality-select':status})[s]}}};
}
function run(rows){
  let result;
  ctx.document.getElementById=id=>id==='age'?{value:'58'}:{style:{}};
  ctx.document.querySelectorAll=()=>rows;
  ctx.hideError=()=>{};ctx.showError=msg=>{throw Error(msg)};
  ctx.renderResults=data=>result=data;
  ctx.calculate();return result;
}
for(const screening of [true,false]){
  const result=run([row(screening?'screening':'history','2026-08-25',150),row('history','2026-06-25',90)]);
  assert.ok(Number.isFinite(result.slope));assert.equal(result.shortSpan,true);
  assert.equal(result.v.rapid,false);assert.equal(result.v.color,'yellow');
  assert.match(result.v.desc,/结果仅为估算，不可作为证据/);
}
for(const [date,shortSpan] of [['2026-02-25',false],['2026-02-26',true]]){
  const result=run([row('history','2026-08-25',150),row('history',date,90)]);
  assert.equal(result.shortSpan,shortSpan);assert.equal(result.prescreen,true);
}
assert.throws(()=>run([row('history','2026-08-25',100),row('history','2026-08-25',120)]),/不同日期/);
assert.equal(ctx.protocolVerdict(5,50,.9,false).rapid,false);
assert.equal(ctx.protocolVerdict(5.00001,50,.9,false).rapid,true);
assert.doesNotMatch(html,/2021|0\.9938|1\.012|88\.42/);
console.log('PASS: 30 independent formula cases; prescreen/screening short-span warnings; six-calendar-month boundaries; duplicate dates; strict decline threshold.');
