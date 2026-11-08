const fs = require("node:fs"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const read = (p) => fs.readFileSync(p, "utf8");
const uiHtml = read("src/ui.html");
const uiCss = read("src/ui.css");
function buildFontFaces() {
  const text =
    uiHtml +
    read("src/ui.js") +
    uiCss +
    "，。！？；：、（）《》〈〉【】〔〕［］「」『』“”‘’—…·～￥";
  const chars = new Set(Array.from(text, (char) => char.codePointAt(0)));
  for (let n = 0x20; n <= 0x7e; n++) chars.add(n);
  const points = [...chars].filter((p) => p >= 0x20).sort((a, b) => a - b);
  const latin = points.filter(
    (p) => p <= 0x7e || /\p{Script=Latin}/u.test(String.fromCodePoint(p)),
  );
  const faces = [
    ["ObliqueTitleUI", "SmileySans-Oblique.ttf", 400],
    ...["Regular", "Medium", "Bold"].map((style, i) => [
      "NotoSansSCUI",
      `NotoSansSC-${style}.otf`,
      [400, 500, 700][i],
    ]),
    ...["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].map(
      (style, i) => ["InterUI", `Inter-${style}.ttf`, 400 + 100 * i],
    ),
  ].map(([family, file, weight]) => ({
    family,
    file,
    weight,
    points: family === "InterUI" ? latin : points,
  }));
  const result = execFileSync("python3", ["scripts/subset-ui-fonts.py"], {
    input: JSON.stringify({ faces }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  })
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return result
    .map(({ data, range, size }, i) => {
      const { family, file, weight } = faces[i];
      console.log(`${file}: ${size} bytes (WOFF2)`);
      return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${range}}`;
    })
    .join("\n");
}
const root = path.dirname(require.resolve("pdfjs-dist/package.json")),
  maps = {};
for (const f of fs
  .readdirSync(path.join(root, "cmaps"))
  .filter((f) => f.endsWith(".bcmap")))
  maps[f.slice(0, -6)] = fs
    .readFileSync(path.join(root, "cmaps", f))
    .toString("base64");
const fonts = {};
for (const f of fs
  .readdirSync(path.join(root, "standard_fonts"))
  .filter((f) => /\.(ttf|pfb)$/.test(f)))
  fonts[f] = fs
    .readFileSync(path.join(root, "standard_fonts", f))
    .toString("base64");
const parts = ["pdf.worker.min.js", "pdf.min.js"].map((f) =>
  read(path.join(root, "build", f)),
);
parts.push(read(require.resolve("jszip/dist/jszip.min.js")));
const previewRoot = path.dirname(require.resolve("docx-preview"));
parts.push(read(path.join(previewRoot, "docx-preview.min.js")));
parts.push(
  "(()=>{const CMAPS=" +
    JSON.stringify(maps) +
    ",STANDARD_FONTS=" +
    JSON.stringify(fonts) +
    ";\n" +
    ["pdf", "layout", "docx", "api", "ui"]
      .map((f) => read("src/" + f + ".js"))
      .join("\n") +
    "\n})();",
);
// Inline script elements keep UMD globals separate. Encode source to keep vendor
// comments, source-map links and XML namespace literals out of the HTML markup.
const payloads = parts.map((s) =>
  Buffer.from(s.replace(/^\/\/[#@] sourceMappingURL=.*$/gm, "")).toString(
    "base64",
  ),
);
const licenses = [
  ...["SmileySans", "NotoSansSC", "Inter"].map(
    (name) => "assets/fonts/licenses/" + name + "-OFL.txt",
  ),
  path.join(root, "LICENSE"),
  path.join(root, "cmaps/LICENSE"),
  ...fs
    .readdirSync(path.join(root, "standard_fonts"))
    .filter((f) => f.startsWith("LICENSE"))
    .map((f) => path.join(root, "standard_fonts", f)),
  require.resolve("jszip/LICENSE.markdown"),
  path.join(previewRoot, "../LICENSE"),
]
  .map(read)
  .join("\n");
const loader =
  '<script type="application/octet-stream" id="third-party-licenses">' +
  Buffer.from(licenses).toString("base64") +
  "</script>" +
  "<script>for(const b of " +
  JSON.stringify(payloads) +
  '){const s=document.createElement("script");s.textContent=new TextDecoder().decode(Uint8Array.from(atob(b),c=>c.charCodeAt(0)));document.body.append(s);}</script>';
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync(
  "dist/PDF转Word.html",
  uiHtml
    .replace("/* UI CSS */", () => buildFontFaces() + "\n" + uiCss)
    .replace("<!-- MOOD IMAGES -->", () =>
      ["idle", "expect", "focus", "happy", "sad"]
        .map((mood) => {
          const data = fs
            .readFileSync("assets/moods/" + mood + ".webp")
            .toString("base64");
          return `<span class="pet-layer" data-image="${mood}"><img src="data:image/webp;base64,${data}" width="300" height="400" alt=""><canvas width="300" height="400"></canvas></span>`;
        })
        .join(""),
    )
    .replace("<!-- BUNDLE -->", loader),
);
