const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/",
  ns =
    'xmlns:w="' +
    W +
    '" xmlns:r="' +
    R +
    '" xmlns:wp="' +
    drawing +
    'wordprocessingDrawing" xmlns:a="' +
    drawing +
    'main" xmlns:pic="' +
    drawing +
    'picture"';
const esc = (s) =>
  String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const tw = (x) => Math.round(20 * x),
  em = (x) => Math.round(12700 * x);
const val = (tag, v) => "<w:" + tag + ' w:val="' + v + '"/>';
const plain = val("autoSpaceDE", 0) + val("autoSpaceDN", 0);
// Python round() uses the nearest even integer at exact half-integers.
const roundEven = (x) =>
  x - Math.floor(x) === 0.5 ? 2 * Math.round((x - 0.5) / 2) : Math.round(x);
const border = (side, width, space, color) =>
  "<w:" +
  side +
  ' w:val="single" w:sz="' +
  Math.trunc(Math.max(2, Math.min(96, width * 8))) +
  '" w:space="' +
  Math.max(0, Math.min(31, roundEven(space))) +
  '" w:color="' +
  color +
  '"/>';
function props({
  br = false,
  borders = "",
  fill,
  tabs = "",
  before = 0,
  line,
  left,
  right,
  hang,
  align,
  sect = "",
}) {
  const ind = [
    ["left", left],
    ["right", right],
    ["hanging", hang],
  ]
    .filter((k) => k[1] != null)
    .map(([k, v]) => " w:" + k + '="' + tw(v) + '"')
    .join("");
  return (
    "<w:pPr>" +
    (br ? "<w:pageBreakBefore/>" : "") +
    val("widowControl", 0) +
    (borders ? "<w:pBdr>" + borders + "</w:pBdr>" : "") +
    (fill
      ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>'
      : "") +
    (tabs ? "<w:tabs>" + tabs + "</w:tabs>" : "") +
    plain +
    '<w:spacing w:before="' +
    2 * Math.round(Math.max(0, before) * 10) +
    '" w:after="0" w:lineRule="exact" w:line="' +
    2 * Math.round(line * 10) +
    '"/>' +
    (ind ? "<w:ind" + ind + "/>" : "") +
    (align ? val("jc", align) : "") +
    sect +
    "</w:pPr>"
  );
}
function run(text, font, { size, bold, color }) {
  font = esc(font);
  return (
    '<w:r><w:rPr><w:rFonts w:ascii="' +
    font +
    '" w:hAnsi="' +
    font +
    '" w:eastAsia="' +
    font +
    '" w:cs="' +
    font +
    '"/>' +
    val("b", bold ? 1 : 0) +
    (color && color !== "000000" ? val("color", color) : "") +
    val("sz", Math.floor(size * 2)) +
    "</w:rPr>" +
    (text === "\t"
      ? "<w:tab/>"
      : '<w:t xml:space="preserve">' + esc(text) + "</w:t>") +
    "</w:r>"
  );
}
function fieldRuns(text, font, r) {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(text) || /(\d+)/.exec(text);
  if (!m) return run(text, font, r);
  let xml = run(text.slice(0, m.index), font, r);
  const field = (n, v) =>
    '<w:fldSimple w:instr=" ' + n + ' ">' + run(v, font, r) + "</w:fldSimple>";
  xml += field("PAGE", m[1]);
  if (m[2])
    xml +=
      run(m[0].slice(m[1].length, -m[2].length), font, r) +
      field("NUMPAGES", m[2]);
  return xml + run(text.slice(m.index + m[0].length), font, r);
}
class Builder {
  constructor(pages, font) {
    this.pages = pages;
    this.font = font;
    this.media = [];
    this.body = [];
    this.cols = '<w:cols w:space="720"/>';
    this.cont = false;
    const pg = pages[0],
      objects = pages.flatMap((p) => [
        ...p.lines,
        ...p.rules,
        ...p.tables,
        ...p.boxes,
      ]);
    this.ml = Math.max(
      18,
      min([...objects, ...pages.flatMap((p) => p.bars)], (o) => o.x0) - 0.5,
    );
    this.cright = max(objects, (o) => o.x1);
    if (!Number.isFinite(this.cright)) {
      this.ml = 18;
      this.cright = pg.w - 18;
    }
    this.mr = Math.max(18, pg.w - this.cright - 0.5);
    const lines = (p) => [...p.lines, ...p.tables];
    this.mt = Math.max(
      12,
      min(pages, (p) => (lines(p).length ? min(lines(p), (l) => l.top) : 72)) -
        10,
    );
    this.mb = Math.max(
      10,
      Math.min(
        36,
        min(
          pages,
          (p) => p.h - (lines(p).length ? max(lines(p), (l) => l.bottom) : 0),
        ) - 6,
      ),
    );
    this.fd = 0;
    if (pg.footer) {
      const { lines, rules } = pg.footer;
      this.mb = Math.max(
        10,
        pg.h -
          Math.min(
            ...lines.map((l) => l.top - 3),
            ...rules.map((r) => r.y - 2),
          ),
      );
      this.fd = Math.max(
        0,
        pg.h -
          Math.max(
            ...lines.map((l) => l.b + 0.18 * l.size),
            ...rules.map((r) => r.y + 1),
          ),
      );
    }
  }
  section() {
    const p = this.pages[0];
    return (
      "<w:sectPr>" +
      (!this.cont && p.footer
        ? '<w:footerReference w:type="default" r:id="footer"/>'
        : "") +
      (this.cont ? val("type", "continuous") : "") +
      '<w:pgSz w:w="' +
      tw(p.w) +
      '" w:h="' +
      tw(p.h) +
      '"/><w:pgMar w:top="' +
      tw(this.mt) +
      '" w:right="' +
      tw(this.mr) +
      '" w:bottom="' +
      tw(this.mb) +
      '" w:left="' +
      tw(this.ml) +
      '" w:header="0" w:footer="' +
      tw(this.fd) +
      '" w:gutter="0"/>' +
      this.cols +
      "</w:sectPr>"
    );
  }
  sectionBreak() {
    this.body.push(
      "<w:p>" + props({ line: 0.7, sect: this.section() }) + "</w:p>",
    );
    this.cont = true;
    this.cursor += 0.7;
  }
  paragraph(p, content = "") {
    this.first ??= this.body.length;
    this.body.push(
      "<w:p>" + props({ ...p, br: this.break }) + content + "</w:p>",
    );
    this.break = false;
  }
  para(p, prevBox) {
    const f = p.lines[0],
      last = p.lines.at(-1),
      bottom = last.b + 0.18 * last.size;
    let line = p.pitch || Math.round(f.size * 13) / 10,
      top = f.b + 0.18 * f.size - line,
      before = top - this.cursor;
    const pr = {},
      box = p.box;
    if (box) {
      const bw = Math.max(0.5, box.stroke ? box.lw : 0.5),
        pad = Math.max(1, f.x0 - box.x0 - bw);
      if (box !== prevBox) before = box.top - this.cursor;
      pr.left = f.x0 - this.cl;
      pr.right = Math.max(0, this.cr - box.x1 + pad);
      pr.fill = box.fill;
      pr.borders = [
        ["top", box === prevBox ? 0 : top - box.top],
        ["left", pad],
        ["bottom", box.bottom - bottom],
        ["right", pad],
      ]
        .map(([s, v]) => border(s, bw, v, box.stroke || box.fill))
        .join("");
      this.cursor = box.bottom;
    } else {
      this.cursor = bottom;
      if (p.hang != null) {
        pr.left = p.hang - this.cl;
        pr.hang = p.hang - f.x0;
      } else if (f.x0 - this.cl > 0.5) pr.left = f.x0 - this.cl;
      if (p.bar) {
        pr.left = f.x0 - this.cl;
        pr.borders = border(
          "left",
          p.bar.x1 - p.bar.x0,
          f.x0 - p.bar.x1,
          p.bar.fill,
        );
      }
    }
    if (before < 0) {
      line = Math.max(f.size * 1.05, line + before);
      before = 0;
    }
    if (p.lines.length > 1) {
      pr.align = "both";
      if (!box)
        pr.right = Math.max(
          0,
          this.cr - max(p.lines.slice(0, -1), (l) => l.x1) - 0.5,
        );
    }
    pr.tabs = f.segments
      .slice(1)
      .map((s) => {
        const right =
          s === f.segments.at(-1) &&
          s.x1 > this.cl + 0.55 * (this.cr - this.cl);
        return (
          '<w:tab w:val="' +
          (right ? "right" : "left") +
          '" w:pos="' +
          tw((right ? s.x1 : s.x0) - this.cl - (pr.left || 0)) +
          '"/>'
        );
      })
      .join("");
    let content = "";
    for (const [li, l] of p.lines.entries())
      for (const [si, s] of l.segments.entries()) {
        if (si) content += "<w:r><w:tab/></w:r>";
        for (const [ri, r] of s.runs.entries()) {
          let t = r.text;
          if (
            li &&
            !si &&
            !ri &&
            p.lines[li - 1].text.at(-1).charCodeAt(0) > 127
          )
            t = t.trimStart();
          if (!li && !si && !ri && p.hang != null) {
            content +=
              run(t[0], "Arial", r) + run("\t", this.font, { size: r.size });
            t = t.slice(1).trimStart();
          }
          content += this.footer
            ? fieldRuns(t, this.font, r)
            : run(t, this.font, r);
        }
      }
    this.paragraph({ ...pr, before, line }, content);
  }
  rule(r) {
    const w = Math.max(0.5, r.w);
    this.paragraph(
      {
        before: r.y - w / 2 - 0.7 - this.cursor,
        line: 0.7,
        left: r.x0 - this.cl > 1 ? r.x0 - this.cl : null,
        right: this.cr - r.x1 > 1 ? this.cr - r.x1 : null,
        borders: border("bottom", w, 0, r.color),
      },
      run("", this.font, { size: 1 }),
    );
    this.cursor = r.y + w / 2;
  }
  table(t) {
    const gap = t.top - this.cursor;
    if (gap > 0.8 || this.break) this.paragraph({ line: Math.max(0.7, gap) });
    const widths = t.xs.slice(1).map((x, i) => tw(x - t.xs[i]));
    const table =
      '<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/><w:tblInd w:type="dxa" w:w="' +
      tw(t.x0 - this.cl) +
      '"/><w:tblBorders>' +
      ["top", "left", "bottom", "right", "insideH", "insideV"]
        .map((k) => border(k, t.lw, 0, t.color))
        .join("") +
      '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      widths.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") +
      "</w:tblGrid>";
    this.body.push(
      table +
        t.rows
          .map(
            (row, j) =>
              '<w:tr><w:trPr><w:trHeight w:hRule="exact" w:val="' +
              tw(t.ys[j + 1] - t.ys[j]) +
              '"/></w:trPr>' +
              row
                .map((lines, i) => {
                  const centered =
                    lines.length &&
                    lines[0].x0 - t.xs[i] > 6 &&
                    lines.every(
                      (l) => Math.abs(mid(l) - (t.xs[i] + t.xs[i + 1]) / 2) < 3,
                    );
                  return (
                    '<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="' +
                    widths[i] +
                    '"/>' +
                    val("vAlign", "center") +
                    "</w:tcPr><w:p>" +
                    props({
                      line: lines.length ? lines[0].size * 1.3 : 10,
                      left: lines.length
                        ? centered
                          ? 0
                          : Math.max(0, lines[0].x0 - t.xs[i])
                        : null,
                      align: centered ? "center" : null,
                    }) +
                    lines
                      .map((l) =>
                        l.segments
                          .map((s) =>
                            s.runs
                              .map((r) => run(r.text, this.font, r))
                              .join(""),
                          )
                          .join("<w:r><w:t> </w:t></w:r>"),
                      )
                      .join("<w:r><w:br/></w:r>") +
                    "</w:p></w:tc>"
                  );
                })
                .join("") +
              "</w:tr>",
          )
          .join("") +
        "</w:tbl>",
    );
    this.cursor = t.bottom;
  }
  flow(lines, others, pg, right) {
    let prev;
    for (const o of [...group(lines, right, pg), ...others].sort(
      (a, b) => a.top - b.top,
    )) {
      if (o.kind === "rule") this.rule(o);
      else if (o.kind === "table") this.table(o);
      else this.para(o, prev);
      prev = o.box;
    }
  }
  page(pg, index) {
    this.first = null;
    this.break = index > 0;
    this.cursor = this.mt;
    const regs = pg.regions,
      bounds = regs
        .slice(1)
        .map(
          (r, i) =>
            (max(regs[i].lines, (l) => l.bottom) + min(r.lines, (l) => l.top)) /
            2,
        );
    for (const [i, r] of regs.entries()) {
      const mine = [...pg.rules, ...pg.tables].filter(
        (o) =>
          o.top >= (bounds[i - 1] ?? -Infinity) &&
          o.top < (bounds[i] ?? Infinity),
      );
      this.cl = this.ml;
      this.cr = this.cright;
      if (!r.cols) {
        this.flow(r.lines, mine, pg, this.cr);
        continue;
      }
      const [left, right] = r.cols,
        space = tw(right.x0 - left.x1);
      this.sectionBreak();
      const top = this.cursor,
        ends = [];
      for (const [j, col] of r.cols.entries()) {
        if (j)
          this.paragraph({ line: 0.7 }, '<w:r><w:br w:type="column"/></w:r>');
        this.cursor = top + (j ? 0.7 : 0);
        this.cl = j ? right.x0 : this.ml;
        this.cr = j ? this.cright : left.x1;
        this.flow(
          col.lines,
          mine.filter((o) => mid(o) < right.x0 === !j),
          pg,
          col.x1,
        );
        ends.push(this.cursor);
      }
      this.cols =
        '<w:cols w:num="2" w:space="' +
        space +
        '" w:equalWidth="0"><w:col w:w="' +
        tw(left.x1 - this.ml) +
        '" w:space="' +
        space +
        '"/><w:col w:w="' +
        tw(this.cright - right.x0) +
        '"/></w:cols>';
      this.sectionBreak();
      this.cols = '<w:cols w:space="720"/>';
      this.cursor = Math.max(...ends) + 0.7;
    }
    if (this.first == null) this.paragraph({ line: 0.7 });
    for (const im of pg.images) {
      this.media.push(im);
      this.body[this.first] = this.body[this.first].replace(
        /<\/w:p>$/,
        anchor(im, this.media.length) + "</w:p>",
      );
    }
  }
  build() {
    this.pages.forEach((p, i) => this.page(p, i));
    const doc =
      "<w:document " +
      ns +
      "><w:body>" +
      this.body.join("") +
      this.section() +
      "</w:body></w:document>";
    let footer;
    const pg = this.pages[0],
      foot = pg.footer;
    if (foot) {
      this.body = [];
      this.footer = true;
      this.break = false;
      this.cl = this.ml;
      this.cr = this.cright;
      this.cursor = Math.min(
        ...foot.lines.map((l) => l.b + 0.18 * l.size - l.size * 1.3),
        ...foot.rules.map((r) => r.y - Math.max(0.5, r.w) / 2 - 0.7),
      );
      this.flow(foot.lines, foot.rules, pg, this.cr);
      footer = "<w:ftr " + ns + ">" + this.body.join("") + "</w:ftr>";
    }
    return packageDoc(doc, footer, this.media);
  }
}
function anchor(im, id) {
  const x = em(im.x0),
    y = em(im.top),
    cx = em(im.x1 - im.x0),
    cy = em(im.bottom - im.top);
  return (
    '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="0" simplePos="0" relativeHeight="' +
    (100 + id) +
    '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>' +
    x +
    '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' +
    y +
    '</wp:posOffset></wp:positionV><wp:extent cx="' +
    cx +
    '" cy="' +
    cy +
    '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="' +
    (100 + id) +
    '" name="图片 ' +
    id +
    '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="' +
    drawing +
    'picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image' +
    id +
    '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img' +
    id +
    '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' +
    cx +
    '" cy="' +
    cy +
    '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'
  );
}
function packageDoc(doc, footer, media) {
  const zip = new JSZip(),
    pkg = "http://schemas.openxmlformats.org/package/2006/";
  const rel = (id, type, target) =>
    '<Relationship Id="' +
    id +
    '" Type="' +
    R +
    "/" +
    type +
    '" Target="' +
    target +
    '"/>';
  const rels = (entries) =>
    '<Relationships xmlns="' +
    pkg +
    'relationships">' +
    entries +
    "</Relationships>";
  zip.file(
    "_rels/.rels",
    rels(rel("doc", "officeDocument", "word/document.xml")),
  );
  let links = rel("styles", "styles", "styles.xml");
  if (footer) {
    links += rel("footer", "footer", "footer1.xml");
    zip.file("word/footer1.xml", footer);
  }
  media.forEach((im, i) => {
    const path = "media/image" + (i + 1) + ".png";
    links += rel("img" + (i + 1), "image", path);
    zip.file("word/" + path, im.png, { base64: true });
  });
  zip.file("word/_rels/document.xml.rels", rels(links));
  zip.file("word/document.xml", doc);
  zip.file(
    "word/styles.xml",
    '<w:styles xmlns:w="' +
      W +
      '"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:style></w:styles>',
  );
  const override = (name, type) =>
    '<Override PartName="/word/' +
    name +
    '.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' +
    type +
    '+xml"/>';
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="' +
      pkg +
      'content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
      override("document", "document.main") +
      override("styles", "styles") +
      (footer ? override("footer1", "footer") : "") +
      "</Types>",
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
