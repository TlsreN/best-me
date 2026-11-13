# tools

一次性脚本与本地预览工具。都不参与 App 运行。

| 文件 | 用途 |
| --- | --- |
| `dump_xlsx.py` | 把 `reference/健身饮食.xlsx` 的 28 张表导出成 `reference/excel-解析/*.tsv`，便于全文检索 |
| `dump_formulas.py` | 单独导出表 11/3 里的公式，核对计算口径 |
| `test_store.js` | 校验 `app/store.js` 的计算结果与 Excel 表 11 完全一致（22 项断言） |
| `serve.ps1` | 起一个本地静态服务器，供 iPhone/iPad 在同一 Wi-Fi 下预览 |
| `render/probe.html` | 无头浏览器用的样例数据页，用来截图检查排版 |

## 跑测试

```powershell
& 'C:\Users\14615\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' tools\test_store.js
```

期望输出 `通过 22，失败 0`。

## 本地预览

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8080
```

脚本会打印电脑的局域网地址，在 iPad 的 Safari 里打开 `http://<那个地址>:8080` 即可。
