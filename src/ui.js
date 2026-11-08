(() => {
  const $ = (s) => document.querySelector(s);
  const items = [];
  const mobile = matchMedia("(max-width:639px),(orientation:portrait)");
  let state,
    active,
    pageNumber,
    selection = 0,
    paint = 0,
    documentView,
    toastTimer;
  const icon = (name) =>
    '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
  function node(tag, className, value) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = value ?? "";
    return el;
  }
  const pet = $("#pet");
  const readyMoods = new Set();
  let wantedMood = "idle",
    moodTimer;

  function showMood(mood) {
    wantedMood = mood;
    if (readyMoods.has(mood)) pet.dataset.mood = mood;
  }
  for (const layer of pet.querySelectorAll(".pet-layer")) {
    const image = layer.querySelector("img");
    image.decode().then(() => {
      // Drawing an animated image to canvas uses its first frame.
      layer.querySelector("canvas").getContext("2d").drawImage(image, 0, 0);
      readyMoods.add(layer.dataset.image);
      if (wantedMood === layer.dataset.image) showMood(wantedMood);
    });
  }
  function stateTo(next) {
    state = next;
    document.body.dataset.state = next;
    for (const id of ["idle", "queue", "running", "report"])
      $("#" + id).hidden = id !== next;
    const slot = $("#" + next + " .pet-slot");
    if (pet.parentElement !== slot) slot.append(pet);
    // Establish the outgoing layer's opacity in the newly visible slot.
    void pet.offsetWidth;
    clearTimeout(moodTimer);
    if (next === "report") {
      const successes = items.filter((it) => it.ok).length;
      showMood(successes === items.length ? "happy" : "sad");
      if (successes > 0 && successes < items.length)
        moodTimer = setTimeout(() => showMood("happy"), 2000);
    } else {
      showMood({ idle: "idle", queue: "expect", running: "focus" }[next]);
    }
    $("#badge").innerHTML = icon("lock") + "断网可用 · 文件不出电脑";
  }
  async function withPdf(file, callback) {
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      CMapReaderFactory: MemoryCMap,
      StandardFontDataFactory: MemoryStandardFonts,
      useWorkerFetch: false,
      cMapPacked: true,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: false,
      isOffscreenCanvasSupported: false,
    });
    try {
      return await callback(await task.promise);
    } finally {
      await task.destroy();
    }
  }
  async function thumbnail(page) {
    const view = page.getViewport({ scale: 1 });
    const sized = page.getViewport({
      scale: Math.min(2, 1200 / Math.max(view.width, view.height)),
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(sized.width);
    canvas.height = Math.ceil(sized.height);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: sized,
    }).promise;
    return { canvas, width: view.width, height: view.height };
  }
  function add(files) {
    if (!["idle", "queue"].includes(state) || !files.length) return;
    if (state !== "queue") stateTo("queue");
    for (const file of files) {
      const it = { file, status: "等待中" };
      items.push(it);
      const row = node("li", "");
      row.style.setProperty(
        "--delay",
        Math.min(items.length - 1, 8) * 0.055 + "s",
      );
      const meta = node("div", "file-meta");
      const size =
        file.size >= 1048576
          ? (file.size / 1048576).toFixed(1) + " MB"
          : Math.ceil(file.size / 1024) + " KB";
      const info = node("small", "", size);
      meta.append(node("b", "", file.name), info);
      row.append(
        node("span", "ico", "PDF"),
        meta,
        node("span", "tag", it.status),
      );
      $("#list").append(row);
      withPdf(file, (pdf) => pdf.numPages)
        .then((pages) => {
          it.pages = pages;
          info.textContent = pages + " 页 · " + size;
          if (state === "queue" && items.includes(it)) queueTitle();
        })
        .catch(() => {
          info.textContent = "页数未知 · " + size;
        });
    }
    queueTitle();
  }
  function queueTitle() {
    $("#count").textContent = "已添加 " + items.length + " 个文件";
    $("#meta").textContent = items.every((it) => it.pages)
      ? "共 " + items.reduce((n, it) => n + it.pages, 0) + " 页 · 可继续添加"
      : "可继续添加文件";
    $("#go").textContent = "开始转换（" + items.length + " 个文件）";
  }
  function drawLayout(pg) {
    const lines = makeLines(pg.chars).flatMap((line) =>
      line.segments.map((seg) => ({
        ...seg,
        top: line.top,
        bottom: line.top + Math.max(2, line.size * 0.52),
        fill: line.color,
      })),
    );
    const elements = [...pg.shapes, ...pg.images, ...lines].map((box, i) => {
      const el = node("i", "block");
      const color = box.fill || box.stroke || "cbdaf3";
      el.style.cssText = [
        "left:" + (100 * box.x0) / pg.w + "%",
        "top:" + (100 * box.top) / pg.h + "%",
        "width:" + Math.max(0.25, (100 * (box.x1 - box.x0)) / pg.w) + "%",
        "height:" + Math.max(0.25, (100 * (box.bottom - box.top)) / pg.h) + "%",
        "background:#" + color,
        "--dx:" + (i % 2 ? 1 : -1) * (14 + (i % 27)) + "px",
        "--dy:" + (i % 3 ? 1 : -1) * (10 + (i % 17)) + "px",
        "--angle:" + ((i % 11) - 5) + "deg",
        "--delay:calc(" + (i % 19) * 0.016 + "s * var(--speed))",
      ].join(";");
      return el;
    });
    $("#blocks").replaceChildren(...elements);
  }
  async function showMotion(it) {
    $("#sourceThumb").replaceChildren();
    $("#blocks").replaceChildren();
    try {
      await withPdf(it.file, async (pdf) => {
        const page = await pdf.getPage(1);
        const thumb = await thumbnail(page);
        for (const el of document.querySelectorAll(".sheet"))
          el.style.aspectRatio = thumb.width + "/" + thumb.height;
        $("#sourceThumb").append(thumb.canvas);
        drawLayout(await parsePage(page));
      });
    } catch {
      $("#sourceThumb").textContent = "无法预览此文件";
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        document.body.classList.contains("record") ? 1800 : 1200,
      ),
    );
  }
  async function convert(it) {
    try {
      const buffer = await it.file.arrayBuffer();
      it.font = $("#font").value;
      const start = performance.now();
      let result;
      try {
        result = await window.pdfToDocx(buffer, { font: it.font });
      } finally {
        it.duration = performance.now() - start;
      }
      Object.assign(it, result);
      if (it.ok) {
        const base = it.file.name.replace(/\.pdf$/i, "");
        it.output = base + ".docx";
        let n = 1;
        while (
          items.some((other) => other !== it && other.output === it.output)
        )
          it.output = base + " (" + ++n + ").docx";
      }
    } catch (e) {
      it.status = "失败";
      it.error = "无法读取文件（" + e.message + "）";
    }
  }
  async function run() {
    if (state !== "queue") return;
    stateTo("running");
    for (const [i, it] of items.entries()) {
      $("#badge").textContent = "正在转换 " + it.file.name;
      $("#counter").textContent =
        "第 " + (i + 1) + " / " + items.length + " 个文件";
      $("#progress").max = items.length;
      $("#progress").value = i + 1;
      await Promise.all([convert(it), showMotion(it)]);
    }
    const elapsed = (
      items.reduce((sum, it) => sum + (it.duration || 0), 0) / 1000
    ).toFixed(1);
    stateTo("report");
    $("#badge").textContent =
      "✓ " + items.length + " 个文件全部完成 · 用时 " + elapsed + " 秒";
    renderResults();
    $("#zip").disabled = !items.some((it) => it.ok);
    await selectFile(items.find((it) => it.ok) || items[0]);
  }
  function renderResults() {
    $("#results").replaceChildren(
      ...items.map((it) => {
        const row = node("li", "result");
        const pick = node("button", "");
        pick.setAttribute("aria-current", String(it === active));
        const meta = node("span", "file-meta");
        meta.append(node("b", "", it.output || it.file.name));
        if (it.error) meta.append(node("small", "", it.error));
        pick.append(
          meta,
          node(
            "span",
            "tag " + (it.ok ? "ok" : it.status === "失败" ? "bad" : "warn"),
            it.status,
          ),
        );
        pick.onclick = () => selectFile(it);
        row.append(pick);
        if (it.ok) {
          const single = node("button", "download");
          single.innerHTML = icon("down");
          single.setAttribute("aria-label", "下载 " + it.output);
          single.onclick = () => download(it);
          row.append(single);
        }
        return row;
      }),
    );
  }
  function positionPictures(xml, host) {
    // The writer emits one picture per drawing, in body order. Include inline
    // pictures when matching, but only reposition anchors relative to the page.
    const pictures = host.querySelectorAll("section.docx article img");
    const drawings = [...xml.getElementsByTagNameNS("*", "drawing")].filter(
      (el) => el.getElementsByTagNameNS("*", "blip").length,
    );
    drawings.forEach((drawing, i) => {
      const anchor = drawing.firstElementChild;
      const image = pictures[i];
      if (!image || anchor?.localName !== "anchor") return;
      const offset = (axis) => {
        const pos = anchor.getElementsByTagNameNS("*", axis)[0];
        if (pos?.getAttribute("relativeFrom") === "page")
          return pos.getElementsByTagNameNS("*", "posOffset")[0]?.textContent;
      };
      const extent = anchor.getElementsByTagNameNS("*", "extent")[0];
      const dimensions = [
        offset("positionH"),
        offset("positionV"),
        extent?.getAttribute("cx"),
        extent?.getAttribute("cy"),
      ];
      if (
        !dimensions.every(
          (n) => n != null && n !== "" && Number.isFinite(Number(n)),
        )
      )
        return;
      const [left, top, width, height] = dimensions.map(
        (n) => Number(n) / 12700 + "pt",
      );
      const wrapper = image.parentElement;
      Object.assign(wrapper.style, {
        position: "absolute",
        float: "none",
        left,
        top,
        width,
        height,
      });
      Object.assign(image.style, {
        display: "block",
        width: "100%",
        height: "100%",
        left: "0",
        top: "0",
      });
      image.closest("section.docx").append(wrapper);
    });
  }
  async function selectFile(it) {
    const token = ++selection;
    paint++;
    active = it;
    pageNumber = 1;
    documentView = null;
    renderResults();
    $("#compare").hidden = true;
    $("#pager").hidden = true;
    $("#pdfLayer").replaceChildren();
    $("#wordLayer").replaceChildren();
    $("#message").textContent = it.ok ? "正在准备对比预览…" : it.error;
    if (!it.ok) return;
    try {
      const host = node("div", "preview-doc");
      const styles = node("div", "");
      const options = {
        inWrapper: false,
        keepOrigin: true,
        useBase64URL: true,
        ignoreLastRenderedPageBreak: false,
        renderAltChunks: false,
      };
      const model = await window.docx.parseAsync(it.docx, options);
      // The renderer recognizes run-level page breaks but skips direct paragraph
      // pageBreakBefore properties. Normalize its in-memory preview model only.
      const body = model.documentPart.body;
      const children = [];
      for (const paragraph of body.children) {
        if (paragraph.pageBreakBefore && children.length) {
          let previous = children.at(-1);
          if (previous.type !== "paragraph") {
            previous = { type: "paragraph", children: [] };
            children.push(previous);
          }
          previous.children.push({
            type: "run",
            children: [{ type: "break", break: "page" }],
          });
        }
        children.push(paragraph);
      }
      body.children = children;
      host.style.setProperty("--preview-font", JSON.stringify(it.font));
      await window.docx.renderDocument(model, host, styles, options);
      if (token !== selection) return;
      const sections = [...host.querySelectorAll("section.docx")];
      if (!sections.length) throw new Error("Word 预览没有生成页面");
      positionPictures(model.documentPart._xmlDocument, host);
      $("#wordLayer").replaceChildren(styles, host);
      documentView = {
        host,
        sections,
        count: Math.max(it.pages, sections.length),
      };
      await showPage();
    } catch (e) {
      if (token === selection)
        $("#message").textContent = "预览失败：" + e.message;
    }
  }
  async function showPage() {
    const token = ++paint,
      view = documentView,
      it = active,
      n = pageNumber;
    $("#prev").disabled = n <= 1;
    $("#next").disabled = n >= view.count;
    $("#pager").hidden = view.count <= 1;
    $("#message").textContent = "正在读取页面…";
    try {
      const thumb =
        n <= it.pages
          ? await withPdf(it.file, async (pdf) =>
              thumbnail(await pdf.getPage(n)),
            )
          : null;
      if (token !== paint) return;
      view.sections.forEach((el, i) => (el.hidden = i !== n - 1));
      $("#pdfLayer").replaceChildren(
        thumb?.canvas || node("p", "", "原 PDF 无此页"),
      );
      view.thumb = thumb;
      $("#wordLayer").querySelector(".missing")?.remove();
      if (!view.sections[n - 1])
        $("#wordLayer").append(node("p", "missing", "Word 无此页"));
      $("#pageNo").textContent = n + " / " + view.count;
      $("#compare").hidden = false;
      $("#message").textContent = "";
      fit();
    } catch (e) {
      if (token === paint)
        $("#message").textContent = "无法预览此页：" + e.message;
    }
  }
  function fit() {
    if (!documentView || $("#compare").hidden) return;
    const { thumb, host, sections } = documentView;
    const section = sections[pageNumber - 1];
    const box = $(".viewport"),
      padding = parseFloat(getComputedStyle(box).paddingLeft) * 2;
    const aspect = thumb
      ? thumb.width / thumb.height
      : section?.offsetWidth / section?.offsetHeight || 0.707;
    const w = Math.min(
      box.clientWidth - padding,
      (box.clientHeight - padding) * aspect,
    );
    $("#compare").style.width = w + "px";
    $("#compare").style.height = w / aspect + "px";
    if (section)
      host.style.transform =
        "scale(" +
        Math.min(w / section.offsetWidth, w / aspect / section.offsetHeight) +
        ")";
  }
  new ResizeObserver(fit).observe($(".viewport"));
  function split(value) {
    const n = Math.max(0, Math.min(100, Math.round(value)));
    $("#split").value = n;
    $("#compare").style.setProperty("--split", n + "%");
  }
  function pointer(e) {
    const r = $("#compare").getBoundingClientRect();
    split(
      100 *
        (mobile.matches
          ? (e.clientY - r.top) / r.height
          : (e.clientX - r.left) / r.width),
    );
  }
  const frame = $("#compare");
  frame.onpointerdown = (e) => {
    frame.setPointerCapture(e.pointerId);
    pointer(e);
  };
  frame.onpointermove = (e) => {
    if (frame.hasPointerCapture(e.pointerId)) pointer(e);
  };
  $("#split").oninput = (e) => split(e.target.value);
  $("#handle").onkeydown = (e) => {
    const steps = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    if (e.key in steps) {
      e.preventDefault();
      split(Number($("#split").value) + steps[e.key]);
    }
  };
  $("#prev").onclick = () => {
    pageNumber--;
    showPage();
  };
  $("#next").onclick = () => {
    pageNumber++;
    showPage();
  };
  async function download(it) {
    let blob;
    if (it)
      blob = new Blob([it.docx], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    else {
      const zip = new JSZip();
      for (const item of items.filter((item) => item.ok))
        zip.file(item.output, item.docx);
      blob = await zip.generateAsync({ type: "blob" });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = it ? it.output : "转换结果.zip";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  function reset() {
    selection++;
    paint++;
    active = null;
    documentView = null;
    items.length = 0;
    for (const id of [
      "list",
      "results",
      "pdfLayer",
      "wordLayer",
      "sourceThumb",
      "blocks",
    ])
      $("#" + id).replaceChildren();
    split(50);
    stateTo("idle");
  }
  $("#font").value = defaultFont;
  document
    .querySelectorAll(".pick")
    .forEach((b) => (b.onclick = () => $("#file").click()));
  $("#file").onchange = (e) => {
    add(e.target.files);
    e.target.value = "";
  };
  for (const zone of document.querySelectorAll(".drop")) {
    let depth = 0;
    function hovering(on) {
      zone.classList.toggle("over", on);
      if (state === "idle") showMood(on ? "expect" : "idle");
    }
    zone.ondragenter = (e) => {
      e.preventDefault();
      depth++;
      hovering(true);
    };
    zone.ondragleave = () => {
      if (--depth <= 0) {
        depth = 0;
        hovering(false);
      }
    };
    zone.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    zone.ondrop = (e) => {
      e.preventDefault();
      depth = 0;
      hovering(false);
      add(e.dataTransfer.files);
    };
  }
  for (const type of ["dragover", "drop"])
    document.addEventListener(type, (e) => e.preventDefault());
  $("#go").onclick = run;
  $("#zip").onclick = () => download();
  $("#again").onclick = $("#clear").onclick = reset;
  document.addEventListener("keydown", (e) => {
    if (
      e.key.toLowerCase() !== "r" ||
      e.repeat ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      e.target.matches(
        "input:not([type=range]),textarea,[contenteditable=true]",
      )
    )
      return;
    const on = document.body.classList.toggle("record");
    const toast = $("#toast");
    clearTimeout(toastTimer);
    toast.classList.remove("show");
    toast.textContent = on ? "录屏模式" : "";
    if (on) {
      void toast.offsetHeight;
      toast.classList.add("show");
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
    }
  });
  stateTo("idle");
})();
