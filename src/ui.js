(() => {
  const $ = (s) => document.querySelector(s);
  const items = [];
  let busy = false;

  function htmlEscape(s) {
    return s.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  }
  function tagClass(st) {
    return (
      { 成功: "ok", 扫描件已跳过: "warn", 失败: "bad", 转换中: "run" }[st] || ""
    );
  }

  function render() {
    $("#list").innerHTML = items
      .map(
        (it, i) => `
    <li>
      <div class="ico">PDF</div>
      <div class="meta">
        <div class="name" title="${htmlEscape(it.file.name)}">${htmlEscape(it.file.name)}</div>
        <div class="status">${it.pages ? it.pages + " 页 · " : ""}${htmlEscape(it.error || (it.output ? "可下载为 " + it.output : (it.file.size / 1024).toFixed(0) + " KB"))}</div>
      </div>
      <span class="tag ${tagClass(it.status)}">${it.status}</span>
      ${it.output ? `<button data-i="${i}">下载</button>` : ""}
    </li>`,
      )
      .join("");
    $("#empty").style.display = items.length ? "none" : "block";
    const waiting = items.some((it) => it.status === "等待中");
    $("#go").disabled = busy || !waiting;
    $("#clear").disabled = busy || !items.length;
    $("#zip").disabled = busy || !items.some((it) => it.output);
  }

  function add(files) {
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name)) continue;
      items.push({ file: f, status: "等待中" });
    }
    render();
  }

  async function run() {
    busy = true;
    render();
    const todo = items.filter((it) => it.status === "等待中");
    $("#progress").style.display = "block";
    let done = 0;
    for (const it of todo) {
      it.status = "转换中";
      render();
      try {
        Object.assign(
          it,
          await window.pdfToDocx(await it.file.arrayBuffer(), {
            font: $("#font").value,
          }),
        );
        if (it.ok) {
          const base = it.file.name.replace(/\.pdf$/i, "");
          let n = 1;
          it.output = base + ".docx";
          while (items.some((o) => o !== it && o.output === it.output))
            it.output = base + " (" + ++n + ").docx";
        }
      } catch (e) {
        it.status = "失败";
        it.error = e.message;
      }
      done++;
      $("#progress div").style.width = (done / todo.length) * 100 + "%";
      render();
    }
    busy = false;
    render();
    report();
    setTimeout(() => {
      $("#progress").style.display = "none";
      $("#progress div").style.width = "0";
    }, 800);
  }

  function report() {
    const g = (s) => items.filter((it) => it.status === s);
    const ok = g("成功"),
      scan = g("扫描件已跳过"),
      bad = g("失败");
    const line = (t, arr, f) =>
      `<p><b>${t}（${arr.length}）</b>${arr.length ? "：" + arr.map(f).join("；") : ""}</p>`;
    $("#reportBody").innerHTML =
      line(
        "成功",
        ok,
        (it) => htmlEscape(it.file.name) + " → " + htmlEscape(it.output),
      ) +
      line("扫描件已跳过", scan, (it) => htmlEscape(it.file.name)) +
      line(
        "失败",
        bad,
        (it) =>
          htmlEscape(it.file.name) + "（" + htmlEscape(it.error || "") + "）",
      );
    $("#report").style.display = "block";
  }

  async function download(names, zip) {
    const files = items.filter((it) => names.includes(it.output));
    let blob;
    if (zip) {
      const z = new JSZip();
      for (const it of files) z.file(it.output, it.docx);
      blob = await z.generateAsync({ type: "blob" });
    } else
      blob = new Blob([files[0].docx], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = zip ? "转换结果.zip" : names[0];
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  $("#font").value = defaultFont;
  $("#drop").onclick = (e) => {
    if (e.target !== $("#file")) $("#file").click();
  };
  $("#drop").onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") $("#file").click();
  };
  $("#file").onchange = (e) => {
    add(e.target.files);
    e.target.value = "";
  };
  ["dragenter", "dragover"].forEach((t) =>
    $("#drop").addEventListener(t, (e) => {
      e.preventDefault();
      $("#drop").classList.add("over");
    }),
  );
  ["dragleave", "drop"].forEach((t) =>
    $("#drop").addEventListener(t, (e) => {
      e.preventDefault();
      $("#drop").classList.remove("over");
    }),
  );
  $("#drop").addEventListener("drop", (e) => add(e.dataTransfer.files));
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());
  $("#go").onclick = run;
  $("#list").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) download([items[b.dataset.i].output]);
  };
  $("#zip").onclick = () =>
    download(
      items.filter((it) => it.output).map((it) => it.output),
      true,
    );

  $("#clear").onclick = () => {
    items.length = 0;
    $("#report").style.display = "none";
    render();
  };
  render();
})();
