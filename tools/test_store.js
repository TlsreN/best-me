/* 用 Node 校验 store.js 的计算结果与 Excel 表 11 一致 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'store.js'), 'utf8');
const sandbox = { window: {}, console, Date, Math, JSON, Object, Array, Number, String, isNaN };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const S = sandbox.window.Store;

let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  const ok = tol === undefined ? got === want : Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ok   ${name} = ${got}`); }
  else { fail++; console.log(`  FAIL ${name} = ${got} (期望 ${want})`); }
}

console.log('== 增肌（表 11 原值）==');
const p = S.defaultPlan();
eq('BMR', Math.round(S.bmr(p) * 100) / 100, 1547.54, 0.01);
eq('无运动消耗 b', S.noExerciseKcal(p), 2211);
eq('力训日平衡 e1', S.balanceKcal(p, true), 2616);
eq('休息日平衡 e2', S.balanceKcal(p, false), 2441);
eq('力训日应吃 f1', S.targetKcal(p, true), 2197.4, 0.1);
eq('休息日应吃 f2', S.targetKcal(p, false), 2050.4, 0.1);
eq('碳水(力训)', S.macros(p, true).carbs, 220.5, 0.01);
eq('碳水(休息)', S.macros(p, false).carbs, 170.1, 0.01);
eq('蛋白质', S.macros(p, true).protein, 119.7, 0.01);
eq('脂肪', S.macros(p, true).fat, 80);

console.log('== 减脂 ==');
p.direction = 'cut';
eq('力训日应吃', S.targetKcal(p, true), 1674.2, 0.1);
eq('休息日应吃', S.targetKcal(p, false), 1562.2, 0.1);
eq('碳水(力训)', S.macros(p, true).carbs, 163.8, 0.01);
eq('碳水(休息)', S.macros(p, false).carbs, 138.6, 0.01);
eq('脂肪', S.macros(p, true).fat, 60);

console.log('== 食物与统计 ==');
const st = S.emptyState();
const day = S.getDay(st, '2026-11-13', true);
day.train = true;
day.weightKg = 63;
day.foods.push({ meal: 'breakfast', name: '鸡蛋', amountG: 100, carbs: 1, protein: 13, fat: 9, kcal: null, micros: { 钠: 140 } });
day.foods.push({ meal: 'lunch', name: '米饭', amountG: 300, carbs: 78, protein: 6, fat: 1, kcal: 350, micros: {} });
const t = S.dayTotals(day);
eq('热量合计', t.kcal, 137 + 350);
eq('碳水合计', t.carbs, 79);
eq('钠合计', t.micros['钠'], 140);
eq('状态=达标', S.statusOf(st, '2026-11-13'), 'good');

console.log('== 7 日均线 ==');
const st2 = S.emptyState();
S.getDay(st2, '2026-11-10', true).weightKg = 64;
S.getDay(st2, '2026-11-11', true).weightKg = 63;
S.getDay(st2, '2026-11-12', true).weightKg = 63.5;
const series = S.weightSeries(st2, '2026-11-10', '2026-11-13');
eq('均线样本数', series.length, 4);
eq('11-12 均线', series[2].ma, Math.round(((64 + 63 + 63.5) / 3) * 10) / 10);

console.log('== CSV ==');
const csv = S.toCsv(st);
eq('CSV 行数(表头+2 条食物)', csv.split('\n').length, 3);

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
