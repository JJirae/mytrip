#!/usr/bin/env python3
"""trip.json → 여행 일정 PWA 폴더 생성/갱신.

사용법:
  python3 build.py <프로젝트폴더>                 # <폴더>/trip.json → 앱 생성 + 공유 파일
  python3 build.py <프로젝트폴더> --check         # 검증만
  python3 build.py <프로젝트폴더> --no-downloads  # 다운로드 폴더 복사 생략

생성물:
  웹 앱(배포용): index.html, sw.js, manifest.webmanifest, vercel.json, robots.txt,
                .vercelignore, .gitignore(없을 때만), icons/*.png
  가족 공유 파일: share/<제목>.html — 이미지까지 모두 넣은 HTML 한 개(카톡 전송, 오프라인 열림)
                 Windows(WSL)·macOS·Linux의 다운로드 폴더에도 복사
"""
import base64
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
TPL = HERE.parent / "template"

REQUIRED_INTAKE = ["destination", "region", "travelers", "course", "transport", "dates"]
REGIONS = {"domestic", "overseas"}
TRANSPORTS = {"flight", "train", "bus", "car", "ship", "taxi", "walk", "bike", "subway"}


def fail(errors):
    print("❌ trip.json 검증 실패:")
    for e in errors:
        print("  -", e)
    sys.exit(1)


def validate(t):
    errs = []
    intake = t.get("intake") or {}
    for k in REQUIRED_INTAKE:
        v = intake.get(k)
        if v in (None, "", [], {}):
            errs.append(f"intake.{k} 누락 (스킬 질의로 반드시 받아야 하는 항목)")
    if intake.get("region") and intake["region"] not in REGIONS:
        errs.append("intake.region은 domestic 또는 overseas")
    for p in intake.get("travelers") or []:
        if not isinstance(p, dict) or not p.get("name") or not p.get("relation"):
            errs.append("intake.travelers 각 항목에 name, relation 필요")
            break

    m = t.get("meta") or {}
    for k in ("id", "title", "start", "end", "region"):
        if not m.get(k):
            errs.append(f"meta.{k} 누락")
    if m.get("region") and m["region"] not in REGIONS:
        errs.append("meta.region은 domestic 또는 overseas")
    if m.get("id") and not re.fullmatch(r"[a-z0-9-]+", m["id"]):
        errs.append("meta.id는 영문 소문자·숫자·하이픈만")
    try:
        s = dt.date.fromisoformat(m["start"])
        e = dt.date.fromisoformat(m["end"])
        if e < s:
            errs.append("meta.end가 meta.start보다 앞")
    except Exception:
        errs.append("meta.start/end는 YYYY-MM-DD")
        s = e = None

    for tr in t.get("transport") or []:
        if tr not in TRANSPORTS:
            errs.append(f"transport '{tr}' 알 수 없음 ({', '.join(sorted(TRANSPORTS))})")
    if not t.get("transport"):
        errs.append("transport 누락")

    days = t.get("days") or []
    if not days:
        errs.append("days 비어 있음")
    ids = set()
    places = t.get("places") or {}
    tickets = {x.get("id") for x in t.get("tickets") or []}
    for d in days:
        did = d.get("id")
        if not did or did in ids:
            errs.append(f"day id 누락/중복: {did}")
        ids.add(did)
        try:
            dd = dt.date.fromisoformat(d.get("date", ""))
            if s and e and not (s <= dd <= e):
                errs.append(f"{did} 날짜 {dd}가 여행 기간 밖")
        except Exception:
            errs.append(f"{did} date 형식 오류")
        prev = ""
        for ev in d.get("events") or []:
            if not ev.get("title"):
                errs.append(f"{did} 제목 없는 일정")
            tm = ev.get("time", "")
            if tm and not re.fullmatch(r"\d{2}:\d{2}", tm):
                errs.append(f"{did} '{ev.get('title')}' time은 HH:MM")
            if tm and prev and tm < prev:
                errs.append(f"{did} '{ev.get('title')}' 시간 순서가 뒤바뀜 ({prev} → {tm})")
            prev = tm or prev
            if ev.get("addr") and ev["addr"] not in places:
                errs.append(f"{did} '{ev.get('title')}' addr '{ev['addr']}'가 places에 없음")
            if ev.get("ticket") and ev["ticket"] not in tickets:
                errs.append(f"{did} '{ev.get('title')}' ticket '{ev['ticket']}'가 tickets에 없음")
    groups = {g.get("id") for g in t.get("ticket_groups") or []}
    for g in t.get("ticket_groups") or []:
        if not g.get("id") or not g.get("label"):
            errs.append("ticket_groups 각 항목에 id, label 필요")
    for x in t.get("tickets") or []:
        if not x.get("id") or not x.get("title"):
            errs.append("tickets 각 항목에 id, title 필요")
        if groups and x.get("group") and x["group"] not in groups:
            errs.append(f"ticket '{x.get('id')}'의 group '{x['group']}'가 ticket_groups에 없음")
    for d in days:
        for n in d.get("nearby") or []:
            if not n.get("name"):
                errs.append(f"{d.get('id')} nearby 항목에 name 필요")
    meals = t.get("meals") or {}
    for d in days:
        for ev in d.get("events") or []:
            if ev.get("meal") and not [m for m in meals.get(d.get("id"), []) if m.get("slot") == ev["meal"]]:
                errs.append(f"{d.get('id')} '{ev['meal']}' 식사 줄에 후보가 없음 (meals에 정해진 식사 또는 추천 2곳 필요)")
    for k, lst in meals.items():
        slots = {}
        for m in lst:
            if not m.get("slot") or not m.get("name"):
                errs.append(f"meals.{k} 각 항목에 slot, name 필요")
            if m.get("confirmed"):
                slots[m.get("slot")] = slots.get(m.get("slot"), 0) + 1
        for sl, n in slots.items():
            if n > 1:
                errs.append(f"meals.{k} '{sl}'에 confirmed가 {n}개 (끼니당 하나만)")
    for k in (t.get("meals") or {}):
        if k not in ids:
            errs.append(f"meals의 '{k}'에 해당하는 day가 없음")
    if m.get("region") == "overseas":
        for k, p in places.items():
            if not p.get("local") or not p.get("addr_local"):
                errs.append(f"해외 여행: places.{k}에 현지어 local/addr_local 필요(택시 주소 카드)")
    return errs


def asset_refs(o, acc=None):
    acc = [] if acc is None else acc
    if isinstance(o, dict):
        for v in o.values():
            asset_refs(v, acc)
    elif isinstance(o, list):
        for v in o:
            asset_refs(v, acc)
    elif isinstance(o, str) and o.startswith("assets/"):
        acc.append(o)
    return acc


def inline_assets(o, out, cache):
    if isinstance(o, dict):
        return {k: inline_assets(v, out, cache) for k, v in o.items()}
    if isinstance(o, list):
        return [inline_assets(v, out, cache) for v in o]
    if isinstance(o, str) and o.startswith("assets/"):
        if o not in cache:
            f = out / o
            mime = mimetypes.guess_type(f.name)[0] or "image/png"
            cache[o] = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode()
        return cache[o]
    return o


def render(t):
    html = (TPL / "index.html").read_text(encoding="utf-8")
    payload = json.dumps(t, ensure_ascii=False).replace("</", "<\\/")
    html = re.sub(r'(<script type="application/json" id="trip">)[\s\S]*?(</script>)',
                  lambda mm: mm.group(1) + payload + mm.group(2), html, count=1)
    return html.replace("<title>여행 일정</title>", f"<title>{t['meta']['title']}</title>")


def downloads_dir():
    """Windows(WSL)면 C:\\Users\\<사용자>\\Downloads, 아니면 ~/Downloads."""
    if Path("/mnt/c/Users").exists():
        try:
            r = subprocess.run(["cmd.exe", "/c", "echo %USERPROFILE%"], capture_output=True, text=True,
                               timeout=10, cwd="/mnt/c")
            win = r.stdout.strip().splitlines()[-1].strip()
            p = subprocess.run(["wslpath", win], capture_output=True, text=True, timeout=10).stdout.strip()
            if p and (Path(p) / "Downloads").exists():
                return Path(p) / "Downloads"
        except Exception:
            pass
    for cand in (Path.home() / "Downloads", Path.home() / "다운로드"):
        if cand.exists():
            return cand
    return None


def make_icons(out, title, accent):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("⚠️  Pillow 없음 → 아이콘 생략")
        return
    (out / "icons").mkdir(exist_ok=True)
    ch = (title.strip() or "여")[0]
    font_path = None
    for cand in ["/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
                 "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
                 "/System/Library/Fonts/AppleSDGothicNeo.ttc",
                 "C:/Windows/Fonts/malgunbd.ttf"]:
        if Path(cand).exists():
            font_path = cand
            break
    if not font_path:
        import subprocess
        try:
            r = subprocess.run(["fc-list", ":lang=ko", "file"], capture_output=True, text=True)
            files = [l.split(":")[0] for l in r.stdout.splitlines() if l.strip()]
            bold = [f for f in files if "B" in Path(f).stem or "Bold" in f]
            font_path = (bold or files or [None])[0]
        except Exception:
            pass
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        im = Image.new("RGB", (size, size), "#1f2a44")
        d = ImageDraw.Draw(im)
        pad = size * 0.14
        d.ellipse([pad, pad, size - pad, size - pad], fill=accent)
        if font_path:
            f = ImageFont.truetype(font_path, int(size * 0.42))
            d.text((size / 2, size / 2), ch, font=f, fill="white", anchor="mm")
        im.save(out / "icons" / name)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    out = Path(sys.argv[1]).resolve()
    trip_path = out / "trip.json"
    t = json.loads(trip_path.read_text(encoding="utf-8"))
    errs = validate(t)
    for ref in sorted(set(asset_refs(t))):
        if not (out / ref).is_file():
            errs.append(f"이미지 파일 없음: {ref}")
    if errs:
        fail(errs)
    if "--check" in sys.argv:
        print("✅ trip.json 검증 통과")
        return

    m = t["meta"]
    accent = m.get("accent") or "#c4442a"

    (out / "index.html").write_text(render(t), encoding="utf-8")

    assets = sorted("/" + p.relative_to(out).as_posix() for p in (out / "assets").rglob("*")
                    if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}) \
        if (out / "assets").exists() else []
    pre = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
           "/icons/apple-touch-icon.png"] + assets
    version = f"{m['id']}-{dt.datetime.now().strftime('%Y%m%d%H%M%S')}"
    sw = (TPL / "sw.js").read_text(encoding="utf-8")
    sw = sw.replace("__VERSION__", version).replace("__PRECACHE__", json.dumps(pre, ensure_ascii=False, indent=2))
    (out / "sw.js").write_text(sw, encoding="utf-8")

    manifest = {
        "name": m["title"], "short_name": m.get("short_name") or m["title"][:12],
        "description": f"{m['title']} 일정 · 티켓 · 주소 (오프라인 지원)",
        "lang": "ko", "id": "/", "start_url": "/", "scope": "/", "display": "standalone",
        "orientation": "portrait", "background_color": "#1f2a44", "theme_color": "#1f2a44",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (out / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    for f in ("vercel.json", "robots.txt", ".vercelignore"):  # 배포 설정
        (out / f).write_text((TPL / f).read_text(encoding="utf-8"), encoding="utf-8")
    if not (out / ".gitignore").exists():
        (out / ".gitignore").write_text((TPL / "gitignore").read_text(encoding="utf-8"), encoding="utf-8")
    if not (out / "icons" / "icon-512.png").exists() or "--icons" in sys.argv:
        make_icons(out, m.get("icon_char") or m["title"], accent)

    # 가족 공유용 단일 파일 (이미지 내장)
    share = out / "share"
    share.mkdir(exist_ok=True)
    safe = re.sub(r'[\\/:*?"<>|]', "", m["title"]).strip() or m["id"]
    single = share / f"{safe}.html"
    single.write_text(render(inline_assets(t, out, {})), encoding="utf-8")
    size_mb = single.stat().st_size / 1024 / 1024
    copied = None
    if "--no-downloads" not in sys.argv:
        dl = downloads_dir()
        if dl:
            copied = dl / single.name
            shutil.copyfile(single, copied)

    n_ev = sum(len(d.get("events") or []) for d in t["days"])
    print(f"✅ 생성 완료: {out}")
    print(f"   {len(t['days'])}일 · 일정 {n_ev}개 · 장소 {len(t.get('places') or {})}곳 · 티켓 {len(t.get('tickets') or [])}개 · 쇼핑 {len(t.get('shop') or [])}개 · 이미지 {len(assets)}개")
    print(f"📦 가족 공유 파일: {single} ({size_mb:.1f}MB)")
    if copied:
        print(f"   → 다운로드 폴더에 복사: {copied}")
    if size_mb > 20:
        print("⚠️  20MB가 넘으면 카톡 전송이 느릴 수 있어요. assets 이미지를 줄여 주세요.")


if __name__ == "__main__":
    main()
