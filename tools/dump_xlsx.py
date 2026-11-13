# -*- coding: utf-8 -*-
"""把 reference/健身饮食.xlsx 的每张工作表导出成可读文本，便于检索与比对。"""
import os, io, json
import openpyxl

SRC = r"D:\Deepseek\project\健身可视化\reference\健身饮食.xlsx"
OUT = r"D:\Deepseek\project\健身可视化\reference\excel-解析"
os.makedirs(OUT, exist_ok=True)

wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)
index = []
for i, ws in enumerate(wb.worksheets, 1):
    dim = ws.calculate_dimension() if hasattr(ws, "calculate_dimension") else ""
    index.append({"i": i, "name": ws.title, "dim": dim})
    safe = "".join(c if c not in '\\/:*?"<>|' else "_" for c in ws.title)
    lines = []
    for row in ws.iter_rows():
        cells = []
        for c in row:
            v = c.value
            if v is None:
                continue
            if isinstance(v, float):
                v = f"{v:g}"
            cells.append(f"{c.coordinate}={str(v).replace(chr(9),' ').replace(chr(10),' / ')}")
        if cells:
            lines.append("\t".join(cells))
    with io.open(os.path.join(OUT, f"{i:02d}_{safe}.tsv"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(i, ws.title, dim, "rows:", len(lines))

with io.open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=1)
