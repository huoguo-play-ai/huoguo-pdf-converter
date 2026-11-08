# PDF 转 Word

## 使用说明

双击 `dist/PDF转Word.html`，选择或拖入 PDF，点击「开始转换」。成功的文件可以单独下载，也可以打包成 ZIP。页面根据系统选择苹方或微软雅黑，转换前可切换字体。扫描件按整份文档平均每页少于 10 个非空白字符判定。

| PDF 里的东西 | 在 Word 里变成 |
| --- | --- |
| 一行行的文字 | 普通段落，用段前间距和固定行距对齐原来的位置 |
| 被自动换行切开的长段落 | 合并成一个段落（两端对齐），改字后会自动重新换行 |
| 左边标题、右边日期 | 同一段落里的制表位，日期始终靠右对齐 |
| 项目符号 | 悬挂缩进，换行后和文字对齐 |
| 标题左侧的色条 | 段落左边框 |
| 分隔线 | 段落下边框 |
| 带底色的提示框 | 段落底纹 + 边框 |
| 有框线的表格 | 真正的 Word 表格 |
| 照片等图片 | 按原位置浮动的图片，可以拖动 |
| 双栏排版 | Word 的分栏，文字会在两栏之间自动流动 |
| 每页底部的页脚 | Word 页脚，页码换成会自动更新的页码 |

### 使用限制

- 扫描件会跳过，工具不提供文字识别（OCR）。
- 中文统一使用所选字体。字体粗细和字宽可能与原 PDF 不同，长行的换行位置也可能变化。
- 用矢量线条绘制的图标、流程图和图表可能丢失。
- 底色框会变成直角，阴影和渐变无法保留。
- 可识别有框线的表格。无框线的表格按普通文字处理，合并单元格暂不支持。
- 三栏及以上、复杂的图文环绕、竖排文字和页眉暂不支持，部分内容会按普通文字处理。
- 受密码保护的 PDF 需要先解除密码保护。

### 确认文件没有上传

断开 Wi-Fi 和有线网络，关闭页面，再双击 HTML 转换一份 PDF。首次使用也可以断网。页面内置了转换所需的代码和资源，在浏览器中读取文件并生成下载，不需要启动本地服务。

## 构建和测试

在仓库根目录运行：

```sh
npm ci --omit=optional --ignore-scripts
npm run build
npm test
```

成品包含 PDF.js、CMap、标准字体数据和 JSZip。PDF.js 在主线程解析，CSP 禁止联网。使用成品无需安装 Node.js、Python 或 LibreOffice。

测试使用同级 `claude-python-version` 中的样本和参考 DOCX。测试机需要 Python 3 和 Chromium 浏览器，可用 `CHROME_PATH` 指定浏览器。安装 LibreOffice 时，渲染步骤还使用 Poppler 和 ImageMagick，图片位于 `test-output/渲染`，左侧为原稿，右侧为转换结果。`检查结果.json` 记录结构差异、网络请求和页面错误。测试输出不纳入版本控制。

### 转换接口

```js
const result = await window.pdfToDocx(await file.arrayBuffer(), { font: "PingFang SC" });
if (result.ok) {
  const word = new Blob([result.docx], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
```

`pages` 是输入 PDF 的页数，`status` 为「成功」「扫描件已跳过」或「失败」。失败及扫描件返回空的 Uint8Array，并在 `error` 中说明原因。

