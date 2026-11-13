# -*- coding: utf-8 -*-
"""
生成测试数据（v3：按顿记营养、按总运动量记训练）
1) test-data/每日记录模板.xlsx —— 供人填写，已填 2026-11-13 一天作基准
2) test-data/半年增长数据.json  —— 推演 180 天，供程序自测
   同时输出 tools/render/data180.js
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

# 基准日：每餐一条（碳水, 蛋白, 脂肪, 热量, 备注）
BASE_MEALS = [
    ("breakfast", 39.0, 25.9, 21.4, 455, "鸡蛋2个+牛奶250+燕麦40"),
    ("pre",       25.0, 1.2, 0.3, 107, "香蕉1根"),
    ("lunch",     97.0, 43.5, 11.5, 681, "米饭350+鸡胸150+炒青菜"),
    ("dinner",    59.0, 31.0, 18.5, 531, "牛肉炒菜+米饭150"),
    ("snack",     16.0, 12.0, 21.0, 302, "坚果30+酸奶200"),
]
BASE_LIFT = (175, 6200, "深蹲4×8×60 等 4 个动作")
BASE_CARDIO = ("walk", "平地走", 30, 120)

MEAL_NAME = {'breakfast': '早饭', 'pre': '练前', 'lunch': '午饭', 'dinner': '晚饭', 'snack': '加餐'}


def meal_totals():
    c = round(sum(m[1] for m in BASE_MEALS), 1)
    p = round(sum(m[2] for m in BASE_MEALS), 1)
    f = round(sum(m[3] for m in BASE_MEALS), 1)
    k = sum(m[4] for m in BASE_MEALS)
    return c, p, f, k


# ---------------- Excel ----------------
def write_xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    head_fill = PatternFill('solid', fgColor='1F8A6B')
    head_font = Font(color='FFFFFF', bold=True, size=10)
    thin = Side(style='thin', color='E3E2DC')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    def head(ws, ncol, widths):
        for c in range(1, ncol + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill = head_fill
            cell.font = head_font
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = border
        ws.freeze_panes = 'A2'
        ws.row_dimensions[1].height = 26
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w

    ws = wb.active
    ws.title = '填写说明'
    lines = [
        ('最好的我 · 每日记录模板', True),
        ('', False),
        ('怎么填', True),
        ('1. 一天一行填「每日概览」；每顿饭一行填「饮食」；训练填「训练」。', False),
        ('2. 饮食只填这一顿的总量（碳水 / 蛋白 / 脂肪），不用拆到每样食物。', False),
        ('3. 热量可以留空，程序按 碳×4 + 蛋×4 + 脂×9 自动算。', False),
        ('4. 训练只填总消耗，不记单个动作。有氧填项目与分钟。', False),
        ('5. 日期统一写 2026-11-13 这种格式。', False),
        ('6. 已按 2026-11-13 填好一天作基准，照这个格式往下加。', False),
        ('', False),
        ('每天要填的字段', True),
        ('每日概览：日期、力训日、体重 kg、饮水 ml、备注', False),
        ('饮食：日期、餐次、碳水 g、蛋白 g、脂肪 g、热量 kcal、备注', False),
        ('训练：日期、类型、名称、消耗 kcal、分钟', False),
        ('', False),
        ('餐次只能填这五个', True),
        ('早饭 / 练前 / 午饭 / 晚饭 / 加餐', False),
        ('', False),
        ('注意', True),
        ('· 体重只填早上空腹那次。', False),
        ('· 饮水按杯估，250 ml 一杯就填 250。', False),
        ('· 没练就整行不填，力训日写「否」。', False),
    ]
    for i, (text, bold) in enumerate(lines, start=1):
        c = ws.cell(row=i, column=1, value=text)
        if bold:
            c.font = Font(bold=True, size=12 if i == 1 else 11)
    ws.column_dimensions['A'].width = 92

    ws = wb.create_sheet('每日概览')
    ws.append(['日期', '力训日', '体重 kg', '饮水 ml', '备注'])
    ws.append(['2026-11-13', '是', 63.0, 2000, '基准日：午饭前练'])
    head(ws, 5, [14, 9, 11, 11, 30])

    ws = wb.create_sheet('饮食')
    ws.append(['日期', '餐次', '碳水 g', '蛋白 g', '脂肪 g', '热量 kcal', '备注'])
    for meal, c, p, f, k, note in BASE_MEALS:
        ws.append(['2026-11-13', MEAL_NAME[meal], c, p, f, k, note])
    tc, tp, tf, tk = meal_totals()
    ws.append(['合计', '', tc, tp, tf, tk, ''])
    for c in range(1, 8):
        ws.cell(row=ws.max_row, column=c).font = Font(bold=True)
        ws.cell(row=ws.max_row, column=c).fill = PatternFill('solid', fgColor='F2F2F5')
    head(ws, 7, [14, 9, 10, 10, 10, 11, 30])

    ws = wb.create_sheet('训练')
    ws.append(['日期', '类型', '名称', '消耗 kcal', '分钟'])
    ws.append(['2026-11-13', '力量', '力量训练', BASE_LIFT[0], ''])
    ws.append(['2026-11-13', '有氧', '平地走', BASE_CARDIO[3], BASE_CARDIO[2]])
    head(ws, 5, [14, 10, 16, 12, 10])

    path = os.path.join(OUT_DIR, '每日记录模板.xlsx')
    wb.save(path)
    print('写入', path)


# ---------------- 半年数据 ----------------
def build_dataset():
    days = {}
    n_days = 180
    start_weight, end_weight = 63.0, 66.2

    for i in range(n_days):
        d = BASE_DATE - datetime.timedelta(days=n_days - 1 - i)
        key = d.isoformat()
        prog = i / (n_days - 1)

        w = start_weight + (end_weight - start_weight) * prog + random.gauss(0, 0.22) + 0.35 * math.sin(i / 9.0)
        w = round(w, 1)
        train = d.weekday() in (0, 2, 4) or (d.weekday() == 5 and random.random() < 0.4)

        # 按宏量配额生成，保证四环看起来是合理的（糖 220 / 蛋 114 / 脂 72）
        k = (1.0 if train else 0.88) * random.uniform(0.94, 1.06)
        tpl = [
            ("breakfast", 39.0, 26.0, 21.0, ["鸡蛋牛奶燕麦", "鸡蛋牛奶", "鸡蛋+豆浆+面包"]),
            ("pre", 25.0, 1.0, 0.3, ["香蕉", "小面包", "八宝粥"]),
            ("lunch", 95.0, 44.0, 12.0, ["米饭+鸡胸+青菜", "米饭+牛肉+青菜"]),
            ("dinner", 45.0, 31.0, 18.0, ["牛肉炒菜+米饭", "鱼+米饭+青菜"]),
            ("snack", 16.0, 12.0, 21.0, ["坚果+酸奶", "坚果", "牛奶"]),
        ]
        meals = {}
        for mid, c, p, fa, notes in tpl:
            c2 = round(c * k, 1); p2 = round(p * k, 1); f2 = round(fa * k, 1)
            meals[mid] = {"carbs": c2, "protein": p2, "fat": f2,
                          "kcal": round(c2 * 4 + p2 * 4 + f2 * 9, 1),
                          "note": random.choice(notes)}
        if random.random() < 0.10:
            mk = random.choice(list(meals))
            meals[mk]["kcal"] = round(meals[mk]["kcal"] * random.uniform(0.85, 1.3))
            meals[mk]["fat"] = round(meals[mk]["fat"] * random.uniform(0.8, 1.6), 1)
            meals[mk]["note"] = meals[mk]["note"] + "（外食）"

        day = {
            "train": train, "weightKg": w, "bodyFatPct": None,
            "waterMl": random.choice([1500, 1750, 2000, 2000, 2250, 2500]),
            "meals": meals, "lift": None, "cardio": None
        }

        if train:
            step = int(prog * 10) * 2.5
            volume = int((60 + step) * 4 * 8 + (40 + step * 0.6) * 3 * 12 + (50 + step * 0.8) * 3 * 10)
            day["lift"] = {"kcal": 175, "volume": volume, "note": "深蹲/腿屈伸/硬拉/卷腹"}

        if d.weekday() in (1, 6) and random.random() < 0.75:
            minutes = random.choice([30, 35, 40, 45, 50])
            day["cardio"] = {"act": "walk", "minutes": minutes,
                             "kcal": round(3.8 * w * minutes / 60)}
        days[key] = day

    return {"schemaVersion": 3, "plan": PLAN, "days": days, "lastBackupAt": None}


def main():
    write_xlsx()
    data = build_dataset()
    keys = sorted(data['days'])
    weights = [data['days'][k]['weightKg'] for k in keys]
    kcals = [sum(m['kcal'] for m in data['days'][k]['meals'].values()) for k in keys]
    train_days = sum(1 for k in keys if data['days'][k]['train'])
    tc, tp, tf, tk = meal_totals()

    path = os.path.join(OUT_DIR, '半年增长数据.json')
    with open(path, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, indent=1)

    with open(os.path.join(ROOT, 'tools', 'render', 'data180.js'), 'w', encoding='utf-8') as fp:
        fp.write('window.SEED = ' + json.dumps(data, ensure_ascii=False) + ';\n')

    print('写入', path)
    print('基准日 %.1f 碳水 / %.1f 蛋白 / %.1f 脂肪 / %d kcal' % (tc, tp, tf, tk))
    print('天数 %d，力训 %d 天' % (len(keys), train_days))
    print('体重 %.1f → %.1f kg' % (weights[0], weights[-1]))
    print('日均摄入 %d kcal（%d–%d）' % (sum(kcals) / len(kcals), min(kcals), max(kcals)))


if __name__ == '__main__':
    main()
