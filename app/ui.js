/* 最好的我 — 界面 v3：按顿记营养，按总运动量记训练 */
(function () {
  'use strict';

  var S = window.Store;
  var state = S.load();
  var view = 'today';
  var cursor = S.todayKey();
  var range = 'day';
  var calMonth = S.parseKey(cursor);
  var selDate = cursor;
  var editingMeal = 'breakfast';
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

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f1(n) { var v = Math.round((Number(n) || 0) * 10) / 10; return v % 1 === 0 ? String(v) : v.toFixed(1); }
  function n0(n) { return String(Math.round(Number(n) || 0)); }
  function q(sel) { return document.querySelector(sel); }
  function num(v) { if (v === null || v === undefined || String(v).trim() === '') return null; var n = Number(v); return isNaN(n) ? null : n; }

  function dayOf(key, create) {
    if (!state.days[key] && create) state.days[key] = S.newDay();
    return state.days[key] || S.newDay();
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

    var isDay = range === 'day';
    var weights = tr.map(function (p) { return isDay ? p.ma : p.weight; });
    var raws = isDay ? tr.map(function (p) { return p.weight; }) : [];
    var burns = tr.map(function (p) { return p.burn; });

    var lastW = null, lastB = null;
    for (var i = tr.length - 1; i >= 0; i--) {
      if (lastW === null && weights[i] !== null) lastW = weights[i];
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
          ring('蛋白 (g)', t.protein, m.protein, 'var(--orange)') +
          ring('碳水 (g)', t.carbs, m.carbs, 'var(--blue)') +
          ring('脂肪 (g)', t.fat, m.fat, 'var(--red)') +
          ring('饮水 (ml)', t.water, tg.water, 'var(--teal)', 'data-act="water"') +
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

  function ring(label, value, goal, color, extra) {
    var pct = goal > 0 ? Math.min(value / goal, 1) : 0;
    var circ = 2 * Math.PI * 42;
    var dash = (pct * circ).toFixed(1) + ' ' + (circ - pct * circ).toFixed(1);
    return '<div class="ring-item' + (value > goal ? ' over' : '') + '" ' + (extra || '') + '>' +
      '<div class="ring"><svg viewBox="0 0 100 100">' +
        '<circle class="track" cx="50" cy="50" r="42" stroke="' + color + '"/>' +
        '<circle class="arc" cx="50" cy="50" r="42" stroke="' + color + '" stroke-dasharray="' + dash + '"/>' +
        '<circle cx="50" cy="8" r="4" fill="' + color + '"/>' +
      '</svg><div class="val">' + n0(value) + '</div></div>' +
      '<div><div class="ring-l">' + label + '</div><div class="ring-p">' + n0(value) + ' / ' + n0(goal) + '</div></div>' +
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
      ['热量', selT.kcal, selGoal.kcal],
      ['蛋白', selT.protein, selGoal.macros.protein],
      ['碳水', selT.carbs, selGoal.macros.carbs],
      ['脂肪', selT.fat, selGoal.macros.fat],
      ['饮水', selT.water, selGoal.water]
    ].map(function (b) {
      var pct = b[2] > 0 ? Math.min(b[1] / b[2] * 100, 100) : 0;
      var cls = b[1] > b[2] * 1.15 ? 'over' : b[1] > b[2] * 1.02 ? 'warm' : '';
      return '<div class="daybar"><span class="k">' + b[0] + '</span>' +
        '<span class="t"><i class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="v">' + n0(b[1]) + ' / ' + n0(b[2]) + '</span></div>';
    }).join('');

    var burnInfo = S.burnTotalOf(sel, state.plan);
    var balance = Math.round(selT.kcal - burnInfo.total);
    var burnCardHtml = '<section class="card">' +
      '<div class="card-t"><b>消耗与结余</b><span class="more">' + (burnInfo.source === 'health' ? '来自健康' : '按方案估算') + '</span></div>' +
      '<div class="rows">' +
        '<div class="row"><span class="k">摄入</span><span class="v"><b>' + n0(selT.kcal) + '</b> kcal</span></div>' +
        '<div class="row"><span class="k">消耗</span><span class="v"><b>' + n0(burnInfo.total) + '</b> kcal</span></div>' +
        '<div class="row"><span class="k">结余</span><span class="v"><b>' + (balance >= 0 ? '+' : '') + n0(balance) + '</b> kcal</span></div>' +
      '</div>' +
      (sel && sel.health
        ? '<div class="hint">活动 ' + n0(sel.health.active) + ' · 静息 ' + n0(sel.health.resting) + ' · 步数 ' + n0(sel.health.steps) + ' · 运动 ' + n0(sel.health.workoutMin) + ' 分钟</div>'
        : '<div class="hint">这一天还没有健康数据。去「身体 → 设置 → 健康数据导入」。</div>') +
      '</section>';

    var mealRows = S.MEALS.map(function (m) {
      var x = sel && sel.meals && sel.meals[m.id];
      var kc = S.mealKcal(x);
      return '<div class="row"><span class="k">' + m.name + '</span>' +
        '<span class="v">' + (kc ? n0(kc) + ' 大卡 · 碳' + n0(x.carbs) + ' 蛋' + n0(x.protein) + ' 脂' + n0(x.fat) : '—') + '</span></div>';
    }).join('');

    return '<div class="page">' +
      '<div class="head"><div><h1>数据</h1><div class="sub">每日达标 · 当天明细</div></div></div>' +

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

      burnCardHtml +
      '<section class="card">' +
        '<div class="card-t"><b>' + S.dayLabel(selDate) + ' · 吃了什么</b></div>' +
        '<div class="rows">' + mealRows + '</div>' +
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
          '<div class="row tap" data-act="health"><span class="k">健康数据导入</span><span class="v">' + (hasHealth() ? '已导入' : '未导入') + ' <span class="go">›</span></span></div>' +
          '<div class="row tap" data-act="backup"><span class="k">数据备份与恢复</span><span class="v">' + backupLabel() + ' <span class="go">›</span></span></div>' +
          '<div class="row tap" data-act="about"><span class="k">关于</span><span class="v">v0.7.0 <span class="go">›</span></span></div>' +
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
  }
  function closeSheet() { modal.innerHTML = ''; }

  /* ---- 记一餐：只填这一顿的总量 ---- */
  function openMeal(mealId) {
    editingMeal = mealId;
    var day = dayOf(cursor, true);
    var meal = S.MEALS.filter(function (m) { return m.id === mealId; })[0] || S.MEALS[0];
    var cur = (day.meals && day.meals[meal.id]) || null;

    openSheet('记' + meal.name, '' +
      '<div class="fields">' +
        '<div class="hint">只填这一顿的总量，不用拆到每样食物。热量留空就按 碳×4 + 蛋×4 + 脂×9 算。</div>' +
        '<div class="frow">' +
          '<label class="field">碳水 g<input type="number" step="1" id="m-carb" value="' + (cur ? f1(cur.carbs) : '') + '"></label>' +
          '<label class="field">蛋白 g<input type="number" step="1" id="m-pro" value="' + (cur ? f1(cur.protein) : '') + '"></label>' +
          '<label class="field">脂肪 g<input type="number" step="1" id="m-fat" value="' + (cur ? f1(cur.fat) : '') + '"></label>' +
        '</div>' +
        '<div class="frow">' +
          '<label class="field">热量 kcal<input type="number" step="1" id="m-kcal" value="' + (cur && cur.kcal !== null && cur.kcal !== undefined ? cur.kcal : '') + '" placeholder="自动算"></label>' +
          '<label class="field">备注<input type="text" id="m-note" value="' + esc(cur ? cur.note : '') + '" placeholder="如 米饭+鸡胸"></label>' +
        '</div>' +
        '<div class="hint" id="m-prev"></div>' +
        '<button class="primary" data-act="meal-save">保存</button>' +
        (cur ? '<button class="ghost danger" data-act="meal-clear">清掉这一餐</button>' : '') +
      '</div>');

    function upd() {
      var c = num(q('#m-carb').value) || 0, p = num(q('#m-pro').value) || 0, f = num(q('#m-fat').value) || 0;
      q('#m-prev').textContent = '合计约 ' + Math.round(c * 4 + p * 4 + f * 9) + ' 大卡';
    }
    ['#m-carb', '#m-pro', '#m-fat'].forEach(function (id) { q(id).addEventListener('input', upd); });
    upd();
  }

  /* ---- 记训练：力量一条、有氧一条，都是总数 ---- */
  function openWorkout() {
    var day = dayOf(cursor, true);
    var lift = day.lift || { kcal: state.plan.liftKcal, volume: 0 };
    var cardio = day.cardio || { act: 'walk', minutes: 0, kcal: 0 };

    openSheet('记训练', '' +
      '<div class="fields">' +
        '<div class="hint">力量和有氧分开，各填一个总数，不用记每个动作。</div>' +
        '<div style="font-size:12px;color:var(--muted)">力量训练</div>' +
        '<div class="frow">' +
          '<label class="field">总消耗 kcal<input type="number" step="1" id="t-lift" value="' + n0(lift.kcal) + '"></label>' +
          '<label class="field">总容量 kg（选填）<input type="number" step="10" id="t-vol" value="' + (lift.volume ? n0(lift.volume) : '') + '" placeholder="如 8600"></label>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:6px">有氧</div>' +
        '<div class="frow">' +
          '<label class="field">项目<select id="t-act">' + S.ACTIVITIES.map(function (a) {
            return '<option value="' + a.id + '"' + (a.id === cardio.act ? ' selected' : '') + '>' + a.name + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field">时长 分钟<input type="number" step="5" id="t-min" value="' + (cardio.minutes ? n0(cardio.minutes) : '') + '" placeholder="不填就是没做"></label>' +
        '</div>' +
        '<div class="hint" id="t-prev"></div>' +
        '<button class="primary" data-act="workout-save">保存</button>' +
        ((day.lift || day.cardio) ? '<button class="ghost danger" data-act="workout-clear">清掉今天的训练</button>' : '') +
      '</div>');

    function upd() {
      var a = S.ACTIVITIES.filter(function (x) { return x.id === q('#t-act').value; })[0] || S.ACTIVITIES[0];
      var min = num(q('#t-min').value) || 0;
      var kc = Math.round(a.rate * Number(state.plan.weightKg) * (min / 60));
      q('#t-prev').textContent = min ? '有氧约 ' + kc + ' 大卡（按 ' + f1(state.plan.weightKg) + ' kg）' : '没填时长就不记有氧';
    }
    q('#t-min').addEventListener('input', upd);
    q('#t-act').addEventListener('change', upd);
    upd();
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
        '<button class="primary" data-act="plan-save">保存</button>' +
        '<div class="hint">改完立即重算目标。口径见 PRD §5，与 Excel 表 11 一致。</div>' +
      '</div>');

    Array.prototype.forEach.call(document.querySelectorAll('#pl-dir button'), function (b) {
      b.addEventListener('click', function () {
        p.direction = b.dataset.d;
        persist();
        openPlan();
      });
    });
  }

  /* ---- 备份 / 关于 ---- */

  function hasHealth() {
    return Object.keys(state.days).some(function (k) { return !!state.days[k].health; });
  }

  function openHealth() {
    openSheet('健康数据导入', '' +
      '<div class="fields">' +
        '<div class="hint">用 iOS「快捷指令」把健康数据导出成一行文本，贴进来或存成文件导入。格式：<br>' +
        '<code>日期,活动能量,静息能量,步数,运动分钟</code><br>例如 <code>2026-11-13,412,1480,8342,35</code></div>' +
        '<label class="field">粘贴文本<textarea id="h-text" rows="5" style="font:12px/1.5 ui-monospace,Menlo,monospace" placeholder="2026-11-13,412,1480,8342,35"></textarea></label>' +
        '<button class="primary" data-act="health-import">导入粘贴的内容</button>' +
        '<button class="ghost" data-act="health-file">从文件导入（可多选）</button>' +
        '<div class="hint">导入后，这一天会用健康的「活动+静息」作为总消耗，替代方案估算。</div>' +
      '</div>');
  }

  function importHealthText(text) {
    var rows = S.parseHealth(text);
    if (!rows.length) { alert('没认出有效数据，检查格式'); return; }
    var n = S.applyHealth(state, rows);
    persist();
    closeSheet();
    alert('导入 ' + n + ' 天健康数据');
  }

  function openBackup() {
    openSheet('数据备份与恢复', '' +
      '<div class="fields">' +
        '<div class="hint">上次备份：' + backupLabel() + '。数据存在本机浏览器里，换地址或清缓存会丢，建议每周导一次。</div>' +
        '<button class="primary" data-act="export-json">导出备份（JSON）</button>' +
        '<button class="ghost" data-act="export-csv">导出表格（CSV）</button>' +
        '<button class="ghost" data-act="import">从备份恢复</button>' +
        '<button class="ghost danger" data-act="reset">清空全部数据</button>' +
      '</div>');
  }

  function openAbout() {
    var days = Object.keys(state.days).filter(function (k) { return !S.isEmptyDay(state.days[k]); }).length;
    var healthDays = Object.keys(state.days).filter(function (k) { return !!state.days[k].health; }).length;
    var lastHealth = Object.keys(state.days).filter(function (k) { return !!state.days[k].health; }).sort().pop();
    openSheet('关于', '' +
      '<div class="rows">' +
        '<div class="row"><span class="k">版本</span><span class="v">v0.7.0</span></div>' +
        '<div class="row"><span class="k">有记录的天数</span><span class="v">' + days + ' 天</span></div>' +
        '<div class="row"><span class="k">健康数据</span><span class="v">' + (healthDays ? healthDays + ' 天 · 最近 ' + (lastHealth || '--') : '未导入') + '</span></div>' +
        '<div class="row"><span class="k">方案</span><span class="v">' + (state.plan.direction === 'bulk' ? '增肌' : '减脂') + ' · 午饭前练</span></div>' +
      '</div>' +
      '<div class="hint">按顿记营养、按总运动量记训练。计算口径与《健身饮食.xlsx》表 11 一致。</div>');
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


  /* 支持一次选多个文件（每天一个 txt 的情况） */
  function pickHealthFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.txt,.csv,text/plain';
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      var texts = new Array(files.length);
      var left = files.length;
      files.forEach(function (f, i) {
        var reader = new FileReader();
        reader.onload = function () {
          texts[i] = String(reader.result);
          if (--left === 0) importHealthText(texts.join('\n'));
        };
        reader.readAsText(f);
      });
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

      case 'meal-save':
        day.meals[editingMeal] = {
          carbs: num(q('#m-carb').value) || 0,
          protein: num(q('#m-pro').value) || 0,
          fat: num(q('#m-fat').value) || 0,
          kcal: num(q('#m-kcal').value),
          note: (q('#m-note').value || '').trim()
        };
        persist(); closeSheet();
        break;
      case 'meal-clear':
        delete day.meals[editingMeal];
        persist(); closeSheet();
        break;

      case 'workout-save': {
        var a = S.ACTIVITIES.filter(function (x) { return x.id === q('#t-act').value; })[0] || S.ACTIVITIES[0];
        var min = num(q('#t-min').value) || 0;
        day.lift = { kcal: num(q('#t-lift').value) || 0, volume: num(q('#t-vol').value) || 0, note: '' };
        day.cardio = min ? { act: a.id, minutes: min, kcal: Math.round(a.rate * Number(state.plan.weightKg) * (min / 60)) } : null;
        persist(); closeSheet();
        break;
      }
      case 'workout-clear': day.lift = null; day.cardio = null; persist(); closeSheet(); break;

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

      case 'plan': openPlan(); break;
      case 'plan-save': {
        var p = state.plan;
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
        persist(); closeSheet();
        break;
      }

      case 'health': openHealth(); break;
      case 'health-import': importHealthText(q('#h-text').value || ''); break;
      case 'health-file': pickHealthFile(); break;
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

  window.ZGHDBug = {
    getState: function () { return state; },
    setState: function (s) { state = s; S.save(state); render(); },
    go: function (v, key) { if (key) cursor = key; view = v; render(); }
  };

  render();
})();
