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
    await page.goto(pathToFileURL(path.join(root, "dist/火锅PDF转换器.html")).href);
    const fontState = await page.evaluate(async () => {
      await document.fonts.ready;
      const title = getComputedStyle(document.querySelector("#idle h1"));
      const subsets = Array.from(document.styleSheets[0].cssRules).filter(
        (rule) => rule.type === CSSRule.FONT_FACE_RULE,
      );
      return {
        subsets: subsets.length,
        inlineBytes: subsets.reduce(
          (sum, rule) => sum + new TextEncoder().encode(rule.cssText).length,
          0,
        ),
        loaded: [...document.fonts]
          .filter((face) => face.status === "loaded")
          .map((face) => face.family),
        title: title.fontFamily.split(",")[0].replaceAll('"', ""),
        weight: title.fontWeight,
        spacing: title.letterSpacing,
        size: title.fontSize,
      };
    });
    for (const family of ["ObliqueTitleUI", "NotoSansSCUI", "InterUI"])
      assert(fontState.loaded.includes(family), family + " 未加载");
    assert.equal(fontState.subsets, 9);
    assert(fontState.inlineBytes <= 300_000, "内联字体超过 300 KB");
    assert.equal(fontState.title, "ObliqueTitleUI");
    assert.equal(fontState.weight, "400");
    assert.equal(fontState.spacing, "0.5px");
    assert.equal(fontState.size, "64px");
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
      fs.statSync(path.join(root, "dist/火锅PDF转换器.html")).size < 12_000_000,
    );
    const expectMood = async (mood) => {
      const layer = page.locator(
        `#pet[data-mood="${mood}"] [data-image="${mood}"]`,
      );
      await layer.waitFor();
      await page.waitForFunction((m) => {
        const el = document.querySelector(`#pet [data-image="${m}"]`);
        return getComputedStyle(el).opacity === "1";
      }, mood);
    };
    await expectMood("idle");
    for (const mood of ["idle", "expect", "focus", "happy", "sad"]) {
      const img = page.locator(`[data-image="${mood}"] img`);
      assert.equal(
        await img.getAttribute("src"),
        "data:image/webp;base64," +
          fs
            .readFileSync(path.join(root, "assets/moods", mood + ".webp"))
            .toString("base64"),
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".pet-layer img:visible").count(), 0);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".pet-layer canvas")].every((c) =>
        c
          .getContext("2d")
          .getImageData(0, 0, c.width, c.height)
          .data.some((v, i) => i % 4 === 3 && v > 0),
      ),
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      const pet = document.querySelector("#pet");
      window.moodChanges = {};
      new MutationObserver(() => {
        window.moodChanges[pet.dataset.mood] = performance.now();
      }).observe(pet, { attributes: true, attributeFilter: ["data-mood"] });
    });
    const expectMixedReport = async () => {
      await expectMood("sad");
      await expectMood("happy");
      const duration = await page.evaluate(
        () => window.moodChanges.happy - window.moodChanges.sad,
      );
      assert(
        duration >= 1950 && duration < 3000,
        "委屈状态持续 " + duration + " ms",
      );
    };
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
    await expectMood("expect");
    await page
      .locator("#drop")
      .dispatchEvent("dragleave", { dataTransfer: transfer });
    await expectMood("idle");
    await page
      .locator("#drop")
      .dispatchEvent("drop", { dataTransfer: transfer });
    await page
      .locator("#append")
      .dispatchEvent("drop", { dataTransfer: transfer });
    assert.equal(await page.locator("#list li").count(), 2);
    await expectMood("expect");
    await transfer.dispose();
    await page.locator("#clear").click();
    await expectMood("idle");
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
      await expectMood("expect");
      await shot("2-拖入文件");
      await page.evaluate(() => {
        window.measuredMs = 0;
      });
      await page.locator("#go").click();
      await expectMood("focus");
      await page.locator("#sourceThumb canvas").waitFor();
      await page
        .locator("#blocks .block")
        .first()
        .waitFor({ state: "attached" });
      await page.waitForTimeout(175);
      for (const recording of [false, true]) {
        if (recording) await page.keyboard.press("r");
        const bounds = async (selector) => {
          const box = await page.locator(selector).boundingBox();
          assert(box && box.width > 0 && box.height > 0, selector);
          assert(
            box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= width + 1 &&
              box.y + box.height <= height + 1,
            selector + " 超出画面",
          );
          return box;
        };
        const original = await bounds("#sourceThumb");
        const pet = await bounds("#running #pet[data-mood=focus]");
        const caption = await bounds(".direction");
        const counter = await bounds("#counter");
        const progress = await bounds("#progress");
        assert(Math.abs(pet.width / pet.height - 0.75) < 0.01);
        assert(Math.abs(pet.x + pet.width / 2 - width / 2) < 2);
        assert(
          caption.y >= pet.y + pet.height - 1 &&
            counter.y > caption.y + caption.height,
        );
        assert(progress.y >= counter.y + counter.height - 1);
        assert(Math.abs(progress.x + progress.width / 2 - width / 2) < 2);
        if (width === 1280) {
          const reflow = await bounds("#blocks");
          assert(
            original.x + original.width < pet.x && pet.x + pet.width < reflow.x,
          );
          if (!recording) {
            assert(Math.abs(pet.height - 340) < 2);
            assert(Math.abs(progress.width - 760) < 2);
          }
        } else {
          assert(original.y + original.height < pet.y);
          assert.equal(await page.locator("#blocks").isVisible(), false);
          if (!recording) assert(Math.abs(pet.width - 180) < 2);
        }
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await shot(recording ? "3-转换中-录屏" : "3-转换中");
        if (recording) await page.keyboard.press("r");
      }
      await page.locator("#report").waitFor();
      await expectMixedReport();
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
    await expectMixedReport();
    const successful = files[rows.findIndex((r) => r.status === "成功")];
    const scanned = files[rows.findIndex((r) => r.status === "扫描件已跳过")];
    const invalid = {
      name: "损坏.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("invalid"),
    };
    for (const [file, mood] of [
      [successful, "happy"],
      [scanned, "sad"],
      [invalid, "sad"],
    ]) {
      await page.locator("#again").click();
      await expectMood("idle");
      await page.locator("#file").setInputFiles(file);
      await page.locator("#go").click();
      await page.locator("#report").waitFor();
      await expectMood(mood);
      if (mood === "sad") {
        await page.waitForTimeout(2100);
        await expectMood("sad");
      }
    }
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
