/* 校验 store.js v3：按顿记营养、按总运动量记训练 */
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
eq('力训日 力量消耗(默认)', S.burnOf(dayTrain, plan).lift, 175);
eq('力训日 有氧消耗(默认)', S.burnOf(dayTrain, plan).cardio, 230);
eq('休息日 力量消耗', S.burnOf(dayRest, plan).lift, 0);
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
eq('减脂 脂肪', S.macros(cutPlan, true).fat, 60);

console.log('== 总运动量输入（力量 + 有氧各一条）==');
const d1 = mkDay(true);
d1.lift = { kcal: 220, volume: 8600, note: '' };
d1.cardio = { act: 'walk', minutes: 40, kcal: 160 };
const b1 = S.burnOf(d1, plan);
eq('记录后 力量消耗', b1.lift, 220);
eq('记录后 有氧消耗', b1.cardio, 160);
eq('记录后 合计', b1.total, 380);
eq('记录后 平衡热量', S.balanceKcal(plan, d1), 2211 + 380);
eq('容量 volume', S.dayTotals(d1).volume, 8600);

const d2 = mkDay(true);
d2.lift = { kcal: 0, volume: 0 };
eq('力量填 0 时回落默认', S.burnOf(d2, plan).lift, 175);
eq('无有氧时用方案默认', S.burnOf(d2, plan).cardio, 230);

console.log('== 按顿记营养 ==');
const d3 = mkDay(true);
d3.meals.breakfast = { carbs: 12, protein: 20, fat: 14, kcal: null, note: '鸡蛋牛奶' };
d3.meals.lunch = { carbs: 91, protein: 35, fat: 3, kcal: 480, note: '米饭鸡胸' };
const t3 = S.dayTotals(d3);
eq('热量 = 自动 + 手填', t3.kcal, (12 * 4 + 20 * 4 + 14 * 9) + 480);
eq('碳水合计', t3.carbs, 103);
eq('蛋白合计', t3.protein, 55);
eq('脂肪合计', t3.fat, 17);
eq('记了几餐', t3.meals, 2);
eq('一餐热量（全 0 时用 4/4/9）', S.mealKcal({ carbs: 10, protein: 5, fat: 2, kcal: null }), 78);

const d4 = mkDay(true);
d4.meals.breakfast = { carbs: 0, protein: 0, fat: 0, kcal: null };
eq('空餐不计入', S.dayTotals(d4).meals, 0);

console.log('== 趋势聚合 ==');
const st = S.emptyState();
const base = '2026-11-13';
for (let i = 0; i < 40; i++) {
  const k = S.addDays(base, -i);
  st.days[k] = Object.assign(S.newDay(), { train: i % 2 === 0, weightKg: 63 + i * 0.01 });
  st.days[k].meals.breakfast = { carbs: 50, protein: 30, fat: 10, kcal: 400 };
  if (i % 2 === 0) st.days[k].lift = { kcal: 200, volume: 5000 };
  st.days[k].cardio = { act: 'walk', minutes: 30, kcal: 100 };
}
const tDay = S.trend(st, 'day', base);
eq('日视图点数', tDay.length, 30);
eq('日视图最后一天', tDay[29].key, base);
truthy('日视图有均线', tDay[29].ma !== null);
eq('日视图训练消耗', tDay[29].burn, 300);

const tWeek = S.trend(st, 'week', base);
eq('周视图点数', tWeek.length, 12);
truthy('周视图有体重均值', tWeek[11].weight !== null);
truthy('周视图消耗为日均', tWeek[11].burn > 0 && tWeek[11].burn < 600);

const tMonth = S.trend(st, 'month', base);
eq('月视图点数', tMonth.length, 12);
eq('月视图最后一个月', tMonth[11].key, '2026-11');
truthy('月视图有体重均值', tMonth[11].weight !== null);

const tE = S.trend(S.emptyState(), 'day', base);
eq('空数据体重为 null', tE[29].weight, null);
eq('空数据消耗为 null', tE[29].burn, null);

console.log('== 迁移 v2 → v3（多条食物合成一餐）==');
const v2 = {
  schemaVersion: 2,
  plan: { direction: 'bulk', sex: 'male', age: 24, heightCm: 165, weightKg: 63, liftKcal: 175, cardioKcal: 230, proteinPerKg: 1.9, waterMl: 2000, bulk: { fatG: 80, carbTrain: 3.5, carbRest: 2.7 }, cut: { fatG: 60, carbTrain: 2.6, carbRest: 2.2 } },
  days: {
    '2026-11-10': {
      train: true, weightKg: 63, bodyFatPct: null, waterMl: 500,
      foods: [
        { meal: 'lunch', name: '米饭', carbs: 60, protein: 5, fat: 1, kcal: 300 },
        { meal: 'lunch', name: '鸡胸', carbs: 0, protein: 30, fat: 2, kcal: 150 }
      ],
      workouts: [{ kcal: 175, sets: [{ exercise: '深蹲', sets: 4, reps: 8, weight: 60 }] }],
      cardios: [{ act: 'walk', minutes: 30, kcal: 120 }]
    }
  }
};
const m2 = S.normalize(v2);
eq('迁移后 schemaVersion', m2.schemaVersion, 3);
eq('午饭合成一条 碳水', m2.days['2026-11-10'].meals.lunch.carbs, 60);
eq('午饭合成一条 蛋白', m2.days['2026-11-10'].meals.lunch.protein, 35);
eq('午饭合成一条 热量', m2.days['2026-11-10'].meals.lunch.kcal, 450);
eq('力量合成一条 消耗', m2.days['2026-11-10'].lift.kcal, 175);
eq('力量合成一条 容量', m2.days['2026-11-10'].lift.volume, 4 * 8 * 60);
eq('有氧合成一条 分钟', m2.days['2026-11-10'].cardio.minutes, 30);
eq('迁移后不等于空日', S.isEmptyDay(m2.days['2026-11-10']), false);

console.log('== 迁移 v1 → v3 ==');
const v1 = {
  version: 1,
  plan: v2.plan,
  days: {
    '2026-11-09': {
      train: true, weightKg: 63.2, foods: [{ meal: 'breakfast', name: '蛋', carbs: 1, protein: 13, fat: 9, kcal: null }],
      sets: [{ exercise: '卧推', sets: 4, reps: 8, weight: 60 }], cardios: []
    }
  }
};
const m1 = S.normalize(v1);
eq('v1 迁移后 schemaVersion', m1.schemaVersion, 3);
eq('v1 早饭蛋白', m1.days['2026-11-09'].meals.breakfast.protein, 13);
eq('v1 力量容量', m1.days['2026-11-09'].lift.volume, 4 * 8 * 60);

console.log('== 导出 ==');
const csv = S.toCsv(st);
eq('CSV 行数（表头 + 40 餐）', csv.split('\n').length, 41);

console.log('== 状态判定 ==');
const stS = S.emptyState();
stS.days[base] = Object.assign(S.newDay(), { train: true });
stS.days[base].meals.breakfast = { carbs: 0, protein: 0, fat: 0, kcal: 3000 };
eq('超标状态', S.statusOf(stS, base), 'over');
eq('空日状态', S.statusOf(stS, '2000-01-01'), 'empty');

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
