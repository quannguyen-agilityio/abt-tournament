// Shared shell for the mockups: Tailwind config, i18n, theme, header/sidebar, helpers.
// Each page sets <body data-area="public|admin" data-screen="..."> and calls ABTUI.mount(renderFn).
(function () {
  'use strict';

  // ---------- i18n (spec §1 glossary) ----------
  const DICT = {
    vi: {
      mock: 'Mockup · dữ liệu giả', mockState: 'Trạng thái mùa', stGroup: 'Đang vòng bảng', stKo: 'Đang knock-out', allScreens: 'Tất cả màn hình',
      home: 'Trang chủ', standings: 'Bảng xếp hạng', matches: 'Lịch & kết quả', bracket: 'Knock-out', teams: 'Đội', players: 'VĐV', awards: 'Giải phụ', rules: 'Điều lệ',
      admin: 'Quản trị', season: 'Mùa giải', theme: 'Giao diện', themeSystem: 'Theo hệ thống', themeLight: 'Sáng', themeDark: 'Tối',
      now: 'Đang diễn ra', next: 'Sắp tới', latest: 'Kết quả mới nhất', top4: 'Top 4 vào bán kết', seeAll: 'Xem tất cả', lastUpdated: 'Cập nhật lúc', autoRefresh: 'tự làm mới mỗi 30 giây',
      day: 'Ngày', court: 'Sân', time: 'Giờ', referee: 'Trọng tài', stage: 'Vòng', all: 'Tất cả', team: 'Đội', vs: 'vs',
      group: 'Vòng bảng', semi_final: 'Bán kết', third_place: 'Tranh hạng 3', final: 'Chung kết', round: 'Lượt',
      scheduled: 'Sắp diễn ra', lineup_locked: 'Đã khóa đội hình', in_progress: 'Đang đấu', completed: 'Kết thúc', forfeit: 'Xử thua', annulled: 'Đã hủy',
      colPos: '#', colTeam: 'Đội', colP: 'Tr', colW: 'T', colL: 'B', colPts: 'Điểm', colSets: 'Set', colSD: 'HS set', colPoints: 'Điểm số', colPD: 'HS điểm',
      provisional: 'Tạm tính, vòng bảng chưa chốt', closed: 'Vòng bảng đã chốt', why: 'Xếp nhờ',
      why_pts: 'điểm', why_h2h: 'đối đầu', why_mini: 'mini-league', why_sd: 'hiệu số set', why_pd: 'hiệu số điểm', why_draw: 'bốc thăm',
      open: 'Tự do', low: 'Rank thấp', high: 'Rank cao', set: 'Set', leg: 'Lượt', handicap: 'Chấp', start: 'xuất phát',
      relayNote: 'Đánh tiếp sức: 5 lượt, mốc 25/50/75/100/125. Chấp tổng được cộng từ đầu lượt 1.', relayStart: 'Tỉ số xuất phát',
      lineupHidden: 'Đội hình sẽ công khai khi trận khóa đội hình.', forfeitReason_late: 'Đội đến trễ quá 10 phút', substitution: 'Thay người', injury: 'chấn thương',
      tbd: 'Chờ xác định', seed: 'Hạt giống', champion: 'Vô địch', runnerUp: 'Á quân', third: 'Hạng ba', winner: 'Thắng',
      roster: 'Đội hình', captain: 'Đội trưởng', record: 'Thành tích', results: 'Kết quả', rank: 'Rank', skill: 'Điểm kỹ năng', gender: 'Giới tính', male: 'Nam', female: 'Nữ',
      setsPlayed: 'Set đã đánh', setRecord: 'Thắng–thua set', pointsFor: 'Điểm ghi–mất', partner: 'Đồng đội hay cặp nhất', history: 'Lịch sử các mùa', firstSeason: 'Mùa đầu tiên',
      sponsor: 'Tài trợ', value: 'Giá trị', criteria: 'Tiêu chí', winners: 'Người nhận', pending: 'Chưa trao', pair: 'Cặp',
      search: 'Tìm VĐV…', filterRank: 'Rank', noMatches: 'Không có trận nào khớp bộ lọc.',
      // admin
      signIn: 'Đăng nhập', email: 'Email', password: 'Mật khẩu', signInHint: 'Tài khoản do BTC cấp. Quên mật khẩu, hãy nhờ BTC đặt lại.',
      role: 'Vai trò', btc: 'BTC', refereeRole: 'Trọng tài', viewAs: 'Xem với vai trò', signOut: 'Đăng xuất',
      aSeason: 'Mùa giải', aPlayers: 'VĐV & lệ phí', aTeams: 'Đội', aSchedule: 'Lịch thi đấu', aMatches: 'Trận đấu', aClose: 'Chốt vòng bảng', aAwards: 'Giải phụ', aUsers: 'Người dùng',
      save: 'Lưu', cancel: 'Hủy', importCsv: 'Import CSV', add: 'Thêm', edit: 'Sửa', generateRR: 'Sinh lịch vòng tròn', assign: 'Gán',
      myMatches: 'Trận của tôi', today: 'Hôm nay', other: 'Các trận khác',
      stepAttendance: 'Điểm danh', stepLineup: 'Đội hình', stepLock: 'Khóa', stepScores: 'Tỉ số', stepDone: 'Hoàn tất',
      present: 'có mặt', violations: 'Vi phạm luật', override: 'BTC cho phép với lý do', overrideReason: 'Lý do cho phép',
      lockLineups: 'Khóa đội hình', saveSet: 'Lưu set', forfeitAction: 'Xử thua', disqualify: 'Loại đội', substitute: 'Thay người', reopen: 'Mở lại',
      fees: 'Lệ phí', paid: 'Đã đóng', unpaid: 'Chưa đóng', collected: 'Đã thu', expected: 'Dự kiến', memberType: 'Loại', employee: 'Nhân viên', intern: 'Intern', guest: 'Khách mời',
      lockGroup: 'Chốt vòng bảng & sinh bracket', drawOrder: 'Kéo thả để xếp các đội bằng nhau theo kết quả bốc thăm', note: 'Ghi chú',
      rulesParams: 'Thông số luật', venue: 'Địa điểm', days: 'Ngày thi đấu', courts: 'Sân', status: 'Trạng thái', setCurrent: 'Đặt làm mùa hiện tại',
      newUser: 'Tạo tài khoản', resetPw: 'Đặt lại mật khẩu', deactivate: 'Khóa', active: 'Hoạt động', mustChange: 'Phải đổi mật khẩu',
      conflicts: 'Xung đột', noConflicts: 'Không có xung đột lịch',
    },
    en: {
      mock: 'Mockup · fake data', mockState: 'Season state', stGroup: 'Group stage', stKo: 'Knock-out', allScreens: 'All screens',
      home: 'Home', standings: 'Standings', matches: 'Schedule & results', bracket: 'Knock-out', teams: 'Teams', players: 'Players', awards: 'Side awards', rules: 'Rules',
      admin: 'Admin', season: 'Season', theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
      now: 'Now playing', next: 'Up next', latest: 'Latest results', top4: 'Top 4 go to the semi-finals', seeAll: 'See all', lastUpdated: 'Updated at', autoRefresh: 'refreshes every 30 s',
      day: 'Day', court: 'Court', time: 'Time', referee: 'Referee', stage: 'Stage', all: 'All', team: 'Team', vs: 'vs',
      group: 'Group stage', semi_final: 'Semi-final', third_place: 'Third place', final: 'Final', round: 'Round',
      scheduled: 'Upcoming', lineup_locked: 'Lineups locked', in_progress: 'Live', completed: 'Final', forfeit: 'Forfeit', annulled: 'Annulled',
      colPos: '#', colTeam: 'Team', colP: 'P', colW: 'W', colL: 'L', colPts: 'Pts', colSets: 'Sets', colSD: 'SD', colPoints: 'Points', colPD: 'PD',
      provisional: 'Provisional: group not closed yet', closed: 'Group stage closed', why: 'Decided by',
      why_pts: 'points', why_h2h: 'head-to-head', why_mini: 'mini-league', why_sd: 'set difference', why_pd: 'point difference', why_draw: 'draw',
      open: 'Open', low: 'Low-rank', high: 'High-rank', set: 'Set', leg: 'Leg', handicap: 'Handicap', start: 'start',
      relayNote: 'Relay: 5 legs to 25/50/75/100/125. The total handicap is added at the start of leg 1.', relayStart: 'Starting score',
      lineupHidden: 'Lineups go public once the match is locked.', forfeitReason_late: 'Team more than 10 minutes late', substitution: 'Substitution', injury: 'injury',
      tbd: 'TBD', seed: 'Seed', champion: 'Champion', runnerUp: 'Runner-up', third: 'Third place', winner: 'Winner',
      roster: 'Roster', captain: 'Captain', record: 'Record', results: 'Results', rank: 'Rank', skill: 'Skill points', gender: 'Gender', male: 'Male', female: 'Female',
      setsPlayed: 'Sets played', setRecord: 'Set W–L', pointsFor: 'Points for–against', partner: 'Most frequent partner', history: 'Season history', firstSeason: 'First season',
      sponsor: 'Sponsor', value: 'Value', criteria: 'Criteria', winners: 'Winners', pending: 'Not awarded yet', pair: 'Pair',
      search: 'Search players…', filterRank: 'Rank', noMatches: 'No matches fit these filters.',
      signIn: 'Sign in', email: 'Email', password: 'Password', signInHint: 'Accounts are issued by the Organizing Committee. Ask them to reset a forgotten password.',
      role: 'Role', btc: 'Organizing Committee', refereeRole: 'Referee', viewAs: 'View as', signOut: 'Sign out',
      aSeason: 'Season', aPlayers: 'Players & fees', aTeams: 'Teams', aSchedule: 'Schedule', aMatches: 'Matches', aClose: 'Close group', aAwards: 'Side awards', aUsers: 'Users',
      save: 'Save', cancel: 'Cancel', importCsv: 'Import CSV', add: 'Add', edit: 'Edit', generateRR: 'Generate round-robin', assign: 'Assign',
      myMatches: 'My matches', today: 'Today', other: 'Other matches',
      stepAttendance: 'Attendance', stepLineup: 'Lineups', stepLock: 'Lock', stepScores: 'Scores', stepDone: 'Done',
      present: 'present', violations: 'Rule violations', override: 'Allowed by the committee', overrideReason: 'Reason for allowing',
      lockLineups: 'Lock lineups', saveSet: 'Save set', forfeitAction: 'Forfeit', disqualify: 'Disqualify team', substitute: 'Substitute', reopen: 'Reopen',
      fees: 'Fees', paid: 'Paid', unpaid: 'Unpaid', collected: 'Collected', expected: 'Expected', memberType: 'Type', employee: 'Employee', intern: 'Intern', guest: 'Guest',
      lockGroup: 'Close group & seed bracket', drawOrder: 'Drag to order tied teams by the draw result', note: 'Note',
      rulesParams: 'Rule parameters', venue: 'Venue', days: 'Match days', courts: 'Courts', status: 'Status', setCurrent: 'Set as current season',
      newUser: 'Create account', resetPw: 'Reset password', deactivate: 'Deactivate', active: 'Active', mustChange: 'Must change password',
      conflicts: 'Conflicts', noConflicts: 'No schedule conflicts',
    },
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: keep in memory */ } },
  };
  let locale = store.get('abt.locale') || (navigator.language || 'vi').slice(0, 2);
  if (!DICT[locale]) locale = 'vi';
  let theme = store.get('abt.theme') || 'system';
  const t = (k) => DICT[locale][k] ?? DICT.vi[k] ?? k;

  const applyTheme = () => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  };
  applyTheme();

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const params = new URLSearchParams(location.search);
  const link = (href, extra = {}) => {
    const [path, q] = href.split('?');
    const p = new URLSearchParams(q || '');
    if (params.get('state') === 'group') p.set('state', 'group');
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
  const fmtDate = (d, opts = { weekday: 'short', day: '2-digit', month: '2-digit' }) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', opts).format(new Date(`${d}T00:00:00`));
  const money = (v) => new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(v) + ' ₫';
  const A = () => window.ABT;
  const team = (id) => A().T[id];
  const teamChip = (id, opts = {}) => {
    if (!id) return `<span class="text-muted">${t('tbd')}</span>`;
    const tm = team(id);
    const base = document.body.dataset.area === 'admin' ? '../public/' : '';
    return `<a href="${link(`${base}team.html`, { id })}" class="inline-flex items-center gap-2 font-semibold hover:underline ${opts.cls || ''}"><span class="swatch" style="background:${tm.color}"></span>${esc(tm.name)}</a>`;
  };
  const playerLink = (id, opts = {}) => {
    const p = A().P[id];
    if (!p) return '';
    const base = document.body.dataset.area === 'admin' ? '../public/' : '';
    return `<a href="${link(`${base}player.html`, { id })}" class="hover:underline ${opts.cls || ''}">${esc(p.name)}</a>${opts.rank ? ` <span class="text-muted text-xs num">R${p.rank}·${p.skill}</span>` : ''}`;
  };
  const statusChip = (m) => {
    const cls = { in_progress: 'chip-live', completed: '', forfeit: 'chip-warn', annulled: 'chip-loss', lineup_locked: 'chip-accent', scheduled: '' }[m.status];
    return `<span class="chip ${cls}">${t(m.status)}</span>`;
  };
  const scoreHtml = (m, size = 'text-2xl') => {
    if (!m.score) return `<span class="display ${size} text-muted">–</span>`;
    const [h, a] = m.score;
    return `<span class="score ${size}"><span class="${h > a ? 'w' : 'l'}">${h}</span><span class="text-muted px-1">–</span><span class="${a > h ? 'w' : 'l'}">${a}</span></span>`;
  };
  const stageLabel = (m) => (m.stage === 'group' ? `${t('group')} · ${t('round')} ${m.round}` : t(m.stage));
  const userName = (id) => (A().users.find((u) => u.id === id) || {}).name || '';

  // ---------- shell ----------
  const PUBLIC_NAV = [['home', 'home.html'], ['standings', 'standings.html'], ['matches', 'matches.html'], ['bracket', 'bracket.html'], ['teams', 'teams.html'], ['players', 'players.html'], ['awards', 'awards.html'], ['rules', 'rules.html']];
  const ADMIN_NAV = [
    ['aSeason', 'season.html', 'btc'], ['aPlayers', 'players.html', 'btc'], ['aTeams', 'teams.html', 'btc'], ['aSchedule', 'schedule.html', 'btc'],
    ['aMatches', 'matches.html', 'all'], ['aClose', 'close-group.html', 'btc'], ['aAwards', 'awards.html', 'btc'], ['aUsers', 'users.html', 'btc'],
  ];
  const themeLabel = () => ({ system: t('themeSystem'), light: t('themeLight'), dark: t('themeDark') })[theme];
  const ICON_THEME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function ribbon() {
    const st = params.get('state') === 'group' ? 'group' : 'knockout';
    const here = location.pathname.split('/').pop();
    const sw = (s, label) => `<a class="underline-offset-2 ${st === s ? 'font-semibold underline' : 'hover:underline'}" href="${here}?${new URLSearchParams({ ...Object.fromEntries(params), state: s }).toString()}">${label}</a>`;
    return `<div class="mock-ribbon gutter py-1.5 flex flex-wrap gap-x-4 gap-y-1 items-center">
      <span class="font-semibold">${t('mock')}</span>
      <span>${t('mockState')}: ${sw('group', t('stGroup'))} · ${sw('knockout', t('stKo'))}</span>
      <a class="hover:underline ml-auto" href="../index.html">${t('allScreens')} →</a></div>`;
  }
  function controls() {
    const a = A();
    return `<div class="flex items-center gap-2">
      <label class="sr-only" for="season-select">${t('season')}</label>
      <select id="season-select" class="select !h-8 !w-auto !py-0 text-sm font-semibold">${a.seasons.map((s) => `<option ${s.current ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
      <button id="locale-btn" class="btn btn-sm" aria-label="Language">${locale === 'vi' ? 'EN' : 'VI'}</button>
      <button id="theme-btn" class="btn btn-sm" title="${t('theme')}: ${themeLabel()}">${ICON_THEME}<span class="hidden sm:inline">${themeLabel()}</span></button>
    </div>`;
  }
  function publicShell(inner) {
    const screen = document.body.dataset.nav || document.body.dataset.screen;
    return `${ribbon()}
    <header class="topbar">
      <div class="gutter max-w-6xl mx-auto flex items-center gap-4 h-14">
        <a href="${link('home.html')}" class="wordmark">ABT<i>·</i>27</a>
        <nav class="hidden lg:flex items-center gap-1 ml-2">${PUBLIC_NAV.map(([k, h]) => `<a class="navlink" href="${link(h)}" ${screen === k ? 'aria-current="page"' : ''}>${t(k)}</a>`).join('')}</nav>
        <div class="ml-auto">${controls()}</div>
      </div>
      <nav class="lg:hidden scroll-x border-t border-line"><div class="gutter flex gap-1 py-1.5 w-max">${PUBLIC_NAV.map(([k, h]) => `<a class="navlink" href="${link(h)}" ${screen === k ? 'aria-current="page"' : ''}>${t(k)}</a>`).join('')}</div></nav>
    </header>
    <main class="gutter max-w-6xl mx-auto py-6 sm:py-8">${inner}</main>
    <footer class="gutter max-w-6xl mx-auto pb-10 pt-4"><div class="courtline mb-4"></div>
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"><span>${A().season.name} · ${esc(A().season.venue)}</span><a class="hover:underline" href="${link('../admin/matches.html')}">${t('admin')} →</a></div></footer>`;
  }
  function adminShell(inner) {
    const screen = document.body.dataset.nav || document.body.dataset.screen;
    const role = params.get('role') === 'referee' ? 'referee' : 'btc';
    const me = role === 'referee' ? A().users.find((u) => u.id === 'u3') : A().users[0];
    const navItem = ([k, h, who]) => {
      const locked = who === 'btc' && role === 'referee';
      return `<a href="${link(h, role === 'referee' ? { role } : {})}" class="${locked ? 'locked' : ''}" ${screen === k ? 'aria-current="page"' : ''} ${locked ? 'aria-disabled="true"' : ''}>${t(k)}${locked ? ' <span class="ml-auto text-xs">BTC</span>' : ''}</a>`;
    };
    const roleSw = ['btc', 'referee'].map((r) => `<a href="${location.pathname.split('/').pop()}?${new URLSearchParams({ ...Object.fromEntries(params), role: r }).toString()}" class="chip ${role === r ? 'chip-accent' : ''}">${r === 'btc' ? t('btc') : t('refereeRole')}</a>`).join('');
    return `${ribbon()}
    <header class="topbar"><div class="gutter flex items-center gap-3 h-14">
      <a href="${link('../public/home.html')}" class="wordmark">ABT<i>·</i>27</a><span class="chip">${t('admin')}</span>
      <div class="ml-auto">${controls()}</div></div></header>
    <div class="gutter py-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] max-w-7xl mx-auto">
      <aside class="side flex flex-col gap-1 min-w-0">
        <div class="panel p-3 mb-2"><div class="font-semibold text-sm">${esc(me.name)}</div><div class="text-xs text-muted mb-2">${esc(me.email)}</div>
          <div class="eyebrow mb-1">${t('viewAs')}</div><div class="flex flex-wrap gap-1">${roleSw}</div></div>
        <nav class="flex lg:flex-col gap-1 scroll-x">${ADMIN_NAV.map(navItem).join('')}</nav>
      </aside>
      <main class="min-w-0">${inner}</main>
    </div>`;
  }

  function mount(render) {
    const area = document.body.dataset.area;
    const go = () => {
      document.documentElement.lang = locale;
      const inner = render({ t, esc, link, fmtDate, money, team, teamChip, playerLink, statusChip, scoreHtml, stageLabel, userName, locale, params, role: params.get('role') === 'referee' ? 'referee' : 'btc' });
      document.getElementById('app').innerHTML = area === 'bare' ? inner : area === 'admin' ? adminShell(inner) : publicShell(inner);
      const lb = document.getElementById('locale-btn');
      if (lb) lb.onclick = () => { locale = locale === 'vi' ? 'en' : 'vi'; store.set('abt.locale', locale); go(); };
      const tb = document.getElementById('theme-btn');
      if (tb) tb.onclick = () => { theme = { system: 'light', light: 'dark', dark: 'system' }[theme]; store.set('abt.theme', theme); applyTheme(); go(); };
      if (window.ABTUI.after) window.ABTUI.after();
    };
    go();
  }

  window.ABTUI = { mount, t, esc, link };
})();
