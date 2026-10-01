# trip.json 형식

앱은 `trip.json` 하나로 그려집니다. `build.py`가 검증 후 웹 앱(`index.html`)과 가족 공유 파일(`share/<제목>.html`)을 만듭니다.
**전체 예시: `examples/osaka-sample/trip.json`** (해외·부모님 동행·모든 탭 사용). 작성 전에 이 파일을 열어 구조를 그대로 따른다.

하단 탭 순서는 고정: **일정 > 식사 > 정보 > 티켓 > 쇼핑 > 준비**. 데이터가 없는 탭은 자동으로 숨는다(일정·정보는 항상).

## 필수 블록

```jsonc
"intake": {                       // 질의로 받은 값 — 6개 모두 필수 (build.py 검사)
  "destination": "오사카·교토",
  "region": "overseas",           // domestic | overseas
  "travelers": [{ "name": "이승훈", "relation": "본인" }, { "name": "엄마", "relation": "부모님", "age": 65 }],
  "course": "추천 경로 A안 — 1일 도톤보리, 2일 교토, 3일 오사카성",
  "transport": ["flight", "train"],
  "dates": { "start": "2026-11-13", "end": "2026-11-15" },
  "extra": "부모님 무릎 · 매운 음식 X"            // 선택
},
"meta": {
  "id": "osaka-2026-11",          // 영문 소문자·숫자·하이픈 (기기 저장소 키)
  "title": "오사카·교토 가족여행",  // 공유 파일 이름이 됨
  "short_name": "오사카", "kicker": "2026 가을 · 2박 3일",
  "start": "2026-11-13", "end": "2026-11-15", "region": "overseas",
  "accent": "#c4442a",            // 대표색(진한 색, 흰 글씨 대비 4.5:1 이상)
  "addr_ask": "この住所までお願いします。",  // 해외: 주소 카드 윗줄 "여기로 가 주세요"
  "lang_label": "일본어"           // 해외: 정보 > 회화 탭 이름
},
"travelers": [{ "name": "이승훈" }, ...],   // 표지·사람별 사진 칸에 쓰임
"transport": ["flight", "train", "subway", "taxi"]  // flight train bus car ship taxi walk bike subway
                                               // car가 있으면 지도 옆 '길안내' 버튼 자동
```

## 🗓️ 일정 — `days[]`
```jsonc
{ "id": "d1", "date": "2026-11-13", "title": "오사카 도착",
  "weather": { "text": "맑음", "hi": 18, "lo": 10, "url": "예보 링크" },
  "note": "그날 주의사항(노란 상자)",
  "events": [                       // 시간순 필수
    { "time": "11:50", "end": "13:05", "icon": "🚆", "title": "하루카 → 신오사카",   // 제목은 짧게
      "meta": "한 줄 설명", "kv": [["좌석", "4명 지정석"]], "tip": "주의(노란 상자)",
      "map": "検索語 또는 URL",     // 국내=네이버지도, 해외=구글지도
      "addr": "hotel",              // places 키 → 주소 카드
      "ticket": "haruka",           // tickets id → 티켓 탭 해당 카드로 이동
      "qr": "assets/x.png",         // 바로 크게 띄울 QR 이미지
      "image": "assets/route.jpg", "image_label": "동선 지도",
      "links": [{ "label": "홈페이지", "url": "https://..." }],
      "nav": false },               // car일 때 길안내 숨김
    { "time": "14:00", "icon": "🍚", "title": "중식", "meal": "중식" }   // 식사 줄: 가게는 식사 탭에서 확정
  ],
  "nearby": [                       // 일정·식사 탭 아래 '근처 추천 가게' (예약 전 대안)
    { "cat": "대안 식사", "name": "...", "menu": "...", "location": "...", "note": "영업시간", "map": "...", "url": "...", "addr": "..." }
  ]                                 // cat: 대안 식사 / 카페 / 간식 / 술집 / 맛집
}
```

## 🍽️ 식사 — `meals{dayId: []}`
```jsonc
"d2": [
  { "slot": "조식", "name": "호텔 조식", "menu": "뷔페", "near": "호텔 1층", "confirmed": true },      // 정해진 식사
  { "slot": "중식", "name": "두부 요리집", "menu": "유도후 정식",                                    // 추천 후보 ①
    "near": "기요미즈데라 내려오는 길 · 걸어서 5분", "hours": "11:00~16:00", "price": "1인 2,500엔",
    "why": "교토 대표 음식 · 맵지 않음", "map": "湯豆腐 清水", "url": "...", "addr": "places 키" },
  { "slot": "중식", "name": "소바집", "menu": "니신 소바", "near": "기온 입구 · 다음 일정 바로 앞", ... }, // 추천 후보 ②
  { "slot": "석식", "name": "스시집", "reserved": true, "confirmed": true, "ticket": "dinner", ... }   // 예약
]
```
- 끼니(`slot`)마다 후보를 모아 보여 준다. 일정의 `"meal": "중식"` 줄과 `slot` 이름이 같아야 연결된다.
- `confirmed: true`는 끼니당 하나(정해진 식사 또는 질의에서 고른 곳). 없으면 일정표에 **"2곳 중 고르기"**(점선 카드), 식사 탭에 **"이걸로 정하기"** 버튼.
- 앱에서 고르면 같은 끼니의 다른 후보는 자동으로 대안이 되고, "다시 고르기"로 되돌릴 수 있다. 고른 결과는 "사진 포함 파일 보내기"에 담겨 가족에게 전달된다.
- `near`(앞뒤 일정 기준 위치·거리), `hours`, `price`, `why`(추천 이유)는 고르는 데 쓰이므로 추천 후보에는 꼭 채운다.

## 📍 정보 — `places{}`, `info{}`
```jsonc
"places": { "hotel": { "group": "숙소", "when": "11/13~15", "name": "한국어 이름",
            "local": "現地語名", "addr_local": "現地語住所", "addr_ko": "한국어 주소", "tel": "...", "map": "..." } },
"info": {
  "maps":     [{ "title": "🍁 11/14 교토 동선", "desc": "...", "image": "assets/route.jpg", "map": "...", "links": [] }],
  "contacts": [{ "group": "긴급", "label": "경찰", "tel": "110", "note": "..." },      // mail / url 도 가능
               { "group": "예약처", "label": "호텔", "tel": "..." }],
  "bookings": [{ "label": "항공 예약번호", "value": "ABC123", "note": "" }],         // 누르면 크게
  "phrases":  [{ "ko": "이 주소로 가 주세요", "local": "...", "pron": "..." }],       // 해외만
  "sections": [{ "title": "💴 돈 · 결제", "items": ["..."] }]                        // 알아두기
}
```
- 정보 탭 하위: 택시/주소(검색·그룹) · 지도 · 연락처 · 예약번호 · 회화 · 알아두기 — 데이터 있는 것만 나옴.
- 해외는 모든 place에 `local`, `addr_local` 필수(택시 기사에게 보여줌).

## 🎫 티켓 — `ticket_groups[]`, `tickets[]`
```jsonc
"ticket_groups": [
  { "id": "qr", "label": "입국 QR", "icon": "🛂", "per_person": true,   // 사람별 사진 칸 자동
    "desc": "설명", "empty": "빈 칸 안내" },
  { "id": "flight", "label": "항공", "icon": "✈️" }, { "id": "train", "label": "기차", "icon": "🚆" },
  { "id": "food", "label": "식당", "icon": "🍱" },   { "id": "tour", "label": "입장권", "icon": "🎟️" }
],
"tickets": [{ "id": "haruka", "group": "train", "icon": "🚆", "title": "하루카 왕복", "meta": "...",
              "kv": [["예약번호", "..."]], "timetable": [["09:00", "집합"], ["12:00", "점심"]],
              "image": "assets/x.jpg", "images": ["assets/y.png"], "tip": "...",
              "addr": "places 키", "links": [], "photo": true }]   // photo:false면 사진 칸 숨김
```
- 모든 티켓 카드에 "＋ 사진 추가" 칸(이 기기 저장). 티켓 탭 맨 아래 **"사진 포함 파일 보내기"** — 가족이 등록한 사진까지 넣은 HTML 파일을 카톡 등으로 공유.
- 해외면 `qr` 그룹(입국 QR, per_person)을 기본으로 넣는다.

## 🛍️ 쇼핑 — `shop[]`, `coupons[]`, `shop_notes[]`
```jsonc
"shop": [{ "cat": "과자", "name": "킷캣 말차", "where": ["드럭스토어", "공항"], "price": "약 600엔",
           "note": "...", "image": "assets/kitkat.jpg", "warn": false }],   // warn:true → 빨간 글씨(반입 금지 등)
"coupons": [{ "title": "...", "note": "...", "image": "assets/coupon.jpg", "url": "..." }],
"shop_notes": ["면세는 여권 필수"]
```
- `where`가 매장 칩(필터)이 된다. 검색창은 이름·메모·매장으로 찾음.

## ✅ 준비 — `checklist{}`
```jsonc
"checklist": {
  "before": ["여권 유효기간"],                                   // 출발 전
  "items":  [{ "title": "전기 · 충전", "items": [{ "t": "돼지코 2개", "note": "100V" }, "보조배터리"] }],  // 필수품
  "wear":   [{ "title": "11월 · 10~18℃", "items": ["바람막이"] }],  // 옷차림
  "during": ["매일 아침 일정 확인"]                              // 여행 중
}
```
- 값은 문자열 배열 또는 `[{title, items}]` 그룹 배열. 하위 탭에 "완료/전체" 개수가 표시된다.

## 규칙
- 본문은 한국어. 해외의 `local`/`addr_local`/`phrases.local`만 현지어.
- 접힌 카드 제목은 짧게(장소·행동·가게 이름). 설명은 `meta`/`kv`/`tip`/`note`로 펼친 안쪽에.
- 이미지는 `<폴더>/assets/`에 두고 `"assets/파일명"`으로 참조 → 공유 파일에 자동 내장, 웹 앱 오프라인 캐시에 자동 추가.
- 예약번호·좌석처럼 모르는 값은 지어내지 않고 "예약 후 입력".
- 개인 서류(여권·QR)는 텍스트로 쓰지 않는다. 사용자가 앱에서 사진으로 등록.
