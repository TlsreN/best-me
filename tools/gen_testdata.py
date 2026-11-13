# -*- coding: utf-8 -*-
"""
生成测试数据：
1) test-data/每日记录模板.xlsx —— 供人填写，四个工作表，已填好 2026-11-13 一天作基准
2) test-data/半年增长数据.json  —— 以基准日为依据推演 180 天，供程序自测
   同时输出 tools/render/data180.js 供无头浏览器加载
"""
import os, json, random, datetime, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'test-data')
os.makedirs(OUT_DIR, exist_ok=True)

BASE_DATE = datetime.date(2026, 11, 13)
random.seed(20261113)

PLAN = {
    "direction": "bulk", "sex": "male", "age": 24, "heightCm": 165, "weightKg": 63,
    "liftKcal": 175, "cardioKcal": 230, "proteinPerKg": 1.9, "waterMl": 2000,
    "bulk": {"fatG": 80, "carbTrain": 3.5, "carbRest": 2.7},
    "cut":  {"fatG": 60, "carbTrain": 2.6, "carbRest": 2.2}
}

# ---------------- 基准日：一天吃与练 ----------------
BASE_FOODS = [
    # 餐次, 食物, 数量, 碳水, 蛋白, 脂肪, 热量
    ("breakfast", "鸡蛋 2 个",      "2 个",   1.0, 12.6, 9.4, 140),
    ("breakfast", "全脂牛奶",        "250 ml", 12.0, 8.3, 9.0, 163),
    ("breakfast", "燕麦片（干）",    "40 g",  26.0, 5.6, 3.0, 152),
    ("pre",       "香蕉",            "1 根",  25.0, 1.2, 0.3, 107),
    ("lunch",     "米饭（熟）",      "350 g", 91.0, 7.0, 1.2, 400),
    ("lunch",     "鸡胸肉",          "150 g",  0.0, 34.5, 2.3, 177),
    ("lunch",     "炒青菜",          "200 g",  6.0, 2.0, 8.0, 104),
    ("dinner",    "牛肉炒菜",        "300 g", 20.0, 28.0, 18.0, 360),
    ("dinner",    "米饭（熟）",      "150 g", 39.0, 3.0, 0.5, 171),
    ("snack",     "混合坚果",        "30 g",   6.0, 5.0, 15.0, 180),
    ("snack",     "无糖酸奶",        "200 g", 10.0, 7.0, 6.0, 122),
]

BASE_SETS = [
    ("杠铃深蹲", 4, 8, 60.0),
    ("器械腿屈伸", 3, 12, 40.0),
    ("罗马尼亚硬拉", 3, 10, 50.0),
    ("平板卷腹", 3, 15, 0.0),
]

BASE_CARDIO = [("walk", "平地走", 30, 120)]


def totals(foods):
    c = sum(f[3] for f in foods); p = sum(f[4] for f in foods)
    fa = sum(f[5] for f in foods); k = sum(f[6] for f in foods)
    return round(c, 1), round(p, 1), round(fa, 1), round(k)


# ---------------- 写 Excel 模板 ----------------
def write_xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    head_fill = PatternFill('solid', fgColor='1F8A6B')
    head_font = Font(color='FFFFFF', bold=True, size=10)
    thin = Side(style='thin', color='E3E2DC')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    def style_header(ws, ncol):
        for c in range(1, ncol + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill = head_fill; cell.font = head_font
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = border
        ws.freeze_panes = 'A2'
        ws.row_dimensions[1].height = 26

    # --- 说明 ---
    ws = wb.active
    ws.title = '填写说明'
    lines = [
        ('最好的我 · 每日记录模板', True),
        ('', False),
        ('怎么填', True),
        ('1. 一天一行，填在「每日概览」；吃了什么填「饮食」，练了什么填「训练」。', False),
        ('2. 日期统一写 2026-11-13 这种格式，一天里多行要写同一天。', False),
        ('3. 碳水 / 蛋白 / 脂肪 按你算出来的克数填，热量留空也可以（程序按 碳×4+蛋×4+脂×9 算）。', False),
        ('4. 「数量」写人类看得懂的量：350 g、1 根、2 个、250 ml。', False),
        ('5. 训练里「类型」写 力量 或 有氧；有氧只填分钟，不填组次重量。', False),
        ('6. 已经按 2026-11-13 填好一天作为基准，照这个格式往下加就行。', False),
        ('', False),
        ('每天要填的字段', True),
        ('每日概览：日期、力训日、体重 kg、饮水 ml、备注', False),
        ('饮食：日期、餐次、食物、数量、碳水 g、蛋白 g、脂肪 g、热量 kcal', False),
        ('训练：日期、类型、名称、组数、次数、重量 kg、分钟、消耗 kcal', False),
        ('', False),
        ('餐次只能填这五个', True),
        ('早饭 / 练前 / 午饭 / 晚饭 / 加餐', False),
        ('', False),
        ('注意', True),
        ('· 体重只填早上空腹那次，一天一次。', False),
        ('· 饮水按杯估，250 ml 一杯就填 250。', False),
        ('· 没练就整行不填，力训日写「否」。', False),
    ]
    for i, (text, bold) in enumerate(lines, start=1):
        c = ws.cell(row=i, column=1, value=text)
        if bold:
            c.font = Font(bold=True, size=12 if i == 1 else 11)
    ws.column_dimensions['A'].width = 92

    # --- 每日概览 ---
    ws = wb.create_sheet('每日概览')
    head = ['日期', '力训日', '体重 kg', '饮水 ml', '备注']
    ws.append(head)
    ws.append(['2026-11-13', '是', 63.0, 2000, '基准日：午饭前练'])
    style_header(ws, len(head))
    widths = [14, 9, 11, 11, 30]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # --- 饮食 ---
    ws = wb.create_sheet('饮食')
    head = ['日期', '餐次', '食物', '数量', '碳水 g', '蛋白 g', '脂肪 g', '热量 kcal']
    ws.append(head)
    for meal, name, amount, c, p, f, k in BASE_FOODS:
        ws.append(['2026-11-13', {'breakfast': '早饭', 'pre': '练前', 'lunch': '午饭',
                                  'dinner': '晚饭', 'snack': '加餐'}[meal], name, amount, c, p, f, k])
    tc, tp, tf, tk = totals(BASE_FOODS)
    ws.append(['合计', '', '', '', tc, tp, tf, tk])
    for c in range(1, 9):
        ws.cell(row=ws.max_row, column=c).font = Font(bold=True)
        ws.cell(row=ws.max_row, column=c).fill = PatternFill('solid', fgColor='F2F2F5')
    style_header(ws, len(head))
    for i, w in enumerate([14, 9, 18, 10, 10, 10, 10, 11], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # --- 训练 ---
    ws = wb.create_sheet('训练')
    head = ['日期', '类型', '名称', '组数', '次数', '重量 kg', '分钟', '消耗 kcal']
    ws.append(head)
    for name, s, r, w in BASE_SETS:
        ws.append(['2026-11-13', '力量', name, s, r, w, '', 175])
    ws.append(['2026-11-13', '有氧', '平地走', '', '', '', 30, 120])
    style_header(ws, len(head))
    for i, w in enumerate([14, 8, 18, 8, 8, 10, 8, 11], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    path = os.path.join(OUT_DIR, '每日记录模板.xlsx')
    wb.save(path)
    print('写入', path)


# ---------------- 造半年数据 ----------------
def build_dataset():
    days = {}
    foods_lib = [
        {"id": "cf1", "name": "鸡胸肉", "mode": "per100g", "servingName": None,
         "carbs": 0, "protein": 23, "fat": 1.5, "kcal": 118, "lastUsedAt": 1},
        {"id": "cf2", "name": "一碗米饭", "mode": "perServing", "servingName": "碗",
         "carbs": 60, "protein": 5, "fat": 1, "kcal": 300, "lastUsedAt": 1},
        {"id": "cf3", "name": "全脂牛奶", "mode": "per100g", "servingName": None,
         "carbs": 4.8, "protein": 3.3, "fat": 3.6, "kcal": 65, "lastUsedAt": 1},
    ]

    n_days = 180
    start_weight = 63.0
    end_weight = 66.2

    for i in range(n_days):
        d = BASE_DATE - datetime.timedelta(days=n_days - 1 - i)
        key = d.isoformat()
        prog = i / (n_days - 1)

        # 体重：线性增长 + 日内波动 + 偶尔水分跳变
        noise = random.gauss(0, 0.22)
        water = 0.35 * math.sin(i / 9.0)
        w = start_weight + (end_weight - start_weight) * prog + noise + water
        w = round(w, 1)

        train = d.weekday() in (0, 2, 4) or (d.weekday() == 5 and random.random() < 0.4)

        day = {
            "train": train,
            "weightKg": w,
            "bodyFatPct": None,
            "waterMl": random.choice([1500, 1750, 2000, 2000, 2250, 2500]),
            "foods": [], "workouts": [], "cardios": []
        }

        # 目标热量：训练日略高
        target_kcal = 2250 if train else 1980
        target_kcal *= random.uniform(0.94, 1.06)

        # 饮食模板：按目标热量缩放主食
        rice = (target_kcal - 1505) / 1.15  # 固定部分约 1505 kcal，其余用米饭补
        rice = max(150, min(620, rice))
        f = []
        f.append(("breakfast", "鸡蛋 2 个", 1.0, 12.6, 9.4, 140))
        f.append(("breakfast", "全脂牛奶", 12.0, 8.3, 9.0, 163))
        f.append(("breakfast", "燕麦片（干）", 26.0, 5.6, 3.0, 152))
        f.append(("pre", "香蕉", 25.0, 1.2, 0.3, 107))
        f.append(("lunch", "米饭（熟）", round(rice * 0.55 * 0.26, 1), round(rice * 0.55 * 0.02, 1), 0.8, round(rice * 0.55 * 1.15)))
        f.append(("lunch", "鸡胸肉", 0.0, 34.5, 2.3, 177))
        f.append(("lunch", "炒青菜", 6.0, 2.0, 8.0, 104))
        f.append(("dinner", "牛肉炒菜", 20.0, 28.0, 18.0, 360))
        f.append(("dinner", "米饭（熟）", round(rice * 0.45 * 0.26, 1), round(rice * 0.45 * 0.02, 1), 0.5, round(rice * 0.45 * 1.15)))
        f.append(("snack", "混合坚果", 6.0, 5.0, 15.0, 180))
        if random.random() < 0.6:
            f.append(("snack", "无糖酸奶", 10.0, 7.0, 6.0, 122))

        for idx, (meal, name, c, p, fa, k) in enumerate(f):
            # 10% 概率某天换掉一个食物，模拟真实波动
            if random.random() < 0.10:
                name = name + "（外食）"
                k = round(k * random.uniform(0.85, 1.25))
                fa = round(fa * random.uniform(0.8, 1.6), 1)
            day["foods"].append({
                "id": "f%d_%d" % (i, idx), "meal": meal, "name": name,
                "mode": "manual", "amountG": None, "servings": None,
                "carbs": c, "protein": p, "fat": fa, "kcal": k, "micros": {}
            })

        # 力量训练：每两周加 2.5kg
        if train:
            step = int(prog * 10) * 2.5
            sets = [
                ("杠铃深蹲", 4, 8, 60 + step),
                ("器械腿屈伸", 3, 12, 40 + step * 0.6),
                ("罗马尼亚硬拉", 3, 10, 50 + step * 0.8),
                ("平板卷腹", 3, 15, 0),
            ]
            day["workouts"] = [{
                "id": "w%d" % i, "name": "力量训练", "kcal": 175, "overridden": False,
                "sets": [{"exercise": n, "sets": s, "reps": r, "weight": round(wt, 1)} for n, s, r, wt in sets]
            }]

        # 有氧：每周两次，周末或不练的日子
        if d.weekday() in (1, 6) and random.random() < 0.75:
            minutes = random.choice([30, 35, 40, 45, 50])
            day["cardios"] = [{
                "id": "c%d" % i, "act": "walk", "name": "平地走", "minutes": minutes,
                "kcal": round(3.8 * w * minutes / 60), "overridden": False
            }]

        days[key] = day

    return {
        "schemaVersion": 2, "plan": PLAN, "days": days,
        "foods": foods_lib, "lastBackupAt": None
    }


def main():
    write_xlsx()
    data = build_dataset()
    keys = sorted(data['days'])
    weights = [data['days'][k]['weightKg'] for k in keys]
    kcals = []
    for k in keys:
        kcals.append(sum(f['kcal'] for f in data['days'][k]['foods']))
    train_days = sum(1 for k in keys if data['days'][k]['train'])

    path = os.path.join(OUT_DIR, '半年增长数据.json')
    with open(path, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, indent=1)

    js_path = os.path.join(ROOT, 'tools', 'render', 'data180.js')
    with open(js_path, 'w', encoding='utf-8') as fp:
        fp.write('window.SEED = ' + json.dumps(data, ensure_ascii=False) + ';\n')

    print('写入', path)
    print('天数 %d，力训 %d 天' % (len(keys), train_days))
    print('体重 %.1f → %.1f kg' % (weights[0], weights[-1]))
    print('日均摄入 %d kcal（区间 %d–%d）' % (sum(kcals) / len(kcals), min(kcals), max(kcals)))


if __name__ == '__main__':
    main()
