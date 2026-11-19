/* 最好的我 — 数据层 v3：按顿记营养、按总运动量记训练 */
(function (global) {
  'use strict';

  var KEY = 'zghd.v4';
  var LEGACY = ['zghd.v3', 'zghd.v2', 'zghd.v1'];
  var VERSION = '0.11.4';

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

  function newMeal() { return { items: [], note: '' }; }

  function newFood() {
    return {
      id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: '', kcal100: 0, carbs100: 0, protein100: 0, fat100: 0,
      scoopG: 0, scoopLabel: '勺',
      createdAt: new Date().toISOString(), lastUsedAt: null
    };
  }

  function newDay() {
    return {
      train: true, weightKg: null, bodyFatPct: null, waterMl: 0,
      meals: {},
      lift: null,
      cardio: null,
      health: null
    };
  }

  function emptyState() {
    return { schemaVersion: 4, plan: defaultPlan(), foods: [], days: {}, lastBackupAt: null };
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

  /* 允许补记的日期：今天及之前 30 天内（PRD §4.3） */
  var BACKFILL_DAYS = 30;
  function canBackfill(key, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
    var d = parseKey(key);
    if (toKey(d) !== key) return false;                 /* 2026-13-01 / 2026-02-30 这类假日期 */
    var t = parseKey(today || todayKey());
    var diff = Math.round((t - d) / 86400000);          /* 本地时区，无夏令时 */
    return diff >= 0 && diff <= BACKFILL_DAYS;
  }

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
    if (Array.isArray(m.items)) {
      return r1(m.items.reduce(function (s, it) { return s + nz(it && it.kcal); }, 0));
    }
    if (m.kcal !== null && m.kcal !== undefined && m.kcal !== '') return nz(m.kcal);
    return r1(nz(m.carbs) * 4 + nz(m.protein) * 4 + nz(m.fat) * 9);
  }

  /* ---------- 食物：每 100 g 档案 ---------- */
  var KCAL_PER_KJ = 0.2390057;
  function kjToKcal(kj) { return r1(nz(kj) / 4.184); }
  function kcalToKj(kcal) { return r1(nz(kcal) * 4.184); }

  /* 档案的每 100 g 四项；热量留空就按 4/4/9 算 */
  function per100Of(food) {
    var f = food || {};
    var kcal = nz(f.kcal100);
    if (!kcal) kcal = nz(f.carbs100) * 4 + nz(f.protein100) * 4 + nz(f.fat100) * 9;
    return { kcal: r1(kcal), carbs: nz(f.carbs100), protein: nz(f.protein100), fat: nz(f.fat100) };
  }

  function scalePer100(p, grams) {
    var g = nz(grams) / 100;
    return {
      kcal: r1(nz(p && p.kcal) * g),
      carbs: r1(nz(p && p.carbs) * g),
      protein: r1(nz(p && p.protein) * g),
      fat: r1(nz(p && p.fat) * g)
    };
  }

  function foodMacros(food, grams) { return scalePer100(per100Of(food), grams); }

  /* 一条记录：存当时的每 100 g 快照 + 克数，所以改档案/删食物都不影响历史 */
  function makeItem(food, grams) {
    var p = per100Of(food), m = scalePer100(p, grams);
    return {
      id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      foodId: (food && food.id) || null,
      name: (food && food.name) || '',
      grams: nz(grams),
      per100: p,
      kcal: m.kcal, carbs: m.carbs, protein: m.protein, fat: m.fat
    };
  }

  /* 改克数：按快照重算这一条 */
  function recalcItem(item, grams) {
    if (!item) return item;
    if (!item.per100) { item.grams = nz(grams); return item; }
    var m = scalePer100(item.per100, grams);
    item.grams = nz(grams);
    item.kcal = m.kcal; item.carbs = m.carbs; item.protein = m.protein; item.fat = m.fat;
    return item;
  }

  /* 手写条目：直接填营养，不挂食物；热量留空按 4/4/9 */
  function setManualItem(item, m) {
    var src = m || {};
    item.name = (src.name !== undefined && src.name !== '') ? src.name : (item.name || '手写条目');
    item.grams = null;
    item.per100 = null;
    item.carbs = r1(nz(src.carbs));
    item.protein = r1(nz(src.protein));
    item.fat = r1(nz(src.fat));
    var hasKcal = src.kcal !== null && src.kcal !== undefined && src.kcal !== '';
    item.kcal = hasKcal ? r1(nz(src.kcal)) : r1(item.carbs * 4 + item.protein * 4 + item.fat * 9);
    return item;
  }

  function manualItem(name, m) {
    var seed = {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      foodId: null, name: name || '手写条目', grams: null, per100: null,
      kcal: 0, carbs: 0, protein: 0, fat: 0
    };
    return setManualItem(seed, Object.assign({ name: name }, m || {}));
  }

  /* 环上刻度点：0% 在正上方，顺时针为正，返回 100×100 viewBox 坐标 */
  function ringDot(ratio, radius) {
    var r = (radius === undefined || radius === null) ? 42 : nz(radius);
    var p = Math.max(0, Math.min(1, nz(ratio)));
    var rad = p * 2 * Math.PI;
    return {
      x: Math.round((50 + r * Math.sin(rad)) * 10) / 10,
      y: Math.round((50 - r * Math.cos(rad)) * 10) / 10
    };
  }

  /* 一餐合计：新结构按条目加总；旧结构（没有 items）按原来的总数 */
  function mealTotals(meal) {
    var t = { kcal: 0, carbs: 0, protein: 0, fat: 0, items: 0 };
    if (!meal) return t;
    if (Array.isArray(meal.items)) {
      meal.items.forEach(function (it) {
        if (!it) return;
        t.kcal += nz(it.kcal); t.carbs += nz(it.carbs); t.protein += nz(it.protein); t.fat += nz(it.fat);
        t.items++;
      });
    } else {
      var k = mealKcal(meal);
      if (k || nz(meal.carbs) || nz(meal.protein) || nz(meal.fat)) {
        t.kcal = k; t.carbs = nz(meal.carbs); t.protein = nz(meal.protein); t.fat = nz(meal.fat); t.items = 1;
      }
    }
    t.kcal = r1(t.kcal); t.carbs = r1(t.carbs); t.protein = r1(t.protein); t.fat = r1(t.fat);
    return t;
  }

  /* 这一餐有没有记录（首页快捷入口靠它上色） */
  function hasMealData(meal) {
    var t = mealTotals(meal);
    return !!(t.kcal || t.carbs || t.protein || t.fat);
  }

  /* 最近使用优先，同时间按名字 */
  function sortFoods(foods) {
    return (foods || []).slice().sort(function (a, b) {
      var ta = a && a.lastUsedAt ? String(a.lastUsedAt) : '';
      var tb = b && b.lastUsedAt ? String(b.lastUsedAt) : '';
      if (ta !== tb) return ta < tb ? 1 : -1;
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'zh-Hans-CN');
    });
  }

  /* ---------- 当日汇总 ---------- */
  function dayTotals(day) {
    var t = { kcal: 0, carbs: 0, protein: 0, fat: 0, water: 0, volume: 0, liftKcal: 0, cardioKcal: 0, meals: 0 };
    if (!day) return t;
    Object.keys(day.meals || {}).forEach(function (k) {
      var m = day.meals[k];
      if (!m) return;
      var mt = mealTotals(m);
      if (!mt.kcal && !mt.carbs && !mt.protein && !mt.fat) return;
      t.kcal += mt.kcal; t.carbs += mt.carbs; t.protein += mt.protein; t.fat += mt.fat;
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
      var mt = mealTotals(day.meals[k]);
      return !!(mt.kcal || mt.carbs || mt.protein || mt.fat);
    });
    var w = day.weightKg !== null && day.weightKg !== undefined && day.weightKg !== '';
    return !hasMeal && !day.lift && !day.cardio && !nz(day.waterMl) && !w;
  }

  /* 日历状态：碳水与蛋白两项都必须落在合理区间才算绿（PRD §4.2） */
  var RANGE = { low: 0.90, high: 1.10, over: 1.20 };

  function statusOf(state, key) {
    var day = state.days[key];
    if (isEmptyDay(day)) return 'empty';
    var t = dayTotals(day);
    if (!t.kcal) return 'empty';
    var g = targets(state.plan, day);
    /* 只判碳水与蛋白：热量与脂肪不参与（用户 2026-11-13 定） */
    var pairs = [
      [t.carbs, g.macros.carbs],
      [t.protein, g.macros.protein]
    ];
    var ratios = pairs.map(function (x) { return x[1] > 0 ? x[0] / x[1] : 1; });
    var over = ratios.some(function (r) { return r > RANGE.over; });
    if (over) return 'over';
    var allIn = ratios.every(function (r) { return r >= RANGE.low && r <= RANGE.high; });
    if (allIn) return 'good';
    return 'warm';   /* 有一项没达标（偏低或略偏高） */
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
        var sumW = 0, nW = 0, sumB = 0, sumL = 0, sumC = 0, nB = 0;
        for (var j = 0; j < 7; j++) {
          k = addDays(ws, j); d = state.days[k];
          if (d && d.weightKg !== null && d.weightKg !== undefined && d.weightKg !== '') { sumW += nz(d.weightKg); nW++; }
          if (d && !isEmptyDay(d)) {
            var bw = burnOf(d, state.plan);
            sumB += bw.total; sumL += bw.lift; sumC += bw.cardio; nB++;
          }
        }
        out.push({
          key: ws, label: (parseKey(ws).getMonth() + 1) + '/' + parseKey(ws).getDate(),
          weight: nW ? r1(sumW / nW) : null, ma: null,
          burn: nB ? Math.round(sumB / nB) : null,
          lift: nB ? Math.round(sumL / nB) : null,
          cardio: nB ? Math.round(sumC / nB) : null
        });
      }
      return out;
    }

    var base = parseKey(endKey);
    for (i = RANGES.month - 1; i >= 0; i--) {
      var dt = new Date(base.getFullYear(), base.getMonth() - i, 1);
      var mk = dt.getFullYear() + '-' + pad(dt.getMonth() + 1);
      var sW = 0, cW = 0, sB = 0, sL = 0, sC = 0, cB = 0;
      Object.keys(state.days).forEach(function (key) {
        if (monthKey(key) !== mk) return;
        var dd = state.days[key];
        if (dd.weightKg !== null && dd.weightKg !== undefined && dd.weightKg !== '') { sW += nz(dd.weightKg); cW++; }
        if (!isEmptyDay(dd)) {
          var bm = burnOf(dd, state.plan);
          sB += bm.total; sL += bm.lift; sC += bm.cardio; cB++;
        }
      });
      out.push({
        key: mk, label: (dt.getMonth() + 1) + ' 月',
        weight: cW ? r1(sW / cW) : null, ma: null,
        burn: cB ? Math.round(sB / cB) : null,
        lift: cB ? Math.round(sL / cB) : null,
        cardio: cB ? Math.round(sC / cB) : null
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
    if (s.schemaVersion === 4) return finalize(s);
    if (s.schemaVersion === 3) return finalize(migrateV3(s));
    if (s.schemaVersion === 2) return finalize(migrateV3(migrateV2(s)));
    var d0 = firstDay(s.days);
    if ((d0 && Array.isArray(d0.sets)) || s.version === 1) return finalize(migrateV3(migrateV1(s)));
    if (d0 && Array.isArray(d0.foods)) return finalize(migrateV3(migrateV2(s)));
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
        var m = nd.meals[f.meal] || { carbs: 0, protein: 0, fat: 0, kcal: 0, note: '' };
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

  function legacyItem(m, mealKey) {
    var kc = mealKcal(m);
    return {
      id: 'legacy-' + mealKey,
      foodId: null,
      name: (m.note || '整餐'),
      grams: null,
      per100: null,
      kcal: kc, carbs: nz(m.carbs), protein: nz(m.protein), fat: nz(m.fat)
    };
  }

  /* v3 → v4：一餐一条总数 → 一餐一条「整餐」条目 */
  function migrateV3(s) {
    var days = {};
    Object.keys(s.days || {}).forEach(function (k) {
      var d = Object.assign(newDay(), s.days[k]);
      var meals = {};
      Object.keys(d.meals || {}).forEach(function (mk) {
        var m = d.meals[mk] || {};
        if (Array.isArray(m.items)) { meals[mk] = { items: m.items, note: m.note || '' }; return; }
        var kc = mealKcal(m);
        var has = kc || nz(m.carbs) || nz(m.protein) || nz(m.fat);
        meals[mk] = { items: has ? [legacyItem(m, mk)] : [], note: m.note || '' };
      });
      d.meals = meals;
      days[k] = d;
    });
    return { schemaVersion: 4, plan: s.plan || {}, foods: s.foods || [], days: days, lastBackupAt: s.lastBackupAt || null };
  }

  function normalizeItems(items, mealKey) {
    return (Array.isArray(items) ? items : []).map(function (it, idx) {
      if (!it) return null;
      var p = it.per100 && typeof it.per100 === 'object' ? {
        kcal: nz(it.per100.kcal), carbs: nz(it.per100.carbs),
        protein: nz(it.per100.protein), fat: nz(it.per100.fat)
      } : null;
      var grams = (it.grams === null || it.grams === undefined || it.grams === '') ? null : nz(it.grams);
      return {
        id: it.id || ('i' + mealKey + '-' + idx),
        foodId: it.foodId || null,
        name: it.name || '',
        grams: grams,
        per100: p,
        kcal: nz(it.kcal), carbs: nz(it.carbs), protein: nz(it.protein), fat: nz(it.fat)
      };
    }).filter(Boolean);
  }

  function normalizeFoods(foods) {
    return (Array.isArray(foods) ? foods : []).map(function (f, i) {
      if (!f) return null;
      return {
        id: f.id || ('f' + i),
        name: f.name || '',
        kcal100: nz(f.kcal100), carbs100: nz(f.carbs100),
        protein100: nz(f.protein100), fat100: nz(f.fat100),
        scoopG: nz(f.scoopG), scoopLabel: f.scoopLabel || '勺',
        createdAt: f.createdAt || null,
        lastUsedAt: f.lastUsedAt || null
      };
    }).filter(Boolean);
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
      var meals = {};
      Object.keys(d.meals).forEach(function (mk) {
        var m = d.meals[mk] || {};
        var items;
        if (Array.isArray(m.items)) {
          items = normalizeItems(m.items, mk);
        } else {
          var kc = mealKcal(m);
          items = (kc || nz(m.carbs) || nz(m.protein) || nz(m.fat)) ? [legacyItem(m, mk)] : [];
        }
        meals[mk] = { items: items, note: m.note || '' };
      });
      d.meals = meals;
      days[k] = d;
    });
    return {
      schemaVersion: 4,
      plan: p,
      foods: normalizeFoods(s.foods),
      days: days,
      lastBackupAt: s.lastBackupAt || null
    };
  }


  /* ---------- 健康数据导入（快捷指令导出的文本） ---------- */
  function parseHealth(text) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || /^date/i.test(line) || line.charAt(0) === '#') return;
      var p = line.split(',');
      var d = (p[0] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || p.length < 3) return;
      rows.push({
        date: d, active: nz(p[1]), resting: nz(p[2]), steps: nz(p[3]), workoutMin: nz(p[4])
      });
    });
    return rows;
  }

  function applyHealth(state, rows) {
    var n = 0;
    rows.forEach(function (r) {
      if (!state.days[r.date]) state.days[r.date] = newDay();
      state.days[r.date].health = {
        active: r.active, resting: r.resting, steps: r.steps, workoutMin: r.workoutMin
      };
      n++;
    });
    return n;
  }

  /* 某天总消耗：有健康数据用健康的，没有就用估算 */
  function burnTotalOf(day, plan) {
    if (day && day.health && (day.health.active || day.health.resting)) {
      /* 静息没导进来时，用 App 自己算的 BMR 补上 */
      var resting = nz(day.health.resting) > 0 ? nz(day.health.resting) : bmr(plan);
      return { total: Math.round(nz(day.health.active) + resting), source: 'health' };
    }
    return { total: Math.round(noExerciseKcal(plan) + burnOf(day, plan).total), source: 'estimate' };
  }

  /* 合并导入：只覆盖传入的那些天，其余原样保留 */
  function mergeState(base, incoming) {
    var out = JSON.parse(JSON.stringify(base));
    var inc = normalize(incoming);
    Object.keys(inc.days || {}).forEach(function (k) {
      var src = inc.days[k];
      var dst = out.days[k] || newDay();
      dst.meals = dst.meals || {};
      ['breakfast', 'pre', 'lunch', 'dinner', 'snack'].forEach(function (m) {
        if (src.meals && src.meals[m]) dst.meals[m] = src.meals[m];
      });
      if (src.lift) dst.lift = src.lift;
      if (src.cardio) dst.cardio = src.cardio;
      if (src.health) dst.health = src.health;
      if (src.weightKg !== null && src.weightKg !== undefined) dst.weightKg = src.weightKg;
      if (src.waterMl) dst.waterMl = src.waterMl;
      if (src.train !== undefined && src.train !== null) dst.train = !!src.train;
      out.days[k] = dst;
    });
    /* 食物档案按 id 合并：只补缺，不覆盖本地已有的 */
    var outFoods = Array.isArray(out.foods) ? out.foods.slice() : [];
    (inc.foods || []).forEach(function (f) {
      if (!f) return;
      if (!outFoods.some(function (x) { return x && x.id === f.id; })) outFoods.push(f);
    });
    out.foods = outFoods;
    return normalize(out);
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
    KEY: KEY, VERSION: VERSION, MEALS: MEALS, ACTIVITIES: ACTIVITIES, RANGES: RANGES, FACTOR: FACTOR, RANGE: RANGE,
    defaultPlan: defaultPlan, newDay: newDay, newMeal: newMeal, emptyState: emptyState,
    load: load, save: save, normalize: normalize, migrateV1: migrateV1, migrateV2: migrateV2,
    toKey: toKey, parseKey: parseKey, todayKey: todayKey, addDays: addDays, dayLabel: dayLabel, weekStart: weekStart, monthKey: monthKey,
    canBackfill: canBackfill,
    bmr: bmr, noExerciseKcal: noExerciseKcal, burnOf: burnOf, balanceKcal: balanceKcal,
    factor: factor, targetKcal: targetKcal, macros: macros, targets: targets,
    mealKcal: mealKcal, dayTotals: dayTotals, isEmptyDay: isEmptyDay, statusOf: statusOf,
    newFood: newFood, per100Of: per100Of, foodMacros: foodMacros, makeItem: makeItem,
    recalcItem: recalcItem, mealTotals: mealTotals, sortFoods: sortFoods, hasMealData: hasMealData,
    manualItem: manualItem, setManualItem: setManualItem, ringDot: ringDot,
    kjToKcal: kjToKcal, kcalToKj: kcalToKj,
    ma7: ma7, trend: trend, toCsv: toCsv, r1: r1,
    parseHealth: parseHealth, applyHealth: applyHealth, burnTotalOf: burnTotalOf, mergeState: mergeState
  };
})(typeof window !== 'undefined' ? window : globalThis);
