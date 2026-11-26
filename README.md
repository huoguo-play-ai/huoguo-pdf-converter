# 火锅PDF转换器

双击打开、断网可用的 PDF 转 Word 网页工具。不用文本框，而是用 Word 自带的段落、制表位、边框、表格和分栏重建版式，转出来的 Word 排版几乎和原 PDF 一样，打开就能直接改字。

**直接使用：** 下载 [`dist/火锅PDF转换器.html`](dist/火锅PDF转换器.html)，用 Chrome、Edge 等浏览器打开即可，不需要安装任何东西，文件不会上传。

## 用 DeepSeek 自己做一个

想自己动手做一个？把 [`prompts/分阶段提示词.md`](prompts/分阶段提示词.md) 里的 4 段提示词按顺序发给 DeepSeek Harness（或其他能读写文件的 AI 编程工具）就行：

1. 读取 PDF：一个字一个字地读
2. 认出版式：哪些是一行、哪些是一段
3. 生成 Word：把版式搬进 Word
4. 做界面：让工具变好看

每段大约 15～20 分钟。提示词的图片版在 [`prompts/images`](prompts/images/)。按提示词做出来的是不带吉祥物的基础版，和本仓库的完整版界面会有差别。

## 使用说明

双击 `dist/火锅PDF转换器.html`，选择或拖入 PDF，点击「开始转换」。成功的文件可以单独下载，也可以打包成 ZIP。页面根据系统选择苹方或微软雅黑，转换前可切换字体。扫描件按整份文档平均每页少于 10 个非空白字符判定。

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

转换完成后可以拖动蓝色手柄对比原 PDF 和生成的 Word，也可以用滑块和方向键调整分割位置。竖屏时上下对比。点击结果列表可以切换文件，多页文件可用页码旁的按钮翻页。Word 预览使用本机字体，具体分页与换行以下载后在 Word 中打开的结果为准。

按 R 键切换录屏模式，界面放大约 15%，动画时长增加至 1.5 倍。系统开启“减少动态效果”后，界面使用淡入淡出。

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
python3 -m pip install fonttools brotli
npm ci --omit=optional --ignore-scripts
npm run build
npm test
```

成品包含 PDF.js、CMap、标准字体数据、JSZip、docx-preview 和吉祥物图片。PDF.js 在主线程解析，CSP 禁止联网。使用成品无需安装 Node.js、Python 或 LibreOffice。

测试使用同级 `claude-python-version` 中的样本和参考 DOCX。测试机需要 Python 3 和 Chromium 浏览器，可用 `CHROME_PATH` 指定浏览器。安装 LibreOffice 时，渲染步骤还使用 Poppler 和 ImageMagick，图片位于 `test-output/渲染`，左侧为原稿，右侧为转换结果。`检查结果.json` 记录结构差异、网络请求和页面错误。两种窗口尺寸下的四个界面状态截图位于 `test-output/界面`。测试输出不纳入版本控制。

## 吉祥物

界面里的吉祥物动图（`assets/moods/`）由作者提供，版权归作者所有，不随代码一起开放使用。

## 字体与许可证

界面标题使用得意黑，正文中的英文和数字使用 Inter，中文使用 Noto Sans SC。构建时从界面源码收集字符，以 FontTools 生成 WOFF2 子集并内联到 HTML。文件名中超出子集的字符由系统字体显示。Word 预览和导出的文档继续使用转换时选择的字体。

三种字体均采用 SIL Open Font License 1.1。源字体保存在 `assets/fonts/`，许可证全文随离线 HTML 分发。得意黑的界面子集使用独立名称 `ObliqueTitleUI`。

| 字体 | 官方来源 | 许可证原文 |
| --- | --- | --- |
| 得意黑 | [Smiley Sans v2.0.1](https://github.com/atelier-anchor/smiley-sans/releases/tag/v2.0.1) | [SmileySans-OFL.txt](assets/fonts/licenses/SmileySans-OFL.txt) |
| Noto Sans SC | [Noto CJK 简体中文 OTF](https://github.com/notofonts/noto-cjk/tree/main/Sans/SubsetOTF/SC) | [NotoSansSC-OFL.txt](assets/fonts/licenses/NotoSansSC-OFL.txt) |
| Inter | [Inter 4.1](https://github.com/rsms/inter/releases/tag/v4.1) | [Inter-OFL.txt](assets/fonts/licenses/Inter-OFL.txt) |

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

