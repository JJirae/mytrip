// 생성된 여행 앱을 헤드리스 크롬으로 열어 모든 탭·상호작용·공유 파일을 점검한다.
// 사용법: node verify.mjs <프로젝트폴더> [스크린샷폴더]
//  - 프로젝트폴더/index.html을 임시 서버로 띄워 탭 6개 + 하위 탭을 모두 열고 콘솔 오류 수집
//  - 주소 카드, 식사 확정 → 일정 반영, 준비 체크 카운트, 사진 추가, "사진 포함 파일 보내기" 결과 확인
//  - share/*.html을 file://로 열어 이미지가 내장돼 있는지 확인
// 크롬: CHROME 환경변수 → playwright 캐시 → google-chrome/chromium 순서로 찾는다.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';

const dir = path.resolve(process.argv[2] || '.');
const shots = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const pw = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).sort().reverse()) {
      for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(pw, d, rel); if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const c of ['google-chrome', 'chromium', 'chromium-browser']) { try { return execSync(`command -v ${c}`).toString().trim(); } catch {} }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) if (fs.existsSync(p)) return p;
  return null;
}
const B = findChrome();
if (!B) { console.log('⚠️  크롬을 찾지 못해 브라우저 검증을 건너뜀 (CHROME=경로 로 지정 가능)'); process.exit(2); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(dir, p);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-verify-'));
const dport = 9400 + Math.floor(Math.random() * 400);
const ch = spawn(B, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${dport}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${dport}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; const errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console: ' + JSON.stringify(d.params.args.map(a => a.value || a.description))); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) { errors.push('검증 중 오류: ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0]); return null; } return r.result?.result?.value; };
const shot = async name => { if (!shots) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(r.result.data, 'base64')); };
const go = async (h, w = 500) => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(w); };
const res = []; const ok = (name, pass, detail = '') => res.push({ name, pass: !!pass, detail });

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: `http://localhost:${port}/` }); await sleep(2000);
const T = await ev(`JSON.parse(document.getElementById('trip').textContent)`);
await shot('00_home');
const tabs = await ev(`[...document.querySelectorAll('.tabbar button')].map(b=>b.dataset.go)`);
ok('탭 순서 (일정>식사>정보>티켓>쇼핑>준비 중 있는 것)', JSON.stringify(tabs) === JSON.stringify(['plan', 'meal', 'info', 'ticket', 'shop', 'check'].filter(t => tabs.includes(t))), tabs.join(' > '));

// 모든 탭·하위 탭 열기
for (const tab of tabs) {
  await go('#/' + tab);
  const subs = await ev(`[...document.querySelectorAll('.days button, .subtabs button')].map(b=>b.dataset.go)`);
  for (const s of (subs.length ? subs : ['' + tab])) { await go('#/' + s); await shot(s.replace(/\//g, '_')); }
  ok(`${tab} 탭 열기 (하위 ${subs.length}개)`, true);
}
// 일정 카드 수
const evCount = (T.days || []).reduce((n, d) => n + (d.events || []).length, 0);
let shown = 0; for (const d of T.days) { await go('#/plan/' + d.id, 250); shown += await ev(`document.querySelectorAll('.ev').length`); }
ok('일정 카드 모두 표시', shown === evCount, `${shown}/${evCount}`);
// 주소 카드
const pk = Object.keys(T.places || {})[0];
if (pk) { await go('#/info/addr'); await ev(`document.querySelector('[data-addr]').click()`); await sleep(250); const t = await ev(`document.getElementById('show-sheet').hidden?'':document.getElementById('show-body').innerText`); ok('주소 카드 크게 보기', !!t, (t || '열리지 않음').replace(/\n+/g, ' / ').slice(0, 80)); await shot('zz_addr_sheet'); await ev(`document.querySelector('[data-close="show-sheet"]').click()`); }
// 식사 고르기: 아직 안 정한 끼니에서 후보를 고르면 일정표에 이름 표시, 다시 고르기로 되돌림
const open = [];
for (const d of T.days) for (const e of d.events || []) {
  if (!e.meal) continue;
  const c = (T.meals?.[d.id] || []).map((m, i) => ({ m, i })).filter(x => x.m.slot === e.meal);
  if (c.length && !c.some(x => x.m.confirmed)) open.push({ d: d.id, slot: e.meal, c });
}
if (open.length) {
  const o = open[0], pick = o.c[o.c.length - 1];
  await go('#/plan/' + o.d);
  const pend = await ev(`[...document.querySelectorAll('.ev.pending .mname')].map(e=>e.textContent).join('|')`);
  ok('안 정한 끼니는 일정표에 "고르기" 표시', /고르기/.test(pend || ''), pend);
  await go('#/meal/' + o.d);
  const nCards = await ev(`document.querySelectorAll('#ms-${o.slot} [data-pick]').length`);
  ok(`식사 탭 ${o.slot} 후보 표시`, nCards === o.c.length, `${nCards}곳`);
  await ev(`document.querySelector('[data-pick="${o.d}|${pick.i}"]').click()`); await sleep(300);
  await shot('zz_meal_picked');
  await go('#/plan/' + o.d);
  const names = await ev(`[...document.querySelectorAll('.mname')].map(e=>e.textContent).join('|')`);
  ok('식사 고르기 → 일정표에 가게 이름', (names || '').includes(pick.m.name), names);
  await go('#/meal/' + o.d);
  await ev(`document.querySelector('[data-unpick="${o.d}|${o.slot}"]').click()`); await sleep(300);
  const back = await ev(`document.querySelectorAll('#ms-${o.slot} [data-pick]').length`);
  ok('다시 고르기 → 후보로 돌아감', back === o.c.length, `${back}곳`);
  await ev(`document.querySelector('[data-pick="${o.d}|${pick.i}"]').click()`); await sleep(200); // 공유 파일 테스트용으로 다시 선택
} else ok('식사 고르기 대상 끼니', true, '모든 끼니가 이미 확정 — 건너뜀');
// 준비 체크 카운트
if (tabs.includes('check')) { await go('#/check'); const b = await ev(`document.querySelector('.subtabs [aria-selected=true]').textContent`); await ev(`document.querySelector('.chk input').click()`); await sleep(250); const a = await ev(`document.querySelector('.subtabs [aria-selected=true]').textContent`); ok('준비물 체크 카운트', a !== b, `${b} → ${a}`); }
// 사진 추가 + 파일 보내기
if (tabs.includes('ticket')) {
  await go('#/ticket', 700);
  const slot = await ev(`document.querySelector('[data-add-photo]')?.dataset.addPhoto`);
  if (slot) {
    const n = await ev(`(async()=>{const c=document.createElement('canvas');c.width=c.height=40;c.getContext('2d').fillRect(0,0,40,40);const b=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([b],'t.png',{type:'image/png'}));const i=document.querySelector('[data-add-photo]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,800));return document.querySelectorAll('[data-slot="'+${JSON.stringify(slot)}+'"] .th').length})()`);
    ok('사진 추가 (이 기기 저장)', n >= 1, `${slot}: ${n}장`);
  }
  const ex = await ev(`(async()=>{let href,name;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){href=this.href;name=this.download};document.querySelector('[data-export]').click();for(let i=0;i<50&&!href;i++)await new Promise(r=>setTimeout(r,200));HTMLAnchorElement.prototype.click=o;if(!href)return null;const t=await (await fetch(href)).text();const trip=t.split('id="trip">')[1].split('</script>')[0];return {name,kb:Math.round(t.length/1024),mealKept:/"confirmed":true/.test(trip),photos:/"data:image/.test(t.split('id="photos">')[1].split('</script>')[0]),inlined:!/"assets\\//.test(trip)}})()`);
  ok('사진 포함 파일 보내기', ex && ex.photos && ex.inlined, JSON.stringify(ex));
}
// 공유용 단일 파일 file:// 열기
const shareDir = path.join(dir, 'share');
const single = fs.existsSync(shareDir) && fs.readdirSync(shareDir).find(f => f.endsWith('.html'));
if (single) {
  await send('Page.navigate', { url: 'file://' + path.join(shareDir, single) + '#/plan' }); await sleep(1500);
  const r = await ev(`(()=>{const raw=document.getElementById('trip').textContent;return {evs:document.querySelectorAll('.ev').length,noAssetPath:!/"assets\\//.test(raw)}})()`);
  ok('공유 파일(file://) 열기 · 이미지 내장', r.evs > 0 && r.noAssetPath, `${single} · 일정 ${r.evs}개`);
  await shot('zz_single_file');
} else ok('공유 파일 존재 (share/*.html)', false, 'build.py를 먼저 실행');

ok('콘솔 오류 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
ws.close(); ch.kill(); server.close();
for (const r of res) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
if (shots) console.log(`📸 스크린샷: ${shots}`);
process.exit(res.every(r => r.pass) ? 0 : 1);
