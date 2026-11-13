/* 最好的我 — 界面渲染与交互 */
(function () {
  'use strict';

  var S = window.Store;
  var state = S.load();
  var view = 'today';
  var cursor = S.todayKey();
  var monthAnchor = S.parseKey(cursor);
  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal-root');
  var brandSub = document.getElementById('brand-sub');
  var lastScroll = 0;

  var EXERCISES = [
    '杠铃深蹲', '史密斯深蹲', '哈克机', '倒蹬机', '箭步蹲', '器械腿屈伸', '器械腿弯举',
    '罗马尼亚硬拉', '传统硬拉', '杠铃臀冲', '器械臀冲',
    '杠铃卧推', '哑铃卧推', '上斜卧推', '器械推胸', '蝴蝶机夹胸', '龙门架夹胸', '双杠臂屈伸',
    '引体向上', '高位下拉', '器械下拉', '杠铃划船', 'T杆划船', '坐姿器械划船', '单边哑铃划船', '直臂下压',
    '器械推举', '哑铃推举', '侧平举', '前平举', '俯身飞鸟', '反向飞鸟', '杠铃提拉',
    '哑铃弯举', '杠铃弯举', '牧师椅弯举', '绳索下压', '颈后臂屈伸', '窄距卧推',
    '平板卷腹', '悬垂举腿'
  ];

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f1(n) {
    var v = Math.round((Number(n) || 0) * 10) / 10;
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  }
  function n0(n) { return String(Math.round(Number(n) || 0)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function val(day, k) { var v = day[k]; return v === null || v === undefined ? '' : v; }

  function save() { S.save(state); render(); }

  /* ---------------- 图表 ---------------- */
  function lineChart(points, opts) {
    opts = opts || {};
    var w = 320, h = opts.height || 100, pad = 12;
    var all = [];
    points.forEach(function (p) {
      if (p.y !== null && p.y !== undefined) all.push(p.y);
      if (p.d !== null && p.d !== undefined) all.push(p.d);
    });
    if (!all.length) return '<div class="empty">还没有数据</div>';
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    if (max - min < 0.6) { var mid = (max + min) / 2; min = mid - 0.4; max = mid + 0.4; }
    var span = max - min;
    function px(i) { return points.length <= 1 ? w / 2 : pad + (w - 2 * pad) * i / (points.length - 1); }
    function py(v) { return h - pad - (h - 2 * pad) * (v - min) / span; }

    var line = '', dots = '', started = false;
    points.forEach(function (p, i) {
      if (p.d !== null && p.d !== undefined) {
        dots += '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(p.d).toFixed(1) + '" r="2.2" fill="#0f766e" opacity=".3"/>';
      }
      if (p.y === null || p.y === undefined) { started = false; return; }
      line += (started ? ' L' : ' M') + px(i).toFixed(1) + ' ' + py(p.y).toFixed(1);
      started = true;
    });
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<text x="2" y="10" font-size="9" fill="#9aa5a2">' + f1(max) + '</text>' +
      '<text x="2" y="' + (h - 2) + '" font-size="9" fill="#9aa5a2">' + f1(min) + '</text>' +
      dots +
      '<path d="' + line + '" fill="none" stroke="' + (opts.color || '#0f766e') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function barChart(bars, goalLine) {
    var w = 320, h = 110, pad = 12, base = h - 18;
    var max = Math.max(goalLine || 0, Math.max.apply(null, bars.map(function (b) { return b.v || 0; })));
    if (max <= 0) return '<div class="empty">还没有数据</div>';
    var bw = (w - 2 * pad) / bars.length;
    var out = '';
    bars.forEach(function (b, i) {
      var bh = Math.max((base - pad) * (b.v || 0) / max, 0);
      var x = pad + i * bw + bw * 0.18;
      var y = base - bh;
      out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2.5" fill="' + (b.over ? '#b3423a' : '#0f766e') + '" opacity=".85"/>';
    });
    var gy = base - (base - pad) * (goalLine || 0) / max;
    out += '<line x1="' + pad + '" y1="' + gy.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + gy.toFixed(1) + '" stroke="#c2861f" stroke-width="1.4" stroke-dasharray="4 3"/>';
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + out + '</svg>';
  }

  function donut(c, p, f) {
    var kcal = c * 4 + p * 4 + f * 9;
    var size = 132, r = 52, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
    if (kcal <= 0) return '<div class="empty">还没有进食记录</div>';
    var parts = [
      { v: c * 4 / kcal, color: '#0f766e' },
      { v: p * 4 / kcal, color: '#2f6f9e' },
      { v: f * 9 / kcal, color: '#c2861f' }
    ];
    var off = 0, segs = '';
    parts.forEach(function (s) {
      var len = circ * s.v;
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="14" ' +
        'stroke-dasharray="' + len.toFixed(1) + ' ' + (circ - len).toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')" opacity=".9"/>';
      off += len;
    });
    return '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" style="height:132px;width:132px">' + segs +
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="18" font-weight="600" fill="#16211f">' + n0(kcal) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="9" fill="#6b7a77">kcal</text></svg>';
  }

  /* ---------------- 今天 ---------------- */
  function bar(label, used, goal, unit) {
    var pct = goal > 0 ? Math.min(used / goal * 100, 100) : 0;
    var cls = used > goal * 1.15 ? 'hot' : used > goal * 1.02 ? 'warm' : '';
    return '<div><div class="bar-top"><span>' + label + '</span><span><b>' + f1(used) + '</b>' +
      ' <span class="t">/ ' + f1(goal) + unit + '</span></span></div>' +
      '<div class="bar ' + cls + '"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>';
  }

  function viewToday() {
    var day = S.getDay(state, cursor, true);
    var t = S.dayTotals(day);
    var tg = S.targets(state.plan, day.train);
    var m = tg.macros;
    var isToday = cursor === S.todayKey();
    var ma7 = (function () {
      var sum = 0, n = 0;
      for (var i = 0; i < 7; i++) {
        var d2 = state.days[S.addDays(cursor, -i)];
        if (d2 && d2.weightKg !== null && d2.weightKg !== undefined && d2.weightKg !== '') { sum += Number(d2.weightKg); n++; }
      }
      return n ? Math.round(sum / n * 10) / 10 : null;
    })();

    var meals = S.MEALS.map(function (meal) {
      var items = (day.foods || []).filter(function (f) { return f.meal === meal.id; });
      var sub = items.reduce(function (a, f) { return a + S.foodKcal(f); }, 0);
      var rows = items.map(function (f) {
        return '<div class="food">' +
          '<div class="nm">' + esc(f.name || '未命名') + '<small>' + (f.amountG ? ' · ' + esc(f.amountG) + 'g' : '') + '</small></div>' +
          '<div class="mc">碳' + f1(f.carbs) + ' 蛋' + f1(f.protein) + ' 脂' + f1(f.fat) + '</div>' +
          '<div class="kcal">' + n0(S.foodKcal(f)) + '</div>' +
          '<button class="del" data-act="del-food" data-id="' + esc(f.id) + '">×</button>' +
          '</div>';
      }).join('');
      return '<div class="meal"><div class="meal-h"><b>' + meal.name + '</b>' +
        '<span>' + (items.length ? n0(sub) + ' kcal' : '—') + '</span></div>' +
        (rows || '<div class="empty">还没记录</div>') + '</div>';
    }).join('');

    var sets = (day.sets || []).length ? (day.sets || []).map(function (s) {
      return '<div class="setrow">' +
        '<span>' + esc(s.exercise || '动作') + '</span>' +
        '<span>' + n0(s.sets) + ' 组</span>' +
        '<span>' + n0(s.reps) + ' 次</span>' +
        '<span>' + f1(s.weight) + ' kg</span>' +
        '<button class="del" data-act="del-set" data-id="' + esc(s.id) + '">×</button>' +
        '</div>';
    }).join('') : '<div class="empty">今天还没练</div>';

    var cardios = (day.cardios || []).map(function (c) {
      return '<div class="setrow" style="grid-template-columns:1fr 56px 56px 28px">' +
        '<span>' + esc(c.name) + '</span>' +
        '<span>' + n0(c.minutes) + ' 分</span>' +
        '<span>' + n0(c.kcal) + ' kcal</span>' +
        '<button class="del" data-act="del-cardio" data-id="' + esc(c.id) + '">×</button></div>';
    }).join('');

    return '<div class="screen">' +
      '<section class="card datebar">' +
        '<div class="nav"><button data-act="prev-day">‹</button><button data-act="next-day">›</button></div>' +
        '<div class="grow"><div class="big">' + S.dayLabel(cursor) + (isToday ? ' · 今天' : '') + '</div>' +
        '<div class="sub">目标 ' + n0(tg.kcal) + ' kcal · 碳 ' + f1(m.carbs) + ' / 蛋 ' + f1(m.protein) + ' / 脂 ' + f1(m.fat) + ' g</div></div>' +
        '<button class="pill ' + (day.train ? '' : 'rest') + '" data-act="toggle-train">' + (day.train ? '力训日' : '休息日') + '</button>' +
      '</section>' +

      '<div class="grid2">' +
        '<div class="stack">' +
          '<section class="card">' +
            '<header><h2>身体</h2><span class="pill ' + (t.kcal > tg.kcal * 1.15 ? 'hot' : 'rest') + '">' +
              (ma7 !== null ? '7 日均体重 ' + f1(ma7) + ' kg' : '还没有体重记录') + '</span></header>' +
            '<div class="row">' +
              '<label class="field">体重 kg<input type="number" inputmode="decimal" step="0.1" data-field="weight" value="' + val(day, 'weightKg') + '"></label>' +
              '<label class="field">体脂 %<input type="number" inputmode="decimal" step="0.1" data-field="bodyfat" value="' + val(day, 'bodyFatPct') + '"></label>' +
            '</div>' +
          '</section>' +
          '<section class="card">' +
            '<header><h2>饮食</h2><button class="add" data-act="add-food">+ 记一餐</button></header>' +
            meals +
          '</section>' +
        '</div>' +
        '<div class="stack">' +
          '<section class="card">' +
            '<header><h2>今日进度</h2><span class="pill ' + (day.train ? '' : 'rest') + '">' + (day.train ? '力训日' : '休息日') + '</span></header>' +
            '<div class="bars">' +
              bar('热量', t.kcal, tg.kcal, ' kcal') +
              bar('碳水', t.carbs, m.carbs, ' g') +
              bar('蛋白质', t.protein, m.protein, ' g') +
              bar('脂肪', t.fat, m.fat, ' g') +
            '</div>' +
            '<div class="note" style="margin-top:10px">本周训练容量 ' + n0(weekTonnage(cursor)) + ' kg · 有氧 ' + n0(t.cardioKcal) + ' kcal</div>' +
          '</section>' +
          '<section class="card">' +
            '<header><h2>训练</h2><button class="add" data-act="add-set">+ 动作</button></header>' +
            '<div class="setrow h"><span>动作</span><span>组</span><span>次</span><span>重量</span><span></span></div>' +
            sets +
            '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">' +
              '<button class="add" data-act="add-cardio">+ 有氧</button>' +
              '<span class="note" style="flex:1">容量 ' + n0(t.tonnage) + ' kg</span>' +
            '</div>' +
            cardios +
          '</section>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function weekTonnage(key) {
    var start = S.weekStart(key), sum = 0;
    for (var i = 0; i < 7; i++) {
      var d = state.days[S.addDays(start, i)];
      if (d) sum += S.dayTotals(d).tonnage;
    }
    return sum;
  }

  /* ---------------- 日历 ---------------- */
  function viewCalendar() {
    var y = monthAnchor.getFullYear(), mo = monthAnchor.getMonth();
    var first = new Date(y, mo, 1);
    var startDow = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var todayK = S.todayKey();

    var cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div class="cal-cell out"></div>';
    var recorded = 0, trainDays = 0, kcalSum = 0, kcalN = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      var key = y + '-' + (mo + 1 < 10 ? '0' : '') + (mo + 1) + '-' + (d < 10 ? '0' : '') + d;
      var day = state.days[key];
      var st = day ? S.statusOf(state, key) : 'empty';
      if (st !== 'empty') { recorded++; }
      if (day && day.train && !S.isEmptyDay(day)) trainDays++;
      if (day && !S.isEmptyDay(day)) { var tt = S.dayTotals(day); if (tt.kcal) { kcalSum += tt.kcal; kcalN++; } }
      cells += '<button class="cal-cell ' + st + (day && day.train ? ' train' : '') + (key === todayK ? ' today' : '') + '" data-act="cal-day" data-date="' + key + '">' +
        '<span>' + d + '</span><i class="dot"></i>' + (day && day.train ? '<i class="f">练</i>' : '') + '</button>';
    }

    return '<div class="screen">' +
      '<section class="card">' +
        '<div class="cal-head"><button data-act="cal-prev">‹</button><b>' + y + ' 年 ' + (mo + 1) + ' 月</b><button data-act="cal-next">›</button></div>' +
        '<div class="cal-grid">' +
          ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<div class="cal-dow">' + w + '</div>'; }).join('') +
          cells +
        '</div>' +
        '<div class="legend"><span><i style="background:#2f855a"></i>达标</span><span><i style="background:#c2861f"></i>略超</span>' +
        '<span><i style="background:#b3423a"></i>超较多</span><span>绿框 = 力训日</span></div>' +
      '</section>' +
      '<section class="card">' +
        '<header><h2>本月</h2></header>' +
        '<div class="calc">' +
          '<span class="k">有记录天数</span><span class="v">' + recorded + ' 天</span>' +
          '<span class="k">力训天数</span><span class="v">' + trainDays + ' 天</span>' +
          '<span class="k">日均摄入</span><span class="v">' + (kcalN ? n0(kcalSum / kcalN) + ' kcal' : '—') + '</span>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  /* ---------------- 趋势 ---------------- */
  function viewTrends() {
    var from = S.addDays(cursor, -29);
    var series = S.weightSeries(state, from, cursor);
    var mPts = series.map(function (s) { return { y: s.ma, d: s.weight }; });

    var kcalBars = [];
    for (var i = 13; i >= 0; i--) {
      var k = S.addDays(cursor, -i);
      var d = state.days[k];
      var tot = d ? S.dayTotals(d).kcal : 0;
      var goal = S.targetKcal(state.plan, d ? d.train : true);
      kcalBars.push({ v: tot, over: tot > goal * 1.05 });
    }
    var todayD = S.getDay(state, cursor, true);
    var tt = S.dayTotals(todayD);

    var weeks = [];
    for (var w = 7; w >= 0; w--) {
      var start = S.weekStart(S.addDays(cursor, -w * 7));
      var sum = 0;
      for (var j = 0; j < 7; j++) { var dd = state.days[S.addDays(start, j)]; if (dd) sum += S.dayTotals(dd).tonnage; }
      weeks.push({ v: sum, over: false });
    }

    var latestMA = null;
    for (var q = series.length - 1; q >= 0; q--) { if (series[q].ma !== null) { latestMA = series[q].ma; break; } }

    return '<div class="screen">' +
      '<div class="grid2">' +
        '<section class="card">' +
          '<header><h2>体重</h2><span class="pill">7 日均线 ' + (latestMA === null ? '—' : f1(latestMA)) + ' kg</span></header>' +
          lineChart(mPts, { color: '#0f766e' }) +
          '<div class="legend"><span><i style="background:#0f766e"></i>7 日均线</span><span><i style="background:#0f766e;opacity:.45"></i>单日体重</span></div>' +
          '<div class="note">只看均线。两三天内的涨跌是水分和食糜，没有参考意义。</div>' +
        '</section>' +
        '<section class="card">' +
          '<header><h2>热量收支</h2><span class="pill rest">近 14 天</span></header>' +
          barChart(kcalBars, S.targetKcal(state.plan, true)) +
          '<div class="legend"><span><i style="background:#0f766e"></i>摄入</span><span><i style="background:#c2861f"></i>力训日目标</span></div>' +
        '</section>' +
        '<section class="card">' +
          '<header><h2>宏量构成</h2><span class="pill rest">' + S.dayLabel(cursor) + '</span></header>' +
          '<div style="display:flex;align-items:center;gap:16px">' +
            donut(tt.carbs, tt.protein, tt.fat) +
            '<div class="calc" style="flex:1">' +
              '<span class="k">碳水</span><span class="v">' + f1(tt.carbs) + ' g</span>' +
              '<span class="k">蛋白质</span><span class="v">' + f1(tt.protein) + ' g</span>' +
              '<span class="k">脂肪</span><span class="v">' + f1(tt.fat) + ' g</span>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="card">' +
          '<header><h2>训练容量</h2><span class="pill rest">近 8 周</span></header>' +
          barChart(weeks, 0) +
          '<div class="note">容量 = Σ(重量 × 次数)。增肌期看它是否在涨。</div>' +
        '</section>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 方案 ---------------- */
  function viewPlan() {
    var p = state.plan;
    var dir = p.direction;
    var d = p[dir];
    var bmr = S.bmr(p);
    var noEx = S.noExerciseKcal(p);
    var balTrain = S.balanceKcal(p, true);
    var balRest = S.balanceKcal(p, false);
    var tTrain = S.targets(p, true);
    var tRest = S.targets(p, false);

    function num(label, field, value, step) {
      return '<label class="field">' + label + '<input type="number" inputmode="decimal" step="' + (step || 1) +
        '" data-plan="' + field + '" value="' + value + '"></label>';
    }

    return '<div class="screen">' +
      '<section class="card">' +
        '<header><h2>方向</h2></header>' +
        '<div class="seg">' +
          '<button data-act="dir" data-dir="bulk" class="' + (dir === 'bulk' ? 'on' : '') + '">增肌</button>' +
          '<button data-act="dir" data-dir="cut" class="' + (dir === 'cut' ? 'on' : '') + '">减脂</button>' +
        '</div>' +
        '<div class="note" style="margin-top:8px">' +
          (dir === 'bulk'
            ? '干净增肌：平衡热量 × 1.05，再留 20% 余地 → <b>×0.84</b>'
            : '减脂：平衡热量 × 0.8，再留 20% 余地 → <b>×0.64</b>') +
        '</div>' +
      '</section>' +

      '<div class="grid2">' +
        '<section class="card">' +
          '<header><h2>个人参数</h2></header>' +
          '<div class="fields" style="display:flex;flex-direction:column;gap:10px">' +
            '<label class="field">性别<select data-plan="sex">' +
              '<option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>男</option>' +
              '<option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>女</option></select></label>' +
            '<div class="row">' + num('年龄', 'age', p.age) + num('身高 cm', 'heightCm', p.heightCm) + '</div>' +
            '<div class="row">' + num('体重 kg', 'weightKg', p.weightKg, 0.1) + num('力训消耗 kcal/天', 'liftKcal', p.liftKcal) + '</div>' +
            '<div class="row">' + num('有氧消耗 kcal/天', 'cardioKcal', p.cardioKcal) + num('蛋白质 g/kg', 'proteinPerKg', p.proteinPerKg, 0.1) + '</div>' +
            '<div class="row">' + num('脂肪 g/天', 'fatG', d.fatG) + '</div>' +
            '<div class="row">' + num('碳水 g/kg（力训）', 'carbTrain', d.carbTrain, 0.1) + num('碳水 g/kg（休息）', 'carbRest', d.carbRest, 0.1) + '</div>' +
          '</div>' +
          '<div class="note" style="margin-top:10px">力训消耗：男 新手 150 / 有基础 200 / 老手 250。蛋白质系数 1.9 是你表里的设定。</div>' +
        '</section>' +

        '<section class="card">' +
          '<header><h2>算出来的目标</h2><span class="pill ' + (dir === 'bulk' ? '' : 'warm') + '">' + (dir === 'bulk' ? '增肌' : '减脂') + '</span></header>' +
          '<div class="calc">' +
            '<span class="k">基础代谢 BMR</span><span class="v">' + n0(bmr) + ' kcal</span>' +
            '<span class="k">无运动总消耗（BMR ÷ 0.7）</span><span class="v">' + n0(noEx) + ' kcal</span>' +
            '<span class="k">力训日平衡</span><span class="v">' + n0(balTrain) + ' kcal</span>' +
            '<span class="k">休息日平衡</span><span class="v">' + n0(balRest) + ' kcal</span>' +
            '<span class="k">力训日应吃</span><span class="v">' + n0(tTrain.kcal) + ' kcal</span>' +
            '<span class="k">休息日应吃</span><span class="v">' + n0(tRest.kcal) + ' kcal</span>' +
            '<span class="k">碳水 力训 / 休息</span><span class="v">' + f1(tTrain.macros.carbs) + ' / ' + f1(tRest.macros.carbs) + ' g</span>' +
            '<span class="k">蛋白质</span><span class="v">' + f1(tTrain.macros.protein) + ' g</span>' +
            '<span class="k">脂肪</span><span class="v">' + f1(tTrain.macros.fat) + ' g</span>' +
          '</div>' +
          '<div class="note" style="margin-top:10px">克数之和不会正好等于热量目标：原表刻意留了约 20% 余地。</div>' +
        '</section>' +
      '</div>' +

      '<section class="card">' +
        '<header><h2>数据</h2></header>' +
        '<div class="row" style="flex-wrap:wrap">' +
          '<button data-act="export-json">导出备份 JSON</button>' +
          '<button data-act="export-csv">导出 CSV</button>' +
          '<button data-act="import">导入备份</button>' +
          '<button class="danger" data-act="reset">清空全部</button>' +
        '</div>' +
        '<div class="note" style="margin-top:10px">数据存在本机：' + backupLabel() + '。建议每周点右上角「备份」导出一份 JSON 到「文件」App，防止被系统清理。</div>' +
      '</section>' +
    '</div>';
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    lastScroll = app.scrollTop;
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.view === view);
    });
    if (view === 'today') app.innerHTML = viewToday();
    else if (view === 'calendar') app.innerHTML = viewCalendar();
    else if (view === 'trends') app.innerHTML = viewTrends();
    else app.innerHTML = viewPlan();
    brandSub.textContent = (state.plan.direction === 'bulk' ? '增肌' : '减脂') + ' · 午饭前练';
    app.scrollTop = lastScroll;
  }

  /* ---------------- 弹层 ---------------- */
  function closeSheet() { modalRoot.innerHTML = ''; }

  function openSheet(title, body, onSubmit, submitLabel) {
    modalRoot.innerHTML = '<div class="mask"><form class="sheet" id="sheet-form"><h3>' + title + '</h3>' +
      '<div class="fields">' + body + '</div>' +
      '<div class="actions"><button type="button" data-act="close-sheet">取消</button>' +
      '<button type="submit" class="solid">' + (submitLabel || '保存') + '</button></div></form></div>';
    var form = document.getElementById('sheet-form');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      onSubmit(new FormData(form));
      closeSheet();
      save();
    });
    var first = form.querySelector('input,select');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 80);
  }

  function mealOptions(selected) {
    return S.MEALS.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + m.name + '</option>';
    }).join('');
  }

  function guessMeal() {
    var h = new Date().getHours();
    if (h < 10) return 'breakfast';
    if (h < 11) return 'pre';
    if (h < 15) return 'lunch';
    if (h < 19) return 'dinner';
    return 'snack';
  }

  function openFoodSheet(editId) {
    var day = S.getDay(state, cursor, true);
    var food = editId ? (day.foods || []).filter(function (f) { return f.id === editId; })[0] : null;
    var names = [];
    Object.keys(state.days).forEach(function (k) {
      (state.days[k].foods || []).forEach(function (f) { if (f.name && names.indexOf(f.name) < 0) names.push(f.name); });
    });
    var datalist = '<datalist id="food-names">' + names.slice(-60).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
    var microFields = S.MICROS.map(function (k) {
      var v = food && food.micros ? food.micros[k] : '';
      return '<label class="field">' + k + '<input type="number" step="0.1" name="m_' + k + '" value="' + (v === undefined || v === null ? '' : v) + '"></label>';
    }).join('');

    openSheet(food ? '修改食物' : '记一餐', '' +
      '<label class="field">餐次<select name="meal">' + mealOptions(food ? food.meal : guessMeal()) + '</select></label>' +
      '<label class="field">食物<input type="text" name="name" list="food-names" value="' + esc(food ? food.name : '') + '" placeholder="如 鸡胸肉" required>' + datalist + '</label>' +
      '<div class="row">' +
        '<label class="field">克数<input type="number" step="1" name="amountG" value="' + (food && food.amountG ? food.amountG : '') + '"></label>' +
        '<label class="field">热量 kcal（可空）<input type="number" step="1" name="kcal" value="' + (food && food.kcal !== null && food.kcal !== undefined ? food.kcal : '') + '" placeholder="自动算"></label>' +
      '</div>' +
      '<div class="row">' +
        '<label class="field">碳水 g<input type="number" step="0.1" name="carbs" value="' + (food ? f1(food.carbs) : '') + '"></label>' +
        '<label class="field">蛋白质 g<input type="number" step="0.1" name="protein" value="' + (food ? f1(food.protein) : '') + '"></label>' +
        '<label class="field">脂肪 g<input type="number" step="0.1" name="fat" value="' + (food ? f1(food.fat) : '') + '"></label>' +
      '</div>' +
      '<details class="micros"><summary>微量营养素（选填）</summary><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">' + microFields + '</div></details>',
      function (fd) {
        var item = {
          id: food ? food.id : uid(),
          meal: fd.get('meal'),
          name: String(fd.get('name') || '').trim(),
          amountG: numOrNull(fd.get('amountG')),
          kcal: numOrNull(fd.get('kcal')),
          carbs: numOrNull(fd.get('carbs')) || 0,
          protein: numOrNull(fd.get('protein')) || 0,
          fat: numOrNull(fd.get('fat')) || 0,
          micros: {}
        };
        S.MICROS.forEach(function (k) {
          var v = numOrNull(fd.get('m_' + k));
          if (v !== null && v !== 0) item.micros[k] = v;
        });
        if (food) {
          var idx = day.foods.indexOf(food);
          day.foods[idx] = item;
        } else {
          day.foods.push(item);
        }
      }, food ? '保存修改' : '添加');
  }

  function numOrNull(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function openSetSheet() {
    var opts = EXERCISES.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    openSheet('加一个动作',
      '<label class="field">动作<input type="text" name="exercise" list="ex-list" required placeholder="如 杠铃深蹲">' +
      '<datalist id="ex-list">' + opts + '</datalist></label>' +
      '<div class="row">' +
        '<label class="field">组数<input type="number" step="1" name="sets" value="3"></label>' +
        '<label class="field">次数<input type="number" step="1" name="reps" value="10"></label>' +
      '</div>' +
      '<div class="row">' +
        '<label class="field">重量 kg<input type="number" step="0.5" name="weight" value=""></label>' +
        '<label class="field">RPE（可空）<input type="number" step="0.5" name="rpe" value=""></label>' +
      '</div>',
      function (fd) {
        var day = S.getDay(state, cursor, true);
        day.sets.push({
          id: uid(),
          exercise: String(fd.get('exercise') || '').trim(),
          sets: numOrNull(fd.get('sets')) || 0,
          reps: numOrNull(fd.get('reps')) || 0,
          weight: numOrNull(fd.get('weight')) || 0,
          rpe: numOrNull(fd.get('rpe'))
        });
      });
  }

  function openCardioSheet() {
    var list = S.ACTIVITIES.map(function (a) {
      return '<option value="' + a.id + '">' + a.name + '（' + a.rate + ' kcal/kg/h）</option>';
    }).join('');
    openSheet('加有氧',
      '<label class="field">项目<select name="act">' + list + '</select></label>' +
      '<label class="field">时长 分钟<input type="number" step="1" name="minutes" value="30"></label>' +
      '<div class="note">热量按「每 kg 每小时消耗 × 体重 × 小时」自动计算。</div>',
      function (fd) {
        var day = S.getDay(state, cursor, true);
        var act = S.ACTIVITIES.filter(function (a) { return a.id === fd.get('act'); })[0] || S.ACTIVITIES[0];
        var minutes = numOrNull(fd.get('minutes')) || 0;
        var w = Number(state.plan.weightKg) || 63;
        day.cardios.push({
          id: uid(), act: act.id, name: act.name, minutes: minutes,
          kcal: Math.round(act.rate * w * (minutes / 60))
        });
      });
  }

  /* ---------------- 导出 / 导入 ---------------- */
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }
  function stamp() { return S.todayKey().replace(/-/g, ''); }

  function backup() {
    state.lastBackupAt = new Date().toISOString();
    S.save(state);
    download('最好的我-备份-' + stamp() + '.json', JSON.stringify(state, null, 2));
    render();
  }

  function backupLabel() {
    if (!state.lastBackupAt) return '还没备份过';
    var days = Math.floor((Date.now() - new Date(state.lastBackupAt).getTime()) / 86400000);
    if (days <= 0) return '今天已备份';
    return days + ' 天前备份';
  }

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
          var data = JSON.parse(String(reader.result));
          state = S.normalize(data);
          S.save(state);
          render();
          alert('导入成功：' + Object.keys(state.days).length + ' 天记录');
        } catch (e) {
          alert('导入失败：文件格式不对');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest ? e.target.closest('.tab') : null;
    if (tab) { view = tab.dataset.view; render(); return; }

    if (e.target.classList && e.target.classList.contains('mask')) { closeSheet(); return; }

    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.dataset.act;
    var day = S.getDay(state, cursor, true);

    switch (act) {
      case 'prev-day': cursor = S.addDays(cursor, -1); render(); break;
      case 'next-day': cursor = S.addDays(cursor, 1); render(); break;
      case 'toggle-train': day.train = !day.train; save(); break;
      case 'add-food': openFoodSheet(); break;
      case 'add-set': openSetSheet(); break;
      case 'add-cardio': openCardioSheet(); break;
      case 'del-food': day.foods = day.foods.filter(function (f) { return f.id !== el.dataset.id; }); save(); break;
      case 'del-set': day.sets = day.sets.filter(function (s) { return s.id !== el.dataset.id; }); save(); break;
      case 'del-cardio': day.cardios = day.cardios.filter(function (c) { return c.id !== el.dataset.id; }); save(); break;
      case 'close-sheet': closeSheet(); break;
      case 'cal-prev': monthAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1); render(); break;
      case 'cal-next': monthAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1); render(); break;
      case 'cal-day': cursor = el.dataset.date; view = 'today'; render(); break;
      case 'dir': state.plan.direction = el.dataset.dir; save(); break;
      case 'export-json': backup(); break;
      case 'export-csv': download('最好的我-' + stamp() + '.csv', '\ufeff' + S.toCsv(state), 'text/csv'); break;
      case 'import': importFile(); break;
      case 'reset':
        if (confirm('确定清空全部记录？建议先导出备份。')) { state = S.emptyState(); S.save(state); render(); }
        break;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.field) {
      var day = S.getDay(state, cursor, true);
      if (t.dataset.field === 'weight') day.weightKg = numOrNull(t.value);
      if (t.dataset.field === 'bodyfat') day.bodyFatPct = numOrNull(t.value);
      if (t.dataset.field === 'weight' && day.weightKg) state.plan.weightKg = day.weightKg;
      save();
      return;
    }
    if (t.dataset && t.dataset.plan) {
      var key = t.dataset.plan;
      var num = numOrNull(t.value);
      if (key === 'sex') { state.plan.sex = t.value; }
      else if (key === 'fatG' || key === 'carbTrain' || key === 'carbRest') {
        state.plan[state.plan.direction][key] = num || 0;
      } else {
        state.plan[key] = num === null ? state.plan[key] : num;
      }
      save();
    }
  });

  var btnBackup = document.getElementById('btn-backup');
  if (btnBackup) btnBackup.addEventListener('click', backup);

  document.getElementById('btn-today').addEventListener('click', function () {
    cursor = S.todayKey();
    monthAnchor = S.parseKey(cursor);
    view = 'today';
    render();
  });

  /* 调试/测试钩子：自动化脚本用它注入样例数据 */
  window.ZGHDBug = {
    getState: function () { return state; },
    setState: function (s) { state = s; S.save(state); render(); },
    go: function (v, key) { if (key) { cursor = key; } view = v; monthAnchor = S.parseKey(cursor); render(); }
  };

  render();
})();
