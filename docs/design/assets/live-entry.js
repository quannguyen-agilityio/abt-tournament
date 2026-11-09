// Phase 2 · entry flow into live scoring (spec §8.0, §8.2). Four pages share this file:
//   admin-matches (A5 list), admin-match (A5 Scores step + Live card), public-home (P1), public-matches (P3).
// It reuses the Phase 1 shell (app.js: header, sidebar, i18n, theme, ABTUI.mount) and, for the public pages, the Phase 1
// home / matches renderers exposed by public.js. admin.js does not expose its renderers, so the admin screens copy its
// row / step bar / entry grid markup. Nothing in the frozen Phase 1 files is edited; the fake data is patched at run time.
(function () {
  'use strict';
  const UI = window.ABTUI, A = () => window.ABT;
  const esc = UI.esc;

  // ---------- strings (VI default + EN) ----------
  const LD = {
    vi: {
      liveNow: 'Đang chấm trực tiếp', ready: 'Sẵn sàng chấm', live: 'LIVE', you: 'Bạn', scoring: 'Đang chấm', setN: 'Set {n}', legN: 'Lượt {n}',
      card: 'Chấm trực tiếp', lockFirst: 'Khoá đội hình trước khi chấm', goLock: 'Đến bước Khoá', start: 'Bắt đầu chấm trực tiếp',
      startHint: 'Nhận quyền chấm rồi mở thiết lập {unit} 1. Chỉ một người chấm tại một thời điểm.',
      resume: 'Tiếp tục chấm', youHold: 'Bạn đang giữ quyền chấm', heldBy: 'Đang chấm bởi {name} · từ {time}', heldHint: 'Bạn xem được trực tiếp. Nhận quyền chấm sẽ chuyển người kia sang chỉ xem.',
      watch: 'Xem trực tiếp', takeover: 'Nhận quyền chấm', takeTitle: 'Nhận quyền chấm trận {code}?',
      takeBody: '{name} sẽ chuyển sang chế độ chỉ xem ngay khi có điểm hoặc tin nhắn realtime kế tiếp. Chỉ một người chấm tại một thời điểm.',
      takeLog: 'Hành động được ghi vào nhật ký (ai, lúc nào).', cancel: 'Hủy', setsWon: 'Tỉ số set', curSet: 'Hiện tại',
      doneTitle: 'Trận đã kết thúc', perSet: 'Kết quả từng set', perLeg: 'Kết quả từng lượt', reopenSet: 'Mở lại set {n}', reopenAria: 'Mở lại set {n} (chỉ BTC)', onlyBtc: 'Chỉ BTC mở lại được set / lượt đã xác nhận.', wins: 'thắng',
      entryTitle: 'Nhập tỉ số cuối', fallback: 'Phương án dự phòng', entryDesc: 'Nhập tỉ số cuối của từng set. Bên được chấp xuất phát từ số điểm chấp.',
      entryRelay: 'Nhập tỉ số cộng dồn tại mỗi mốc. Một bên phải chạm đúng mốc.',
      noOverwrite: 'Hai cách nhập không ghi đè lên nhau. Set đã có điểm chấm trực tiếp chỉ đọc ở đây. Set nhập tỉ số cuối thì không chấm trực tiếp được.',
      liveLabel: 'Chấm trực tiếp', inProgress: 'Đang chấm', saveSet: 'Lưu set', copyLink: 'Sao chép link chấm', copied: 'Đã sao chép', directLink: 'Link chấm trực tiếp',
      directHint: 'Cần cùng vai trò. Nếu bạn không giữ quyền chấm, link mở thẻ này.',
      demoState: 'Trạng thái demo', stUnlocked: 'Chưa khoá', stReady: 'Sẵn sàng', stMine: 'Của tôi', stOther: 'Người khác', stDone: 'Hoàn tất', roleLbl: 'Vai trò',
      heldByShort: 'Đang chấm', sets: 'set', liveFilter: 'Đang live', quick: 'Lọc nhanh', all: 'Tất cả', court: 'Sân', nextUp: 'Tiếp theo', noLiveCourt: 'Chưa có trận đang diễn ra',
      serving: 'đang giao', setScoreAria: 'Tỉ số set {a}–{b}', curAria: 'Set {n}, đang đánh {a}–{b}', liveCount: '{n} trận',
      matchPoint: 'Trận {code}', wholeMatch: 'Tỉ số set', cumul: 'Tổng điểm', cumulAria: 'Tổng điểm {a}–{b}', reopenLeg: 'Mở lại lượt {n}', reopenLegAria: 'Mở lại lượt {n} (chỉ BTC)', copySelect: 'Chọn sẵn, nhấn giữ để sao chép', backList: 'Trận đấu', openMatch: 'Mở trận', stepBar: 'Các bước', unitSet: 'set', unitLeg: 'lượt', typeOpen: 'Tự do',
    },
    en: {
      liveNow: 'Scoring live now', ready: 'Ready to score', live: 'LIVE', you: 'You', scoring: 'Scoring', setN: 'Set {n}', legN: 'Leg {n}',
      card: 'Live scoring', lockFirst: 'Lock the lineups before scoring', goLock: 'Go to Lock', start: 'Start live scoring',
      startHint: 'Take the scoring lock, then open the setup of {unit} 1. Only one person scores at a time.',
      resume: 'Resume scoring', youHold: 'You hold the scoring lock', heldBy: 'Scored by {name} · since {time}', heldHint: 'You can watch live. Taking over switches the other scorer to view-only.',
      watch: 'Watch live', takeover: 'Take over scoring', takeTitle: 'Take over scoring for {code}?',
      takeBody: '{name} will switch to view-only on the next point or realtime message. Only one scorer at a time.',
      takeLog: 'This action is logged (who, when).', cancel: 'Cancel', setsWon: 'Set score', curSet: 'Now',
      doneTitle: 'Match finished', perSet: 'Result per set', perLeg: 'Result per leg', reopenSet: 'Reopen set {n}', reopenAria: 'Reopen set {n} (committee only)', onlyBtc: 'Only the committee can reopen a confirmed set or leg.', wins: 'wins',
      entryTitle: 'Enter final scores', fallback: 'Fallback', entryDesc: 'Enter each set’s final score. The receiving pair starts from its handicap.',
      entryRelay: 'Enter the running score at each milestone. One side must hit the milestone exactly.',
      noOverwrite: 'The two ways never overwrite each other. A set with live points is read-only here. A set entered as a final score cannot be scored live.',
      liveLabel: 'Scored live', inProgress: 'Scoring', saveSet: 'Save set', copyLink: 'Copy scoring link', copied: 'Copied', directLink: 'Direct scoring link',
      directHint: 'Same role needed. If you do not hold the lock, the link opens this card.',
      demoState: 'Demo state', stUnlocked: 'Not locked', stReady: 'Ready', stMine: 'Mine', stOther: 'Someone else', stDone: 'Done', roleLbl: 'Role',
      heldByShort: 'Scorer', sets: 'sets', liveFilter: 'Live now', quick: 'Quick filter', all: 'All', court: 'Court', nextUp: 'Up next', noLiveCourt: 'No match in progress',
      serving: 'serving', setScoreAria: 'Set score {a}–{b}', curAria: 'Set {n}, playing {a}–{b}', liveCount: '{n} matches',
      matchPoint: 'Match {code}', wholeMatch: 'Set score', cumul: 'Cumulative', cumulAria: 'Cumulative score {a}–{b}', reopenLeg: 'Reopen leg {n}', reopenLegAria: 'Reopen leg {n} (committee only)', copySelect: 'Selected, long-press to copy', backList: 'Matches', openMatch: 'Open match', stepBar: 'Steps', unitSet: 'set', unitLeg: 'leg', typeOpen: 'Open',
    },
  };
  const lt = (loc, k, o) => {
    let s = (LD[loc] && LD[loc][k]) ?? LD.vi[k] ?? k;
    if (o) Object.entries(o).forEach(([a, b]) => { s = s.split(`{${a}}`).join(b); });
    return s;
  };

  // ---------- fake live data (patched over the Phase 1 data at run time) ----------
  // adm: score the scorer sees when the A5 card is rendered; pub: score the public sees on P1/P3 (different moment of the demo).
  const LIVE = {
    V07: { home: 't1', away: 't2', court: 'Sân 2', time: '14:00', set: 3, adm: [9, 16], pub: [14, 11], sets: [1, 1], serving: 'home', scorer: 'u3', since: '14:02' },
    V08: { home: 't3', away: 't4', court: 'Sân 1', time: '14:00', set: 2, adm: [12, 10], pub: [12, 10], sets: [1, 0], serving: 'away', scorer: 'u4', since: '14:10' },
  };
  // Relay final F (data.js: lineup_locked, Sân 1, 14:45). Not in LIVE: the list pages keep it "ready"; only admin-match's
  // mine / other / done views use this. Scores are cumulative: leg 2 in progress at 31–27 (leg 1 ended 25–19), same as relay.html.
  const RLIVE = { relay: true, set: 2, adm: [31, 27], court: 'Sân 1', time: '14:45', scorer: 'u4', since: '14:48', done: [[25, 19], [50, 44], [75, 71], [100, 97], [125, 118]] };
  // Same fake pairs and finished scores as the scorer mockups (live.js), so the A5 grid matches what the scorer sees.
  const V07 = {
    names: { t1: ['Trần Minh Khang', 'Lê Gia Bảo', 'Phạm Hữu Phúc', 'Hoàng Thu Lan', 'Đỗ Công Long'], t2: ['Nguyễn Quốc Hưng', 'Võ Mỹ Vy', 'Đặng Văn Kiên', 'Bùi Ngọc Mai', 'Hồ Đức Tú'] },
    pairs: [[0, 1], [2, 3], [0, 1], [2, 3], [0, 4]], types: ['open', 'low', 'open', 'high', 'open'],
    hc: [[0, 0], [0, 0], [0, 9], [3, 0], [0, 5]], done: [[31, 24], [27, 31], [31, 22], [29, 31], [31, 28]],
  };
  const patch = () => {
    const a = A(), ms = a.matches;
    Object.entries(LIVE).forEach(([code, lv]) => {
      const m = ms.find((x) => x.code === code);
      Object.assign(m, { status: 'in_progress', home: lv.home, away: lv.away, court: lv.court, time: lv.time, date: '2027-05-15', score: [...lv.sets], referee: lv.scorer });
    });
    const v09 = ms.find((x) => x.code === 'V09');
    Object.assign(v09, { status: 'lineup_locked', court: 'Sân 3', time: '14:15', date: '2027-05-15', score: undefined });
    delete v09.score;
    const v10 = ms.find((x) => x.code === 'V10');
    Object.assign(v10, { status: 'scheduled', court: 'Sân 3', time: '15:30', date: '2027-05-15' });
    delete v10.score;
  };

  // ---------- helpers ----------
  const SHUTTLE = '<svg class="lv-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="19.2" r="3" fill="currentColor"/><path d="M8.6 16.2 5.2 4.2h13.6l-3.4 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.2 4.2l1.5 11.4M14.8 4.2l-1.5 11.4M12 4.2v11.8" stroke="currentColor" stroke-width="1.2"/></svg>';
  const ICON_INFO = '<svg class="lv-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  const LIVE_FILES = ['admin-matches.html', 'admin-match.html', 'public-home.html', 'public-matches.html', 'public-match.html', 'setup.html', 'score.html', 'relay.html', 'viewer.html', 'index.html'];
  const here = () => location.pathname.split('/').pop() || 'index.html';
  const hrefOf = (file, q = {}, keepRole = true) => {
    const p = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
    const r = new URLSearchParams(location.search).get('role');
    if (keepRole && (r === 'referee' || r === 'btc') && !p.has('role')) p.set('role', r);
    const s = p.toString();
    return s ? `${file}?${s}` : file;
  };
  const teamName = (id) => esc(A().T[id].name);
  const teamsLine = (m) => (m.home ? `${teamName(m.home)} – ${teamName(m.away)}` : '');
  const setLbl = (loc, n, relay) => lt(loc, relay ? 'legN' : 'setN', { n });
  const curSetLbl = (loc, lv, scoreArr) => `${lt(loc, lv.relay ? 'legN' : 'setN', { n: lv.set })} · ${scoreArr[0]}–${scoreArr[1]}`;

  // Pages live in docs/design/live/, the Phase 1 shell links are relative to its own folder: send them to the right place.
  function fixLinks(area) {
    document.querySelectorAll('#app a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (/^(https?:|\.\.\/|#|mailto:|\/)/.test(h)) return;
      const [file, q] = h.split('?');
      const qs = q ? `?${q}` : '';
      if (LIVE_FILES.includes(file)) return;
      if (area === 'public') {
        if (file === 'home.html') a.setAttribute('href', `public-home.html${qs}`);
        else if (file === 'matches.html') a.setAttribute('href', `public-matches.html${qs}`);
        else if (file === 'match.html' && LIVE[new URLSearchParams(q || '').get('code')]) a.setAttribute('href', `public-match.html${qs}`);
        else a.setAttribute('href', `../public/${file}${qs}`);
      } else if (file === 'matches.html') a.setAttribute('href', `admin-matches.html${qs}`);
      else a.setAttribute('href', `../admin/${file}${qs}`);
    });
  }

  function ribbon(u, extra = '') {
    const el = document.querySelector('.mock-ribbon');
    if (!el) return;
    el.className = 'lv-ribbon mock-ribbon';
    const admin = document.body.dataset.area === 'admin';
    const q = new URLSearchParams(location.search);
    const roleSw = admin ? `<span class="inline-flex items-center gap-2 lg:hidden"><span>${lt(u.locale, 'roleLbl')}:</span>${['btc', 'referee'].map((r) => {
      const p = new URLSearchParams(q); p.set('role', r);
      return `<a class="underline-offset-2 ${u.role === r ? 'font-semibold underline' : 'hover:underline'}" href="${here()}?${p}" ${u.role === r ? 'aria-current="true"' : ''}>${r === 'btc' ? u.t('btc') : u.t('refereeRole')}</a>`;
    }).join(' · ')}</span>` : '';
    el.innerHTML = `<span class="font-semibold">${u.t('mock')}</span>${extra}${roleSw}<a class="hover:underline ml-auto" href="index.html">← Live</a><a class="hover:underline" href="../index.html">${u.t('allScreens')} →</a>`;
  }

  const head = (title, sub, actions = '') => `<div class="flex flex-wrap items-end gap-3 mb-5"><div class="min-w-0"><h1 class="display text-4xl font-extrabold uppercase leading-none">${title}</h1>${sub ? `<p class="text-muted mt-1">${sub}</p>` : ''}</div><div class="ml-auto flex flex-wrap gap-2">${actions}</div></div>`;

  const S = {};

  // =============================================================== A5 list
  S.adminMatches = (u) => {
    const a = A(), L = (k, o) => lt(u.locale, k, o);
    const me = u.role === 'referee' ? 'u3' : 'u1';
    const ms = a.matches;
    const live = ms.filter((m) => LIVE[m.code]);
    const rest = ms.filter((m) => !LIVE[m.code]);
    const mine = rest.filter((m) => m.referee === me);
    const others = rest.filter((m) => m.referee !== me);
    const stateOf = (m) => (m.status === 'lineup_locked' ? 'ready' : m.status === 'completed' ? 'done' : m.status === 'scheduled' && m.home ? 'unlocked' : '');
    const liveRow = (m) => {
      const lv = LIVE[m.code], isMine = lv.scorer === me;
      return `<a href="${hrefOf('admin-match.html', { code: m.code, state: isMine ? 'mine' : 'other' })}" class="lv-row block p-3 hover:bg-surface2" aria-label="${m.code} ${L('live')} ${esc(a.T[m.home].name)} – ${esc(a.T[m.away].name)}, ${curSetLbl(u.locale, lv, lv.adm)}">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1"><span class="chip chip-live">${L('live')}</span><b class="display text-lg">${m.code}</b><span class="text-sm text-muted">${lv.court}</span>
          <span class="ml-auto display text-lg font-semibold num">${curSetLbl(u.locale, lv, lv.adm)}</span></div>
        <div class="flex items-center gap-3 mt-1"><span class="min-w-0 flex-1 truncate text-sm">${teamsLine(m)}</span><span class="display text-xl font-bold num" aria-label="${L('setScoreAria', { a: lv.sets[0], b: lv.sets[1] })}">${lv.sets[0]}–${lv.sets[1]}</span></div>
        <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted"><span>${L('heldByShort')}: <b class="text-fg">${esc(u.userName(lv.scorer))}</b></span>${isMine ? `<span class="chip chip-accent">${L('you')}</span>` : ''}<span class="num">· ${L('wholeMatch').toLowerCase()} ${lv.sets[0]}–${lv.sets[1]}</span></div></a>`;
    };
    const row = (m) => {
      const st = stateOf(m);
      const href = st ? hrefOf('admin-match.html', { code: m.code, state: st }) : `../admin/match.html${u.role === 'referee' ? `?code=${m.code}&role=referee` : `?code=${m.code}`}`;
      const chip = m.status === 'lineup_locked' ? `<span class="chip chip-accent">${L('ready')}</span>` : u.statusChip(m);
      return `<a href="${href}" class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-surface2">
        <b class="display text-lg w-12">${m.code}</b><span class="text-sm text-muted num w-28">${u.fmtDate(m.date)} ${m.time}</span><span class="text-sm text-muted w-14">${m.court}</span>
        <span class="min-w-0 flex-1 truncate text-sm">${m.home ? teamsLine(m) : u.t('tbd')}</span><span class="num">${m.score ? m.score.join('–') : ''}</span>${chip}</a>`;
    };
    return `${head(u.t('aMatches'), u.role === 'referee' ? u.t('refereeRole') : u.t('btc'))}
      <section class="mb-6" aria-labelledby="h-live"><h2 id="h-live" class="eyebrow mb-2 flex items-center gap-2"><span class="chip chip-live">${L('live')}</span>${L('liveNow')} · ${live.length}</h2>
        <div class="panel lv-livelist divide-y divide-line">${live.map(liveRow).join('')}</div></section>
      ${mine.length ? `<section class="mb-6"><h2 class="eyebrow mb-2">${u.t('myMatches')} · ${mine.length}</h2><div class="panel divide-y divide-line">${mine.map(row).join('')}</div></section>` : ''}
      <section><h2 class="eyebrow mb-2">${u.t('other')} · ${others.length}</h2><div class="panel divide-y divide-line">${others.map(row).join('')}</div></section>`;
  };

  // =============================================================== A5 match, Scores step
  const STATES = ['unlocked', 'ready', 'mine', 'other', 'done'];
  S.adminMatch = (u) => {
    const a = A(), s = a.settings, p = u.params, L = (k, o) => lt(u.locale, k, o);
    const me = u.role === 'referee' ? 'u3' : 'u1';
    const state = STATES.includes(p.get('state')) ? p.get('state') : 'ready';
    const defCode = { unlocked: 'V10', ready: 'V09', mine: 'V07', other: 'V07', done: 'V07' }[state];
    let m = a.matches.find((x) => x.code === p.get('code')) || a.matches.find((x) => x.code === defCode);
    // Live and resume states are drawn for V07 / the relay final F; the summary also works for any completed match with slot scores
    // (relay slots hold cumulative scores). Anything else falls back to V07.
    if (['mine', 'other', 'done'].includes(state)) {
      const okDone = state === 'done' && m.status === 'completed' && m.slots && m.slots.every((x) => x.score);
      if (!(m.code === 'F' || m.code === 'V07' || okDone)) m = a.matches.find((x) => x.code === 'V07');
    }
    const code = m.code, relay = m.stage !== 'group';
    const lv = code === 'F' ? RLIVE : LIVE[code] || LIVE.V07;
    const unit = L(relay ? 'unitLeg' : 'unitSet');
    const holder = lv.scorer !== me ? lv.scorer : (me === 'u3' ? 'u4' : 'u3');
    const route = `/admin/seasons/${a.season.year}/matches/${code}/live`;
    const hasLive = state === 'mine' || state === 'other';

    // slots for the grid and the summary
    const nm = (id) => a.P[id].name;
    const slots = (m.slots || []).map((x, i) => {
      const own = code === 'V07';
      const names = own ? [V07.pairs[i].map((k) => V07.names.t1[k]), V07.pairs[i].map((k) => V07.names.t2[k])] : [x.home.map(nm), x.away.map(nm)];
      const score = own ? V07.done[i] : code === 'F' ? RLIVE.done[i] : x.score;
      return { no: i + 1, type: own ? V07.types[i] : x.type, names, hc: own ? V07.hc[i] : x.hc, score };
    });
    const kindOf = (i) => (state === 'done' ? 'live' : hasLive ? (i < lv.set - 1 ? 'live' : i === lv.set - 1 ? 'cur' : 'free') : 'free');
    const winsOf = (sl) => sl.reduce((n, x, i) => (kindOf(i) === 'live' && x.score && x.score[0] > x.score[1] ? [n[0] + 1, n[1]] : kindOf(i) === 'live' && x.score ? [n[0], n[1] + 1] : n), [0, 0]);

    // ---- head, teams, step bar (copied from admin.js S.aMatch so the page reads the same)
    const chipFor = { unlocked: u.statusChip({ status: 'scheduled' }), ready: u.statusChip({ status: 'lineup_locked' }), mine: `<span class="chip chip-live">${L('live')}</span>`, other: `<span class="chip chip-live">${L('live')}</span>`, done: u.statusChip({ status: 'completed' }) }[state];
    const mm = { ...m, status: 'scheduled' };
    const actions = `<div class="flex flex-wrap gap-2">${state === 'unlocked' ? `<button class="btn btn-sm">${u.t('substitute')}</button>` : ''}${state !== 'done' ? `<button class="btn btn-sm">${u.t('forfeitAction')}</button>` : ''}${u.role === 'btc' && state !== 'done' ? `<button class="btn btn-sm btn-danger">${u.t('disqualify')}</button>` : ''}</div>`;
    const cur = state === 'unlocked' ? 1 : state === 'done' ? 4 : 3;
    const steps = ['attendance', 'lineup', 'lock', 'scores', 'done'];
    const stepHref = (x) => (x === 'scores' || x === 'done' ? hrefOf('admin-match.html', { code, state: x === 'done' ? 'done' : state === 'unlocked' ? 'ready' : state === 'done' ? 'ready' : state }) : `../admin/match.html?${new URLSearchParams({ code, step: x, ...(u.role === 'referee' ? { role: 'referee' } : {}) })}`);
    const stepBar = `<ol class="panel p-3 flex gap-5 scroll-x mb-5" aria-label="${L('stepBar')}">${steps.map((x, i) => `<li><a href="${stepHref(x)}" class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}" ${i === cur ? 'aria-current="step"' : ''}><b>${i < cur ? '✓' : i + 1}</b>${u.t(`step${x[0].toUpperCase()}${x.slice(1)}`)}</a></li>`).join('')}</ol>`;
    const headHtml = `<a href="${hrefOf('admin-matches.html')}" class="text-sm text-muted hover:underline">← ${u.t('aMatches')}</a>
      <div class="flex flex-wrap items-center gap-3 mt-2 mb-4"><h1 class="display text-4xl font-extrabold uppercase">${code}</h1>${chipFor}<span class="text-muted text-sm">${u.stageLabel(mm)} · ${m.court} · ${m.time}</span><div class="ml-auto hidden sm:block">${actions}</div></div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5 text-lg">${u.teamChip(m.home)}<span class="text-muted">vs</span>${u.teamChip(m.away)}</div>`;

    // ---- Live scoring card
    const cardHead = (chips) => `<div class="flex flex-wrap items-center gap-2"><h2 class="display text-2xl font-bold uppercase leading-none mr-1">${L('card')}</h2>${chips}</div>`;
    const bigBtn = (href, label, cls = 'btn-primary') => `<a class="btn ${cls} btn-xl" href="${href}">${label}</a>`;
    const setBoard = () => relay ? `<div class="lv-board"><div class="lv-board-set"><span class="eyebrow">${L('curSet')}</span><b class="display num">${curSetLbl(u.locale, lv, lv.adm)}</b></div>
      <div class="lv-board-sets"><span class="eyebrow">${L('cumul')}</span><b class="display num" aria-label="${L('cumulAria', { a: lv.adm[0], b: lv.adm[1] })}">${lv.adm[0]}–${lv.adm[1]}</b></div></div>` : `<div class="lv-board"><div class="lv-board-set"><span class="eyebrow">${L('curSet')}</span><b class="display num">${curSetLbl(u.locale, lv, lv.adm)}</b></div>
      <div class="lv-board-sets"><span class="eyebrow">${L('wholeMatch')}</span><b class="display num" aria-label="${L('setScoreAria', { a: lv.sets[0], b: lv.sets[1] })}">${lv.sets[0]}–${lv.sets[1]}</b></div></div>`;
    let cardCls = 'lv-card', cardBody = '';
    if (state === 'unlocked') {
      cardCls += ' off';
      cardBody = `${cardHead(`<span class="chip">${u.t('scheduled')}</span>`)}
        <button class="btn btn-xl" disabled aria-describedby="lock-hint">${L('start')}</button>
        <p id="lock-hint" class="text-sm font-semibold flex items-start gap-2 text-warn">${ICON_INFO}<span>${L('lockFirst')}</span></p>
        <a class="btn btn-lg" href="../admin/match.html?${new URLSearchParams({ code, step: 'lineup', ...(u.role === 'referee' ? { role: 'referee' } : {}) })}">${L('goLock')}</a>`;
    } else if (state === 'ready') {
      cardCls += ' on';
      cardBody = `${cardHead(`<span class="chip chip-accent">${L('ready')}</span>`)}
        ${bigBtn(hrefOf('setup.html', relay ? { mode: 'relay', leg: 1 } : { set: 1 }), L('start'))}
        <p class="text-sm text-muted">${L('startHint', { unit })}</p>`;
    } else if (state === 'mine') {
      cardCls += ' live';
      cardBody = `${cardHead(`<span class="chip chip-live">${L('live')}</span><span class="chip chip-accent">${L('youHold')}</span>`)}
        ${bigBtn(relay ? hrefOf('relay.html') : hrefOf('score.html', { set: lv.set }), L('resume'))}
        ${setBoard()}`;
    } else if (state === 'other') {
      cardCls += ' live';
      cardBody = `${cardHead(`<span class="chip chip-live">${L('live')}</span>`)}
        <p class="font-semibold flex items-start gap-2"><span class="text-warn mt-0.5">${SHUTTLE}</span><span>${L('heldBy', { name: `<b>${esc(u.userName(holder))}</b>`, time: lv.since })}</span></p>
        ${setBoard()}
        <div class="grid gap-2 sm:grid-cols-2"><a class="btn btn-lg" href="${hrefOf('viewer.html', relay ? { mode: 'relay' } : {})}">${L('watch')}</a><button class="btn btn-primary btn-lg" type="button" id="take-open" aria-haspopup="dialog">${L('takeover')}</button></div>
        <p class="text-xs text-muted">${L('heldHint')}</p>`;
    } else {
      const w = relay ? slots[slots.length - 1].score : winsOf(slots);
      const winTeam = w[0] > w[1] ? m.home : m.away;
      cardBody = `${cardHead(`<span class="chip chip-win">${u.t('completed')}</span>`)}
        <div class="lv-board"><div class="lv-board-set"><span class="eyebrow">${L('doneTitle')}</span><b class="display num">${w[0]}–${w[1]}</b></div><div class="lv-board-sets"><span class="eyebrow">${u.t('winner')}</span><b class="display flex items-center gap-2"><span class="swatch" style="background:${a.T[winTeam].color}"></span>${teamName(winTeam)}</b></div></div>
        <div><div class="eyebrow mb-1">${L(relay ? 'perLeg' : 'perSet')}</div>
          <ul class="divide-y divide-line">${slots.map((x, i) => {
            const homeWon = x.score[0] > x.score[1];
            return `<li class="flex items-center gap-3 py-2"><b class="display w-14 shrink-0">${setLbl(u.locale, i + 1, relay)}</b><span class="score num text-lg shrink-0"><span class="${homeWon ? 'w' : 'l'}">${x.score[0]}</span><span class="text-muted px-1">–</span><span class="${homeWon ? 'l' : 'w'}">${x.score[1]}</span></span>
              <span class="min-w-0 flex-1 truncate text-sm text-muted">${teamName(homeWon ? m.home : m.away)} ${L('wins')}</span>
              ${u.role === 'btc' ? `<a class="btn btn-sm shrink-0" href="${relay ? 'relay' : 'score'}.html?role=btc&demo=reopen" aria-label="${L(relay ? 'reopenLegAria' : 'reopenAria', { n: i + 1 })}">${L(relay ? 'reopenLeg' : 'reopenSet', { n: i + 1 })}</a>` : ''}</li>`;
          }).join('')}</ul>
          ${u.role === 'btc' ? '' : `<p class="text-xs text-muted mt-2">${L('onlyBtc')}</p>`}</div>`;
    }
    const direct = state === 'unlocked' ? '' : `<div class="lv-direct"><div class="eyebrow">${L('directLink')}</div>
        <div class="flex flex-wrap items-center gap-2"><code class="lv-route" id="route">${route}</code><button class="btn btn-sm" type="button" id="copy-link" data-route="${route}" data-copied="${L('copied')}" data-select="${L('copySelect')}" data-label="${L('copyLink')}">${L('copyLink')}</button><span class="sr-only" role="status" id="copy-live"></span></div>
        <p class="text-xs text-muted">${L('directHint')}</p></div>`;
    const card = `<section class="${cardCls}" aria-label="${L('card')}">${cardBody}${direct}</section>`;

    // ---- Phase 1 entry grid with read-only live rows
    const nameCell = (side, x) => `<span class="text-muted text-xs sm:hidden">${teamName(side ? m.away : m.home)}: </span>${x.names[side].map(esc).join(' + ') || '—'}`;
    const hcTag = (x, side) => (!relay && x.hc && x.hc[side] ? ` <span class="hc">+${x.hc[side]}</span>` : '');
    const gridRow = (x, i) => {
      const kind = kindOf(i);
      const lab = `<div class="col-span-2 sm:col-span-1 flex sm:flex-col items-baseline sm:items-start gap-x-2"><b class="display text-lg">${setLbl(u.locale, i + 1, relay)}</b><span class="text-xs text-muted">${relay ? `→ ${s.milestones[i]}` : x.type === 'open' ? L('typeOpen') : u.t(x.type)}</span></div>`;
      const homeC = `<div class="col-span-2 sm:col-span-1 sm:order-2 text-sm min-w-0 sm:truncate">${nameCell(0, x)}${hcTag(x, 0)}</div>`;
      const awayC = `<div class="col-span-2 sm:col-span-1 sm:order-4 text-sm min-w-0 sm:truncate sm:text-right">${nameCell(1, x)}${hcTag(x, 1)}</div>`;
      if (kind === 'free') {
        return `<div class="lv-grow p-3 grid gap-2 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[72px_minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3">${lab}${homeC}${awayC}
          <div class="flex items-center gap-1 sm:order-3"><input aria-label="${u.t('colTeam')} 1, ${setLbl(u.locale, i + 1, relay)}" class="input !w-16 text-center num display text-xl" inputmode="numeric" value=""><span class="text-muted">–</span><input aria-label="${u.t('colTeam')} 2, ${setLbl(u.locale, i + 1, relay)}" class="input !w-16 text-center num display text-xl" inputmode="numeric" value=""></div>
          <button class="btn btn-sm sm:order-5 justify-self-end">${u.t('saveSet')}</button></div>`;
      }
      const isCur = kind === 'cur';
      const sc = isCur ? lv.adm : x.score;
      const scoreHtml = isCur ? `<span class="display text-xl font-bold num" aria-label="${L('curAria', { n: i + 1, a: sc[0], b: sc[1] })}">${sc[0]}<span class="text-muted px-1">–</span>${sc[1]}</span>` : u.scoreHtml({ score: sc }, 'text-xl');
      return `<div class="lv-grow lv-ro p-3 grid gap-2 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[72px_minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3" data-ro="${kind}">${lab}${homeC}${awayC}
        <div class="sm:order-3">${scoreHtml}</div>
        <span class="chip ${isCur ? 'chip-live' : 'chip-accent'} sm:order-5 justify-self-end">${isCur ? `${L('inProgress')}` : L('liveLabel')}</span></div>`;
    };
    const grid = `<section class="mt-6" aria-labelledby="h-entry">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 id="h-entry" class="display text-2xl font-bold uppercase">${L('entryTitle')}</h2><span class="chip">${L('fallback')}</span></div>
      <p class="text-sm text-muted mt-1 mb-3">${L(relay ? 'entryRelay' : 'entryDesc')}</p>
      ${state === 'unlocked' ? '' : `<div class="panel p-3 mb-3 text-sm flex items-start gap-2" role="note"><span class="text-accent mt-0.5">${ICON_INFO}</span><span>${L('noOverwrite')}</span></div>`}
      <div class="panel divide-y divide-line">${slots.map(gridRow).join('')}</div></section>`;
    return headHtml + stepBar + card + grid + `<div class="sm:hidden mt-6">${actions}</div>`;
  };

  // =============================================================== takeover dialog (same copy as live/viewer.html)
  function bindAdminMatch(u) {
    const L = (k, o) => lt(u.locale, k, o);
    const copy = document.getElementById('copy-link');
    if (copy) {
      copy.onclick = () => {
        const say = (msg) => {
          copy.textContent = msg;
          const st = document.getElementById('copy-live'); if (st) st.textContent = msg;
          setTimeout(() => { copy.textContent = copy.dataset.label; }, 2400);
        };
        const done = () => say(copy.dataset.copied);
        // No clipboard permission (or an insecure origin): select the link text instead and say so, never claim "copied".
        const fallback = () => {
          const r = document.getElementById('route'), sel = window.getSelection();
          if (r && sel) { const rg = document.createRange(); rg.selectNodeContents(r); sel.removeAllRanges(); sel.addRange(rg); }
          say(copy.dataset.select);
        };
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) fallback();
          else navigator.clipboard.writeText(`${location.origin}${copy.dataset.route}`).then(done, fallback);
        } catch (e) { fallback(); }
      };
    }
    const open = document.getElementById('take-open');
    if (!open) return;
    open.onclick = () => {
      const a = A();
      const code = new URLSearchParams(location.search).get('code') || 'V07';
      const lv = code === 'F' ? RLIVE : LIVE[code] || LIVE.V07;
      const me = u.role === 'referee' ? 'u3' : 'u1';
      const holder = lv.scorer !== me ? lv.scorer : (me === 'u3' ? 'u4' : 'u3');
      const ov = document.createElement('div');
      ov.className = 'ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'ov-h');
      ov.innerHTML = `<div class="ov-card"><h2 id="ov-h" class="ov-title" style="font-size:clamp(30px,9vw,44px)">${esc(L('takeTitle', { code }))}</h2>
        <p class="ov-sub" style="font-size:15px">${esc(L('takeBody', { name: u.userName(holder) }))}</p><p class="ov-sub">${esc(L('takeLog'))}</p>
        <div class="ov-actions"><a class="btn btn-primary btn-xl" data-focus href="${lv.relay ? hrefOf('relay.html') : hrefOf('score.html', { set: lv.set })}">${L('takeover')}</a><button class="btn btn-lg" type="button" data-close>${L('cancel')}</button></div></div>`;
      document.body.appendChild(ov);
      const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); open.focus(); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        const f = [...ov.querySelectorAll('a[href],button')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      };
      ov.querySelector('[data-close]').onclick = close;
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
      document.addEventListener('keydown', onKey);
      ov.querySelector('[data-focus]').focus();
      void a;
    };
  }

  // =============================================================== P1
  const liveCard = (m, u) => {
    const lv = LIVE[m.code], L = (k, o) => lt(u.locale, k, o);
    const row = (side) => {
      const id = side ? m.away : m.home, tm = A().T[id], serving = lv.serving === (side ? 'away' : 'home');
      return `<div class="truncate flex items-center gap-2"><span class="swatch" style="background:${tm.color}"></span><span class="font-semibold truncate">${esc(tm.name)}</span>${serving ? `<span class="lv-serve" title="${L('serving')}" role="img" aria-label="${L('serving')}">${SHUTTLE}</span>` : ''}</div>
        <div class="score text-xl text-right ${lv.sets[side] >= lv.sets[1 - side] && lv.sets[0] !== lv.sets[1] ? '' : 'text-muted'}">${lv.sets[side]}</div>`;
    };
    return `<a href="public-match.html?code=${m.code}" class="panel lv-nowcard p-4 flex flex-col gap-3 hover:border-accent/60 transition-colors min-w-0" aria-label="${m.code} ${L('live')}: ${esc(A().T[m.home].name)} ${lv.sets[0]}–${lv.sets[1]} ${esc(A().T[m.away].name)}, ${curSetLbl(u.locale, lv, lv.pub)}">
      <div class="flex items-center gap-2 text-xs text-muted"><span class="chip chip-live">${L('live')}</span><span class="display text-sm font-semibold text-fg">${m.code}</span><span class="ml-auto">${u.fmtDate(m.date)} · ${m.time}</span></div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 items-center">${row(0)}${row(1)}</div>
      <div class="lv-curset"><span class="eyebrow">${L('wholeMatch')} ${lv.sets[0]}–${lv.sets[1]}</span><b class="display num">${curSetLbl(u.locale, lv, lv.pub)}</b></div></a>`;
  };
  S.publicHome = (u) => {
    const a = A(), L = (k, o) => lt(u.locale, k, o);
    const full = a.matches;
    let html;
    a.matches = full.filter((m) => !LIVE[m.code]);
    try { html = window.ABTPublic.screens.home(u); } finally { a.matches = full; }
    const next = (court) => full.filter((m) => m.court === court && ['lineup_locked', 'scheduled'].includes(m.status) && m.home).sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`))[0];
    const courts = a.season.courts.map((c) => {
      const lm = full.find((m) => LIVE[m.code] && m.court === c), nx = next(c);
      const nxHtml = nx ? `<div class="flex items-center gap-2 text-xs text-muted ${lm ? 'pt-2 px-1' : ''} min-w-0"><span>${L('nextUp')}</span><b class="display text-sm text-fg">${nx.code}</b><span class="num whitespace-nowrap">${u.fmtDate(nx.date)} ${nx.time}</span><span class="truncate min-w-0">${teamsLine(nx)}</span></div>` : '';
      return `<div class="min-w-0 flex flex-col"><div class="eyebrow mb-1.5">${esc(c)}</div>${lm ? liveCard(lm, u) + nxHtml : `<div class="panel p-4 flex flex-col gap-2 text-sm text-muted"><span>${L('noLiveCourt')}</span>${nxHtml}</div>`}</div>`;
    });
    const now = `<section aria-labelledby="h-now"><div class="flex items-end gap-3 mb-3"><h2 id="h-now" class="display text-2xl font-bold uppercase tracking-wide">${u.t('now')}</h2></div><div class="grid gap-3 sm:grid-cols-2">${courts.join('')}</div></section>`;
    const marker = '<div class="flex flex-col gap-8 min-w-0">';
    return html.replace(marker, marker + now);
  };

  // =============================================================== P3
  // Decorate the Phase 1 match cards of live matches: LIVE chip, shuttle on the serving team, current set score.
  function decorateCards(u) {
    document.querySelectorAll('#app a.panel[href*="match.html"]').forEach((card) => {
      const code = new URLSearchParams(card.getAttribute('href').split('?')[1] || '').get('code');
      const lv = LIVE[code];
      if (!lv) return;
      card.classList.add('lv-nowcard');
      const chip = card.querySelector('.chip'); if (chip) { chip.className = 'chip chip-live'; chip.textContent = lt(u.locale, 'live'); }
      const grid = card.querySelector('.grid');
      const nameCell = grid && grid.children[lv.serving === 'home' ? 0 : 2];
      if (nameCell && nameCell.firstElementChild) nameCell.firstElementChild.insertAdjacentHTML('beforeend', `<span class="lv-serve" role="img" aria-label="${lt(u.locale, 'serving')}">${SHUTTLE}</span>`);
      if (grid) grid.insertAdjacentHTML('afterend', `<div class="lv-curset"><span class="eyebrow">${lt(u.locale, 'wholeMatch')} ${lv.sets[0]}–${lv.sets[1]}</span><b class="display num">${curSetLbl(u.locale, lv, lv.pub)}</b></div>`);
    });
  }
  S.publicMatches = (u) => {
    const a = A(), L = (k, o) => lt(u.locale, k, o);
    const only = u.params.get('live') === '1';
    const full = a.matches;
    let html;
    if (only) a.matches = full.filter((m) => LIVE[m.code]);
    try { html = window.ABTPublic.screens.matches(u); } finally { a.matches = full; }
    const lnk = (on) => { const p = new URLSearchParams(location.search); on ? p.set('live', '1') : p.delete('live'); const q = p.toString(); return `public-matches.html${q ? `?${q}` : ''}`; };
    const n = full.filter((m) => LIVE[m.code]).length;
    const chips = `<div class="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="${L('quick')}">
      <a class="lv-fchip" href="${lnk(false)}" ${only ? '' : 'aria-current="true"'}>${L('all')}</a>
      <a class="lv-fchip" href="${lnk(true)}" ${only ? 'aria-current="true"' : ''}><span class="chip chip-live !border-0 !bg-transparent !p-0"></span>${L('liveFilter')} <span class="num text-muted">${n}</span></a></div>`;
    return html.replace('</h1>', `</h1>${chips}`);
  };

  // ---------- mount ----------
  const screen = document.body.dataset.screen;
  const area = document.body.dataset.area;
  patch();
  const render = { aMatches: S.adminMatches, aMatch: S.adminMatch, home: S.publicHome, matches: S.publicMatches }[document.body.dataset.entry];
  const prevAfter = UI.after;
  let lastU = null;
  const wrapped = (u) => { lastU = u; return render(u); };
  UI.after = () => {
    if (prevAfter) prevAfter();
    const u = lastU;
    fixLinks(area);
    let extra = '';
    if (document.body.dataset.entry === 'aMatch') {
      const st = STATES.includes(u.params.get('state')) ? u.params.get('state') : 'ready';
      const names = { unlocked: 'stUnlocked', ready: 'stReady', mine: 'stMine', other: 'stOther', done: 'stDone' };
      extra = `<span>${lt(u.locale, 'demoState')}: ${STATES.map((x, i) => {
        const p = new URLSearchParams(location.search); p.set('state', x); if (p.get('code') !== 'F') p.delete('code');
        return `${i ? ' · ' : ''}<a class="underline-offset-2 ${st === x ? 'font-semibold underline' : 'hover:underline'}" href="admin-match.html?${p}" ${st === x ? 'aria-current="true"' : ''}>${lt(u.locale, names[x])}</a>`;
      }).join('')}</span>`;
      bindAdminMatch(u);
    }
    if (document.body.dataset.entry === 'matches') decorateCards(u);
    const curStep = document.querySelector('[aria-current="step"]');
    if (curStep && curStep.closest('.scroll-x')) { const box = curStep.closest('.scroll-x'); box.scrollLeft = Math.max(0, curStep.closest('li').offsetLeft - 24); }
    ribbon(u, extra);
  };
  void screen;
  UI.mount(wrapped);
})();
