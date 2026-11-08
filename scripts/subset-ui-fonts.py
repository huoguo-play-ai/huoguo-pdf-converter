"""Build the offline UI's font faces from the code points collected by build.cjs."""
import base64
from io import BytesIO
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from fontTools import subset
from fontTools.ttLib import TTFont


def unicode_range(points):
    ranges = []
    for point in sorted(points):
        if ranges and point == ranges[-1][1] + 1:
            ranges[-1][1] = point
        else:
            ranges.append([point, point])
    return ",".join(f"U+{a:X}-{b:X}" if a != b else f"U+{a:X}" for a, b in ranges)


def title_names(font):
    # The source reserves its family names. Give the modified subset its own
    # family, full, unique and PostScript names while retaining attribution.
    names = {1: "ObliqueTitleUI", 2: "Regular", 3: "ObliqueTitleUI-Regular",
             4: "ObliqueTitleUI Regular", 6: "ObliqueTitleUI-Regular",
             16: "ObliqueTitleUI", 17: "Regular"}
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())


request = json.load(sys.stdin)
with TemporaryDirectory() as directory:
    output = Path(directory) / "subset.woff2"
    for face in request["faces"]:
        points = face["points"]
        subset.main([
            str(Path("assets/fonts") / face["file"]),
            "--unicodes=" + ",".join(f"{p:X}" for p in points),
            "--flavor=woff2", "--no-hinting", "--name-IDs+=0,7,8,9,13,14",
            "--output-file=" + str(output),
        ])
        with TTFont(output, recalcTimestamp=False) as font:
            ranges = unicode_range(font.getBestCmap())
            if face["family"] == "ObliqueTitleUI":
                title_names(font)
                buffer = BytesIO()
                font.save(buffer)
                data = buffer.getvalue()
            else:
                data = output.read_bytes()
        print(json.dumps({"range": ranges, "size": len(data),
                          "data": base64.b64encode(data).decode("ascii")}))
