/* 最好的我 — 数据层 v3：按顿记营养、按总运动量记训练 */
(function (global) {
  'use strict';

  var KEY = 'zghd.v3';
  var LEGACY = ['zghd.v2', 'zghd.v1'];

  var MEALS = [
    { id: 'breakfast', name: '早饭' },
    { id: 'pre',       name: '练前' },
    { id: 'lunch',     name: '午饭' },
    { id: 'dinner',    name: '晚饭' },
    { id: 'snack',     name: '加餐' }
  ];

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

  function newMeal() { return { carbs: 0, protein: 0, fat: 0, kcal: null, note: '' }; }

  function newDay() {
    return {
      train: true, weightKg: null, bodyFatPct: null, waterMl: 0,
      meals: {},
      lift: null,
      cardio: null
    };
  }

  function emptyState() {
    return { schemaVersion: 3, plan: defaultPlan(), days: {}, lastBackupAt: null };
  }

  /* ---------- 日期 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return toKey(new Date()); }
  function addDays(key, n) { var d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d); }
  function dayLabel(key) {
    var d = parseKey(key);
    var w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 周' + w;
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

  /* 力量与有氧分开；未记录时用方案默认值，保证目标不跳 */
  function burnOf(day, plan) {
    var lift = 0, cardio = 0;
    if (day) {
      if (day.lift && nz(day.lift.kcal) > 0) lift = nz(day.lift.kcal);
      else if (day.train) lift = nz(plan.liftKcal);
      if (day.cardio && nz(day.cardio.kcal) > 0) cardio = nz(day.cardio.kcal);
      else cardio = nz(plan.cardioKcal);
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
    return { kcal: targetKcal(p, day), macros: macros(p, !!(day && day.train)), water: nz(p.waterMl) };
  }

  /* ---------- 一餐热量 ---------- */
  function mealKcal(m) {
    if (!m) return 0;
    if (m.kcal !== null && m.kcal !== undefined && m.kcal !== '') return nz(m.kcal);
    return r1(nz(m.carbs) * 4 + nz(m.protein) * 4 + nz(m.fat) * 9);
  }

  /* ---------- 当日汇总 ---------- */
  function dayTotals(day) {
    var t = { kcal: 0, carbs: 0, protein: 0, fat: 0, water: 0, volume: 0, liftKcal: 0, cardioKcal: 0, meals: 0 };
    if (!day) return t;
    Object.keys(day.meals || {}).forEach(function (k) {
      var m = day.meals[k];
      if (!m) return;
      var kc = mealKcal(m);
      if (!kc && !nz(m.carbs) && !nz(m.protein) && !nz(m.fat)) return;
      t.kcal += kc; t.carbs += nz(m.carbs); t.protein += nz(m.protein); t.fat += nz(m.fat);
      t.meals++;
    });
    if (day.lift) { t.liftKcal = nz(day.lift.kcal); t.volume = nz(day.lift.volume); }
    if (day.cardio) t.cardioKcal = nz(day.cardio.kcal);
    t.water = nz(day.waterMl);
    t.kcal = r1(t.kcal); t.carbs = r1(t.carbs); t.protein = r1(t.protein); t.fat = r1(t.fat);
    return t;
  }

  function isEmptyDay(day) {
    if (!day) return true;
    var hasMeal = Object.keys(day.meals || {}).some(function (k) {
      var m = day.meals[k];
      return m && (nz(m.carbs) || nz(m.protein) || nz(m.fat) || nz(m.kcal));
    });
    var w = day.weightKg !== null && day.weightKg !== undefined && day.weightKg !== '';
    return !hasMeal && !day.lift && !day.cardio && !nz(day.waterMl) && !w;
  }

  function statusOf(state, key) {
    var day = state.days[key];
    if (isEmptyDay(day)) return 'empty';
    var t = dayTotals(day);
    if (!t.kcal) return 'empty';
    var r = t.kcal / targetKcal(state.plan, day);
    if (r <= 1.05) return 'good';
    if (r <= 1.15) return 'warm';
    return 'over';
  }

  /* ---------- 趋势 ---------- */
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
          key: k, label: (parseKey(k).getMonth() + 1) + '/' + parseKey(k).getDate(),
          weight: w, ma: w !== null ? ma7(state, k) : null,
          burn: b ? b.total : null
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
          k = addDays(ws, j); d = state.days[k];
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

  /* ---------- 迁移 ---------- */
  function firstDay(days) {
    var keys = Object.keys(days || {});
    return keys.length ? days[keys[0]] : null;
  }

  function normalize(s) {
    if (!s || typeof s !== 'object') return emptyState();
    if (s.schemaVersion === 3) return finalize(s);
    if (s.schemaVersion === 2) return finalize(migrateV2(s));
    var d0 = firstDay(s.days);
    if ((d0 && Array.isArray(d0.sets)) || s.version === 1) return finalize(migrateV1(s));
    if (d0 && Array.isArray(d0.foods)) return finalize(migrateV2(s));
    return finalize(s);
  }

  function migrateV1(s) {
    var v2 = { schemaVersion: 2, plan: s.plan || {}, days: {}, lastBackupAt: s.lastBackupAt || null };
    Object.keys(s.days || {}).forEach(function (k) {
      var d = s.days[k] || {};
      var nd = { train: !!d.train, weightKg: d.weightKg, bodyFatPct: d.bodyFatPct, waterMl: 0, foods: [], workouts: [], cardios: [] };
      nd.foods = (d.foods || []).map(function (f) {
        return { meal: f.meal, name: f.name, carbs: nz(f.carbs), protein: nz(f.protein), fat: nz(f.fat), kcal: f.kcal };
      });
      var sets = (d.sets || []).filter(function (x) { return x && x.exercise; });
      if (sets.length) nd.workouts = [{ kcal: nz((s.plan || {}).liftKcal) || 175, sets: sets }];
      nd.cardios = (d.cardios || []).map(function (c) { return { minutes: nz(c.minutes), kcal: nz(c.kcal) }; });
      v2.days[k] = nd;
    });
    return migrateV2(v2);
  }

  function migrateV2(s) {
    var days = {};
    Object.keys(s.days || {}).forEach(function (k) {
      var d = s.days[k] || {};
      var nd = newDay();
      nd.train = !!d.train;
      nd.weightKg = d.weightKg === undefined ? null : d.weightKg;
      nd.bodyFatPct = d.bodyFatPct === undefined ? null : d.bodyFatPct;
      nd.waterMl = nz(d.waterMl);

      (d.foods || []).forEach(function (f) {
        if (!f || !f.meal) return;
        var m = nd.meals[f.meal] || newMeal();
        m.carbs = r1(nz(m.carbs) + nz(f.carbs));
        m.protein = r1(nz(m.protein) + nz(f.protein));
        m.fat = r1(nz(m.fat) + nz(f.fat));
        var fk = (f.kcal === null || f.kcal === undefined || f.kcal === '')
          ? nz(f.carbs) * 4 + nz(f.protein) * 4 + nz(f.fat) * 9 : nz(f.kcal);
        m.kcal = r1(nz(m.kcal) + fk);
        if (!m.note && f.name) m.note = f.name;
        nd.meals[f.meal] = m;
      });

      var lifts = d.workouts || [];
      if (lifts.length) {
        var kcal = 0, vol = 0;
        lifts.forEach(function (w) {
          kcal += nz(w.kcal);
          (w.sets || []).forEach(function (st) { vol += nz(st.sets) * nz(st.reps) * nz(st.weight); });
        });
        nd.lift = { kcal: Math.round(kcal), volume: Math.round(vol), note: '' };
      }

      var cards = d.cardios || [];
      if (cards.length) {
        var mins = 0, ck = 0;
        cards.forEach(function (c) { mins += nz(c.minutes); ck += nz(c.kcal); });
        nd.cardio = { act: (cards[0] && cards[0].act) || 'walk', minutes: Math.round(mins), kcal: Math.round(ck) };
      }
      days[k] = nd;
    });
    return { schemaVersion: 3, plan: s.plan || {}, days: days, lastBackupAt: s.lastBackupAt || null };
  }

  function finalize(s) {
    var p = Object.assign(defaultPlan(), s.plan || {});
    p.bulk = Object.assign(defaultPlan().bulk, (s.plan && s.plan.bulk) || {});
    p.cut = Object.assign(defaultPlan().cut, (s.plan && s.plan.cut) || {});
    var days = {};
    Object.keys(s.days || {}).forEach(function (k) {
      var d = Object.assign(newDay(), s.days[k]);
      d.train = !!d.train;
      d.waterMl = nz(d.waterMl);
      d.meals = d.meals || {};
      days[k] = d;
    });
    return { schemaVersion: 3, plan: p, days: days, lastBackupAt: s.lastBackupAt || null };
  }

  /* ---------- 存取 ---------- */
  var mem = null;
  function hasLS() { try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; } }

  function load() {
    if (!hasLS()) return mem ? JSON.parse(mem) : emptyState();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      for (var i = 0; i < LEGACY.length; i++) {
        var old = localStorage.getItem(LEGACY[i]);
        if (old) {
          var migrated = normalize(JSON.parse(old));
          save(migrated);
          return migrated;
        }
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
    var rows = [['日期', '餐次', '碳水g', '蛋白g', '脂肪g', '热量kcal', '备注']];
    Object.keys(state.days).sort().forEach(function (k) {
      var d = state.days[k];
      MEALS.forEach(function (m) {
        var x = d.meals && d.meals[m.id];
        if (!x) return;
        rows.push([k, m.name, nz(x.carbs), nz(x.protein), nz(x.fat), mealKcal(x), x.note || '']);
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
    KEY: KEY, MEALS: MEALS, ACTIVITIES: ACTIVITIES, RANGES: RANGES, FACTOR: FACTOR,
    defaultPlan: defaultPlan, newDay: newDay, newMeal: newMeal, emptyState: emptyState,
    load: load, save: save, normalize: normalize, migrateV1: migrateV1, migrateV2: migrateV2,
    toKey: toKey, parseKey: parseKey, todayKey: todayKey, addDays: addDays, dayLabel: dayLabel, weekStart: weekStart, monthKey: monthKey,
    bmr: bmr, noExerciseKcal: noExerciseKcal, burnOf: burnOf, balanceKcal: balanceKcal,
    factor: factor, targetKcal: targetKcal, macros: macros, targets: targets,
    mealKcal: mealKcal, dayTotals: dayTotals, isEmptyDay: isEmptyDay, statusOf: statusOf,
    ma7: ma7, trend: trend, toCsv: toCsv, r1: r1
  };
})(typeof window !== 'undefined' ? window : globalThis);
