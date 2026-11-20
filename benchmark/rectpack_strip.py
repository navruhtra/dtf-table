"""Competitor for gang-sheet nesting: rectpack (MIT, https://github.com/secnot/rectpack), the open-source rectangle
packer many gang-sheet builders use. Strip packing on one tall bin, every packing algorithm and sort order rectpack
offers, rotation on; the shortest sheet is kept, so the competitor gets its best result per case.

Reads JSON on stdin: {"cases": [{"id", "widthIn", "gapIn", "pieces": [{"wIn", "hIn", "copies"}]}]}
Writes JSON: {"version", "cases": [{"id", "lengthIn", "placed", "best"}]}
Run with python3 -I. Needs: pip install rectpack==0.2.2
"""
import json
import sys
import importlib.metadata as md
import rectpack as rp

U = 100  # hundredths of an inch
ALGOS = [rp.MaxRectsBl, rp.MaxRectsBssf, rp.MaxRectsBaf, rp.MaxRectsBlsf, rp.SkylineBl, rp.SkylineBlWm, rp.SkylineMwf,
         rp.SkylineMwfl, rp.SkylineMwfWm, rp.SkylineMwflWm, rp.GuillotineBssfSas, rp.GuillotineBssfLas,
         rp.GuillotineBafSas, rp.GuillotineBafLas, rp.GuillotineBlsfSas, rp.GuillotineBlsfLas]
SORTS = {"area": rp.SORT_AREA, "peri": rp.SORT_PERI, "diff": rp.SORT_DIFF, "sside": rp.SORT_SSIDE,
         "lside": rp.SORT_LSIDE, "ratio": rp.SORT_RATIO, "none": rp.SORT_NONE}


def run(case):
    gap = round(case["gapIn"] * U)
    width = round(case["widthIn"] * U) + gap
    rects = []
    for p in case["pieces"]:
        for _ in range(int(p.get("copies", 1))):
            rects.append((round(p["wIn"] * U) + gap, round(p["hIn"] * U) + gap))
    tall = sum(max(w, h) for w, h in rects) + gap
    best = None
    for algo in ALGOS:
        for sname, sort in SORTS.items():
            pk = rp.newPacker(mode=rp.PackingMode.Offline, pack_algo=algo, sort_algo=sort, rotation=True)
            for i, (w, h) in enumerate(rects):
                pk.add_rect(w, h, rid=i)
            pk.add_bin(width, tall)
            pk.pack()
            placed = pk.rect_list()
            if len(placed) < len(rects):
                continue
            length = max(y + h for _, x, y, w, h, _ in placed) - gap
            if best is None or length < best[0]:
                best = (length, f"{algo.__name__}/{sname}", len(placed))
    return {"id": case["id"], "lengthIn": best[0] / U, "placed": best[2], "best": best[1]}


if __name__ == "__main__":
    data = json.load(sys.stdin)
    out = {"version": md.version("rectpack"), "cases": [run(c) for c in data["cases"]]}
    json.dump(out, sys.stdout)
