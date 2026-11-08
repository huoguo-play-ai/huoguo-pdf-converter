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
    assert(
      fs.statSync(path.join(root, "dist/PDF转Word.html")).size < 7_000_000,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator("#pet img")
        .evaluate((e) => getComputedStyle(e).animationName),
      "fade",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const transfer = await page.evaluateHandle((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "拖入样本.pdf", {
          type: "application/pdf",
        }),
      );
      return transfer;
    }, Array.from(files[0].buffer));
    await page
      .locator("#drop")
      .dispatchEvent("dragenter", { dataTransfer: transfer });
    assert(await page.locator("#drop.over").count());
    await page
      .locator("#drop")
      .dispatchEvent("drop", { dataTransfer: transfer });
    await page
      .locator("#append")
      .dispatchEvent("drop", { dataTransfer: transfer });
    assert.equal(await page.locator("#list li").count(), 2);
    await transfer.dispose();
    await page.locator("#clear").click();
    await page.evaluate(() => {
      const convert = window.pdfToDocx;
      window.measuredMs = 0;
      window.pdfToDocx = async (...args) => {
        const start = performance.now();
        try {
          return await convert(...args);
        } finally {
          window.measuredMs += performance.now() - start;
        }
      };
    });
    const screenshots = path.join(out, "界面");
    fs.mkdirSync(screenshots, { recursive: true });
    for (const [width, height] of [
      [1280, 720],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      const shot = (name) =>
        page.screenshot({
          path: path.join(
            screenshots,
            width + "×" + height + "-" + name + ".png",
          ),
        });
      await page.locator("#idle").waitFor();
      await shot("1-待机");
      await page.keyboard.press("r");
      assert(await page.locator("body.record").count());
      await page.keyboard.press("r");
      await page.locator("#file").setInputFiles(files);
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("#list small")).every((e) =>
          e.textContent.includes("页"),
        ),
      );
      await page.waitForTimeout(650);
      await shot("2-拖入文件");
      await page.evaluate(() => {
        window.measuredMs = 0;
      });
      await page.locator("#go").click();
      await page.locator("#sourceThumb canvas").waitFor();
      await page.locator("#blocks .block").first().waitFor();
      await page.waitForTimeout(175);
      await shot("3-转换中");
      await page.locator("#report").waitFor();
      assert.deepEqual(
        await page.locator("#results .tag").allTextContents(),
        rows.map((r) => r.status),
      );
      await page.locator("#compare").waitFor();
      await page.locator("#pdfLayer canvas").waitFor();
      assert(
        await page.locator("#wordLayer section.docx:not([hidden])").innerText(),
      );
      assert(
        await page.locator("#pdfLayer canvas").evaluate((c) =>
          c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height)
            .data.some((v, i) => i % 4 !== 3 && v < 180),
        ),
      );
      assert(
        await page
          .locator("#compare")
          .evaluate((el) => el.clientHeight > 100 && el.clientWidth > 100),
      );
      assert(
        await page
          .locator("#wordLayer section.docx:not([hidden])")
          .evaluate(
            (el) =>
              el.getBoundingClientRect().width >
              el.closest("#compare").clientWidth * 0.9,
          ),
      );
      const badge = await page.locator("#badge").innerText();
      const seconds = Number(badge.match(/用时 ([\d.]+) 秒/)[1]);
      assert(
        Math.abs(
          seconds * 1000 - (await page.evaluate(() => window.measuredMs)),
        ) < 60,
      );
      await shot("4-完成对比");
      const pos = await page.locator("#handle").boundingBox();
      const x = pos.x + pos.width / 2,
        y = pos.y + pos.height / 2;
      if (width < 640) {
        const session = await ctx.newCDPSession(page);
        for (const [type, points] of [
          ["touchStart", [{ x, y }]],
          ["touchMove", [{ x, y: y + 50 }]],
          ["touchEnd", []],
        ])
          await session.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points,
          });
        await session.detach();
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 40, y, { steps: 8 });
        await page.mouse.up();
      }
      assert(Number(await page.locator("#split").inputValue()) > 55);
      const before = Number(await page.locator("#split").inputValue());
      await page.locator("#split").focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(
        Number(await page.locator("#split").inputValue()),
        before - 1,
      );
      const multi = rows.findIndex((r) => r.status === "成功" && r.pages > 1);
      if (multi >= 0) {
        await page
          .locator("#results .result")
          .nth(multi)
          .locator("button")
          .first()
          .click();
        await page.locator("#next").click();
        await page.waitForFunction(
          () =>
            document.querySelector("#pageNo").textContent.startsWith("2 /") &&
            !document.querySelector("#message").textContent,
        );
        const wordPage = page.locator("#wordLayer section.docx:not([hidden])");
        await wordPage.waitFor();
        assert.match(await wordPage.innerText(), /第\s*2\s*章/);
      }
      for (const [index, row] of rows.entries()) {
        if (row.status !== "成功") continue;
        await page
          .locator("#results .result")
          .nth(index)
          .locator("button")
          .first()
          .click();
        await page.locator("#compare").waitFor();
        const rendered = page.locator("#wordLayer section.docx:not([hidden])");
        assert(await rendered.innerText());
        if (row.tables)
          assert.equal(
            await page.locator("#wordLayer section.docx table").count(),
            row.tables,
          );
        if (row.anchors) await rendered.locator("img").first().waitFor();
        if (row.name === "4-简历.pdf") {
          const frame = await page.locator("#compare").boundingBox();
          if (width >= 640) {
            const handle = await page.locator("#handle").boundingBox();
            await page.mouse.move(
              handle.x + handle.width / 2,
              handle.y + handle.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(frame.x, frame.y + frame.height / 2, {
              steps: 8,
            });
            await page.mouse.up();
          } else {
            await page.locator("#split").focus();
            await page.keyboard.press("Home");
            const top = await page.locator(".pdf-label").boundingBox();
            const bottom = await page.locator(".word-label").boundingBox();
            assert(
              top.y + top.height <= frame.y &&
                bottom.y >= frame.y + frame.height,
            );
          }
          assert.equal(await page.locator("#split").inputValue(), "0");
          const image = await rendered.locator("img").boundingBox();
          // Original PDF bounds from Poppler, in page points.
          const scale = 595.28 / frame.width;
          const actual = [
            (image.x - frame.x) * scale,
            (image.y - frame.y) * scale,
            image.width * scale,
            image.height * scale,
          ];
          const expected = [437, 39, 120, 120];
          assert(
            actual.every((v, i) => Math.abs(v - expected[i]) < 2),
            JSON.stringify(actual),
          );
          const name = await rendered
            .getByText("火锅", { exact: true })
            .last()
            .boundingBox();
          assert(Math.abs((name.x - frame.x) * scale - 38) < 3);
          console.log(
            "简历照片（pt）",
            actual,
            "姓名左边距（pt）",
            (name.x - frame.x) * scale,
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          await shot("5-简历-完整Word");
        }
      }
      // Stress the sidebar independently of batch conversion speed.
      await page.locator("#results").evaluate((list) => {
        for (let i = 0; i < 30; i++)
          list.append(list.firstElementChild.cloneNode(true));
      });
      for (const record of [false, true]) {
        if (record) await page.keyboard.press("r");
        const list = page.locator("#results");
        await list.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        assert(
          await list.evaluate(
            (el) =>
              el.scrollTop > 0 &&
              el.lastElementChild.getBoundingClientRect().bottom <=
                el.getBoundingClientRect().bottom + 1,
          ),
        );
        for (const id of ["zip", "again"]) {
          assert(
            await page.locator("#" + id).evaluate((el) => {
              const r = el.getBoundingClientRect();
              return el.contains(
                document.elementFromPoint(
                  r.left + r.width / 2,
                  r.top + r.height / 2,
                ),
              );
            }),
          );
        }
        if (record) {
          await shot("6-录屏-长列表");
          await page.keyboard.press("r");
        }
      }
      await page.locator("#results").evaluate((el, count) => {
        while (el.children.length > count) el.lastElementChild.remove();
        el.scrollTop = 0;
      }, rows.length);
      const scan = rows.findIndex((r) => r.status === "扫描件已跳过");
      await page
        .locator("#results .result")
        .nth(scan)
        .locator("button")
        .first()
        .click();
      assert((await page.locator("#message").innerText()).includes("扫描件"));
      const pending = page.waitForEvent("download");
      await page.locator("#zip").click();
      const zipFile = path.join(out, "转换结果.zip");
      await (await pending).saveAs(zipFile);
      const z = await Zip.loadAsync(fs.readFileSync(zipFile));
      assert.deepEqual(
        Object.keys(z.files).sort(),
        names
          .filter((n, i) => rows[i].status === "成功")
          .map((n) => n.replace(/pdf$/, "docx"))
          .sort(),
      );
      const single = page.waitForEvent("download");
      await page.locator(".download").first().click();
      assert.equal((await single).suggestedFilename(), Object.keys(z.files)[0]);
      await page.locator("#again").click();
    }
    await page.locator("#file").setInputFiles([
      {
        name: "损坏.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("invalid"),
      },
      ...files,
    ]);
    await page.locator("#go").click();
    await page.locator("#report").waitFor();
    assert.deepEqual(await page.locator("#results .tag").allTextContents(), [
      "失败",
      ...rows.map((r) => r.status),
    ]);
    assert(
      (await page.locator("#results .result").first().textContent()).includes(
        "这不是 PDF 文件",
      ),
    );
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
