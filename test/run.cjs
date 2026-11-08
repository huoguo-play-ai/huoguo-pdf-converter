const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  { execFileSync } = require("node:child_process"),
  assert = require("node:assert/strict"),
  Zip = require("jszip");
const root = path.resolve(__dirname, ".."),
  fixtures = path.resolve(root, "../claude-python-version"),
  out = path.join(root, "test-output");
const inspect = (f) =>
  JSON.parse(execFileSync("python3", [path.join(__dirname, "inspect.py"), f]));
const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || (fs.existsSync(mac) ? mac : undefined),
  });
  try {
    const ctx = await browser.newContext({
        offline: true,
        acceptDownloads: true,
      }),
      page = await ctx.newPage(),
      network = [],
      errors = [],
      violations = [];
    ctx.on("request", (r) => {
      if (/^https?:|^wss?:/.test(r.url())) network.push(r.url());
    });
    await page.exposeFunction("recordViolation", (d) => violations.push(d));
    await page.addInitScript(() =>
      document.addEventListener("securitypolicyviolation", (e) =>
        window.recordViolation(e.violatedDirective + " " + e.blockedURI),
      ),
    );
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root, "dist/PDF转Word.html")).href);
    const names = fs
        .readdirSync(path.join(fixtures, "测试样本"))
        .filter((f) => f.endsWith(".pdf"))
        .sort(),
      rows = [],
      files = [];
    for (const name of names) {
      const buffer = fs.readFileSync(path.join(fixtures, "测试样本", name));
      files.push({ name, mimeType: "application/pdf", buffer });
      const result = await page.evaluate(async (bytes) => {
        const r = await window.pdfToDocx(Uint8Array.from(bytes).buffer, {});
        const blob = new Blob([r.docx]);
        const data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(blob);
        });
        return { ...r, docx: data };
      }, Array.from(buffer));
      const ref = path.join(fixtures, "参考输出", name.replace(/pdf$/, "docx"));
      const row = { name, status: result.status, pages: result.pages };
      if (fs.existsSync(ref)) {
        assert(result.ok, name + " " + result.error);
        const dest = path.join(out, path.basename(ref));
        fs.writeFileSync(dest, Buffer.from(result.docx, "base64"));
        const got = inspect(dest),
          want = inspect(ref);
        Object.assign(row, got, { pages: result.pages });
        delete row.text;
        row.diff = Object.keys(got)
          .filter((k) => got[k] !== want[k])
          .map((k) => k + " " + got[k] + "/" + want[k])
          .join(", ");
        if (result.pages !== want.pages) row.diff += " PDF pages mismatch";
      } else {
        assert.equal(result.status, "扫描件已跳过");
        row.diff = "";
      }
      rows.push(row);
    }
    console.table(rows);
    await page
      .locator("#file")
      .setInputFiles([
        {
          name: "损坏.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("invalid"),
        },
        ...files,
      ]);
    await page.locator("#go").click();
    await page.locator("#report").waitFor();
    assert.deepEqual(await page.locator("#list .tag").allTextContents(), [
      "失败",
      ...rows.map((r) => r.status),
    ]);
    const pending = page.waitForEvent("download");
    await page.locator("#zip").click();
    const download = await pending;
    const zipFile = path.join(out, "转换结果.zip");
    await download.saveAs(zipFile);
    const z = await Zip.loadAsync(fs.readFileSync(zipFile));
    assert.deepEqual(
      Object.keys(z.files).sort(),
      names
        .filter((n, i) => rows[i].status === "成功")
        .map((n) => n.replace(/pdf$/, "docx"))
        .sort(),
    );
    const single = page.waitForEvent("download");
    await page.locator("#list button").first().click();
    assert.equal((await single).suggestedFilename(), Object.keys(z.files)[0]);
    console.log({ network, errors, violations });
    assert.deepEqual(network, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
    fs.writeFileSync(
      path.join(out, "检查结果.json"),
      JSON.stringify({ rows, network, errors, violations }, null, 2),
    );
    execFileSync("python3", [path.join(__dirname, "render.py")], {
      stdio: "inherit",
    });
    assert(
      rows.every((r) => !r.diff),
      "结构与参考输出有差异",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
