const fs = require("node:fs"),
  path = require("node:path");
const read = (p) => fs.readFileSync(p, "utf8");
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
  read("src/ui.html")
    .replace("/* UI CSS */", () => read("src/ui.css"))
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
