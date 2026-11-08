# PDF 转 Word

双击 `dist/PDF转Word.html`，选择或拖入 PDF，点击「开始转换」。成功的文件可以单独下载，也可以打包成 ZIP。页面根据系统选择苹方或微软雅黑，转换前可切换字体。扫描件按整份文档平均每页少于 10 个非空白字符判定。

## 构建和复核

在仓库根目录运行：

```sh
npm ci --omit=optional --ignore-scripts
npm run build
npm test
```

成品包含 PDF.js、CMap、标准字体数据和 JSZip。PDF.js 在主线程解析，CSP 禁止联网。使用成品无需安装 Node.js、Python 或 LibreOffice。

测试使用同级 `claude-python-version` 中的样本和参考 DOCX。测试机需要 Python 3 和 Chromium 浏览器，可用 `CHROME_PATH` 指定浏览器。安装 LibreOffice 时，渲染步骤还使用 Poppler 和 ImageMagick，图片位于 `test-output/渲染`，左侧为原稿，右侧为转换结果。`检查结果.json` 记录结构差异、网络请求和页面错误。测试输出不纳入版本控制。

## 转换接口

```js
const result = await window.pdfToDocx(await file.arrayBuffer(), { font: "PingFang SC" });
if (result.ok) {
  const word = new Blob([result.docx], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
```

`pages` 是输入 PDF 的页数，`status` 为「成功」「扫描件已跳过」或「失败」。失败及扫描件返回空的 Uint8Array，并在 `error` 中说明原因。

