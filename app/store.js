/* 最好的我 — 数据层（v2 模型，纯函数，可测可移植） */
(function (global) {
  'use strict';

  var KEY = 'zghd.v2';
  var LEGACY_KEY = 'zghd.v1';

  var MEALS = [
    { id: 'breakfast', name: '早饭' },
    { id: 'pre',       name: '练前' },
    { id: 'lunch',     name: '午饭 · 练后' },
    { id: 'dinner',    name: '晚饭' },
    { id: 'snack',     name: '加餐' }
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
  var RANGES = { day: 30, week: 12, month: 12 };

  function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
  function nz(n) { var v = Number(n); return isFinite(v) ? v : 0; }

  function defaultPlan() {
    return {
      direction: 'bulk',
      sex: 'male', age: 24, heightCm: 165, weightKg: 63,
      liftKcal: 175, cardioKcal: 230,
      proteinPerKg: 1.9, waterMl: 2000,
      bulk: { fatG: 80, carbTrain: 3.5, carbRest: 2.7 },
      cut:  { fatG: 60, carbTrain: 2.6, carbRest: 2.2 }
    };
  }

  function newDay() {
    return { train: true, weightKg: null, bodyFatPct: null, foods: [], workouts: [], cardios: [], waterMl: 0 };
  }

  function emptyState() {
    return { schemaVersion: 2, plan: defaultPlan(), days: {}, foods: [], lastBackupAt: null };
  }

  /* ---------- 日期 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return toKey(new Date()); }
  function addDays(key, n) { var d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d); }
  function dowLabel(key) { return ['日', '一', '二', '三', '四', '五', '六'][parseKey(key).getDay()]; }
  function dayLabel(key) {
    var d = parseKey(key);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 周' + dowLabel(key);
  }
  function weekStart(key) {
    var d = parseKey(key);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toKey(d);
  }
  function monthKey(key) { return String(key).slice(0, 7); }

  /* ---------- 代谢 ---------- */
  function bmr(p) {
    var base = 9.99 * nz(p.weightKg) + 6.25 * nz(p.heightCm) - 4.92 * nz(p.age);
    return p.sex === 'male' ? base + 5 : base - 161;
  }
  function noExerciseKcal(p) { return Math.round(bmr(p) / 0.7); }

  /* 力量训练与有氧分别汇总（PRD §5.3） */
  function burnOf(day, plan) {
    var lift = 0, cardio = 0, hasLift = false, hasCardio = false;
    if (day) {
      (day.workouts || []).forEach(function (w) { lift += nz(w.kcal); hasLift = true; });
      (day.cardios || []).forEach(function (c) { cardio += nz(c.kcal); hasCardio = true; });
      if (!hasLift && day.train) lift = nz(plan.liftKcal);
      if (!hasCardio) cardio = nz(plan.cardioKcal);
    }
    return { lift: Math.round(lift), cardio: Math.round(cardio), total: Math.round(lift + cardio) };
  }

  function balanceKcal(p, day) { return noExerciseKcal(p) + burnOf(day, p).total; }
  function factor(p) { return FACTOR[p.direction] || FACTOR.bulk; }

  function targetKcal(p, day) { return r1(balanceKcal(p, day) * factor(p)); }

  function macros(p, isTrain) {
    var d = p[p.direction] || p.bulk;
    return {
      carbs:   r1((isTrain ? d.carbTrain : d.carbRest) * nz(p.weightKg)),
      protein: r1(nz(p.proteinPerKg) * nz(p.weightKg)),
      fat:     nz(d.fatG)
    };
  }
  function targets(p, day) {
    var isTrain = !!(day && day.train);
    return { kcal: targetKcal(p, day), macros: macros(p, isTrain), water: nz(p.waterMl) };
  }

  /* ---------- 食物换算（PRD §4.2） ---------- */
  function foodMacros(food, qty) {
    var q = nz(qty);
    var k = food.mode === 'per100g' ? q / 100 : q;
    return {
      carbs: r1(nz(food.carbs) * k),
      protein: r1(nz(food.protein) * k),
      fat: r1(nz(food.fat) * k),
      kcal: food.kcal === null || food.kcal === undefined || food.kcal === '' ? null : r1(nz(food.kcal) * k)
    };
  }

  function entryKcal(f) {
    if (f.kcal !== null && f.kcal !== undefined && f.kcal !== '') return nz(f.kcal);
    return r1(nz(f.carbs) * 4 + nz(f.protein) * 4 + nz(f.fat) * 9);
  }

  /* ---------- 当日汇总 ---------- */
  function dayTotals(day) {
    var t = { kcal: 0, carbs: 0, protein: 0, fat: 0, micros: {}, water: 0, tonnage: 0, liftKcal: 0, cardioKcal: 0 };
    if (!day) return t;
    (day.foods || []).forEach(function (f) {
      t.kcal += entryKcal(f);
      t.carbs += nz(f.carbs);
      t.protein += nz(f.protein);
      t.fat += nz(f.fat);
      Object.keys(f.micros || {}).forEach(function (k) { t.micros[k] = (t.micros[k] || 0) + nz(f.micros[k]); });
    });
    (day.workouts || []).forEach(function (w) {
      t.liftKcal += nz(w.kcal);
      (w.sets || []).forEach(function (s) { t.tonnage += nz(s.sets) * nz(s.reps) * nz(s.weight); });
    });
    (day.cardios || []).forEach(function (c) { t.cardioKcal += nz(c.kcal); });
    t.water = nz(day.waterMl);
    t.kcal = r1(t.kcal);
    t.carbs = r1(t.carbs);
    t.protein = r1(t.protein);
    t.fat = r1(t.fat);
    return t;
  }

  function isEmptyDay(day) {
    if (!day) return true;
    return !(day.foods || []).length && !(day.workouts || []).length && !(day.cardios || []).length &&
      !nz(day.waterMl) && (day.weightKg === null || day.weightKg === undefined || day.weightKg === '');
  }

  function statusOf(state, key) {
    var day = state.days[key];
    if (isEmptyDay(day)) return 'empty';
    var t = dayTotals(day);
    if (!t.kcal) return 'empty';
    var goal = targetKcal(state.plan, day);
    var r = t.kcal / goal;
    if (r <= 1.05) return 'good';
    if (r <= 1.15) return 'warm';
    return 'over';
  }

  /* ---------- 趋势聚合（PRD §5.5） ---------- */
  function ma7(state, key) {
    var sum = 0, n = 0;
    for (var i = 0; i < 7; i++) {
      var d = state.days[addDays(key, -i)];
      if (d && d.weightKg !== null && d.weightKg !== undefined && d.weightKg !== '') { sum += nz(d.weightKg); n++; }
    }
    return n ? r1(sum / n) : null;
  }

  function trend(state, range, endKey) {
    range = RANGES[range] ? range : 'day';
    var out = [];
    var i, k, d, w, b;

    if (range === 'day') {
      for (i = RANGES.day - 1; i >= 0; i--) {
        k = addDays(endKey, -i);
        d = state.days[k];
        w = d && d.weightKg !== null && d.weightKg !== undefined && d.weightKg !== '' ? nz(d.weightKg) : null;
        b = d && !isEmptyDay(d) ? burnOf(d, state.plan) : null;
        out.push({
          key: k,
          label: (parseKey(k).getMonth() + 1) + '/' + parseKey(k).getDate(),
          weight: w,
          ma: w !== null ? ma7(state, k) : null,
          burn: b ? b.total : null,
          lift: b ? b.lift : null,
          cardio: b ? b.cardio : null
        });
      }
      return out;
    }

    if (range === 'week') {
      var thisWeek = weekStart(endKey);
      for (i = RANGES.week - 1; i >= 0; i--) {
        var ws = addDays(thisWeek, -7 * i);
        var sumW = 0, nW = 0, sumB = 0, nB = 0;
        for (var j = 0; j < 7; j++) {
          k = addDays(ws, j);
          d = state.days[k];
          if (d && d.weightKg !== null && d.weightKg !== undefined && d.weightKg !== '') { sumW += nz(d.weightKg); nW++; }
          if (d && !isEmptyDay(d)) { sumB += burnOf(d, state.plan).total; nB++; }
        }
        out.push({
          key: ws, label: (parseKey(ws).getMonth() + 1) + '/' + parseKey(ws).getDate(),
          weight: nW ? r1(sumW / nW) : null, ma: null,
          burn: nB ? Math.round(sumB / nB) : null
        });
      }
      return out;
    }

    /* month */
    var base = parseKey(endKey);
    for (i = RANGES.month - 1; i >= 0; i--) {
      var dt = new Date(base.getFullYear(), base.getMonth() - i, 1);
      var mk = dt.getFullYear() + '-' + pad(dt.getMonth() + 1);
      var sW = 0, cW = 0, sB = 0, cB = 0;
      Object.keys(state.days).forEach(function (key) {
        if (monthKey(key) !== mk) return;
        var dd = state.days[key];
        if (dd.weightKg !== null && dd.weightKg !== undefined && dd.weightKg !== '') { sW += nz(dd.weightKg); cW++; }
        if (!isEmptyDay(dd)) { sB += burnOf(dd, state.plan).total; cB++; }
      });
      out.push({
        key: mk, label: (dt.getMonth() + 1) + ' 月',
        weight: cW ? r1(sW / cW) : null, ma: null,
        burn: cB ? Math.round(sB / cB) : null
      });
    }
    return out;
  }

  /* ---------- 存取与迁移 ---------- */
  var mem = null;
  function hasLS() { try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; } }

  function normalize(s) {
    if (!s || typeof s !== 'object') return emptyState();
    if (s.schemaVersion === 1 || Array.isArray(s.days && s.days[Object.keys(s.days)[0]] && s.days[Object.keys(s.days)[0]].sets)) {
      s = migrateV1(s);
    }
    var p = Object.assign(defaultPlan(), s.plan || {});
    p.bulk = Object.assign(defaultPlan().bulk, (s.plan && s.plan.bulk) || {});
    p.cut = Object.assign(defaultPlan().cut, (s.plan && s.plan.cut) || {});
    var days = {};
    Object.keys(s.days || {}).forEach(function (k) {
      var d = Object.assign(newDay(), s.days[k]);
      d.train = !!d.train;
      ['foods', 'workouts', 'cardios'].forEach(function (f) { if (!Array.isArray(d[f])) d[f] = []; });
      d.waterMl = nz(d.waterMl);
      days[k] = d;
    });
    return {
      schemaVersion: 2, plan: p, days: days,
      foods: Array.isArray(s.foods) ? s.foods : [],
      lastBackupAt: s.lastBackupAt || null
    };
  }

  /* v1：sets[] 一把抓 → v2：workouts[] 分组 */
  function migrateV1(s) {
    var out = { schemaVersion: 2, plan: s.plan || {}, days: {}, foods: [], lastBackupAt: s.lastBackupAt || null };
    var plan = Object.assign(defaultPlan(), s.plan || {});
    Object.keys(s.days || {}).forEach(function (k) {
      var d = s.days[k] || {};
      var nd = newDay();
      nd.train = !!d.train;
      nd.weightKg = d.weightKg === undefined ? null : d.weightKg;
      nd.bodyFatPct = d.bodyFatPct === undefined ? null : d.bodyFatPct;
      nd.foods = (d.foods || []).map(function (f) {
        return {
          id: f.id, meal: f.meal, name: f.name, mode: 'manual',
          amountG: f.amountG === undefined ? null : f.amountG, servings: null,
          carbs: nz(f.carbs), protein: nz(f.protein), fat: nz(f.fat),
          kcal: f.kcal === undefined ? null : f.kcal, micros: f.micros || {}
        };
      });
      var sets = (d.sets || []).filter(function (x) { return x && x.exercise; });
      if (sets.length) {
        nd.workouts = [{
          id: 'legacy-' + k, name: '力量训练',
          sets: sets.map(function (x) { return { exercise: x.exercise, sets: nz(x.sets), reps: nz(x.reps), weight: nz(x.weight) }; }),
          kcal: nz(plan.liftKcal), overridden: false
        }];
      }
      nd.cardios = (d.cardios || []).map(function (c) {
        return { id: c.id, act: c.act, minutes: nz(c.minutes), kcal: nz(c.kcal), overridden: true };
      });
      nd.waterMl = 0;
      out.days[k] = nd;
    });
    return out;
  }

  function load() {
    if (!hasLS()) return mem ? JSON.parse(mem) : emptyState();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      var old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        var migrated = normalize(JSON.parse(old));
        save(migrated);
        return migrated;
      }
    } catch (e) { }
    return emptyState();
  }

  function save(state) {
    var raw = JSON.stringify(state);
    if (!hasLS()) { mem = raw; return false; }
    try { localStorage.setItem(KEY, raw); return true; } catch (e) { mem = raw; return false; }
  }

  function toCsv(state) {
    var rows = [['日期', '力训日', '餐次', '食物', '数量', '碳水g', '蛋白g', '脂肪g', '热量kcal']];
    Object.keys(state.days).sort().forEach(function (k) {
      var d = state.days[k];
      (d.foods || []).forEach(function (f) {
        var meal = (MEALS.filter(function (m) { return m.id === f.meal; })[0] || {}).name || f.meal || '';
        var qty = f.mode === 'perServing' ? (nz(f.servings) + ' 份') : (nz(f.amountG) + ' g');
        rows.push([k, d.train ? '是' : '否', meal, f.name || '', qty, nz(f.carbs), nz(f.protein), nz(f.fat), entryKcal(f)]);
      });
    });
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v === null || v === undefined ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
  }

  global.Store = {
    KEY: KEY, LEGACY_KEY: LEGACY_KEY, MEALS: MEALS, ACTIVITIES: ACTIVITIES, MICROS: MICROS, RANGES: RANGES, FACTOR: FACTOR,
    defaultPlan: defaultPlan, emptyState: emptyState, newDay: newDay,
    load: load, save: save, normalize: normalize, migrateV1: migrateV1,
    toKey: toKey, parseKey: parseKey, todayKey: todayKey, addDays: addDays, dayLabel: dayLabel, weekStart: weekStart, monthKey: monthKey,
    bmr: bmr, noExerciseKcal: noExerciseKcal, burnOf: burnOf, balanceKcal: balanceKcal,
    factor: factor, targetKcal: targetKcal, macros: macros, targets: targets,
    foodMacros: foodMacros, entryKcal: entryKcal, dayTotals: dayTotals, isEmptyDay: isEmptyDay, statusOf: statusOf,
    ma7: ma7, trend: trend, toCsv: toCsv, r1: r1
  };
})(typeof window !== 'undefined' ? window : globalThis);
