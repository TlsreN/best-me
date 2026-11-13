/* 最好的我 — 三页界面（今天 / 数据 / 身体） */
(function () {
  'use strict';

  var S = window.Store;
  var state = S.load();
  var view = 'today';
  var cursor = S.todayKey();
  var range = 'day';
  var calMonth = S.parseKey(cursor);
  var selDate = cursor;
  var app = document.getElementById('app');
  var modal = document.getElementById('modal-root');

  var ICON = {
    coffee: '<path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 5V3M11 5V3"/>',
    bolt:   '<path d="M13 2 6 13h5l-1 9 7-11h-5l1-9z"/>',
    bowl:   '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.6 1.2-2.6 2.6-2.6"/>',
    moon:   '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    cookie: '<circle cx="12" cy="12" r="7.2"/><circle cx="9.6" cy="10" r="1"/><circle cx="13.4" cy="9.4" r="1"/><circle cx="12" cy="13.8" r="1"/>',
    dumb:   '<path d="M7 8v8M17 8v8M4 10.5v3M20 10.5v3M7 12h10"/>'
  };

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f1(n) { var v = Math.round((Number(n) || 0) * 10) / 10; return v % 1 === 0 ? String(v) : v.toFixed(1); }
  function n0(n) { return String(Math.round(Number(n) || 0)); }
  function q(sel) { return document.querySelector(sel); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v) { if (v === null || v === undefined || String(v).trim() === '') return null; var n = Number(v); return isNaN(n) ? null : n; }

  function dayOf(key, create) {
    if (!state.days[key] && create) state.days[key] = S.newDay();
    return state.days[key] || null;
  }
  function persist() { S.save(state); render(); }

  /* ---------------- 折线 ---------------- */
  function plot(vals, color, opts) {
    opts = opts || {};
    var w = 300, h = opts.h || 56, pad = 6;
    var raw = opts.raw || [];
    var all = [];
    vals.concat(raw).forEach(function (v) { if (v !== null && v !== undefined) all.push(v); });
    if (!all.length) return '<div class="empty-mini">还没有数据</div>';
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    if (max - min < 1) { var m = (max + min) / 2; min = m - 1; max = m + 1; }
    var span = max - min;
    function X(i) { return pad + (w - 2 * pad) * (vals.length <= 1 ? 0.5 : i / (vals.length - 1)); }
    function Y(v) { return h - pad - (h - 2 * pad) * (v - min) / span; }

    var d = '', started = false, dots = '';
    vals.forEach(function (v, i) {
      if (v === null || v === undefined) { started = false; return; }
      d += (started ? ' L' : ' M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      started = true;
    });
    raw.forEach(function (v, i) {
      if (v === null || v === undefined) return;
      dots += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2" fill="' + color + '" opacity=".3"/>';
    });

    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + '</svg>';
  }

  function deltaLabel(vals) {
    var nums = vals.filter(function (v) { return v !== null && v !== undefined; });
    if (nums.length < 2) return '';
    var d = Math.round((nums[nums.length - 1] - nums[0]) * 10) / 10;
    if (!d) return '';
    return (d > 0 ? '+' : '') + f1(d);
  }

  /* ---------------- 今天 ---------------- */
  function viewToday() {
    var day = dayOf(cursor, true);
    var t = S.dayTotals(day);
    var tg = S.targets(state.plan, day);
    var m = tg.macros;
    var isToday = cursor === S.todayKey();
    var tr = S.trend(state, range, cursor);

    var weights = tr.map(function (p) { return p.ma; });
    var raws = tr.map(function (p) { return p.weight; });
    var burns = tr.map(function (p) { return p.burn; });

    var lastW = null, lastB = null;
    for (var i = tr.length - 1; i >= 0; i--) {
      if (lastW === null && tr[i].ma !== null) lastW = tr[i].ma;
      if (lastB === null && tr[i].burn !== null) lastB = tr[i].burn;
    }

    var rangeLabel = { day: '近 30 天', week: '近 12 周', month: '近 12 月' }[range];

    return '<div class="page today">' +
      '<div class="head">' +
        '<div><h1>今天</h1><div class="sub">' + S.dayLabel(cursor) + (isToday ? '' : ' · 非今天') + '</div></div>' +
        '<div class="right">' +
          '<button class="pill ' + (day.train ? 'on' : 'rest') + '" data-act="toggle-train">' + (day.train ? '力训日' : '休息日') + '</button>' +
        '</div>' +
      '</div>' +

      '<section class="card energy">' +
        '<div class="energy-top">' +
          '<div class="num">' + n0(t.kcal) + '<i>/</i><span class="unit">目标 ' + n0(tg.kcal) + ' 大卡</span></div>' +
          '<span class="chip">' + (state.plan.direction === 'bulk' ? '增肌' : '减脂') + '</span>' +
        '</div>' +
        '<div class="rings">' +
          ring('蛋白 (g)', t.protein, m.protein, 'var(--orange)', '') +
          ring('碳水 (g)', t.carbs, m.carbs, 'var(--blue)', '') +
          ring('脂肪 (g)', t.fat, m.fat, 'var(--red)', '') +
          ring('饮水 (ml)', t.water, tg.water, 'var(--teal)', '', 'data-act="water"') +
        '</div>' +
      '</section>' +

      '<section class="card tight quick-card">' +
        '<div class="quick">' +
          quick('breakfast', ICON.coffee, '早饭') +
          quick('pre', ICON.bolt, '练前') +
          quick('lunch', ICON.bowl, '午饭') +
          quick('dinner', ICON.moon, '晚饭') +
          quick('snack', ICON.cookie, '加餐') +
          '<button class="q" data-act="workout"><span class="qi"><svg viewBox="0 0 24 24">' + ICON.dumb + '</svg></span><em>训练</em></button>' +
        '</div>' +
      '</section>' +

      '<section class="card trend">' +
        '<div class="card-t"><b>趋势</b>' +
          '<div class="seg">' +
            '<button class="' + (range === 'day' ? 'on' : '') + '" data-act="range" data-range="day">日</button>' +
            '<button class="' + (range === 'week' ? 'on' : '') + '" data-act="range" data-range="week">周</button>' +
            '<button class="' + (range === 'month' ? 'on' : '') + '" data-act="range" data-range="month">月</button>' +
          '</div>' +
        '</div>' +
        '<div class="chart-row">' +
          '<div class="cr-top"><span class="n">体重 · ' + rangeLabel + '</span>' +
            '<span class="v">' + (lastW === null ? '--' : f1(lastW)) + '<small>kg</small>' +
            '<span class="d">' + deltaLabel(weights) + '</span></span></div>' +
          '<div class="plot">' + plot(weights, '#0F766E', { raw: raws }) + '</div>' +
        '</div>' +
        '<div class="chart-row">' +
          '<div class="cr-top"><span class="n">训练消耗 · ' + rangeLabel + '</span>' +
            '<span class="v">' + (lastB === null ? '--' : n0(lastB)) + '<small>kcal</small>' +
            '<span class="d">' + deltaLabel(burns) + '</span></span></div>' +
          '<div class="plot">' + plot(burns, '#C2861F') + '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  function quick(meal, icon, label) {
    return '<button class="q" data-act="meal" data-meal="' + meal + '">' +
      '<span class="qi"><svg viewBox="0 0 24 24">' + icon + '</svg></span><em>' + label + '</em></button>';
  }

  function ring(label, value, goal, color, unit, extra) {
    var pct = goal > 0 ? Math.min(value / goal, 1) : 0;
    var circ = 2 * Math.PI * 42;
    var dash = (pct * circ).toFixed(1) + ' ' + (circ - pct * circ).toFixed(1);
    return '<div class="ring-item' + (value > goal ? ' over' : '') + '" ' + (extra || '') + '>' +
      '<div class="ring"><svg viewBox="0 0 100 100">' +
        '<circle class="track" cx="50" cy="50" r="42" stroke="' + color + '"/>' +
        '<circle class="arc" cx="50" cy="50" r="42" stroke="' + color + '" stroke-dasharray="' + dash + '"/>' +
        '<circle cx="50" cy="8" r="4" fill="' + color + '"/>' +
      '</svg><div class="val">' + n0(value) + '</div></div>' +
      '<div><div class="ring-l">' + label + '</div><div class="ring-p">' + n0(value) + ' / ' + n0(goal) + unit + '</div></div>' +
    '</div>';
  }

  /* ---------------- 数据 ---------------- */
  function viewData() {
    var y = calMonth.getFullYear(), mo = calMonth.getMonth();
    var first = new Date(y, mo, 1);
    var startDow = (first.getDay() + 6) % 7;
    var dim = new Date(y, mo + 1, 0).getDate();
    var todayK = S.todayKey();

    var cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div class="d out"></div>';
    for (var d = 1; d <= dim; d++) {
      var key = y + '-' + (mo + 1 < 10 ? '0' : '') + (mo + 1) + '-' + (d < 10 ? '0' : '') + d;
      var day = state.days[key];
      var st = day ? S.statusOf(state, key) : 'empty';
      cells += '<button class="d ' + st + (day && day.train ? ' train' : '') +
        (key === todayK ? ' today' : '') + (key === selDate ? ' sel' : '') +
        '" data-act="cal-day" data-date="' + key + '"><span>' + d + '</span><i class="dot"></i></button>';
    }

    var sel = state.days[selDate];
    var selT = S.dayTotals(sel);
    var selGoal = S.targets(state.plan, sel || S.newDay());

    var bars = [
      ['热量', selT.kcal, selGoal.kcal, ''],
      ['蛋白', selT.protein, selGoal.macros.protein, 'g'],
      ['碳水', selT.carbs, selGoal.macros.carbs, 'g'],
      ['脂肪', selT.fat, selGoal.macros.fat, 'g'],
      ['饮水', selT.water, selGoal.water, 'ml']
    ].map(function (b) {
      var pct = b[2] > 0 ? Math.min(b[1] / b[2] * 100, 100) : 0;
      var cls = b[1] > b[2] * 1.15 ? 'over' : b[1] > b[2] * 1.02 ? 'warm' : '';
      return '<div class="daybar"><span class="k">' + b[0] + '</span>' +
        '<span class="t"><i class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="v">' + n0(b[1]) + ' / ' + n0(b[2]) + '</span></div>';
    }).join('');

    var foods = state.foods.slice().sort(function (a, b) { return (b.lastUsedAt || 0) - (a.lastUsedAt || 0); });
    var foodList = foods.length ? foods.map(function (f) {
      var per = f.mode === 'per100g' ? '每 100 g' : '每' + esc(f.servingName || '份');
      return '<div class="row tap" data-act="edit-food" data-id="' + f.id + '">' +
        '<span class="k">' + esc(f.name) + '</span>' +
        '<span class="v">' + per + ' · ' + n0(f.kcal || (f.carbs * 4 + f.protein * 4 + f.fat * 9)) + ' 大卡 <span class="go">›</span></span></div>';
    }).join('') : '<div class="hint">还没有自定义食物。录一次常吃的，以后一餐两秒记完。</div>';

    return '<div class="page">' +
      '<div class="head"><div><h1>数据</h1><div class="sub">每日达标 · 自定义食物</div></div></div>' +

      '<section class="card">' +
        '<div class="card-t"><b>' + y + ' 年 ' + (mo + 1) + ' 月</b>' +
          '<div style="display:flex;gap:2px">' +
            '<button class="circle" style="width:30px;height:30px;font-size:14px" data-act="cal-prev">‹</button>' +
            '<button class="circle" style="width:30px;height:30px;font-size:14px" data-act="cal-next">›</button>' +
          '</div>' +
        '</div>' +
        '<div class="cal">' +
          '<div class="dw">一</div><div class="dw">二</div><div class="dw">三</div><div class="dw">四</div><div class="dw">五</div><div class="dw">六</div><div class="dw">日</div>' +
          cells +
        '</div>' +
        '<div class="hint">绿点达标 · 橙点略超 · 红点超较多 · 灰底 = 力训日</div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-t"><b>' + S.dayLabel(selDate) + ' · 达标</b>' +
          '<button class="pill" data-act="open-day">打开 ›</button></div>' +
        bars +
      '</section>' +

      '<section class="card">' +
        '<div class="card-t"><b>自定义食物</b><span class="more">' + foods.length + ' 种</span></div>' +
        '<div class="rows">' + foodList + '</div>' +
        '<button class="addbtn" data-act="add-food">＋ 新增食物</button>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-t"><b>能量换算</b><span class="more">1 kcal = 4.184 kJ</span></div>' +
        '<div class="conv">' +
          '<div class="box"><div class="lb">千卡</div><input type="number" inputmode="decimal" id="conv-kcal" placeholder="0"><div class="lb" style="margin-top:2px">kcal</div></div>' +
          '<div class="eq">=</div>' +
          '<div class="box"><div class="lb">千焦</div><input type="number" inputmode="decimal" id="conv-kj" placeholder="0"><div class="lb" style="margin-top:2px">kJ</div></div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  /* ---------------- 身体 ---------------- */
  function viewBody() {
    var p = state.plan;
    var allKeys = Object.keys(state.days).filter(function (k) {
      var d = state.days[k];
      return d.weightKg !== null && d.weightKg !== undefined && d.weightKg !== '';
    }).sort().reverse();
    var recent = allKeys.slice(0, 3).map(function (k) {
      return '<div class="row"><span class="k">' + S.dayLabel(k) + '</span><span class="v"><b>' + f1(state.days[k].weightKg) + '</b> kg</span></div>';
    }).join('');
    var ma = S.ma7(state, S.todayKey());

    return '<div class="page">' +
      '<div class="head"><div><h1>身体</h1><div class="sub">档案 · 体重 · 设置</div></div>' +
        '<button class="circle" data-act="plan">✎</button></div>' +

      '<section class="card">' +
        '<div class="card-t"><b>身体档案</b><span class="more">' + (p.direction === 'bulk' ? '增肌' : '减脂') + '</span></div>' +
        '<div class="rows">' +
          '<div class="row"><span class="k">身高</span><span class="v"><b>' + n0(p.heightCm) + '</b> cm</span></div>' +
          '<div class="row"><span class="k">年龄</span><span class="v"><b>' + n0(p.age) + '</b> 岁</span></div>' +
          '<div class="row"><span class="k">性别</span><span class="v">' + (p.sex === 'male' ? '男' : '女') + '</span></div>' +
          '<div class="row"><span class="k">方案体重</span><span class="v"><b>' + f1(p.weightKg) + '</b> kg</span></div>' +
          '<div class="row"><span class="k">基础代谢</span><span class="v"><b>' + n0(S.bmr(p)) + '</b> kcal</span></div>' +
          '<div class="row"><span class="k">力训日应吃</span><span class="v"><b>' + n0(S.targetKcal(p, { train: true })) + '</b> kcal</span></div>' +
        '</div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-t"><b>记录体重</b><span class="more">7 日均值 ' + (ma === null ? '--' : f1(ma)) + '</span></div>' +
        '<div class="winput">' +
          '<input type="number" inputmode="decimal" step="0.1" id="w-input" placeholder="输入今天体重">' +
          '<span class="u">kg</span>' +
          '<button class="wbtn" data-act="save-weight">记录</button>' +
        '</div>' +
        '<div class="rows" style="margin-top:10px">' + (recent || '<div class="hint">还没有体重记录</div>') + '</div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-t"><b>设置</b></div>' +
        '<div class="rows">' +
          '<div class="row tap" data-act="plan"><span class="k">训练与饮食方案</span><span class="v">' + (p.direction === 'bulk' ? '增肌' : '减脂') + ' <span class="go">›</span></span></div>' +
          '<div class="row tap" data-act="backup"><span class="k">数据备份与恢复</span><span class="v">' + backupLabel() + ' <span class="go">›</span></span></div>' +
          '<div class="row tap" data-act="about"><span class="k">关于</span><span class="v">v0.6.1 <span class="go">›</span></span></div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  function backupLabel() {
    if (!state.lastBackupAt) return '未备份';
    var days = Math.floor((Date.now() - new Date(state.lastBackupAt).getTime()) / 86400000);
    return days <= 0 ? '今天已备份' : days + ' 天前';
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var keep = app.scrollTop;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('on', t.dataset.view === view);
    });
    app.innerHTML = view === 'today' ? viewToday() : view === 'data' ? viewData() : viewBody();
    app.scrollTop = keep;
  }

  /* ---------------- 弹层 ---------------- */
  function openSheet(title, body) {
    modal.innerHTML = '<div class="mask"><div class="sheet">' +
      '<div class="sheet-h"><b>' + title + '</b><button class="x" data-act="close">×</button></div>' +
      '<div class="sheet-b">' + body + '</div></div></div>';
    return modal;
  }
  function closeSheet() { modal.innerHTML = ''; }

  /* ---- 记一餐 ---- */
  function openMeal(mealId) {
    var day = dayOf(cursor, true);
    var foods = state.foods.slice().sort(function (a, b) { return (b.lastUsedAt || 0) - (a.lastUsedAt || 0); });
    var options = '<option value="">手动输入</option>' + foods.map(function (f) {
      return '<option value="' + f.id + '">' + esc(f.name) + '</option>';
    }).join('');

    openSheet('记一餐', '' +
      '<div class="fields">' +
        '<label class="field">餐次<select id="f-meal">' + S.MEALS.map(function (m) {
          return '<option value="' + m.id + '"' + (m.id === mealId ? ' selected' : '') + '>' + m.name + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field">食物<select id="f-src">' + options + '</select></label>' +
        '<div id="f-dyn"></div>' +
        '<button class="primary" id="f-add">添加</button>' +
      '</div>' +
      '<div class="rows" id="f-list" style="margin-top:8px"></div>');

    function paintList() {
      var list = q('#f-list');
      var items = (day.foods || []).filter(function (f) { return f.meal === q('#f-meal').value; });
      list.innerHTML = items.length ? items.map(function (f) {
        return '<div class="list-item"><div class="nm">' + esc(f.name) +
          '<small>' + n0(f.carbs) + ' 碳 · ' + n0(f.protein) + ' 蛋 · ' + n0(f.fat) + ' 脂</small></div>' +
          '<div class="v" style="font-weight:600">' + n0(S.entryKcal(f)) + '</div>' +
          '<button class="del" data-act="del-food" data-id="' + f.id + '">×</button></div>';
      }).join('') : '<div class="hint">这一餐还没记东西</div>';
    }

    function paintDyn() {
      var id = q('#f-src').value;
      var box = q('#f-dyn');
      if (!id) {
        box.innerHTML =
          '<label class="field">名称<input type="text" id="f-name" placeholder="如 鸡蛋"></label>' +
          '<div class="frow">' +
            '<label class="field">碳水 g<input type="number" step="0.1" id="f-carb" value=""></label>' +
            '<label class="field">蛋白 g<input type="number" step="0.1" id="f-pro" value=""></label>' +
          '</div>' +
          '<div class="frow">' +
            '<label class="field">脂肪 g<input type="number" step="0.1" id="f-fat" value=""></label>' +
            '<label class="field">热量<input type="number" step="1" id="f-kcal" placeholder="自动算"></label>' +
          '</div>';
      } else {
        var f = state.foods.filter(function (x) { return x.id === id; })[0];
        var unit = f.mode === 'per100g' ? '克数 g' : '份数（1 份 = ' + esc(f.servingName || '一份') + '）';
        var step = f.mode === 'per100g' ? '10' : '0.5';
        box.innerHTML = '<label class="field">' + unit + '<input type="number" step="' + step + '" id="f-qty" value="' +
          (f.mode === 'per100g' ? '100' : '1') + '"></label>' +
          '<div class="hint" id="f-prev"></div>';
        var qi = q('#f-qty');
        function upd() {
          var mm = S.foodMacros(f, num(qi.value) || 0);
          q('#f-prev').textContent = '约 ' + n0(mm.carbs) + ' 碳 · ' + n0(mm.protein) + ' 蛋 · ' + n0(mm.fat) + ' 脂 · ' +
            n0(mm.kcal === null ? mm.carbs * 4 + mm.protein * 4 + mm.fat * 9 : mm.kcal) + ' 大卡';
        }
        qi.addEventListener('input', upd);
        upd();
      }
    }

    q('#f-src').addEventListener('change', paintDyn);
    q('#f-meal').addEventListener('change', paintList);
    paintDyn();
    paintList();

    q('#f-add').addEventListener('click', function () {
      var meal = q('#f-meal').value;
      var id = q('#f-src').value;
      if (id) {
        var f = state.foods.filter(function (x) { return x.id === id; })[0];
        var qty = num(q('#f-qty').value) || 0;
        if (!qty) return;
        var mm = S.foodMacros(f, qty);
        day.foods.push({
          id: uid(), meal: meal, name: f.name,
          mode: f.mode, amountG: f.mode === 'per100g' ? qty : null, servings: f.mode === 'perServing' ? qty : null,
          carbs: mm.carbs, protein: mm.protein, fat: mm.fat, kcal: mm.kcal, micros: {}
        });
        f.lastUsedAt = Date.now();
      } else {
        var name = (q('#f-name').value || '').trim();
        if (!name) return;
        day.foods.push({
          id: uid(), meal: meal, name: name, mode: 'manual', amountG: null, servings: null,
          carbs: num(q('#f-carb').value) || 0, protein: num(q('#f-pro').value) || 0,
          fat: num(q('#f-fat').value) || 0, kcal: num(q('#f-kcal').value), micros: {}
        });
      }
      persist();
      openMeal(meal);
    });
  }

  /* ---- 记训练 ---- */
  function openWorkout() {
    var day = dayOf(cursor, true);
    var w = (day.workouts || [])[0];

    function box() {
      var sets = (w && w.sets) || [];
      var rows = sets.length ? sets.map(function (s, i) {
        return '<div class="list-item"><div class="nm">' + esc(s.exercise) +
          '<small>' + n0(s.sets) + ' 组 × ' + n0(s.reps) + ' 次 × ' + f1(s.weight) + ' kg</small></div>' +
          '<button class="del" data-act="del-set" data-i="' + i + '">×</button></div>';
      }).join('') : '<div class="hint">今天还没有动作</div>';

      return '<div class="fields">' +
        '<div class="frow">' +
          '<label class="field" style="flex:1.6">动作<input type="text" id="w-ex" placeholder="如 杠铃深蹲"></label>' +
          '<label class="field">组<input type="number" id="w-sets" value="4"></label>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">次<input type="number" id="w-reps" value="8"></label>' +
          '<label class="field">重量 kg<input type="number" step="0.5" id="w-kg" value=""></label>' +
        '</div>' +
        '<button class="primary" id="w-add">加一组</button>' +
      '</div>' +
      '<div class="rows" style="margin-top:8px">' + rows + '</div>' +
      (w ? '<div class="hint">本次消耗按方案值计：' + n0(w.kcal) + ' kcal</div>' : '');
    }

    function paint() {
      q('.sheet-b').innerHTML = box();
      q('#w-add').addEventListener('click', function () {
        var name = (q('#w-ex').value || '').trim();
        if (!name) return;
        if (!w) {
          w = { id: uid(), name: '力量训练', sets: [], kcal: Number(state.plan.liftKcal) || 0, overridden: false };
          day.workouts.push(w);
        }
        w.sets.push({ exercise: name, sets: num(q('#w-sets').value) || 0, reps: num(q('#w-reps').value) || 0, weight: num(q('#w-kg').value) || 0 });
        persist();
        paint();
      });
    }

    openSheet('记训练', box());
    paint();
  }

  /* ---- 记有氧 ---- */
  function openCardio() {
    var day = dayOf(cursor, true);
    openSheet('记有氧', '' +
      '<div class="fields">' +
        '<label class="field">项目<select id="c-act">' + S.ACTIVITIES.map(function (a) {
          return '<option value="' + a.id + '">' + a.name + '（' + a.rate + ' kcal/kg/h）</option>';
        }).join('') + '</select></label>' +
        '<label class="field">时长 分钟<input type="number" id="c-min" value="40"></label>' +
        '<button class="primary" id="c-add">添加</button>' +
      '</div>' +
      '<div class="rows" id="c-list" style="margin-top:8px"></div>');

    function paint() {
      var items = day.cardios || [];
      q('#c-list').innerHTML = items.length ? items.map(function (c, i) {
        return '<div class="list-item"><div class="nm">' + esc(c.name) + '<small>' + n0(c.minutes) + ' 分钟</small></div>' +
          '<div style="font-weight:600">' + n0(c.kcal) + '</div>' +
          '<button class="del" data-act="del-cardio" data-i="' + i + '">×</button></div>';
      }).join('') : '<div class="hint">今天还没有有氧</div>';
    }
    paint();

    q('#c-add').addEventListener('click', function () {
      var a = S.ACTIVITIES.filter(function (x) { return x.id === q('#c-act').value; })[0] || S.ACTIVITIES[0];
      var min = num(q('#c-min').value) || 0;
      if (!min) return;
      day.cardios.push({
        id: uid(), act: a.id, name: a.name, minutes: min,
        kcal: Math.round(a.rate * Number(state.plan.weightKg) * (min / 60)), overridden: false
      });
      persist();
      paint();
    });
  }

  /* ---- 饮水 ---- */
  function openWater() {
    var day = dayOf(cursor, true);
    openSheet('记饮水', '' +
      '<div class="fields">' +
        '<div class="hint">今天已喝 ' + n0(day.waterMl) + ' ml，目标 ' + n0(state.plan.waterMl) + ' ml</div>' +
        '<div class="frow">' +
          '<button class="ghost" data-act="water-add" data-ml="250">+250 ml</button>' +
          '<button class="ghost" data-act="water-add" data-ml="500">+500 ml</button>' +
        '</div>' +
        '<label class="field">自定义 ml<input type="number" id="water-ml" placeholder="300"></label>' +
        '<button class="primary" data-act="water-custom">添加</button>' +
        '<button class="ghost danger" data-act="water-reset">清零</button>' +
      '</div>');
  }

  /* ---- 记体重 ---- */
  function openWeight() {
    var day = dayOf(cursor, true);
    openSheet('记录体重', '' +
      '<div class="fields">' +
        '<label class="field">体重 kg<input type="number" inputmode="decimal" step="0.1" id="wt-kg" value="' +
          (day.weightKg === null || day.weightKg === undefined ? '' : day.weightKg) + '"></label>' +
        '<label class="field">日期<input type="date" id="wt-date" value="' + cursor + '"></label>' +
        '<button class="primary" id="wt-save">保存</button>' +
      '</div>');
    q('#wt-save').addEventListener('click', function () {
      var kg = num(q('#wt-kg').value);
      var key = q('#wt-date').value || cursor;
      if (kg === null) return;
      dayOf(key, true).weightKg = kg;
      state.plan.weightKg = kg;
      cursor = key;
      persist();
      closeSheet();
    });
  }
  function openFoodModeDispatch(mode, f) {
    /* 切换计量方式时保留已填内容 */
    var keep = {
      name: (q('#fd-name') || {}).value || '',
      serving: (q('#fd-serving') || {}).value || '',
      carbs: (q('#fd-carb') || {}).value || '',
      protein: (q('#fd-pro') || {}).value || '',
      fat: (q('#fd-fat') || {}).value || '',
      kcal: (q('#fd-kcal') || {}).value || ''
    };
    openSheet(f ? '编辑食物' : '新增食物', foodForm(mode, f, keep));
    wireFoodForm(mode, f, keep);
  }

  function foodForm(md, f, keep) {
    keep = keep || {};
    var name = keep.name !== undefined && keep.name !== '' ? keep.name : (f ? f.name : '');
    var serving = keep.serving !== undefined && keep.serving !== '' ? keep.serving : (f ? (f.servingName || '') : '');
    var carb = keep.carbs !== undefined && keep.carbs !== '' ? keep.carbs : (f ? f1(f.carbs) : '');
    var pro = keep.protein !== undefined && keep.protein !== '' ? keep.protein : (f ? f1(f.protein) : '');
    var fat = keep.fat !== undefined && keep.fat !== '' ? keep.fat : (f ? f1(f.fat) : '');
    var kcal = keep.kcal !== undefined && keep.kcal !== '' ? keep.kcal : (f && f.kcal !== null && f.kcal !== undefined ? f.kcal : '');

    return '<div class="fields">' +
      '<div class="mode-seg" id="food-mode">' +
        '<button class="' + (md === 'per100g' ? 'on' : '') + '" data-m="per100g">每 100 g</button>' +
        '<button class="' + (md === 'perServing' ? 'on' : '') + '" data-m="perServing">每份</button>' +
      '</div>' +
      '<label class="field">名称<input type="text" id="fd-name" value="' + esc(name) + '" placeholder="如 鸡胸肉 / 一碗米饭"></label>' +
      (md === 'perServing'
        ? '<label class="field">一份叫什么<input type="text" id="fd-serving" value="' + esc(serving) + '" placeholder="碗 / 个 / 盘"></label>'
        : '<div class="hint">按包装上的营养成分表填，通常是每 100 g。</div>') +
      '<div class="frow">' +
        '<label class="field">碳水 g<input type="number" step="0.1" id="fd-carb" value="' + carb + '"></label>' +
        '<label class="field">蛋白 g<input type="number" step="0.1" id="fd-pro" value="' + pro + '"></label>' +
      '</div>' +
      '<div class="frow">' +
        '<label class="field">脂肪 g<input type="number" step="0.1" id="fd-fat" value="' + fat + '"></label>' +
        '<label class="field">热量<input type="number" step="1" id="fd-kcal" value="' + kcal + '" placeholder="自动算"></label>' +
      '</div>' +
      '<button class="primary" id="fd-save">' + (f ? '保存' : '添加') + '</button>' +
      (f ? '<button class="ghost danger" data-act="del-custom" data-id="' + f.id + '">删除这个食物</button>' : '') +
    '</div>';
  }

  function wireFoodForm(md, f, keep) {
    Array.prototype.forEach.call(document.querySelectorAll('#food-mode button'), function (b) {
      b.addEventListener('click', function () {
        openFoodModeDispatch(b.dataset.m, f);
      });
    });
    q('#fd-save').addEventListener('click', function () {
      var nm = (q('#fd-name').value || '').trim();
      if (!nm) return;
      var item = {
        id: f ? f.id : uid(),
        name: nm,
        mode: md,
        servingName: md === 'perServing' ? ((q('#fd-serving') || {}).value || '份') : null,
        carbs: num(q('#fd-carb').value) || 0,
        protein: num(q('#fd-pro').value) || 0,
        fat: num(q('#fd-fat').value) || 0,
        kcal: num(q('#fd-kcal').value),
        lastUsedAt: f ? f.lastUsedAt : Date.now()
      };
      if (f) state.foods[state.foods.indexOf(f)] = item;
      else state.foods.push(item);
      persist();
      closeSheet();
    });
  }

  /* ---- 方案 ---- */
  function openPlan() {
    var p = state.plan;
    var d = p[p.direction];
    openSheet('训练与饮食方案', '' +
      '<div class="fields">' +
        '<div class="mode-seg" id="pl-dir">' +
          '<button class="' + (p.direction === 'bulk' ? 'on' : '') + '" data-d="bulk">增肌</button>' +
          '<button class="' + (p.direction === 'cut' ? 'on' : '') + '" data-d="cut">减脂</button>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">年龄<input type="number" id="pl-age" value="' + n0(p.age) + '"></label>' +
          '<label class="field">身高 cm<input type="number" id="pl-h" value="' + n0(p.heightCm) + '"></label>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">体重 kg<input type="number" step="0.1" id="pl-w" value="' + f1(p.weightKg) + '"></label>' +
          '<label class="field">性别<select id="pl-sex"><option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>男</option><option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>女</option></select></label>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">力训日消耗<input type="number" id="pl-lift" value="' + n0(p.liftKcal) + '"></label>' +
          '<label class="field">有氧日均<input type="number" id="pl-cardio" value="' + n0(p.cardioKcal) + '"></label>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">蛋白质 g/kg<input type="number" step="0.1" id="pl-pro" value="' + f1(p.proteinPerKg) + '"></label>' +
          '<label class="field">饮水目标 ml<input type="number" id="pl-water" value="' + n0(p.waterMl) + '"></label>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">脂肪 g<input type="number" id="pl-fat" value="' + n0(d.fatG) + '"></label>' +
          '<label class="field">碳水 g/kg 力训<input type="number" step="0.1" id="pl-ct" value="' + f1(d.carbTrain) + '"></label>' +
        '</div>' +
        '<label class="field">碳水 g/kg 休息<input type="number" step="0.1" id="pl-cr" value="' + f1(d.carbRest) + '"></label>' +
        '<button class="primary" id="pl-save">保存</button>' +
        '<div class="hint">改完立即重算目标。计算口径见 PRD §5，与 Excel 表 11 一致。</div>' +
      '</div>');

    Array.prototype.forEach.call(document.querySelectorAll('#pl-dir button'), function (b) {
      b.addEventListener('click', function () {
        p.direction = b.dataset.d;
        persist();
        openPlan();
      });
    });

    q('#pl-save').addEventListener('click', function () {
      p.age = num(q('#pl-age').value) || p.age;
      p.heightCm = num(q('#pl-h').value) || p.heightCm;
      p.weightKg = num(q('#pl-w').value) || p.weightKg;
      p.sex = q('#pl-sex').value;
      p.liftKcal = num(q('#pl-lift').value) || 0;
      p.cardioKcal = num(q('#pl-cardio').value) || 0;
      p.proteinPerKg = num(q('#pl-pro').value) || 1.9;
      p.waterMl = num(q('#pl-water').value) || 2000;
      var dd = p[p.direction];
      dd.fatG = num(q('#pl-fat').value) || dd.fatG;
      dd.carbTrain = num(q('#pl-ct').value) || dd.carbTrain;
      dd.carbRest = num(q('#pl-cr').value) || dd.carbRest;
      persist();
      closeSheet();
    });
  }

  /* ---- 备份 ---- */
  function openBackup() {
    openSheet('数据备份与恢复', '' +
      '<div class="fields">' +
        '<div class="hint">上次备份：' + backupLabel() + '。数据存在本机浏览器里，换地址或清理缓存会丢，建议每周导一次。</div>' +
        '<button class="primary" data-act="export-json">导出备份（JSON）</button>' +
        '<button class="ghost" data-act="export-csv">导出表格（CSV）</button>' +
        '<button class="ghost" data-act="import">从备份恢复</button>' +
        '<button class="ghost danger" data-act="reset">清空全部数据</button>' +
      '</div>');
  }

  function openAbout() {
    var days = Object.keys(state.days).filter(function (k) { return !S.isEmptyDay(state.days[k]); }).length;
    openSheet('关于', '' +
      '<div class="rows">' +
        '<div class="row"><span class="k">版本</span><span class="v">v0.6.1</span></div>' +
        '<div class="row"><span class="k">有记录的天数</span><span class="v">' + days + ' 天</span></div>' +
        '<div class="row"><span class="k">自定义食物</span><span class="v">' + state.foods.length + ' 种</span></div>' +
        '<div class="row"><span class="k">方案</span><span class="v">' + (state.plan.direction === 'bulk' ? '增肌' : '减脂') + ' · 午饭前练</span></div>' +
      '</div>' +
      '<div class="hint">计算口径与《健身饮食.xlsx》表 11 一致，改动会先写测试再改代码。</div>');
  }

  /* ---------------- 导出导入 ---------------- */
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }
  function stamp() { return S.todayKey().replace(/-/g, ''); }

  function importFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state = S.normalize(JSON.parse(String(reader.result)));
          persist();
          closeSheet();
          alert('导入成功：' + Object.keys(state.days).length + ' 天');
        } catch (e) { alert('导入失败：文件格式不对'); }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.tab');
    if (tab) { view = tab.dataset.view; render(); return; }

    if (e.target.classList && e.target.classList.contains('mask')) { closeSheet(); return; }

    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.dataset.act;
    var day = dayOf(cursor, true);

    switch (act) {
      case 'close': closeSheet(); break;
      case 'toggle-train': day.train = !day.train; persist(); break;
      case 'range': range = el.dataset.range; render(); break;
      case 'meal': openMeal(el.dataset.meal); break;
      case 'workout': openWorkout(); break;
      case 'water': openWater(); break;
      case 'water-add': day.waterMl = (day.waterMl || 0) + Number(el.dataset.ml); persist(); closeSheet(); break;
      case 'water-custom': {
        var ml = num(q('#water-ml') && q('#water-ml').value);
        if (ml) { day.waterMl = (day.waterMl || 0) + ml; persist(); closeSheet(); }
        break;
      }
      case 'water-reset': day.waterMl = 0; persist(); closeSheet(); break;
      case 'save-weight': {
        var kg = num(q('#w-input') && q('#w-input').value);
        if (kg !== null) { day.weightKg = kg; state.plan.weightKg = kg; persist(); }
        break;
      }
      case 'cal-prev': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); render(); break;
      case 'cal-next': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); render(); break;
      case 'cal-day': selDate = el.dataset.date; cursor = selDate; render(); break;
      case 'open-day': view = 'today'; cursor = selDate; render(); break;
      case 'add-food': openFoodEdit(null); break;
      case 'edit-food': openFoodEdit(el.dataset.id); break;
      case 'del-custom': {
        state.foods = state.foods.filter(function (f) { return f.id !== el.dataset.id; });
        persist(); closeSheet();
        break;
      }
      case 'del-food': {
        day.foods = (day.foods || []).filter(function (f) { return f.id !== el.dataset.id; });
        persist();
        openMeal(q('#f-meal').value);
        break;
      }
      case 'del-set': {
        var w = (day.workouts || [])[0];
        if (w) { w.sets.splice(Number(el.dataset.i), 1); persist(); openWorkout(); }
        break;
      }
      case 'del-cardio': {
        day.cardios.splice(Number(el.dataset.i), 1);
        persist(); openCardio();
        break;
      }
      case 'plan': openPlan(); break;
      case 'backup': openBackup(); break;
      case 'about': openAbout(); break;
      case 'export-json':
        state.lastBackupAt = new Date().toISOString();
        S.save(state);
        download('最好的我-备份-' + stamp() + '.json', JSON.stringify(state, null, 2));
        render();
        break;
      case 'export-csv':
        download('最好的我-' + stamp() + '.csv', '\ufeff' + S.toCsv(state), 'text/csv');
        break;
      case 'import': importFile(); break;
      case 'reset':
        if (confirm('确定清空全部数据？建议先导出备份。')) { state = S.emptyState(); persist(); closeSheet(); }
        break;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'conv-kcal') {
      var v = Number(e.target.value);
      q('#conv-kj').value = v ? (v * 4.184).toFixed(0) : '';
    } else if (e.target.id === 'conv-kj') {
      var v2 = Number(e.target.value);
      q('#conv-kcal').value = v2 ? (v2 / 4.184).toFixed(0) : '';
    }
  });

  /* 兼容旧调用名 */
  function openFoodEdit(id) { openFood2(id); }

  function openFood2(id) {
    var f = id ? state.foods.filter(function (x) { return x.id === id; })[0] : null;
    var md = f ? f.mode : 'per100g';
    openSheet(f ? '编辑食物' : '新增食物', foodForm(md, f));
    wireFoodForm(md, f);
  }

  window.ZGHDBug = {
    getState: function () { return state; },
    setState: function (s) { state = s; S.save(state); render(); },
    go: function (v, key) { if (key) cursor = key; view = v; render(); }
  };

  render();
})();
