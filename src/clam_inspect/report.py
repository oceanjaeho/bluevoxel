"""검사 결과 보기 페이지 생성 (HTML 한 파일).

배출 통(정상 후보 / 불량 / 재검사)별로 개체를 나눠 보여주고, 각 개체 사진 위에
검출한 개체 영역과 결함 위치를 그린다. 정답과 다른 판정은 빨간 테두리로 표시한다.

  python -m clam_inspect.report --manifest data/manifest.csv --pred runs/pred_test.json \
      --thresholds runs/eval/thresholds.json --out runs/report_test.html

브라우저로 바로 열 수 있고, 사진이 파일 안에 들어 있어 그대로 전달할 수 있다.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from html import escape
from pathlib import Path

from PIL import Image

from .evaluate import decide, evaluate, first_per_object, gt_from_manifest
from .labels import Route

BINS = [
    (Route.PASS, "정상 후보", "pass"),
    (Route.REJECT, "불량", "reject"),
    (Route.RECHECK, "재검사", "recheck"),
]
REASON_KO = {
    "normal_ext": "정상 외관",
    "track_lost": "개체 미검출",
    "track_ambiguous": "개체 여러 개",
    "quality_blur": "영상 흐림",
    "quality_glare": "반사",
    "quality_truncated": "개체 잘림",
    "quality_occluded": "가림",
    "BROKEN": "파손",
    "CHIPPED": "결손",
    "CRACK_SUSPECT": "균열 의심",
    "UNKNOWN": "판독 보류",
    "no_valid_label": "라벨 없음",
}
GT_KO = {True: "정답 불량", False: "정답 정상", None: "정답 보류"}

CSS = """
/* VOICE work: quality inspection result for the plant team
   IDEA a sorting line's three collection bins, each holding the actual shells routed there
   PICTURE the bins themselves: every inspected clam photo grouped by route, errors outlined
   COLOUR deep green ground for the summary band, white below, lime-white, coral for wrong calls
   TYPE Inter Tight 700 + Inter
   LAYOUT finding + figures on green band; three bin columns (stack under 760px); metric rows */
:root{color-scheme:light dark;--bg:light-dark(#ffffff,#0f1413);--ink:light-dark(#14201d,#e7eeec);--mute:light-dark(#5b6b67,#9aaba6);--line:light-dark(#dfe6e4,#26312e);--panel:light-dark(#f4f7f6,#161e1c);--band:#00463c;--bandink:#ffffff;--lime:#e6f5c8;--bad:#ff6f59;--pass:light-dark(#0b7a5a,#4fd1a5);--reject:light-dark(#b3261e,#ff8a78);--recheck:light-dark(#9a6400,#f2b84b)}
:root[data-theme=light]{color-scheme:light}
:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box;min-width:0}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,sans-serif;overflow-x:clip}
.band{padding-block:clamp(24px,4vw,48px);padding-left:max(5vw,16px,env(safe-area-inset-left,0px));padding-right:max(5vw,16px,env(safe-area-inset-right,0px))}
.wrap{max-width:1240px;margin:0 auto}
.top{background:var(--band);color:var(--bandink);margin-top:calc(-1*env(safe-area-inset-top,0px));padding-top:calc(env(safe-area-inset-top,0px) + clamp(24px,4vw,48px))}
h1{font:700 clamp(28px,4.2vw,46px)/1.08 "Inter Tight",Inter,sans-serif;letter-spacing:-.02em;margin:0 0 10px;max-width:22ch}
.sub{color:var(--lime);margin:0;font-size:15px}
.note{display:inline-block;margin-top:14px;background:var(--lime);color:#14201d;border-radius:4px;padding:3px 10px;font-size:13px}
.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(9em,1fr));gap:1px;background:rgba(255,255,255,.18);margin-top:26px;border-block:1px solid rgba(255,255,255,.18)}
.figs div{background:var(--band);padding:12px 14px 12px 0}
.figs b{display:block;font:700 clamp(24px,3vw,34px)/1.1 "Inter Tight",Inter,sans-serif;white-space:nowrap}
.figs span{font-size:13px;color:var(--lime)}
.figs .warn b{color:var(--bad)}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px}
.tools button{font:inherit;font-size:14px;min-height:40px;padding:0 14px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
.tools button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.tools span{color:var(--mute);font-size:14px;margin-left:auto}
.bins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.bin{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
.bin h2{display:flex;justify-content:space-between;align-items:baseline;margin:2px 2px 12px;font:700 20px/1.2 "Inter Tight",Inter,sans-serif}
.bin h2 small{font:500 14px Inter,sans-serif;color:var(--mute)}
.bin.pass h2{color:var(--pass)}.bin.reject h2{color:var(--reject)}.bin.recheck h2{color:var(--recheck)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:8px;overflow:hidden;cursor:pointer;padding:0;text-align:left;font:inherit;color:inherit}
.card.wrong{outline:3px solid var(--bad);outline-offset:-1px}
.card:focus-visible{outline:3px solid var(--ink)}
.pic{position:relative;aspect-ratio:4/3;background:#000}
.pic img,.pic svg{position:absolute;inset:0;width:100%;height:100%}
.meta{padding:7px 9px 9px;font-size:13px;line-height:1.35}
.meta b{display:block;font-size:13px}
.meta .gt{color:var(--mute)}
.meta .wrongtag{color:var(--bad);font-weight:600}
.empty{color:var(--mute);font-size:14px;padding:8px 2px}
.rates{display:grid;gap:2px;max-width:900px}
.rate{display:grid;grid-template-columns:minmax(8em,12em) minmax(0,1fr) auto;gap:14px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:15px}
.track{position:relative;height:12px;background:var(--panel);border-radius:3px}
.track i{position:absolute;inset:0 auto 0 0;background:var(--ink);border-radius:3px}
.track u{position:absolute;top:-3px;bottom:-3px;border-inline:2px solid var(--mute);opacity:.7}
.rate .v{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:14px}
.rate .v em{font-style:normal;color:var(--mute)}
h3{font:700 22px/1.2 "Inter Tight",Inter,sans-serif;margin:0 0 6px}
.lead{color:var(--mute);margin:0 0 16px;font-size:15px}
.box-clam{fill:none;stroke:#4fd1a5;stroke-width:3;vector-effect:non-scaling-stroke}
.box-def{fill:none;stroke:#ff6f59;stroke-width:3;vector-effect:non-scaling-stroke}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top,0px)) 16px;z-index:9}
.lb .in{background:var(--bg);border-radius:10px;max-width:min(920px,100%);max-height:100%;overflow:auto;width:100%}
.lb .pic{aspect-ratio:auto}
.lb .pic img,.lb .pic svg{position:static;display:block;width:100%;height:auto}
.lb .pic svg{position:absolute;inset:0;height:100%}
.lb .info{padding:14px 16px;display:grid;gap:6px;font-size:15px}
.lb .info table{border-collapse:collapse;font-size:14px}
.lb .info td{padding:3px 12px 3px 0;font-variant-numeric:tabular-nums}
.lb button{font:inherit;min-height:44px;margin:0 16px 16px;padding:0 18px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
@media(max-width:760px){.bins{grid-template-columns:minmax(0,1fr)}.rate{grid-template-columns:minmax(0,1fr) auto}.rate .track{grid-column:1/-1;grid-row:2}}
"""

JS = """
{
const lb=document.getElementById('lb'),body=document.getElementById('lbbody');
document.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=>{body.innerHTML=c.querySelector('template').innerHTML;lb.hidden=false;lb.querySelector('button').focus()}));
lb.addEventListener('click',e=>{if(e.target===lb||e.target.tagName==='BUTTON')lb.hidden=true});
document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.hidden=true});
const btns=document.querySelectorAll('.tools button');
btns.forEach(b=>b.addEventListener('click',()=>{btns.forEach(x=>x.setAttribute('aria-pressed',x===b));const only=b.dataset.f==='wrong';
document.querySelectorAll('.card').forEach(c=>c.hidden=only&&!c.classList.contains('wrong'))}));
}
"""


def _thumb(path: Path, width: int) -> tuple[str, int, int]:
    im = Image.open(path).convert("RGB")
    W, H = im.size
    im.thumbnail((width, width * H // max(W, 1)))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(), W, H


def _overlay(rec: dict, W: int, H: int, min_score: float) -> str:
    parts = [f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">']
    if rec.get("clam_box"):
        x1, y1, x2, y2 = rec["clam_box"]
        parts.append(f'<rect class="box-clam" x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}"/>')
    for d in rec.get("detections", []):
        if d["score"] >= min_score:
            x1, y1, x2, y2 = d["box"]
            parts.append(f'<rect class="box-def" x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}"/>')
    parts.append("</svg>")
    return "".join(parts)


def _reason_ko(reason: str) -> str:
    return " + ".join(REASON_KO.get(r, r) for r in reason.split("+"))


def _is_wrong(gt, route: Route) -> bool:
    return (gt is True and route is Route.PASS) or (gt is False and route is Route.REJECT)


def _card(rec: dict, gt, dec, img_src: str, W: int, H: int, min_score: float, shots: int) -> str:
    wrong = _is_wrong(gt, dec.route)
    ov = _overlay(rec, W, H, min_score)
    tag = ""
    if wrong:
        tag = '<span class="wrongtag">불량 유출</span>' if gt else '<span class="wrongtag">정상 오배출</span>'
    scores = rec.get("defect_scores", {})
    rows = "".join(
        f"<tr><td>{escape(REASON_KO.get(k, k))}</td><td>{v:.3f}</td></tr>" for k, v in scores.items()
    )
    lat = rec.get("clam_ms", 0) + rec.get("defect_ms", 0)
    detail = (
        f'<div class="pic"><img src="{img_src}" alt=""/>{ov}</div><div class="info">'
        f"<b>{escape(rec['object_id'])} · {escape(_reason_ko(dec.reason))}</b>"
        f"<span>{GT_KO[gt]} · 판정 {escape(dict((r, n) for r, n, _ in BINS)[dec.route])} {tag}</span>"
        f"<span>영상 품질 {escape(str(rec.get('quality_state') or '-'))} · 촬영 {shots}회 · 처리 {lat:.0f} ms</span>"
        f"<table>{rows}</table>"
        f"<span style=\"color:var(--mute);font-size:13px\">{escape(rec.get('image_path', ''))}</span></div>"
    )
    return (
        f'<button class="card{" wrong" if wrong else ""}" type="button">'
        f'<div class="pic"><img src="{img_src}" alt="{escape(rec["object_id"])}" loading="lazy"/>{ov}</div>'
        f'<div class="meta"><b>{escape(_reason_ko(dec.reason))}</b>'
        f'<span class="gt">{GT_KO[gt]}</span> {tag}</div>'
        f"<template>{detail}</template></button>"
    )


def _rate_row(name: str, r) -> str:
    if not r.n:
        return f'<div class="rate"><span>{escape(name)}</span><div class="track"></div><span class="v"><em>해당 없음</em></span></div>'
    return (
        f'<div class="rate"><span>{escape(name)}</span>'
        f'<div class="track"><i style="width:{r.value * 100:.1f}%"></i>'
        f'<u style="left:{r.lo * 100:.1f}%;width:{(r.hi - r.lo) * 100:.1f}%"></u></div>'
        f'<span class="v">{r.value:.1%} <em>{r.k}/{r.n} · {r.lo:.0%}–{r.hi:.0%}</em></span></div>'
    )


def build(manifest: str, pred_path: str, thresholds: dict, root: Path, note: str = "",
          thumb: int = 480, min_score: float | None = None) -> str:
    data = json.loads(Path(pred_path).read_text(encoding="utf-8"))
    preds, summ = data["results"], data.get("summary", {})
    gt = gt_from_manifest(manifest)
    metrics, _, n_unk = evaluate(preds, gt, thresholds)
    if min_score is None:
        min_score = min(thresholds.values())

    by = first_per_object(preds)
    cols: dict[Route, list[str]] = {r: [] for r, _, _ in BINS}
    n_wrong = {"esc": 0, "fr": 0}
    for oid, recs in sorted(by.items()):
        rec = recs[0]
        dec = decide(rec, thresholds)
        g = gt.get(oid)
        if _is_wrong(g, dec.route):
            n_wrong["esc" if g else "fr"] += 1
        src, W, H = _thumb(root / rec["image_path"], thumb)
        cols[dec.route].append(_card(rec, g, dec, src, W, H, min_score, len(recs)))

    n = len(by)
    esc, fr, rc = metrics["불량 유출률(자동)"], metrics["정상 오배출률"], metrics["재검사율"]
    head = (f"{n}개 중 불량 유출 {n_wrong['esc']}개, 정상 오배출 {n_wrong['fr']}개, "
            f"재검사 {len(cols[Route.RECHECK])}개")
    lat = summ.get("latency_ms", {})
    figs = [
        (f"{metrics['자동판정률'].value:.0%}" if n else "-", "자동판정률", False),
        (f"{esc.value:.0%}" if esc.n else "-", f"불량 유출률 ({esc.k}/{esc.n})", esc.k > 0),
        (f"{fr.value:.0%}" if fr.n else "-", f"정상 오배출률 ({fr.k}/{fr.n})", fr.k > 0),
        (f"{rc.value:.0%}" if rc.n else "-", f"재검사율 ({rc.k}/{rc.n})", False),
        (f"{lat['p99']:.0f} ms" if lat else "-", f"처리 지연 p99 ({escape(str(summ.get('device', '')))})", False),
    ]
    fig_html = "".join(
        f'<div class="{"warn" if w else ""}"><b>{escape(v)}</b><span>{escape(lbl)}</span></div>' for v, lbl, w in figs
    )
    bins_html = "".join(
        f'<section class="bin {cls}"><h2>{name}<small>{len(cols[r])}개</small></h2>'
        f'<div class="grid">{"".join(cols[r]) or "<div class=empty>없음</div>"}</div></section>'
        for r, name, cls in BINS
    )
    rates = "".join(_rate_row(k, v) for k, v in metrics.items())
    th_txt = ", ".join(f"{_reason_ko(k)} {v:.2f}" for k, v in thresholds.items())
    sub = (f"평가 구분 {escape(str(summ.get('split', '-')))} · 모델 {escape(str(summ.get('model_version', '-')))}"
           f" · 임계값 {escape(th_txt)}")
    if n_unk:
        sub += f" · 정답 보류 {n_unk}개 별도"
    note_html = f'<span class="note">{escape(note)}</span>' if note else ""

    return f"""<title>바지락 검사 결과</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}</style>
<header class="band top"><div class="wrap">
<h1>{escape(head)}</h1>
<p class="sub">{sub}</p>{note_html}
<div class="figs">{fig_html}</div>
</div></header>
<main>
<section class="band"><div class="wrap">
<div class="tools"><button type="button" data-f="all" aria-pressed="true">전체</button>
<button type="button" data-f="wrong" aria-pressed="false">틀린 판정만</button>
<span>사진을 누르면 크게 보고 점수를 확인합니다. 초록 상자 = 개체, 주황 상자 = 결함</span></div>
<div class="bins">{bins_html}</div>
</div></section>
<section class="band" style="padding-top:0"><div class="wrap">
<h3>지표와 95% 신뢰구간</h3>
<p class="lead">막대는 측정값, 회색 구간은 신뢰구간입니다. 개체 수가 적으면 구간이 넓어져 결론을 내릴 수 없습니다.</p>
<div class="rates">{rates}</div>
</div></section>
</main>
<div class="lb" id="lb" hidden><div class="in" role="dialog" aria-modal="true"><div id="lbbody"></div><button type="button">닫기</button></div></div>
<script>{JS}</script>
"""


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--pred", required=True, help="predict.py 출력 JSON")
    ap.add_argument("--thresholds", required=True, help="evaluate.py가 만든 thresholds.json")
    ap.add_argument("--root", help="영상 경로 기준 폴더 (기본: manifest 폴더)")
    ap.add_argument("--note", default="", help="페이지 상단 안내 문구")
    ap.add_argument("--out", required=True)
    ap.add_argument("--fragment", action="store_true", help="doctype/head 없이 본문만 출력 (게시용)")
    a = ap.parse_args(argv)
    th = json.loads(Path(a.thresholds).read_text(encoding="utf-8"))["thresholds"]
    root = Path(a.root or Path(a.manifest).parent)
    html = build(a.manifest, a.pred, th, root, a.note)
    if not a.fragment:
        html = ('<!doctype html><html lang="ko"><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
                + html + "</html>\n")
    Path(a.out).write_text(html, encoding="utf-8")
    print(f"저장: {a.out}")


if __name__ == "__main__":
    main()
