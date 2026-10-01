#!/usr/bin/env python3
"""여러 여행을 한 사이트로 묶는 메인 페이지(여행 목록) 생성.

사용법:
  python3 build_home.py <사이트폴더>

<사이트폴더>/site.json이 있으면 사이트로 본다. 그 바로 아래 */trip.json을 모두 읽어
  index.html     — 여행 목록 (누르면 /<여행폴더>/ 로 이동)
  vercel.json    — 사이트 전체 배포 설정 (Vercel Root Directory는 비워 둠)
  .vercelignore  — 스킬 코드·계획서·trip.json은 배포하지 않음
을 만든다. build.py는 여행 폴더의 상위에 site.json이 있으면 이 스크립트를 자동으로 실행한다.

site.json 예: { "title": "우리 여행", "subtitle": "일정표 모음" }
"""
import json
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
TPL = HERE.parent / "template"


def collect(root):
    trips = []
    for tj in sorted(root.glob("*/trip.json")):
        folder = tj.parent
        if not (folder / "index.html").is_file():  # 아직 build.py를 안 돌린 여행은 목록에서 뺌
            continue
        try:
            t = json.loads(tj.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠️  {tj} 읽기 실패, 목록에서 뺌: {e}")
            continue
        m = t.get("meta") or {}
        trips.append({
            "path": folder.name + "/",
            "title": m.get("title") or folder.name,
            "kicker": m.get("kicker") or "",
            "start": m.get("start"),
            "end": m.get("end"),
            "accent": m.get("accent") or "#c4442a",
            "destination": (t.get("intake") or {}).get("destination") or "",
            "who": " · ".join(p["name"] for p in t.get("travelers") or [] if p.get("name")),
        })
    return trips


def build(root):
    root = Path(root).resolve()
    site = json.loads((root / "site.json").read_text(encoding="utf-8"))
    trips = collect(root)
    payload = json.dumps({"site": site, "trips": trips}, ensure_ascii=False).replace("</", "<\\/")
    html = (TPL / "home.html").read_text(encoding="utf-8")
    html = html.replace("__SITE__", payload).replace(
        "<title>여행</title>", f"<title>{escape(site.get('title') or '여행')}</title>")
    (root / "index.html").write_text(html, encoding="utf-8")
    (root / "vercel.json").write_text((TPL / "site-vercel.json").read_text(encoding="utf-8"), encoding="utf-8")
    (root / ".vercelignore").write_text((TPL / "site-vercelignore").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"🏠 메인 페이지: {root / 'index.html'} (여행 {len(trips)}개)")
    return trips


if __name__ == "__main__":
    if len(sys.argv) < 2 or not (Path(sys.argv[1]) / "site.json").is_file():
        print(__doc__)
        sys.exit(1)
    build(sys.argv[1])
