const min = (a, f) => Math.min(...a.map(f)),
  max = (a, f) => Math.max(...a.map(f));
const mid = (c) => (c.x0 + c.x1) / 2;
function median(a) {
  a.sort((x, y) => x - y);
  return (a[a.length >> 1] + a[(a.length - 1) >> 1]) / 2;
}
const inside = (o, b, p = 1) =>
  o.x0 >= b.x0 - p &&
  o.x1 <= b.x1 + p &&
  o.top >= b.top - p &&
  o.bottom <= b.bottom + p;
const hanging = "•●○■□◆◇▪▫",
  bullets = "•·●○■□◆◇▪▫–-*";
function makeLines(chars) {
  const rows = [];
  for (const c of [...chars].sort((a, b) => a.b - b.b || a.x0 - b.x0)) {
    let r = rows.at(-1);
    if (!r || Math.abs(r.b - c.b) > Math.max(1.5, c.size * 0.25))
      rows.push((r = { b: c.b, chars: [] }));
    r.chars.push(c);
  }
  const lines = [];
  for (const row of rows) {
    const cs = row.chars.sort((a, b) => a.x0 - b.x0),
      body = cs.filter((c) => c.text.trim());
    if (!body.length) continue;
    const size = median(body.map((c) => c.size)),
      groups = [[]];
    let last;
    for (const c of cs) {
      if (c.text.trim() && c.x0 - last > Math.max(2.5 * size, 18))
        groups.push([]);
      groups.at(-1).push(c);
      if (c.text.trim()) last = c.x1;
    }
    const segments = groups.map((g) => {
      while (!g[0].text.trim()) g.shift();
      while (!g.at(-1).text.trim()) g.pop();
      const runs = [];
      for (const c of g) {
        const size = Math.round(c.size * 2) / 2;
        let r = runs.at(-1);
        if (!r || r.font !== c.font || r.color !== c.color || r.size !== size)
          runs.push(
            (r = {
              font: c.font,
              color: c.color,
              size,
              bold: /bold|medium|semibold|demi|heavy|black|w[5-9]/i.test(
                c.font.split("+").at(-1),
              ),
              text: "",
            }),
          );
        r.text += c.text;
      }
      return { x0: g[0].x0, x1: g.at(-1).x1, runs };
    });
    lines.push({
      segments,
      chars: body,
      x0: segments[0].x0,
      x1: segments.at(-1).x1,
      b: median(body.map((c) => c.b)),
      color: body[0].color,
      size: max(body, (c) => c.size),
      top: min(body, (c) => c.top),
      bottom: max(body, (c) => c.bottom),
      text: cs
        .map((c) => c.text)
        .join("")
        .trim(),
    });
  }
  return lines;
}
// Snap parallel edges, join collinear fragments and find the smallest closed cells.
function tableEdges(shapes, vertical) {
  const edges = [];
  for (const s of shapes)
    for (const [[x, y], [u, v]] of s.segments) {
      if (vertical ? Math.abs(x - u) > 0.01 : Math.abs(y - v) > 0.01) continue;
      const [a, b] = vertical ? [y, v] : [x, u];
      if (a === b) continue;
      edges.push({
        pos: vertical ? x : y,
        start: Math.min(a, b),
        end: Math.max(a, b),
        shape: s,
      });
    }
  edges.sort((a, b) => a.pos - b.pos);
  const bands = [];
  for (const e of edges) {
    let g = bands.at(-1);
    if (!g || e.pos - g.at(-1).pos > 3) bands.push((g = []));
    g.push(e);
  }
  return bands
    .map((g) => {
      const pos = g.reduce((a, e) => a + e.pos, 0) / g.length,
        spans = [];
      for (const e of g.sort((a, b) => a.start - b.start)) {
        const s = spans.at(-1);
        if (s && e.start <= s.end + 3) s.end = Math.max(s.end, e.end);
        else spans.push({ ...e });
      }
      return { pos, spans: spans.filter((s) => s.end - s.start >= 3) };
    })
    .filter((g) => g.spans.length);
}
function tables(pg) {
  const vs = tableEdges(pg.shapes, true),
    hs = tableEdges(pg.shapes, false);
  const covers = (edge, a, b) =>
    edge.spans.some((s) => a >= s.start - 3 && b <= s.end + 3);
  const cells = [];
  for (const [i, l] of vs.entries())
    for (const [j, t] of hs.entries()) {
      let found = false;
      for (const b of hs.slice(j + 1)) {
        if (!covers(l, t.pos, b.pos)) continue;
        for (const r of vs.slice(i + 1)) {
          if (
            covers(t, l.pos, r.pos) &&
            covers(b, l.pos, r.pos) &&
            covers(r, t.pos, b.pos)
          ) {
            cells.push({ x0: l.pos, x1: r.pos, top: t.pos, bottom: b.pos });
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
  const corners = (c) =>
    [c.x0, c.x1].flatMap((x) => [c.top, c.bottom].map((y) => x + "," + y));
  const clusters = [];
  for (const c of cells) {
    const keys = corners(c),
      adj = clusters.filter((g) => keys.some((k) => g.keys.has(k)));
    const next = { cells: [c], keys: new Set(keys) };
    for (const g of adj) {
      clusters.splice(clusters.indexOf(g), 1);
      next.cells.push(...g.cells);
      for (const k of g.keys) next.keys.add(k);
    }
    clusters.push(next);
  }
  const result = [];
  for (const g of clusters) {
    if (g.cells.length < 2) continue;
    const ticks = (f) =>
      [...new Set(g.cells.flatMap(f).map((v) => Math.round(v * 10) / 10))].sort(
        (a, b) => a - b,
      );
    const xs = ticks((c) => [c.x0, c.x1]),
      ys = ticks((c) => [c.top, c.bottom]);
    if (ys.length < 3) continue;
    const t = {
      kind: "table",
      xs,
      ys,
      x0: xs[0],
      x1: xs.at(-1),
      top: ys[0],
      bottom: ys.at(-1),
    };
    const edge = pg.shapes.find((o) => inside(o, t, 2));
    t.color = edge?.stroke || "000000";
    t.lw = edge?.lw || 0.5;
    t.rows = ys
      .slice(1)
      .map((y1, j) =>
        xs
          .slice(1)
          .map((x1, i) =>
            makeLines(
              pg.chars.filter(
                (c) =>
                  c.x1 > xs[i] + 0.5 &&
                  c.x0 < x1 - 0.5 &&
                  c.bottom > ys[j] + 0.5 &&
                  c.top < y1 - 0.5,
              ),
            ),
          ),
      );
    result.push(t);
  }
  return result;
}
function regions(lines, chars, width) {
  const single = [{ lines }];
  if (lines.length < 8) return single;
  const lo = Math.floor(0.3 * width),
    hi = Math.floor(0.7 * width),
    cover = new Uint32Array(hi - lo);
  for (const l of lines) {
    const seen = new Set();
    for (const c of l.chars)
      for (
        let x = Math.max(lo, Math.floor(c.x0));
        x < Math.min(hi, Math.floor(c.x1) + 1);
        x++
      )
        seen.add(x);
    for (const x of seen) cover[x - lo]++;
  }
  let best = 0,
    g0,
    g1,
    start;
  for (let x = lo; x <= hi; x++) {
    if (x < hi && cover[x - lo] <= Math.max(1, lines.length * 0.08)) {
      start ??= x;
      continue;
    }
    if (start !== undefined && x - start >= 8 && x - start > best) {
      best = x - start;
      g0 = start;
      g1 = x;
    }
    start = undefined;
  }
  if (
    !best ||
    lines.filter((l) => l.chars.some((c) => c.x1 <= g0 + 1)).length < 4 ||
    lines.filter((l) => l.chars.some((c) => c.x0 >= g1 - 1)).length < 4
  )
    return single;
  const bands = [];
  for (const l of lines) {
    const crossing = l.chars.some(
      (c) => mid(c) > g0 + 0.5 && mid(c) < g1 - 0.5,
    );
    let b = bands.at(-1);
    if (!b || b.crossing !== crossing)
      bands.push((b = { crossing, lines: [] }));
    b.lines.push(l);
  }
  for (const b of bands) {
    if (b.crossing) continue;
    const cs = chars.filter((c) =>
      b.lines.some((l) => Math.abs(l.b - c.b) <= Math.max(1.5, c.size * 0.25)),
    );
    const cols = [
      makeLines(cs.filter((c) => mid(c) <= g0 + 0.5)),
      makeLines(cs.filter((c) => mid(c) >= g1 - 0.5)),
    ];
    if (cols.every((c) => c.length))
      b.cols = cols.map((lines) => ({
        lines,
        x0: min(lines, (l) => l.x0),
        x1: max(lines, (l) => l.x1),
      }));
  }
  return bands;
}
function analyse(pages) {
  for (const pg of pages) {
    pg.tables = tables(pg);
    const outside = (o) => !pg.tables.some((t) => inside(o, t, 2));
    pg.bars = [];
    pg.boxes = [];
    pg.rules = [];
    for (const o of pg.shapes.filter(outside)) {
      const w = o.x1 - o.x0,
        h = o.bottom - o.top;
      if (o.kind === "line") {
        if (h <= 1 && w >= 40)
          pg.rules.push({
            ...o,
            kind: "rule",
            y: o.top,
            w: o.lw || 0.5,
            color: o.stroke || "000000",
          });
      } else if (o.fill && w <= 6 && h >= 4 && h <= 40) pg.bars.push(o);
      else if (h <= 2.5 && w >= 40)
        pg.rules.push({
          ...o,
          kind: "rule",
          y: (o.top + o.bottom) / 2,
          w: Math.max(h, 0.5),
          color: o.fill || o.stroke || "000000",
        });
      else if (
        ((o.fill && o.fill !== "FFFFFF") || o.stroke) &&
        w >= 30 &&
        h >= 8
      )
        pg.boxes.push({
          ...o,
          fill: o.fill === "FFFFFF" ? null : o.fill,
          lw: o.lw || 0.5,
        });
    }
    pg.rules = pg.rules
      .filter(
        (r) =>
          !pg.boxes.some(
            (b) =>
              r.x0 >= b.x0 - 2 &&
              r.x1 <= b.x1 + 2 &&
              r.y >= b.top - 2 &&
              r.y <= b.bottom + 2,
          ),
      )
      .map((r) => ({ ...r, top: r.y }));
    pg.chars = pg.chars.filter((c) => !pg.tables.some((t) => inside(c, t)));
    pg.lines = makeLines(pg.chars);
  }
  const feet = pages.map((pg) => pg.lines.filter((l) => l.top >= pg.h * 0.92));
  const hasFooter =
    feet.every((f) => f.length) &&
    new Set(
      feet.map((f) =>
        f
          .map((l) => l.text)
          .join(" ")
          .replace(/\d+/g, "#"),
      ),
    ).size === 1;
  for (const [i, pg] of pages.entries()) {
    if (hasFooter) {
      pg.footer = {
        lines: feet[i],
        rules: pg.rules.filter((r) => r.y >= pg.h * 0.92),
      };
      pg.rules = pg.rules.filter((r) => r.y < pg.h * 0.92);
      pg.lines = pg.lines.filter((l) => !feet[i].includes(l));
      pg.chars = pg.chars.filter((c) => c.top < pg.h * 0.92 - 1);
    }
    pg.regions = regions(pg.lines, pg.chars, pg.w);
  }
}
function group(lines, right, pg) {
  const paras = [];
  for (const l of lines) {
    const box = pg.boxes.find((b) => inside(l, b)),
      bar = pg.bars.find(
        (b) =>
          b.x1 <= l.x0 + 1 &&
          l.x0 - b.x1 <= 20 &&
          b.top <= l.bottom &&
          b.bottom >= l.top,
      );
    const p = paras.at(-1),
      prev = p?.lines.at(-1),
      gap = l.b - prev?.b;
    if (
      p &&
      p.box === box &&
      !bar &&
      l.segments.length === 1 &&
      prev.segments.length === 1 &&
      Math.abs(l.size - p.size) < 0.6 &&
      prev.color === l.color &&
      !bullets.includes(l.text[0]) &&
      prev.x1 >= right - 1.5 * prev.size &&
      (Math.abs(l.x0 - p.lines[0].x0) <= 2 ||
        Math.abs(l.x0 - (p.hang ?? -99)) <= 2) &&
      gap >= l.size &&
      gap <= 2 * l.size &&
      (p.lines.length === 1 || Math.abs(gap - p.pitch) <= 1.5)
    ) {
      p.lines.push(l);
      p.pitch ??= gap;
      continue;
    }
    paras.push({
      lines: [l],
      top: l.top,
      size: l.size,
      bar,
      box,
      hang:
        hanging.includes(l.segments[0].runs[0].text[0]) && l.chars.length > 1
          ? l.chars[1].x0
          : undefined,
    });
  }
  return paras;
}
