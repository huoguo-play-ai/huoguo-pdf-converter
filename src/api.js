const defaultFont = /Mac/i.test(navigator.platform)
  ? "PingFang SC"
  : "Microsoft YaHei";
window.pdfToDocx = async function (buffer, { font = defaultFont } = {}) {
  let task,
    pages = 0;
  const empty = { ok: false, pages, docx: new Uint8Array(), error: "" };
  try {
    task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer).slice(),
      CMapReaderFactory: MemoryCMap,
      StandardFontDataFactory: MemoryStandardFonts,
      useWorkerFetch: false,
      cMapPacked: true,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      isOffscreenCanvasSupported: false,
    });
    const pdf = await task.promise;
    pages = pdf.numPages;
    const parsed = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      parsed.push(await parsePage(page));
      page.cleanup();
    }
    if (parsed.reduce((n, p) => n + p.characterCount, 0) < pages * 10)
      return {
        ...empty,
        pages,
        status: "扫描件已跳过",
        error: "这是扫描件，暂不支持",
      };
    analyse(parsed);
    const docx = await new Builder(parsed, font).build();
    return { ok: true, pages, docx, status: "成功", error: "" };
  } catch (e) {
    return { ...empty, pages, status: "失败", error: e.message || String(e) };
  } finally {
    if (task) await task.destroy();
  }
};
