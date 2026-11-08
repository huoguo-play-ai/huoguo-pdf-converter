// PDF.js 3.x emits text-showing operations with decoded glyphs and PDF widths.
class MemoryStandardFonts {
  async fetch({ filename }) {
    if (!Object.hasOwn(STANDARD_FONTS, filename))
      throw Error("缺少字体 " + filename);
    return Uint8Array.from(atob(STANDARD_FONTS[filename]), (c) =>
      c.charCodeAt(0),
    );
  }
}
class MemoryCMap {
  async fetch({ name }) {
    if (!Object.hasOwn(CMAPS, name)) throw Error("缺少 CMap " + name);
    return {
      cMapData: Uint8Array.from(atob(CMAPS[name]), (c) => c.charCodeAt(0)),
      compressionType: 1,
    };
  }
}
const I = [1, 0, 0, 1, 0, 0],
  mul = pdfjsLib.Util.transform;
const shift = (m, x, y) => mul(m, [1, 0, 0, 1, x, y]);
const point = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const rgb = (a) =>
  a
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
const opname = Object.fromEntries(
  Object.entries(pdfjsLib.OPS).map(([k, v]) => [v, k]),
);
function png(im) {
  const canvas = document.createElement("canvas");
  canvas.width = im.width;
  canvas.height = im.height;
  const ctx = canvas.getContext("2d");
  if (im.bitmap) ctx.drawImage(im.bitmap, 0, 0);
  else {
    const pixels = ctx.createImageData(im.width, im.height),
      src = im.data;
    for (let i = 0; i < im.width * im.height; i++) {
      let values;
      if (im.kind === 1) {
        const x = i % im.width,
          y = Math.floor(i / im.width),
          v =
            src[y * Math.ceil(im.width / 8) + (x >> 3)] & (128 >> x % 8)
              ? 255
              : 0;
        values = [v, v, v, 255];
      } else {
        const n = im.kind === 3 ? 4 : 3;
        values = [
          src[i * n],
          src[i * n + 1],
          src[i * n + 2],
          n === 4 ? src[i * n + 3] : 255,
        ];
      }
      pixels.data.set(values, i * 4);
    }
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}
async function parsePage(page) {
  const view = page.getViewport({ scale: 1 }),
    h = view.height,
    w = view.width,
    chars = [],
    shapes = [],
    images = [];
  const list = await page.getOperatorList(),
    stack = [];
  let s = {
      ctm: mul([1, 0, 0, -1, 0, h], view.transform),
      tm: I,
      lm: I,
      size: 0,
      hs: 1,
      cs: 0,
      ws: 0,
      lead: 0,
      rise: 0,
      fill: "000000",
      stroke: "000000",
      lw: 0,
    },
    paths = [],
    characterCount = 0;
  const save = () => stack.push({ ...s }),
    restore = () => {
      s = stack.pop() || s;
    };
  const next = (x, y) => {
    s.tm = s.lm = shift(s.lm, x, y);
  };
  function show(glyphs) {
    if (!s.font) return;
    for (const g of glyphs) {
      if (typeof g === "number") {
        s.tm = shift(s.tm, (-g * s.size * s.hs) / 1000, 0);
        continue;
      }
      const scale = s.font.fontMatrix?.[0] ?? 0.001;
      const advance = g.width * scale * s.size * s.hs;
      const m = mul(s.ctm, s.tm),
        [x, y] = point(m, 0, s.rise),
        [end] = point(m, advance, s.rise);
      const size = Math.abs(s.size * m[3]),
        descent = (s.font.descent || 0) * size;
      if (g.unicode?.trim()) characterCount++;
      if (Math.abs(m[1]) < 0.001 && Math.abs(m[2]) < 0.001 && g.unicode)
        chars.push({
          text: g.unicode,
          x0: Math.min(x, end),
          x1: Math.max(x, end),
          b: h - y,
          top: h - y - size - descent,
          bottom: h - y - descent,
          size,
          font: s.font.name || "",
          color: s.fill,
        });
      s.tm = shift(s.tm, advance + s.hs * (s.cs + (g.isSpace ? s.ws : 0)), 0);
    }
  }
  function path([ops, coords]) {
    let pos = 0,
      pts = [],
      start;
    function append(kind, ps) {
      const xs = ps.map((p) => p[0]),
        ys = ps.map((p) => h - p[1]);
      paths.push({
        kind,
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
        segments: ps
          .slice(1)
          .map((p, i) => [ps[i], p].map(([x, y]) => [x, h - y])),
      });
    }
    const flush = () => {
      if (pts.length > 1) append(pts.length === 2 ? "line" : "curve", pts);
      pts = [];
    };
    const p = () => point(s.ctm, coords[pos++], coords[pos++]);
    for (const id of ops) {
      switch (opname[id]) {
        case "rectangle": {
          flush();
          let [x, y, a, b] = coords.slice(pos, pos + 4);
          pos += 4;
          append(
            "rect",
            [
              [x, y],
              [x + a, y],
              [x + a, y + b],
              [x, y + b],
              [x, y],
            ].map((v) => point(s.ctm, ...v)),
          );
          break;
        }
        case "moveTo":
          flush();
          pts = [p()];
          start = pts[0];
          break;
        case "lineTo":
          pts.push(p());
          break;
        case "curveTo":
          pts.push(p(), p(), p());
          break;
        case "curveTo2":
        case "curveTo3":
          pts.push(p(), p());
          break;
        case "closePath":
          if (start) pts.push(start);
          break;
      }
    }
    flush();
  }
  async function image(im, m) {
    if (!im) return;
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map((v) => point(m, ...v));
    const xs = corners.map((p) => p[0]),
      ys = corners.map((p) => h - p[1]);
    const box = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
    if (box.x1 - box.x0 >= 4 && box.bottom - box.top >= 4)
      images.push({ ...box, png: png(im) });
  }
  function font([name, size]) {
    s.font = page.commonObjs.get(name);
    s.size = size;
  }
  for (let i = 0; i < list.fnArray.length; i++) {
    const op = opname[list.fnArray[i]],
      a = list.argsArray[i] || [];
    switch (op) {
      case "dependency":
        for (const id of a) {
          const objs = id.startsWith("g_") ? page.commonObjs : page.objs;
          await new Promise((resolve) => objs.get(id, resolve));
        }
        break;
      case "save":
        save();
        break;
      case "restore":
        restore();
        break;
      case "transform":
        s.ctm = mul(s.ctm, a);
        break;
      case "paintFormXObjectBegin":
        save();
        if (a[0]) s.ctm = mul(s.ctm, a[0]);
        break;
      case "paintFormXObjectEnd":
        restore();
        break;
      case "beginText":
        s.tm = s.lm = I;
        break;
      case "setFont":
        font(a);
        break;
      case "setGState":
        for (const [key, v] of a[0]) {
          if (key === "Font") font(v);
          if (key === "LW") s.lw = v;
        }
        break;
      case "setTextMatrix":
        s.tm = s.lm = a;
        break;
      case "setLeading":
        s.lead = a[0];
        break;
      case "setCharSpacing":
        s.cs = a[0];
        break;
      case "setWordSpacing":
        s.ws = a[0];
        break;
      case "setHScale":
        s.hs = a[0] / 100;
        break;
      case "setTextRise":
        s.rise = a[0];
        break;
      case "setLeadingMoveText":
        s.lead = -a[1];
        next(...a);
        break;
      case "moveText":
        next(...a);
        break;
      case "nextLine":
        next(0, -s.lead);
        break;
      case "nextLineSetSpacingShowText":
        s.ws = a[0];
        s.cs = a[1];
        next(0, -s.lead);
        show(a[2]);
        break;
      case "nextLineShowText":
        next(0, -s.lead);
        show(a[0]);
        break;
      case "showText":
      case "showSpacedText":
        show(a[0]);
        break;
      case "setFillRGBColor":
        s.fill = rgb(Array.from(a));
        break;
      case "setStrokeRGBColor":
        s.stroke = rgb(Array.from(a));
        break;
      case "setLineWidth":
        s.lw = a[0];
        break;
      case "constructPath":
        path(a);
        break;
      case "endPath":
        paths = [];
        break;
      case "stroke":
      case "closeStroke":
      case "fill":
      case "eoFill":
      case "fillStroke":
      case "eoFillStroke":
      case "closeFillStroke":
      case "closeEOFillStroke":
        for (const p of paths)
          shapes.push({
            ...p,
            fill: /fill/i.test(op) ? s.fill : null,
            stroke: /stroke/i.test(op) ? s.stroke : null,
            lw: s.lw,
          });
        paths = [];
        break;
      case "paintInlineImageXObject":
        await image(a[0], s.ctm);
        break;
      case "paintImageXObject": {
        const objs = a[0].startsWith("g_") ? page.commonObjs : page.objs;
        await image(await new Promise((r) => objs.get(a[0], r)), s.ctm);
        break;
      }
      case "paintImageXObjectRepeat": {
        const im = (a[0].startsWith("g_") ? page.commonObjs : page.objs).get(
          a[0],
        );
        for (let j = 0; j < a[3].length; j += 2)
          await image(im, mul(s.ctm, [a[1], 0, 0, a[2], a[3][j], a[3][j + 1]]));
        break;
      }
    }
  }
  return { w, h, chars, shapes, images, characterCount };
}
