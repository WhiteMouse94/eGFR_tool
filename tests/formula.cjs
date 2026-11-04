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
  vm.runInContext("usageMode='free'",ctx);
  let result;
  ctx.document.getElementById=id=>id==='age'?{value:'58'}:{style:{}};
  ctx.document.querySelectorAll=()=>rows;
  ctx.hideError=()=>{};ctx.showError=msg=>{throw Error(msg)};
  ctx.renderResults=data=>result=data;
  ctx.renderSingleResult=data=>result=data;
  ctx.setUsageMode=()=>{};
  ctx.calculate();return result;
}
for(const screening of [true,false]){
  const result=run([row(screening?'screening':'history','2026-08-25',150),row('history','2026-06-25',90),row('history','2026-07-25',110)]);
  assert.ok(Number.isFinite(result.slope));assert.equal(result.shortSpan,true);
  assert.equal(result.v.rapid,false);assert.equal(result.v.color,'yellow');
  assert.match(result.v.desc,/结果仅为估算，不可作为证据/);
}
for(const [date,shortSpan] of [['2026-02-24',false],['2026-02-25',true],['2026-02-26',true]]){
  const result=run([row('history','2026-08-25',150),row('history',date,90),row('history','2026-05-01',110)]);
  assert.equal(result.shortSpan,shortSpan);assert.equal(result.prescreen,true);
}
assert.throws(()=>run([row('history','2026-08-25',100),row('history','2026-08-25',120),row('history','2025-01-01',90)]),/同一天/);
const two=run([row('history','2026-08-25',100),row('history','2025-08-25',90)]);assert.equal(two.v.rapid,false);assert.equal(two.v.color,'yellow');assert.match(two.v.desc,/2个不同日期/);
const old=run([row('screening','2026-08-25',150),row('history','2018-08-25',90),row('history','2024-01-01',110)]);assert.equal(old.shortSpan,false);assert.equal(old.included.length,3);assert.match(ctx.clinicalNarrative({...old,verdict:old.v}),/纳入合格血肌酐/);
// Dedicated single-point mode uses only its three fields, independently of history.
function runSingle(age,sex,cr){
  vm.runInContext("usageMode='single'",ctx);
  let result;
  ctx.document.getElementById=id=>({value:({'single-age':String(age),'single-sex':sex,'single-cr':String(cr)})[id],style:{}});
  ctx.document.querySelectorAll=()=>{throw Error('Single-point calculation must not read historical records');};
  ctx.renderSingleResult=data=>result=data;
  ctx.calculate();return result;
}
for(const sex of ['M','F']) {
  const single=runSingle(58,sex,100);
  assert.equal(single.singlePoint,true);
  assert.equal(single.referenceEgfr,ctx.calcEGFR(100,58,sex));
  assert.equal(single.slope,undefined);
  assert.equal(single.verdict,undefined);
  assert.match(ctx.clinicalNarrative(single),/未计算年变化率，未评估CKD快速进展/);
}
for(const age of ['',17,101,'bad'])assert.throws(()=>runSingle(age,'M',100),/年龄/);
for(const cr of ['',9,2001,'bad'])assert.throws(()=>runSingle(58,'M',cr),/血肌酐/);
assert.throws(()=>runSingle(58,'',100),/性别/);
assert.throws(()=>run([row('screening','2026-08-25',100)]),/至少需2个/);
assert.throws(()=>run([row('screening','',100)]),/日期/);
assert.throws(()=>run([row('screening','2026-02-30',100)]),/日期格式/);
assert.throws(()=>run([row('screening','2099-01-01',100),row('history','2026-01-01',90)]),/晚于今天/);
// Returning to multiple points restores the existing trend calculation.
assert.ok(Number.isFinite(run([row('screening','2026-08-25',100),row('history','2025-08-25',90)]).slope));
assert.ok(!html.includes('id="protocol-path-card"'));
assert.equal(ctx.protocolVerdict(5,50,.9,false).rapid,false);
assert.equal(ctx.protocolVerdict(5.00001,50,.9,false).rapid,true);
assert.doesNotMatch(html,/2021|0\.9938|1\.012|88\.42/);
console.log('PASS: 30 formula cases; dedicated three-field single-point mode and validation; unchanged multi-point regressions, six-month boundaries and strict decline threshold.');
