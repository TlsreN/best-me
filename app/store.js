/* 最好的我 — 数据层与计算逻辑（纯函数，可被测试与移植） */
(function (global) {
  'use strict';

  var KEY = 'zghd.v1';

  var MEALS = [
    { id: 'breakfast', name: '早饭' },
    { id: 'pre',       name: '练前餐' },
    { id: 'lunch',     name: '午饭 · 练后' },
    { id: 'dinner',    name: '晚饭' },
    { id: 'snack',     name: '加餐 / 夜宵' }
  ];

  /* 每 kg 体重每小时消耗，取自《健身饮食.xlsx》表 16 */
  var ACTIVITIES = [
    { id: 'walk',   name: '平地走',       rate: 3.8 },
    { id: 'walk5',  name: '爬坡走 5°',    rate: 5.5 },
    { id: 'walk10', name: '爬坡走 10°',   rate: 8.0 },
    { id: 'run6',   name: '跑步 6 km/h',  rate: 5.5 },
    { id: 'run8',   name: '跑步 8 km/h',  rate: 9.5 },
    { id: 'run10',  name: '跑步 10 km/h', rate: 10.4 },
    { id: 'bike',   name: '骑行 通勤',    rate: 3.6 },
    { id: 'swim',   name: '游泳 中等',    rate: 7.7 },
    { id: 'ball',   name: '球类 篮球',    rate: 6.1 },
    { id: 'other',  name: '其他有氧',     rate: 5.0 }
  ];

  var MICROS = ['钠', '钾', '钙', '铁', '膳食纤维', '维生素C'];

  var FACTOR = { bulk: 0.84, cut: 0.64 };

  function round1(n) { return Math.round(n * 10) / 10; }

  function defaultPlan() {
    return {
      direction: 'bulk',
      sex: 'male',
      age: 24,
      heightCm: 165,
      weightKg: 63,
      liftKcal: 175,
      cardioKcal: 230,
      proteinPerKg: 1.9,
      bulk: { fatG: 80, carbTrain: 3.5, carbRest: 2.7 },
      cut:  { fatG: 60, carbTrain: 2.6, carbRest: 2.2 }
    };
  }

  function newDay() {
    return { train: true, weightKg: null, bodyFatPct: null, foods: [], sets: [], cardios: [], note: '' };
  }

  function emptyState() {
    return { version: 1, plan: defaultPlan(), days: {}, createdAt: nowIso() };
  }

  function nowIso() { return new Date().toISOString(); }

  /* ---------- 日期 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function todayKey() { return toKey(new Date()); }
  function addDays(key, n) {
    var d = parseKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }
  function dayLabel(key) {
    var d = parseKey(key);
    var w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + w;
  }

  /* ---------- 计算链（与 Excel 表 11 完全一致） ---------- */
  function bmr(p) {
    var base = 9.99 * p.weightKg + 6.25 * p.heightCm - 4.92 * p.age;
    return p.sex === 'male' ? base + 5 : base - 161;
  }
  function noExerciseKcal(p) { return Math.round(bmr(p) / 0.7); }
  function balanceKcal(p, isTrain) {
    return noExerciseKcal(p) + (isTrain ? Number(p.liftKcal) || 0 : 0) + (Number(p.cardioKcal) || 0);
  }
  function factor(p) { return FACTOR[p.direction] || FACTOR.bulk; }
  function targetKcal(p, isTrain) {
    return round1(balanceKcal(p, isTrain) * factor(p));
  }
  function macros(p, isTrain) {
    var d = p[p.direction] || p.bulk;
    return {
      carbs:   round1((isTrain ? d.carbTrain : d.carbRest) * p.weightKg),
      protein: round1(p.proteinPerKg * p.weightKg),
      fat:     Number(d.fatG) || 0
    };
  }
  function targets(p, isTrain) {
    return { kcal: targetKcal(p, isTrain), macros: macros(p, isTrain) };
  }

  /* ---------- 存取 ---------- */
  var mem = null;
  function hasLS() {
    try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; }
  }
  function load() {
    var raw = null;
    try { raw = hasLS() ? localStorage.getItem(KEY) : mem; } catch (e) { raw = null; }
    if (!raw) return emptyState();
    try { return normalize(JSON.parse(raw)); } catch (e) { return emptyState(); }
  }
  function save(state) {
    var raw = JSON.stringify(state);
    if (hasLS()) { try { localStorage.setItem(KEY, raw); return true; } catch (e) { /* 降级到内存 */ } }
    mem = raw;
    return false;
  }
  function normalize(s) {
    if (!s || typeof s !== 'object') return emptyState();
    var plan = Object.assign(defaultPlan(), s.plan || {});
    plan.bulk = Object.assign(defaultPlan().bulk, (s.plan && s.plan.bulk) || {});
    plan.cut  = Object.assign(defaultPlan().cut,  (s.plan && s.plan.cut)  || {});
    var days = {};
    Object.keys(s.days || {}).forEach(function (k) {
      days[k] = Object.assign(newDay(), s.days[k]);
      days[k].train = !!days[k].train;
      ['foods', 'sets', 'cardios'].forEach(function (f) {
        if (!Array.isArray(days[k][f])) days[k][f] = [];
      });
    });
    return { version: 1, plan: plan, days: days, createdAt: s.createdAt || nowIso() };
  }

  /* ---------- 天 ---------- */
  function getDay(state, key, create) {
    if (!state.days[key] && create) state.days[key] = newDay();
    return state.days[key] || null;
  }

  function foodKcal(f) {
    if (f.kcal !== null && f.kcal !== undefined && f.kcal !== '') return Number(f.kcal) || 0;
    return round1((Number(f.carbs) || 0) * 4 + (Number(f.protein) || 0) * 4 + (Number(f.fat) || 0) * 9);
  }

  function dayTotals(day) {
    var t = { kcal: 0, carbs: 0, protein: 0, fat: 0, micros: {}, cardioKcal: 0, tonnage: 0 };
    if (!day) return t;
    (day.foods || []).forEach(function (f) {
      t.kcal    += foodKcal(f);
      t.carbs   += Number(f.carbs) || 0;
      t.protein += Number(f.protein) || 0;
      t.fat     += Number(f.fat) || 0;
      Object.keys(f.micros || {}).forEach(function (k) {
        t.micros[k] = (t.micros[k] || 0) + (Number(f.micros[k]) || 0);
      });
    });
    (day.cardios || []).forEach(function (c) { t.cardioKcal += Number(c.kcal) || 0; });
    (day.sets || []).forEach(function (s) {
      t.tonnage += (Number(s.sets) || 0) * (Number(s.reps) || 0) * (Number(s.weight) || 0);
    });
    t.kcal = round1(t.kcal);
    return t;
  }

  function isEmptyDay(day) {
    if (!day) return true;
    return !(day.foods || []).length && !(day.sets || []).length &&
           !(day.cardios || []).length && (day.weightKg === null || day.weightKg === undefined || day.weightKg === '');
  }

  /* 状态：good 达标 / warm 略超 / over 超很多 / empty 未记录 */
  function statusOf(state, key) {
    var day = state.days[key];
    if (isEmptyDay(day)) return 'empty';
    var t = dayTotals(day);
    var goal = targetKcal(state.plan, !!day.train);
    if (!t.kcal) return 'empty';
    var r = t.kcal / goal;
    if (r <= 1.05) return 'good';
    if (r <= 1.15) return 'warm';
    return 'over';
  }

  /* 体重 7 日均线 */
  function weightSeries(state, fromKey, toKeyStr) {
    var out = [];
    var cur = fromKey;
    var guard = 0;
    while (cur <= toKeyStr && guard++ < 800) {
      var day = state.days[cur];
      var w = day && day.weightKg !== null && day.weightKg !== undefined && day.weightKg !== '' ? Number(day.weightKg) : null;
      var ma = null;
      if (w !== null) {
        var sum = 0, n = 0;
        for (var i = 0; i < 7; i++) {
          var d2 = state.days[addDays(cur, -i)];
          if (d2 && d2.weightKg !== null && d2.weightKg !== undefined && d2.weightKg !== '') {
            sum += Number(d2.weightKg); n++;
          }
        }
        ma = n ? round1(sum / n) : null;
      }
      out.push({ key: cur, weight: w, ma: ma });
      cur = addDays(cur, 1);
    }
    return out;
  }

  function weekStart(key) {
    var d = parseKey(key);
    var dow = (d.getDay() + 6) % 7; /* 周一为一周第一天 */
    d.setDate(d.getDate() - dow);
    return toKey(d);
  }

  /* 导出 ---------- */
  function csvEscape(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(state) {
    var rows = [['日期', '是否力训日', '餐次', '食物', '克数', '碳水g', '蛋白g', '脂肪g', '热量kcal', '体重kg']];
    Object.keys(state.days).sort().forEach(function (k) {
      var d = state.days[k];
      if ((d.foods || []).length) {
        d.foods.forEach(function (f) {
          var meal = (MEALS.filter(function (m) { return m.id === f.meal; })[0] || {}).name || f.meal || '';
          rows.push([k, d.train ? '是' : '否', meal, f.name || '', f.amountG || '', f.carbs || 0, f.protein || 0, f.fat || 0, foodKcal(f), d.weightKg || '']);
        });
      } else {
        rows.push([k, d.train ? '是' : '否', '', '', '', 0, 0, 0, 0, d.weightKg || '']);
      }
    });
    return rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\n');
  }

  global.Store = {
    KEY: KEY, MEALS: MEALS, ACTIVITIES: ACTIVITIES, MICROS: MICROS, FACTOR: FACTOR,
    defaultPlan: defaultPlan, emptyState: emptyState, newDay: newDay,
    load: load, save: save, normalize: normalize,
    todayKey: todayKey, toKey: toKey, parseKey: parseKey, addDays: addDays, dayLabel: dayLabel, weekStart: weekStart,
    bmr: bmr, noExerciseKcal: noExerciseKcal, balanceKcal: balanceKcal, factor: factor,
    targetKcal: targetKcal, macros: macros, targets: targets,
    getDay: getDay, dayTotals: dayTotals, foodKcal: foodKcal, statusOf: statusOf, isEmptyDay: isEmptyDay,
    weightSeries: weightSeries, toCsv: toCsv, round1: round1
  };
})(typeof window !== 'undefined' ? window : globalThis);
