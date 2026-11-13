/* 校验 store.js v2：与 Excel 口径一致 + 新模型（PRD §8.1） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'store.js'), 'utf8');
const sandbox = { window: {}, console, Date, Math, JSON, Object, Array, Number, String, isNaN, isFinite };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const S = sandbox.window.Store;

let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  const ok = tol === undefined ? got === want : Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ok   ${name} = ${JSON.stringify(got)}`); }
  else { fail++; console.log(`  FAIL ${name} = ${JSON.stringify(got)}  (期望 ${JSON.stringify(want)})`); }
}
function truthy(name, v) { if (v) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } }

const plan = S.defaultPlan();
const mkDay = (train) => Object.assign(S.newDay(), { train });

console.log('== 代谢（对照 Excel 表 11）==');
eq('BMR', Math.round(S.bmr(plan) * 100) / 100, 1547.54, 0.01);
eq('无运动消耗 b', S.noExerciseKcal(plan), 2211);

const dayTrain = mkDay(true);
const dayRest = mkDay(false);
const bTrain = S.burnOf(dayTrain, plan);
const bRest = S.burnOf(dayRest, plan);
eq('力训日 力量消耗(默认)', bTrain.lift, 175);
eq('力训日 有氧消耗(默认)', bTrain.cardio, 230);
eq('力训日 总消耗', bTrain.total, 405);
eq('休息日 力量消耗', bRest.lift, 0);
eq('休息日 总消耗', bRest.total, 230);

eq('力训日平衡 e1', S.balanceKcal(plan, dayTrain), 2616);
eq('休息日平衡 e2', S.balanceKcal(plan, dayRest), 2441);
eq('增肌 力训日应吃', S.targetKcal(plan, dayTrain), 2197.4, 0.05);
eq('增肌 休息日应吃', S.targetKcal(plan, dayRest), 2050.4, 0.05);
eq('增肌 碳水(力训)', S.macros(plan, true).carbs, 220.5, 0.01);
eq('增肌 碳水(休息)', S.macros(plan, false).carbs, 170.1, 0.01);
eq('增肌 蛋白质', S.macros(plan, true).protein, 119.7, 0.01);
eq('增肌 脂肪', S.macros(plan, true).fat, 80);

const cutPlan = Object.assign({}, plan, { direction: 'cut' });
eq('减脂 力训日应吃', S.targetKcal(cutPlan, dayTrain), 1674.2, 0.05);
eq('减脂 休息日应吃', S.targetKcal(cutPlan, dayRest), 1562.2, 0.05);
eq('减脂 碳水(力训)', S.macros(cutPlan, true).carbs, 163.8, 0.01);
eq('减脂 碳水(休息)', S.macros(cutPlan, false).carbs, 138.6, 0.01);
eq('减脂 脂肪', S.macros(cutPlan, true).fat, 60);

console.log('== 力量与有氧分开（PRD §5.3）==');
const dayMix = mkDay(true);
dayMix.workouts.push({ id: 'w1', name: '胸', sets: [{ exercise: '卧推', sets: 4, reps: 8, weight: 60 }], kcal: 200 });
dayMix.cardios.push({ id: 'c1', act: 'walk', minutes: 40, kcal: 160 });
const bMix = S.burnOf(dayMix, plan);
eq('记录后 力量消耗', bMix.lift, 200);
eq('记录后 有氧消耗', bMix.cardio, 160);
eq('记录后 合计', bMix.total, 360);
eq('记录后 平衡热量', S.balanceKcal(plan, dayMix), 2211 + 360);
eq('容量 tonnage', S.dayTotals(dayMix).tonnage, 4 * 8 * 60);

console.log('== 食物两种计量（PRD §4.2）==');
const per100 = { name: '鸡胸肉', mode: 'per100g', carbs: 0, protein: 23, fat: 1.5, kcal: 118 };
const perSrv = { name: '一碗米饭', mode: 'perServing', carbs: 60, protein: 5, fat: 1, kcal: 300 };
const m100 = S.foodMacros(per100, 150);
eq('每 100g × 150g 蛋白', m100.protein, 34.5, 0.01);
eq('每 100g × 150g 热量', m100.kcal, 177, 0.01);
const mSrv = S.foodMacros(perSrv, 1.5);
eq('每份 × 1.5 份 碳水', mSrv.carbs, 90, 0.01);
eq('每份 × 1.5 份 热量', mSrv.kcal, 450, 0.01);

console.log('== 热量缺省与汇总 ==');
eq('缺省热量 = 4/4/9', S.entryKcal({ carbs: 10, protein: 5, fat: 2, kcal: null }), 10 * 4 + 5 * 4 + 2 * 9);
const d2 = mkDay(true);
d2.foods.push({ id: 'a', meal: 'breakfast', name: '鸡蛋', mode: 'manual', carbs: 1, protein: 13, fat: 9, kcal: null, micros: { 钠: 140 } });
d2.foods.push({ id: 'b', meal: 'lunch', name: '米饭', mode: 'manual', carbs: 60, protein: 5, fat: 1, kcal: 300, micros: {} });
d2.waterMl = 500;
const t2 = S.dayTotals(d2);
eq('热量合计', t2.kcal, 137 + 300);
eq('碳水合计', t2.carbs, 61);
eq('钠合计', t2.micros['钠'], 140);
eq('饮水', t2.water, 500);

console.log('== 趋势聚合（PRD §5.5）==');
const st = S.emptyState();
const base = '2026-11-13';
for (let i = 0; i < 40; i++) {
  const k = S.addDays(base, -i);
  const d = S.getDay ? null : null;
  st.days[k] = Object.assign(S.newDay(), { train: i % 2 === 0, weightKg: 63 + i * 0.01 });
  if (i % 2 === 0) st.days[k].workouts.push({ id: 'w', name: 'x', sets: [], kcal: 200 });
  st.days[k].cardios.push({ id: 'c', act: 'walk', minutes: 30, kcal: 100 });
}
const tDay = S.trend(st, 'day', base);
eq('日视图点数', tDay.length, 30);
eq('日视图最后一天', tDay[29].key, base);
truthy('日视图有均线', tDay[29].ma !== null);
eq('日视图训练消耗=200+100', tDay[29].burn, 300);

const tWeek = S.trend(st, 'week', base);
eq('周视图点数', tWeek.length, 12);
truthy('周视图有体重均值', tWeek[11].weight !== null);
truthy('周视图有消耗合计', tWeek[11].burn >= 300);

const tMonth = S.trend(st, 'month', base);
eq('月视图点数', tMonth.length, 12);
eq('月视图最后一个月', tMonth[11].key, '2026-11');
truthy('月视图有体重均值', tMonth[11].weight !== null);

console.log('== 空数据不补零 ==');
const stEmpty = S.emptyState();
const tE = S.trend(stEmpty, 'day', base);
eq('空数据体重为 null', tE[29].weight, null);
eq('空数据消耗为 null', tE[29].burn, null);

console.log('== v1 → v2 迁移 ==');
const v1 = {
  version: 1,
  plan: { direction: 'bulk', sex: 'male', age: 24, heightCm: 165, weightKg: 63, liftKcal: 175, cardioKcal: 230, proteinPerKg: 1.9, bulk: { fatG: 80, carbTrain: 3.5, carbRest: 2.7 }, cut: { fatG: 60, carbTrain: 2.6, carbRest: 2.2 } },
  days: {
    '2026-11-10': { train: true, weightKg: 63, bodyFatPct: null, foods: [{ id: 'x', meal: 'breakfast', name: '蛋', amountG: 100, carbs: 1, protein: 13, fat: 9, kcal: null, micros: {} }], sets: [{ exercise: '深蹲', sets: 4, reps: 8, weight: 60 }], cardios: [] }
  }
};
const mig = S.normalize(v1);
eq('迁移后 schemaVersion', mig.schemaVersion, 2);
eq('迁移后 workout 数', mig.days['2026-11-10'].workouts.length, 1);
eq('迁移后 动作名', mig.days['2026-11-10'].workouts[0].sets[0].exercise, '深蹲');
eq('迁移后 食物 mode', mig.days['2026-11-10'].foods[0].mode, 'manual');

console.log('== 导出导入往返 ==');
const round = S.normalize(JSON.parse(JSON.stringify(st)));
eq('往返 天数一致', Object.keys(round.days).length, Object.keys(st.days).length);
eq('往返 日视图一致', S.trend(round, 'day', base)[29].burn, tDay[29].burn);

console.log('== 状态判定 ==');
const stS = S.emptyState();
stS.days[base] = Object.assign(S.newDay(), { train: true });
stS.days[base].foods.push({ id: 'z', meal: 'breakfast', name: 'a', mode: 'manual', carbs: 0, protein: 0, fat: 0, kcal: 3000 });
eq('超标状态', S.statusOf(stS, base), 'over');
eq('空日状态', S.statusOf(stS, '2000-01-01'), 'empty');

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
