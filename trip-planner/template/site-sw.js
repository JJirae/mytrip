// 사이트(메인 페이지) 서비스워커 — 설치형 앱(OurTrip)의 오프라인 지원.
// build_home.py가 VERSION과 PRECACHE(메인 + 각 여행 첫 화면 + 아이콘)를 채운다.
// 여행 폴더는 각자 sw.js(범위 /<여행-id>/)가 있어 한 번 열면 그쪽이 맡고,
// 그 전(설치 직후 오프라인 등)에는 여기서 받아 둔 여행 첫 화면을 보여 준다.
var VERSION = '__VERSION__';
var PRECACHE = __PRECACHE__;
var PREFIX = VERSION.slice(0, VERSION.lastIndexOf('@') + 1);  // '~site@' — 여행 id엔 '~'가 없어 겹치지 않음
var HOME = new URL('./', self.location).href;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.add(new Request(HOME, { cache: 'reload' })).then(function () {
      return Promise.all(PRECACHE.filter(function (u) { return u !== './'; }).map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // 페이지: 네트워크 우선, 실패하면 저장본(여행 캐시 포함 전체에서 찾음) → 그래도 없으면 메인
    var key = req.url.split('#')[0];
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(key, copy); }); }
      return r;
    }).catch(function () {
      return caches.match(key, { ignoreSearch: true }).then(function (hit) { return hit || caches.match(HOME); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return r;
    });
  }));
});
