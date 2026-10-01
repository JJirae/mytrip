# trip-planner — Claude Code 여행 일정표 스킬

장소·동행·코스·국내/해외·이동수단·날짜를 질문으로 받아, 휴대폰용 여행 일정표 앱(오프라인 PWA)을 만들어 주는 Claude Code 스킬입니다.

## 설치
압축을 풀면 나오는 `trip-planner` 폴더를 아래 위치에 넣으세요.

- macOS / Linux / WSL: `~/.claude/skills/trip-planner/`
- Windows: `C:\Users\<사용자>\.claude\skills\trip-planner\`

`SKILL.md`가 `~/.claude/skills/trip-planner/SKILL.md` 경로에 있어야 합니다.
Claude Code를 다시 열면 스킬 목록에 `trip-planner`가 보입니다.

## 사용
```
/trip-planner
/trip-planner 제주 3박4일 부모님이랑 렌터카
```

## 결과물
- `<여행폴더>/share/<제목>.html` — 가족에게 카톡으로 보내는 HTML 파일 하나(이미지 포함, 오프라인 열림). 다운로드 폴더에도 자동 복사됩니다.
- 웹 앱 파일(index.html 등) — 원하면 Vercel 배포
- 예시: `examples/osaka-sample/`

## 여러 여행을 주소 하나로 (사이트 모드)
저장소 맨 위에 `site.json`(`{ "title": "OurTrip" }`)을 두고 여행 폴더를 그 아래에 만들면,
`build.py`가 메인 페이지(`index.html`, 여행 목록)와 설치형 앱 파일(`manifest.webmanifest`·`sw.js`·`icons/`),
`vercel.json`·`.vercelignore`를 함께 만듭니다. 홈 화면에 앱으로 설치되고 오프라인에서도 열립니다.
앱 아이콘을 바꾸려면 `template/site-icons/logo.svg`와 PNG들을 교체하세요.
Vercel 프로젝트는 하나만 두고 Root Directory를 비워 두면, 여행을 추가해도 `git push`만 하면 됩니다.
- 메인: `https://<주소>/` · 여행: `https://<주소>/<여행-id>/`
- 메인 페이지만 다시 만들기: `python3 scripts/build_home.py <사이트폴더>`

## 필요한 것
- Python 3 (앱 생성 스크립트 `scripts/build.py`)
- Node.js 18+ 와 크롬(선택) — `scripts/verify.mjs` 화면 자동 점검용
- Pillow(선택) — 앱 아이콘 생성용. 없으면 아이콘만 빠집니다. `pip install pillow`
