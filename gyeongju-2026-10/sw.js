// 오프라인 지원: 설치 시 페이지와 이미지를 받아 두고, 인터넷이 없으면 저장본을 보여 줍니다.
// build.py가 VERSION과 PRECACHE 목록을 채웁니다. 이미지를 바꾸면 build.py를 다시 실행하세요.
// 주소는 모두 이 파일 위치 기준 상대경로라 사이트 루트(/)나 여행 폴더(/<여행-id>/) 어디에 두어도 동작합니다.
var VERSION = 'gyeongju-2026-10@20261001152714';
var PRECACHE = [
  "./",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];
// 한 사이트에 여행이 여러 개면 캐시 저장소를 같이 쓰므로, 이 여행의 옛 버전만 지운다
var PREFIX = VERSION.slice(0, VERSION.lastIndexOf('@') + 1);
var PAGE = new URL('./', self.location).href;

self.addEventListener('install', function (e) {
  // 페이지(./)는 반드시 저장(실패하면 설치 재시도), 이미지는 하나씩 저장해 일부 실패해도 나머지는 남김
  e.waitUntil(caches.open(VERSION).then(function (c) {
    var list = PRECACHE.filter(function (u, i) { return PRECACHE.indexOf(u) === i && u !== './'; });
    return c.add(new Request(PAGE, { cache: 'reload' })).then(function () {
      return Promise.all(list.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return PREFIX && k.indexOf(PREFIX) === 0 && k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 페이지: 네트워크 우선(수정 내용 바로 반영), 실패하면 저장본
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(PAGE, copy); });
      return r;
    }).catch(function () { return caches.match(PAGE); }));
    return;
  }
  // 이미지·아이콘: 저장본 우선
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return r;
    });
  }));
});
