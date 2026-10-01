// 오프라인 지원: 설치 시 페이지와 이미지를 받아 두고, 인터넷이 없으면 저장본을 보여 줍니다.
// build.py가 VERSION과 PRECACHE 목록을 채웁니다. 이미지를 바꾸면 build.py를 다시 실행하세요.
var VERSION = '__VERSION__';
var PRECACHE = __PRECACHE__;

self.addEventListener('install', function (e) {
  // 페이지(/)는 반드시 저장(실패하면 설치 재시도), 이미지는 하나씩 저장해 일부 실패해도 나머지는 남김
  e.waitUntil(caches.open(VERSION).then(function (c) {
    var list = PRECACHE.filter(function (u, i) { return PRECACHE.indexOf(u) === i && u !== '/'; });
    return c.add(new Request('/', { cache: 'reload' })).then(function () {
      return Promise.all(list.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 페이지: 네트워크 우선(수정 내용 바로 반영), 실패하면 저장본
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put('/', copy); });
      return r;
    }).catch(function () { return caches.match('/'); }));
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
