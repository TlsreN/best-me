# -*- coding: utf-8 -*-
import io, openpyxl
SRC = r"D:\Deepseek\project\健身可视化\健身饮食.xlsx"
wb = openpyxl.load_workbook(SRC, data_only=False, read_only=True)
out = []
for name in ["11增肌-午饭前练", "3减脂-午饭前练"]:
    ws = wb[name]
    out.append(f"===== {name} =====")
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            if isinstance(v, str) and v.startswith("="):
                out.append(f"{c.coordinate}\t{v}")
io.open(r"D:\Deepseek\project\健身可视化\tools\dump\formulas.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
