// ABT Phase 2 · live scoring mockups (docs/spec-phase-2.md). Vanilla JS, no build step, works from file://.
// Pages pick a screen with <body data-screen="score|relay|viewer|setup|public">.
(function () {
  'use strict';

  const other = (s) => (s === 'H' ? 'A' : 'H');
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const given = (n) => n.split(' ').pop();

  // ---------- storage, locale, theme (same keys as app.js so the choice carries over) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  let locale = store.get('abt.locale') === 'en' ? 'en' : 'vi';
  let theme = ['light', 'dark'].includes(store.get('abt.theme')) ? store.get('abt.theme') : 'system';
  const applyTheme = () => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  };
  applyTheme();

  const DICT = {
    vi: {
      mock: 'MOCKUP', mockups: '← Mockups', liveIdx: 'Live', backMatch: 'Về trận', themeSystem: 'Hệ thống', themeLight: 'Sáng', themeDark: 'Tối', theme: 'Giao diện',
      offlineOn: 'Mạng: tắt', offlineOff: 'Mạng: bật', reset: '↺ Đặt lại', pauseSim: 'Tạm dừng mô phỏng', playSim: 'Chạy mô phỏng',
      lang: 'Ngôn ngữ',
      court: 'Sân', set: 'Set', leg: 'Lượt', milestone: 'mốc', live: 'LIVE', endsChip: 'Đổi sân', medChip: 'Tạm dừng y tế', endedChip: 'Kết thúc set', endedLeg: 'Kết thúc lượt', retiredChip: 'Bỏ cuộc',
      type_open: 'Tự do', type_low: 'Thấp', type_high: 'Cao',
      synced: 'Đã đồng bộ', pending: 'Đang chờ gửi ({n})', offline: 'Mất kết nối', offlineQ: 'Mất kết nối · {n} chờ gửi',
      scorer: 'Chấm', menu: 'Menu', injury: 'Chấn thương', takeover: 'Nhận quyền chấm', undo: 'Hoàn tác', lastPoint: 'Điểm cuối: {team}',
      noPoints: 'Chưa có điểm', plusAria: '+1 điểm cho Đội {team}', plusLabel: 'Điểm cho {team}', scoreAria: '{ta} {a}, {tb} {b}.',
      right: 'Phải', left: 'Trái', rightFull: 'phải', leftFull: 'trái', even: 'chẵn', odd: 'lẻ',
      serve: 'Giao', receive: 'Nhận', serveCap: 'Giao: {s} · ô {c} (điểm {n} là số {p})', recvCap: 'nhận: {r}',
      courtAria: 'Sơ đồ sân nhìn từ trên xuống. {l} bên trái, {r} bên phải. {s}',
      readOnly: 'Chỉ xem', scoringBy: 'Đang chấm bởi {name}', scoringByHint: 'Bạn đang xem, không thể nhập điểm.',
      // overlays
      endsTitle: 'Đổi sân', endsReached: '{team} đạt {n} điểm', endsSub: 'Hai đội đổi sân. Vị trí ô phải/trái giữ nguyên.', cont: 'Tiếp tục', undoLast: 'Hoàn tác điểm cuối',
      endSetQ: 'Kết thúc set?', endLegQ: 'Kết thúc lượt?', wonSet: '{team} thắng set {n}', wonLeg: '{team} đạt mốc {n}', confirm: 'Xác nhận', writes: 'Xác nhận sẽ ghi kết quả vào trận.',
      savedSet: 'Đã lưu set {n}', nextSet: 'Tiếp theo: set {n} · {type}', toSetup: 'Thiết lập set {n}', startNow: 'Bắt đầu ngay (demo)',
      savedLeg: 'Đã lưu lượt {n}', nextLeg: 'Tiếp theo: lượt {n}', toLegSetup: 'Màn hình đổi lượt', matchDone: 'Trận đấu kết thúc', matchDoneSub: 'Kết quả được ghi vào trận.', backToList: 'Về danh sách',
      medTitle: 'Tạm dừng y tế', medPick: 'Chọn VĐV bị chấn thương để bắt đầu tính giờ', medLocked: 'Điểm đang bị khóa.', timeUp: 'Hết giờ', timeUpSub: 'Chọn một trong hai: tiếp tục thi đấu hoặc ghi nhận bỏ cuộc.',
      cancel: 'Hủy', resume: 'Tiếp tục thi đấu', retire: 'Bỏ cuộc', skipTo0: 'Demo: nhảy tới 0:00', injured: 'VĐV chấn thương',
      retTitle: 'Xác nhận bỏ cuộc', retSub: '{p} ({team}) không thể tiếp tục. Kiểm tra từng hệ quả trước khi xác nhận.', retConfirm: 'Xác nhận bỏ cuộc', back: 'Quay lại',
      rCur: 'Set {n}: {a}–{b}, {team} thua set (ghi {sa}–{sb}).', rForfeit: 'Set {n}: {p} có trong đội hình, xử thua {team} {sa}–{sb}.', rPlayed: 'Set {n}: {p} không có trong đội hình, đánh bình thường.', rKept: 'Set {a}–{b}: giữ nguyên kết quả.',
      rLeg: 'Lượt {n}: {a}–{b}, {team2} được ghi mốc {m}; {team} giữ {k} điểm.', rLater: 'Lượt {a}–{b}: để trống.', rMatch: 'Trận: {team} thua do bỏ cuộc (chấn thương); {team2} thắng.', rBadge: 'Hiển thị công khai nhãn “Bỏ cuộc (chấn thương)” kèm tên {p}.',
      retDone: 'Đã ghi nhận bỏ cuộc', retDoneSub: '{p} ({team}) bỏ cuộc vì chấn thương. Kết quả đã được ghi vào trận.',
      takeTitle: 'Nhận quyền chấm trận {code}?', takeBody: '{name} sẽ chuyển sang chế độ chỉ xem ngay khi có điểm hoặc tin nhắn realtime kế tiếp. Chỉ một người chấm tại một thời điểm.', takeLog: 'Hành động được ghi vào nhật ký (ai, lúc nào).',
      // setup
      setupTitle: 'Thiết lập set {n} · {type}', setupLegTitle: 'Đổi lượt {n}/5', setupLeg1Title: 'Thiết lập lượt 1/5 · tiếp sức', stEnds: 'Chọn sân', stServe: 'Đội giao', stServer: 'Người giao', stReceiver: 'Người nhận',
      endsPick: 'Chọn sân (nhìn từ chỗ ngồi của người chấm)', leftEnd: 'Bên trái', rightEnd: 'Bên phải', swap: 'Đổi bên', next: 'Tiếp', pickServe: 'Đội nào giao trước?', pickServer: 'Ai giao bóng? ({team})', pickRecv: 'Ai nhận bóng? ({team})',
      startPts: 'Điểm xuất phát', hcStart: 'xuất phát {n}', noHc: 'không chấp', startSet: 'Bắt đầu set', startLeg: 'Bắt đầu lượt {n}', needMore: 'Hoàn tất các bước để bắt đầu',
      exServer: 'Giao từ ô <b>{c}</b> vì điểm {n} là số {p}.', exRecv: 'Người nhận <b>{r}</b> đứng ô {c} (chéo với người giao, cùng nhãn phải/trái).', exNone: 'Chọn người giao để xem ô giao bóng.',
      relayBanner: 'Đổi sân', relayBannerSub: 'Lượt {n}/5 · mốc {m} · tỷ số cộng dồn {a}–{b}', fixedServe: 'Đội thắng pha cuối giao trước', hcServe: '{team} chấp đối thủ (xuất phát 0) nên giao trước', newPairs: 'Cặp mới', cumul: 'Tỷ số cộng dồn',
      // public
      pHome: 'Trang chủ', pStand: 'Bảng xếp hạng', pMatches: 'Lịch & kết quả', pBracket: 'Vòng loại trực tiếp',
      group: 'Vòng bảng', round: 'Vòng', setsWon: 'Số set', liveNote: 'Trực tiếp · cập nhật realtime', liveNotePaused: 'Mô phỏng đang tạm dừng',
      serving: 'đang giao', worm: 'Diễn biến set {n}', wormSub: 'Cách biệt điểm sau mỗi pha cầu', wormUp: '{team} dẫn', hcStartLbl: '{team} xuất phát +{n}', endsLbl: 'Đổi sân', rally: 'Pha cầu',
      matchSets: 'Các set', pending2: 'Chưa đấu', livePair: 'đang đấu', stateLive: 'Trạng thái demo', stLive: 'LIVE', stEnds: 'Đổi sân', stMed: 'Y tế', replay: 'Phát lại',
      medPublic: 'Tạm dừng y tế · {p}',
      // corrections (spec §4.5, L10)
      editSetup: 'Sửa thiết lập', editTitle: 'Sửa thiết lập set {n}', editLegTitle: 'Sửa thiết lập lượt {n}', editNote: 'Tỉ số giữ nguyên <b>{a}–{b}</b>; app tính lại vị trí và người giao.', saveSetup: 'Lưu thiết lập',
      undoLockedSet: 'Set trước đã xác nhận — cần BTC mở lại', undoLockedLeg: 'Lượt trước đã xác nhận — cần BTC mở lại',
      role: 'Vai trò', roleReferee: 'Trọng tài', roleBtc: 'BTC',
      editing: 'Đang sửa', openSetAria: 'Set {n}: {score}, đã xác nhận. Mở chi tiết', openLegAria: 'Lượt {n}: {score}, đã xác nhận. Mở chi tiết', editingAria: '{u}: đang sửa',
      shConfirmed: '{U} đã xác nhận', shBy: 'Xác nhận bởi {name} · {time}', shRefereeMsg: '{U} đã xác nhận. Chỉ BTC mở lại được.', close: 'Đóng',
      reasonLbl: 'Lý do mở lại (bắt buộc)', reasonHint: 'Lý do được ghi vào nhật ký thay đổi.', reopenBtn: 'Mở lại {u}', reopenQ: 'Mở lại {u}?',
      cSetCleared: 'Tỉ số {u} bị xoá tạm cho tới khi xác nhận lại', cMatchLive: 'Trận chuyển về Đang đấu, BXH cập nhật', cAudit: 'Ghi vào nhật ký thay đổi',
      blkOnlyLast: 'Chỉ mở lại được lượt cuối đã xác nhận', blkHasPoints: 'Lượt hiện tại đã có điểm — hoàn tác hết điểm của lượt này trước',
      reopened: 'Đã mở lại {u} · người chấm bấm vào ô {u} để sửa rồi xác nhận lại', setU: 'set', legU: 'lượt',
      fixAria: '{u}: đang sửa. Mở để sửa', fixBanner: 'Đang sửa {u} · mở lại bởi BTC',
      retReopened: 'Đã xóa bỏ cuộc và các kết quả xử thua · người chấm tiếp tục trận', shRetired: 'Đã ghi nhận bỏ cuộc', shRetiredSub: '{p} ({team}) bỏ cuộc vì chấn thương. Chỉ BTC mở lại được.', reopenRet: 'Mở lại bỏ cuộc',
      cRetireClr: 'Ghi nhận bỏ cuộc của {p} bị xoá, người chấm tiếp tục trận', cForfeitSets: 'Các set bị xử thua do bỏ cuộc cũng được xóa', cForfeitLegs: 'Kết quả xử thua do bỏ cuộc cũng được xóa',
      wlOn: 'Màn hình luôn sáng', wlOff: 'Không giữ được màn hình sáng — hãy tắt tự khóa',
    },
    en: {
      mock: 'MOCKUP', mockups: '← Mockups', liveIdx: 'Live', backMatch: 'Back to match', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark', theme: 'Theme',
      offlineOn: 'Network: off', offlineOff: 'Network: on', reset: '↺ Reset', pauseSim: 'Pause simulation', playSim: 'Run simulation',
      lang: 'Language',
      court: 'Court', set: 'Set', leg: 'Leg', milestone: 'milestone', live: 'LIVE', endsChip: 'Change of ends', medChip: 'Medical timeout', endedChip: 'Set finished', endedLeg: 'Leg finished', retiredChip: 'Retired',
      type_open: 'Open', type_low: 'Low', type_high: 'High',
      synced: 'Synced', pending: 'Waiting to send ({n})', offline: 'Offline', offlineQ: 'Offline · {n} queued',
      scorer: 'Scorer', menu: 'Menu', injury: 'Injury', takeover: 'Take over scoring', undo: 'Undo', lastPoint: 'Last point: {team}',
      noPoints: 'No points yet', plusAria: '+1 point for team {team}', plusLabel: 'Point for {team}', scoreAria: '{ta} {a}, {tb} {b}.',
      right: 'Right', left: 'Left', rightFull: 'right', leftFull: 'left', even: 'even', odd: 'odd',
      serve: 'Serve', receive: 'Receive', serveCap: 'Serving: {s} · {c} court (score {n} is {p})', recvCap: 'receiving: {r}',
      courtAria: 'Top view of the court. {l} on the left, {r} on the right. {s}',
      readOnly: 'View only', scoringBy: 'Being scored by {name}', scoringByHint: 'You are watching; you cannot enter points.',
      endsTitle: 'Change of ends', endsReached: '{team} reached {n} points', endsSub: 'The teams swap ends. Right/left courts stay the same.', cont: 'Continue', undoLast: 'Undo last point',
      endSetQ: 'End of set?', endLegQ: 'End of leg?', wonSet: '{team} win set {n}', wonLeg: '{team} reached {n}', confirm: 'Confirm', writes: 'Confirming writes the result to the match.',
      savedSet: 'Set {n} saved', nextSet: 'Next: set {n} · {type}', toSetup: 'Set up set {n}', startNow: 'Start now (demo)',
      savedLeg: 'Leg {n} saved', nextLeg: 'Next: leg {n}', toLegSetup: 'Leg change screen', matchDone: 'Match finished', matchDoneSub: 'The result is written to the match.', backToList: 'Back to list',
      medTitle: 'Medical timeout', medPick: 'Pick the injured player to start the clock', medLocked: 'Scoring is locked.', timeUp: 'Time is up', timeUpSub: 'Choose one: resume play or record a retirement.',
      cancel: 'Cancel', resume: 'Resume play', retire: 'Retire', skipTo0: 'Demo: skip to 0:00', injured: 'Injured player',
      retTitle: 'Confirm retirement', retSub: '{p} ({team}) cannot continue. Check every consequence before confirming.', retConfirm: 'Confirm retirement', back: 'Back',
      rCur: 'Set {n}: {a}–{b}, {team} lose the set (stored {sa}–{sb}).', rForfeit: 'Set {n}: {p} is in the lineup, {team} forfeit {sa}–{sb}.', rPlayed: 'Set {n}: {p} is not in the lineup, played normally.', rKept: 'Sets {a}–{b}: unchanged.',
      rLeg: 'Leg {n}: {a}–{b}, {team2} are credited {m}; {team} keep {k}.', rLater: 'Legs {a}–{b}: left empty.', rMatch: 'Match: {team} lose by retirement (injury); {team2} win.', rBadge: 'The public page shows “Retired (injury)” with {p}’s name.',
      retDone: 'Retirement recorded', retDoneSub: '{p} ({team}) retired with an injury. The result is written to the match.',
      takeTitle: 'Take over scoring for {code}?', takeBody: '{name} will switch to view-only on the next point or realtime message. Only one scorer at a time.', takeLog: 'This action is logged (who, when).',
      setupTitle: 'Set up set {n} · {type}', setupLegTitle: 'Leg change {n}/5', setupLeg1Title: 'Set up leg 1/5 · relay', stEnds: 'Ends', stServe: 'Serving team', stServer: 'Server', stReceiver: 'Receiver',
      endsPick: 'Choose ends (as seen from the scorer’s seat)', leftEnd: 'Left', rightEnd: 'Right', swap: 'Swap', next: 'Next', pickServe: 'Which team serves first?', pickServer: 'Who serves? ({team})', pickRecv: 'Who receives? ({team})',
      startPts: 'Start points', hcStart: 'starts on {n}', noHc: 'no handicap', startSet: 'Start set', startLeg: 'Start leg {n}', needMore: 'Complete the steps to start',
      exServer: 'Serve from the <b>{c}</b> court because {n} is {p}.', exRecv: 'Receiver <b>{r}</b> stands in the {c} court (diagonal to the server, same right/left label).', exNone: 'Pick the server to see the service court.',
      relayBanner: 'Change of ends', relayBannerSub: 'Leg {n}/5 · milestone {m} · cumulative {a}–{b}', fixedServe: 'Winner of the last rally serves first', hcServe: '{team} gives the handicap (starts on 0), so it serves first', newPairs: 'New pairs', cumul: 'Cumulative score',
      pHome: 'Home', pStand: 'Standings', pMatches: 'Schedule & results', pBracket: 'Knock-out',
      group: 'Group stage', round: 'Round', setsWon: 'Sets', liveNote: 'Live · updates in real time', liveNotePaused: 'Simulation paused',
      serving: 'serving', worm: 'Set {n} rally timeline', wormSub: 'Point lead after every rally', wormUp: '{team} ahead', hcStartLbl: '{team} start +{n}', endsLbl: 'Change of ends', rally: 'Rally',
      matchSets: 'Sets', pending2: 'Not played', livePair: 'in play', stateLive: 'Demo state', stLive: 'LIVE', stEnds: 'Ends', stMed: 'Medical', replay: 'Replay',
      medPublic: 'Medical timeout · {p}',
      editSetup: 'Edit setup', editTitle: 'Edit setup · set {n}', editLegTitle: 'Edit setup · leg {n}', editNote: 'The score stays at <b>{a}–{b}</b>; the app recomputes positions and servers.', saveSetup: 'Save setup',
      undoLockedSet: 'Previous set is confirmed — the organiser must reopen it', undoLockedLeg: 'Previous leg is confirmed — the organiser must reopen it',
      role: 'Role', roleReferee: 'Referee', roleBtc: 'Organiser (BTC)',
      editing: 'Editing', openSetAria: 'Set {n}: {score}, confirmed. Open details', openLegAria: 'Leg {n}: {score}, confirmed. Open details', editingAria: '{u}: being corrected',
      shConfirmed: '{U} confirmed', shBy: 'Confirmed by {name} · {time}', shRefereeMsg: '{U} is confirmed. Only the organiser can reopen it.', close: 'Close',
      reasonLbl: 'Reason for reopening (required)', reasonHint: 'The reason is written to the change log.', reopenBtn: 'Reopen {u}', reopenQ: 'Reopen {u}?',
      cSetCleared: 'The score of {u} is cleared until it is confirmed again', cMatchLive: 'The match goes back to In progress and the standings update', cAudit: 'Written to the change log',
      blkOnlyLast: 'Only the last confirmed leg can be reopened', blkHasPoints: 'The current leg already has points — undo all of its points first',
      reopened: '{u} reopened · the scorer taps the {u} cell to fix it and confirm again', setU: 'set', legU: 'leg',
      fixAria: '{u}: being corrected. Open to fix', fixBanner: 'Fixing {u} · reopened by the organiser',
      retReopened: 'Retirement and forfeit results cleared · the scorer continues the match', shRetired: 'Retirement recorded', shRetiredSub: '{p} ({team}) retired with an injury. Only the organiser can reopen it.', reopenRet: 'Reopen retirement',
      cRetireClr: 'The retirement of {p} is cleared and the scorer continues the match', cForfeitSets: 'Sets forfeited because of the retirement are cleared too', cForfeitLegs: 'The forfeit result caused by the retirement is cleared too',
      wlOn: 'Screen stays on', wlOff: 'Cannot keep the screen on — turn off auto-lock',
    },
  };
  const t = (k, v) => {
    let s = DICT[locale][k] ?? DICT.vi[k] ?? k;
    if (v) for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(b);
    return s;
  };

  // ---------- fake data ----------
  const TEAM_GROUP = {
    H: { name: 'Sấm Sét', color: '#E4572E', roster: ['Trần Minh Khang', 'Lê Gia Bảo', 'Phạm Hữu Phúc', 'Hoàng Thu Lan', 'Đỗ Công Long'] },
    A: { name: 'Lông Vũ Xanh', color: '#2E86AB', roster: ['Nguyễn Quốc Hưng', 'Võ Mỹ Vy', 'Đặng Văn Kiên', 'Bùi Ngọc Mai', 'Hồ Đức Tú'] },
  };
  // Relay pages show the final F of data.js (lineup_locked, Sân 1, 14:45): Gió Ngược vs Smash Bros, leg pairs = indexes [0,1] and [2,3].
  const TEAM_RELAY = {
    H: { name: 'Gió Ngược', color: '#2A9D8F', roster: ['Lê Thanh Thông', 'Ngô Khánh Nhàn', 'Vũ Ngọc Hạnh', 'Phan Văn Thông', 'Vũ Gia Tín'] },
    A: { name: 'Smash Bros', color: '#8B5CF6', roster: ['Nguyễn Hữu Luân', 'Hồ Bảo Vy', 'Phan Ngọc Diễm', 'Lý Bảo Diễm', 'Phan Thanh Tín'] },
  };
  const PAGE_Q = new URLSearchParams(location.search);
  const RELAY_MODE = document.body.dataset.screen === 'relay' || (['setup', 'viewer'].includes(document.body.dataset.screen) && PAGE_Q.get('mode') === 'relay');
  const TEAM = RELAY_MODE ? TEAM_RELAY : TEAM_GROUP;
  // Five sets, each with its own pairs (indexes into the rosters) and handicap start points.
  const SETS = [
    { type: 'open', hp: [0, 1], ap: [0, 1], start: { H: 0, A: 0 } },
    { type: 'low', hp: [2, 3], ap: [2, 3], start: { H: 0, A: 0 } },
    { type: 'open', hp: [0, 1], ap: [0, 1], start: { H: 0, A: 9 } },
    { type: 'high', hp: [2, 3], ap: [2, 3], start: { H: 3, A: 0 } },
    { type: 'open', hp: [0, 4], ap: [0, 4], start: { H: 0, A: 5 } },
  ];
  const FINISHED = [[31, 24], [27, 31], [31, 22], [29, 31]];
  const FINAL_SET5 = [31, 28]; // set 5 of V07 (only used to rebuild a reopened set 5)
  const MILESTONES = [25, 50, 75, 100, 125];
  const RELAY_LEG = { n: 2, start: { H: 25, A: 19 }, hp: [2, 3], ap: [2, 3] };
  // Leg 1 starts with the capped net relay handicap (spec §4.3): F has relayStart [0, 5], so the away team starts on 5.
  const RELAY_LEG1 = { n: 1, start: { H: 0, A: 5 }, hp: [0, 1], ap: [0, 1] };
  const SCORER = 'Bùi Thanh Sơn';
  const OTHER_SCORER = 'Võ Minh Tâm';
  const MED_MS = 5 * 60 * 1000;
  // Who confirmed each finished set / leg (fake audit data for the reopen sheet).
  const CONFIRMED = { set: [[SCORER, '13:42'], [SCORER, '14:05'], [OTHER_SCORER, '14:31'], [SCORER, '14:58']], leg: [[SCORER, '13:20']] };
  const letterEvents = (str) => String(str).split('').filter((c) => 'HAE'.includes(c)).map((c) => (c === 'E' ? { k: 'ends' } : { k: 'point', side: c }));
  // Rally list -> URL letters (H/A per point, E where the change of ends was confirmed); replay stays the single source of truth.
  const rallyLetters = (S) => S.rallies.map((r, i) => r.side + (S.endsDone && S.endsAt === i + 1 ? 'E' : '')).join('');
  const ROLES = ['referee', 'btc'];
  const roleParam = () => { const r = new URLSearchParams(location.search).get('role'); return ROLES.includes(r) ? r : null; };

  const nameOf = (ctx, side, k) => TEAM[side].roster[ctx.pairs[side][k]];

  function groupCtx(setNo, P) {
    const cfg = SETS[setNo - 1];
    const num = (v, d) => (v === null || v === '' || isNaN(+v) ? d : +v);
    return {
      relay: false, setNo, type: cfg.type, pairs: { H: cfg.hp, A: cfg.ap }, code: 'V07', court: 'Sân 2', finished: FINISHED.slice(0, setNo - 1),
      setup: {
        start: cfg.start, target: 31, changeEnds: true,
        // L1: with a handicap the side that starts at 0 serves first; only a 0–0 start takes the toss result.
        left: P.get('left') === 'A' ? 'A' : 'H',
        serving: cfg.start.H !== cfg.start.A ? (cfg.start.H < cfg.start.A ? 'H' : 'A') : P.get('serve') === 'H' ? 'H' : 'A', server: num(P.get('srv'), 0), receiver: num(P.get('rcv'), 1),
      },
    };
  }
  function relayCtx(P) {
    const num = (v, d) => (v === null || v === '' || isNaN(+v) ? d : +v);
    const L = P.get('leg') === '1' ? RELAY_LEG1 : RELAY_LEG;
    // Leg 1: the side that starts at 0 serves first (L1); later legs: the winner of the last rally (L4).
    const serving = L.n === 1 && L.start.H !== L.start.A ? (L.start.H < L.start.A ? 'H' : 'A') : P.get('serve') === 'A' ? 'A' : 'H';
    return {
      relay: true, leg: L.n, milestone: MILESTONES[L.n - 1], pairs: { H: L.hp, A: L.ap }, code: 'F', court: 'Sân 1', finished: L.n === 1 ? [] : [[25, 19]],
      setup: {
        start: L.start, target: MILESTONES[L.n - 1], changeEnds: false,
        left: P.get('left') === 'H' ? 'H' : L.n === 1 ? 'H' : 'A', serving, server: num(P.get('srv'), 0), receiver: num(P.get('rcv'), 0),
      },
    };
  }

  // ---------- service logic (spec-phase-2 §4): state = replay(setup, events) ----------
  // Pure: no DOM, no clock. pos[side] = [player in right court, player in left court] (indexes 0/1 into the pair).
  // Server stands in the court that matches the serving team's score (even right, odd left, handicap counts);
  // the receiver is the opponent in the same-labelled court (diagonal). Events: point, ends, timeout_start,
  // timeout_end, retire, end_confirmed, undo{of}. Invalid events (point after the end, point during a
  // timeout or before the change of ends is confirmed, ...) are skipped, like the server would reject them.
  function replay(setup, events) {
    const { start, target } = setup;
    const cancelled = new Set(events.filter((e) => e.k === 'undo').map((e) => e.of));
    const S = { score: { ...start }, serving: setup.serving, pos: { H: [0, 1], A: [0, 1] }, left: setup.left, endsDue: false, endsDone: false, endsAt: null, ended: false, winner: null, confirmed: false, timeout: null, retired: null, rallies: [] };
    const c0 = S.score[S.serving] % 2;
    const rs = other(S.serving);
    S.pos[S.serving][c0] = setup.server; S.pos[S.serving][1 - c0] = 1 - setup.server;
    S.pos[rs][c0] = setup.receiver; S.pos[rs][1 - c0] = 1 - setup.receiver;
    events.forEach((e, i) => {
      if (e.k === 'undo' || cancelled.has(i)) return;
      if (e.k === 'point') {
        if (S.ended || S.timeout || S.retired || S.endsDue) return;
        const w = e.side;
        S.score[w] += 1;
        if (w === S.serving) S.pos[w].reverse(); // serving side won: server and partner swap courts
        else S.serving = w; // receiving side won: nobody moves, serve passes
        S.rallies.push({ ev: i, side: w, H: S.score.H, A: S.score.A });
        if (S.score[w] >= target) { S.ended = true; S.winner = w; }
        else if (setup.changeEnds && !S.endsDone && start[w] === 0 && S.score[w] === (target + 1) / 2) { S.endsDue = true; S.endsAt = S.rallies.length; }
      } else if (e.k === 'ends') {
        if (S.endsDue) { S.left = other(S.left); S.endsDue = false; S.endsDone = true; }
      } else if (e.k === 'timeout_start') {
        if (!S.timeout && !S.retired) S.timeout = { player: e.player, at: e.at };
      } else if (e.k === 'timeout_end') {
        S.timeout = null;
      } else if (e.k === 'retire') {
        if (!S.retired) { S.retired = { player: e.player }; S.timeout = null; }
      } else if (e.k === 'end_confirmed') {
        if (S.ended) S.confirmed = true;
      }
    });
    const c = S.score[S.serving] % 2;
    const r = other(S.serving);
    S.server = { side: S.serving, k: S.pos[S.serving][c], court: c };
    S.receiver = { side: r, k: S.pos[r][c], court: c };
    return S;
  }

  // Deterministic fake rallies up to a target score (inserts the change-of-ends confirmation when due).
  function synth(setup, goal, events = [], seed = 11) {
    const ev = events.slice();
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    let st = replay(setup, ev);
    // The guard stops a goal the set or leg cannot reach (e.g. past its milestone) instead of looping forever.
    for (let guard = 0; (st.score.H < goal.H || st.score.A < goal.A) && guard < 400; guard++) {
      if (st.endsDue) ev.push({ k: 'ends' });
      else {
        const rh = goal.H - st.score.H, ra = goal.A - st.score.A;
        ev.push({ k: 'point', side: ra <= 0 ? 'H' : rh <= 0 ? 'A' : rnd() < rh / (rh + ra) ? 'H' : 'A' });
      }
      st = replay(setup, ev);
    }
    return ev;
  }

  // ---------- shared UI pieces ----------
  const SHUTTLE = '<svg class="lv-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="19.2" r="3" fill="currentColor"/><path d="M8.6 16.2 5.2 4.2h13.6l-3.4 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.2 4.2l1.5 11.4M14.8 4.2l-1.5 11.4M12 4.2v11.8" stroke="currentColor" stroke-width="1.2"/></svg>';
  const ICON_THEME = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const ICON_SWAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/></svg>';
  const ICON_UNDO = '<svg class="lv-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';
  const ICON_SUN = '<svg class="lv-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const ICON_LOCK = '<svg class="lv-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const ICON_DOTS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  const sw = (side) => `<span class="swatch" style="background:${TEAM[side].color}"></span>`;
  const themeLabel = () => ({ system: t('themeSystem'), light: t('themeLight'), dark: t('themeDark') })[theme];
  const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // Back to the A5 Scores step (entry flow): the card state that matches where the user came from.
  function backLink() {
    const st = { setup: 'ready', score: 'mine', relay: 'mine', viewer: 'other' }[document.body.dataset.screen];
    if (!st) return '';
    const code = RELAY_MODE ? 'F' : 'V07';
    return `<a href="admin-match.html?code=${code}&state=${st}${roleParam() ? `&role=${roleParam()}` : ''}">← ${t('backMatch')} ${code}</a>`;
  }
  function ribbon(extra = '') {
    return `<div class="lv-ribbon mock-ribbon">
      <b class="hidden sm:inline">${t('mock')}</b>
      <a href="../index.html">${t('mockups')}</a><a href="index.html">${t('liveIdx')}</a>${backLink()}
      <span class="grow"></span>${extra}
      <button class="lv-rb" id="rb-loc" aria-label="${t('lang')}">${locale === 'vi' ? 'EN' : 'VI'}</button>
      <button class="lv-rb" id="rb-theme" aria-label="${t('theme')}: ${themeLabel()}">${ICON_THEME}<span>${themeLabel()}</span></button>
    </div>`;
  }
  function bindRibbon(rerender) {
    $('#rb-loc').onclick = () => { locale = locale === 'vi' ? 'en' : 'vi'; store.set('abt.locale', locale); document.documentElement.lang = locale; rerender(); };
    $('#rb-theme').onclick = () => { theme = { system: 'light', light: 'dark', dark: 'system' }[theme]; store.set('abt.theme', theme); applyTheme(); rerender(); };
  }

  // Court (top view, horizontal). Right/left courts are from each team's own point of view:
  // the team on the left end faces right, so its right court is at the bottom; the team on the right end is the opposite.
  function courtMarkup(interactive) {
    const el = interactive ? 'button type="button"' : 'div';
    const end = interactive ? 'button' : 'div';
    const tags = ['H', 'A'].flatMap((s) => [0, 1].map((k) => `<${el} class="ptag" data-side="${s}" data-k="${k}" ${interactive ? `data-act="tag"` : 'aria-hidden="true"'} style="--tc:${TEAM[s].color}">${SHUTTLE}<span class="nm"></span></${end}>`)).join('');
    const lbls = ['H', 'A'].flatMap((s) => [0, 1].map((c) => `<span class="lbl" aria-hidden="true" data-side="${s}" data-court="${c}"></span>`)).join('');
    return `<div class="court" data-court>
      <div class="half hl"></div><div class="half hr"></div><div class="mid"></div><div class="net"></div>
      <i class="hlcell s" aria-hidden="true"></i><i class="hlcell r" aria-hidden="true"></i>
      <svg class="arrow off" aria-hidden="true"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 10 5 0 9z" fill="currentColor"/></marker></defs><line x1="0" y1="0" x2="0" y2="0" marker-end="url(#ah)"/></svg>
      ${lbls}${tags}</div>`;
  }
  const courtXY = (left, side, court) => {
    const isL = left === side;
    return { x: isL ? 25 : 75, y: isL ? (court === 0 ? 75 : 25) : (court === 0 ? 25 : 75) };
  };
  // v: { left, pos, server:{side,k,court}|null, receiver:{side,k|null,court}|null, pairs, injured?, pick? }
  function drawCourt(root, v) {
    root.style.setProperty('--cl', TEAM[v.left].color);
    root.style.setProperty('--cr', TEAM[other(v.left)].color);
    root.querySelectorAll('.ptag').forEach((el) => {
      const side = el.dataset.side, k = +el.dataset.k;
      const court = v.pos[side].indexOf(k);
      const p = courtXY(v.left, side, court);
      el.style.left = `${p.x}%`; el.style.top = `${p.y}%`;
      el.querySelector('.nm').textContent = TEAM[side].roster[v.pairs[side][k]];
      el.classList.toggle('srv', !!v.server && v.server.side === side && v.server.k === k);
      el.classList.toggle('rcv', !!v.receiver && v.receiver.side === side && v.receiver.k === k);
      el.classList.toggle('pick', !!v.pick && v.pick.side === side && v.pick.k === k);
      el.classList.toggle('inj', !!v.injured && v.injured.side === side && v.injured.k === k);
    });
    root.querySelectorAll('.lbl').forEach((el) => {
      const p = courtXY(v.left, el.dataset.side, +el.dataset.court);
      el.style.left = `${p.x - 22}%`; el.style.top = `${p.y - 24}%`;
      el.textContent = +el.dataset.court === 0 ? t('right') : t('left');
    });
    const place = (el, ref) => {
      if (!ref) { el.style.opacity = 0; return; }
      const p = courtXY(v.left, ref.side, ref.court);
      el.style.opacity = ''; el.style.left = `${p.x - 25}%`; el.style.top = `${p.y - 25}%`;
    };
    place(root.querySelector('.hlcell.s'), v.server);
    place(root.querySelector('.hlcell.r'), v.receiver);
    // Dashed arrow server -> receiver, hidden while the tags are sliding to their new courts.
    const arrow = root.querySelector('.arrow'), line = arrow.querySelector('line');
    const sig = JSON.stringify([v.left, v.pos, v.server, v.receiver && v.receiver.court]);
    if (v.server && v.receiver) {
      const a = courtXY(v.left, v.server.side, v.server.court), b = courtXY(v.left, v.receiver.side, v.receiver.court);
      const at = (tt) => [a.x + (b.x - a.x) * tt, a.y + (b.y - a.y) * tt];
      const [x1, y1] = at(0.3), [x2, y2] = at(0.7);
      const apply = () => { line.setAttribute('x1', `${x1}%`); line.setAttribute('y1', `${y1}%`); line.setAttribute('x2', `${x2}%`); line.setAttribute('y2', `${y2}%`); arrow.classList.remove('off'); };
      if (root._sig && root._sig !== sig) { arrow.classList.add('off'); clearTimeout(root._at); root._at = setTimeout(apply, 380); } else apply();
    } else arrow.classList.add('off');
    root._sig = sig;
  }
  const serviceText = (ctx, S) => {
    const srv = S.server, sc = S.score[srv.side];
    return t('serveCap', { s: `<b>${esc(nameOf(ctx, srv.side, srv.k))}</b>`, c: t(srv.court === 0 ? 'rightFull' : 'leftFull'), n: sc, p: t(sc % 2 ? 'odd' : 'even') })
      + ` <span class="sep">→</span> ${t('recvCap', { r: `<b>${esc(nameOf(ctx, S.receiver.side, S.receiver.k))}</b>` })}`;
  };
  const plain = (h) => h.replace(/<[^>]+>/g, '');

  // =====================================================================================
  // Scorer screens: score.html (kind 'score'), relay.html ('relay'), viewer.html ('viewer')
  // =====================================================================================
  function mountScorer(kind) {
    const P = new URLSearchParams(location.search);
    const demo = P.get('demo');
    const ro = kind === 'viewer';
    const relay = kind === 'relay' || (ro && RELAY_MODE);
    const fix = !ro && P.get('fix') === '1'; // opened from a reopened set / leg: rebuilt to its finished score, ended but not confirmed
    let ctx = relay ? relayCtx(P) : groupCtx(demo === 'nextset' ? 4 : +P.get('set') >= 1 && +P.get('set') <= 5 ? +P.get('set') : 3, P);
    let events = [];
    let role = roleParam() || (store.get('abt.role') === 'btc' ? 'btc' : 'referee'); // URL param wins over the stored role
    const reopened = new Set(); // mock outcome: finished sets / legs now marked "Đang sửa"
    const confirmedAt = {};
    let S;
    const ui = { sheet: null, reason: '', toast: '', ov: null, ovKey: '', menu: false, offline: false, pending: 0, paused: false, prev: null, flush: null, wl: null, lock: null };
    const scorerName = ro ? OTHER_SCORER : SCORER;
    const root = $('#app');
    const el = (sel) => $(sel, root);

    // initial / demo logs
    function seedLog() {
      const goal = relay ? { H: 31, A: 27 } : { H: 9, A: 16 };
      events = synth(ctx.setup, goal);
      if (ro) events = synth(ctx.setup, relay ? { H: 31, A: 27 } : { H: 12, A: 19 });
      const fin = relay ? { H: ctx.milestone - 1, A: 41 } : { H: 30, A: 27 };
      // Leg 1 of a relay is reached from its setup (admin-match → setup → here): it starts with no rally.
      if (fix) {
        // The winner's last point is pushed on top of the rebuilt rallies, like demo=end, so the end-of-set overlay shows with Undo available.
        const [fh, fa] = relay ? [25, 19] : FINISHED.concat([FINAL_SET5])[ctx.setNo - 1];
        const w = fh > fa ? 'H' : 'A';
        events = synth(ctx.setup, { H: w === 'H' ? fh - 1 : fh, A: w === 'A' ? fa - 1 : fa });
        events.push({ k: 'point', side: w });
      }
      else if (demo === 'fresh' || demo === 'nextset' || demo === 'legstart' || (relay && ctx.leg === 1 && !demo && P.get('r') === null) || (relay && demo === 'reopen' && !ro)) events = [];
      else if (P.get('r') !== null) events = letterEvents(P.get('r')); // coming back from "Sửa thiết lập": same rallies, new setup
      else if (demo === 'ends') { events = synth(ctx.setup, { H: 15, A: 20 }); events.push({ k: 'point', side: 'H' }); }
      else if (demo === 'end') { events = synth(ctx.setup, fin); events.push({ k: 'point', side: 'H' }); }
      else if (demo === 'timeout') { events = synth(ctx.setup, relay ? { H: 31, A: 27 } : { H: 14, A: 19 }); events.push({ k: 'timeout_start', player: { side: 'A', k: 0 }, at: Date.now() - 48000 }); }
      else if (demo === 'retire') {
        events = synth(ctx.setup, relay ? { H: 41, A: 33 } : { H: 22, A: 18 });
        events.push({ k: 'timeout_start', player: { side: 'A', k: 0 }, at: Date.now() - MED_MS - 1000 });
        // ?after=1: the retirement is already confirmed, so the BTC can try "Mở lại bỏ cuộc" (spec §4.5)
        if (P.get('after') === '1') events.push({ k: 'retire', player: { side: 'A', k: 0 } }); else ui.ov = 'retire';
      }
    }

    // ----- skeleton (rebuilt only on locale change) -----
    function build() {
      const mid = relay ? `${t('leg')} ${ctx.leg}/5 · ${t('milestone')} ${ctx.milestone}` : `${t('set')} ${ctx.setNo} · ${t('type_' + ctx.type)}`;
      const strip = relay ? `<div class="rl sc-pad" id="strip">${['H', 'A'].map((s) => `<div class="rl-row" style="--tc:${TEAM[s].color}">${sw(s)}<div class="relay" data-s="${s}"><span style="background:${TEAM[s].color};width:0"></span>${MILESTONES.slice(0, 4).map((m) => `<i class="tick" style="left:${(m / 125) * 100}%"></i>`).join('')}</div><b data-n="${s}">0</b></div>`).join('')}
        <div class="rl-ms" aria-hidden="true">${MILESTONES.map((m) => `<span data-m="${m}" style="left:${(m / 125) * 100}%">${m}</span>`).join('')}</div>
        <div class="strip lgs" role="list" aria-label="${t('leg')}">${[1, 2, 3, 4, 5].map((n) => `<div class="cell" role="listitem" data-n="${n}"><button type="button" class="cellbtn" data-act="sheet" data-n="${n}" disabled><i>${t('leg').toUpperCase()} ${n}</i><b></b></button></div>`).join('')}</div></div>`
        : `<div class="strip sc-pad" id="strip" role="list" aria-label="${t('set')}">${[1, 2, 3, 4, 5].map((n) => `<div class="cell" role="listitem" data-n="${n}"><button type="button" class="cellbtn" data-act="sheet" data-n="${n}" disabled><i>${t('set').toUpperCase()} ${n}</i><b></b></button></div>`).join('')}</div>`;
      const teamBlocks = ['H', 'A'].map((s) => `<section class="info i-${s}" data-info="${s}" style="--tc:${TEAM[s].color}">
          <div class="nm">${sw(s)}<span class="t">${esc(TEAM[s].name)}</span><span class="sh">${SHUTTLE}</span><span class="hc" data-hc="${s}" hidden></span></div>
          <div class="pl" data-pl="${s}"></div><div class="big" data-big="${s}" aria-hidden="true">0</div></section>`).join('');
      const buttons = ['H', 'A'].map((s) => `<div class="b-slot b-${s}" style="--tc:${TEAM[s].color}"><button class="plus" type="button" data-act="plus" data-side="${s}" aria-label="${esc(t('plusAria', { team: TEAM[s].name }))}">+1<small>${esc(t('plusLabel', { team: TEAM[s].name }))}</small></button></div>`).join('');
      root.innerHTML = `${ribbon(ro ? `<button class="lv-rb" id="rb-pause" aria-pressed="false">${t('pauseSim')}</button>` : `<button class="lv-rb" id="rb-role" aria-pressed="${role === 'btc'}" aria-label="${t('role')}: ${roleName()}">${t('role')}: ${roleName()}</button><button class="lv-rb" id="rb-net" aria-pressed="${ui.offline}">${ui.offline ? t('offlineOff') : t('offlineOn')}</button><button class="lv-rb" id="rb-reset">${t('reset')}</button>`)}
      <div class="sc ${ro ? 'ro' : ''}" id="sc" data-mode="${relay ? 'relay' : kind}">
        <header class="sc-top sc-pad">
          <div class="sc-code">${ctx.code}<small>${ctx.court}</small></div>
          <div class="sc-mid"><span class="sc-set" id="midlabel">${mid}</span><span class="chip chip-live" id="statechip">${t('live')}</span></div>
          ${ro ? '' : `<div class="sc-menu"><button class="iconbtn" id="menu-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${t('menu')}">${ICON_DOTS}</button>
            <div class="menu" id="menu" role="menu" hidden><button role="menuitem" data-act="edit-setup">${t('editSetup')}</button><button role="menuitem" class="warnrow" data-act="injury">${t('injury')}</button><a role="menuitem" href="viewer.html${relay ? '?mode=relay' : ''}">${t('takeover')}</a></div></div>`}
        </header>
        <div class="sc-status sc-pad"><span class="net net-ok" id="net" role="status"></span>${ro ? '' : `<span class="sc-wl" id="wl" role="status"></span>`}<span class="who">${t('scorer')}: ${esc(scorerName)}</span></div>
        ${fix ? `<div class="fix-banner sc-pad" role="note">${t('fixBanner', { u: unitOf(relay ? ctx.leg : ctx.setNo) })}</div>` : ''}
        ${strip}
        ${ro ? `<div class="vw-banner sc-pad"><span class="chip">${t('readOnly')}</span><div class="txt"><b>${t('scoringBy', { name: esc(OTHER_SCORER) })}</b><br><span class="text-muted">${t('scoringByHint')}</span></div><button class="btn btn-primary btn-sm" data-act="take-open" type="button">${t('takeover')}</button></div>` : ''}
        <main class="sc-main" id="main" data-left="${ctx.setup.left}">
          ${teamBlocks}
          <div class="court-wrap">${courtMarkup(false)}<p class="cap" id="cap"></p></div>
          ${buttons}
        </main>
        <footer class="sc-foot sc-pad"><button class="btn undo" type="button" data-act="undo" id="undo" aria-describedby="last">${ICON_UNDO}${t('undo')}</button><span class="last" id="last"></span></footer>
        <div class="sr-only-lv" id="live-region" aria-live="polite" aria-atomic="true"></div>
        <div class="toast" id="toast" role="status" hidden></div>
        <div id="ovroot"></div>
      </div>`;
      bindRibbon(() => { ui.ovKey = ''; build(); bind(); update(); });
    }
    const roleName = () => t(role === 'btc' ? 'roleBtc' : 'roleReferee');
    const unitOf = (n) => `${t(relay ? 'legU' : 'setU')} ${n}`;
    const cap1 = (x) => x.charAt(0).toUpperCase() + x.slice(1);

    // ----- state -> DOM -----
    function update() {
      S = replay(ctx.setup, events);
      const main = el('#main');
      main.dataset.left = S.left;
      const frozen = S.ended || S.timeout || S.retired || S.endsDue || ro;
      ['H', 'A'].forEach((s) => {
        const big = el(`[data-big="${s}"]`);
        if (ui.prev && ui.prev[s] !== S.score[s]) { big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); }
        big.textContent = S.score[s];
        el(`[data-info="${s}"]`).classList.toggle('serving', S.serving === s);
        el(`[data-pl="${s}"]`).textContent = ctx.pairs[s].map((i) => given(TEAM[s].roster[i])).join(' · ');
        const hc = el(`[data-hc="${s}"]`), st = ctx.setup.start[s];
        hc.hidden = !(st > 0); hc.textContent = relay ? '' : `+${st}`;
        hc.title = t('hcStart', { n: st });
        el(`.plus[data-side="${s}"]`).disabled = frozen;
      });
      ui.prev = { ...S.score };
      const court = el('[data-court]');
      drawCourt(court, { left: S.left, pos: S.pos, server: S.server, receiver: S.receiver, pairs: ctx.pairs, injured: S.retired ? S.retired.player : null });
      const svc = serviceText(ctx, S);
      el('#cap').innerHTML = svc;
      court.setAttribute('role', 'img');
      court.setAttribute('aria-label', t('courtAria', { l: TEAM[S.left].name, r: TEAM[other(S.left)].name, s: plain(svc) }));
      // strip / progress
      if (relay) {
        ['H', 'A'].forEach((s) => { el(`.relay[data-s="${s}"] > span`).style.width = `${(S.score[s] / 125) * 100}%`; el(`[data-n="${s}"]`).textContent = S.score[s]; });
        root.querySelectorAll('.rl-ms span').forEach((m) => m.classList.toggle('on', +m.dataset.m === ctx.milestone));
      }
      // finished sets / legs are buttons (they open the correction sheet); reopened ones show "Đang sửa"
      const curNo = relay ? ctx.leg : ctx.setNo;
      root.querySelectorAll('#strip .cell').forEach((c) => {
        const n = +c.dataset.n, b = c.querySelector('b'), btn = c.querySelector('button');
        c.className = 'cell'; c.removeAttribute('aria-current'); btn.removeAttribute('aria-label'); btn.disabled = true;
        if (n < curNo || (n === curNo && S.confirmed)) {
          const [h, a] = n < curNo ? ctx.finished[n - 1] : [S.score.H, S.score.A];
          c.classList.add('done'); c.style.setProperty('--wc', TEAM[h > a ? 'H' : 'A'].color);
          btn.dataset.act = 'sheet';
          if (reopened.has(n)) { b.textContent = t('editing'); c.classList.add('edit'); btn.disabled = false; btn.dataset.act = 'fix'; btn.setAttribute('aria-label', t('fixAria', { u: cap1(unitOf(n)) })); }
          else { b.textContent = `${h}–${a}`; btn.disabled = false; btn.setAttribute('aria-label', t(relay ? 'openLegAria' : 'openSetAria', { n, score: `${h}–${a}` })); }
        }
        else if (n === curNo) { b.textContent = `${S.score.H}–${S.score.A}`; c.classList.add('cur'); c.setAttribute('aria-current', 'true'); }
        else { b.textContent = '–'; c.classList.add('pend'); }
      });
      // state chip
      const chip = el('#statechip');
      const st = S.retired ? ['chip-loss', t('retiredChip')] : S.timeout ? ['chip-warn', t('medChip')] : S.endsDue ? ['chip-accent', t('endsChip')] : S.ended ? ['chip-win', relay ? t('endedLeg') : t('endedChip')] : ['chip-live', t('live')];
      chip.className = `chip ${st[0]}`; chip.textContent = st[1];
      // undo + last point
      const lastR = S.rallies[S.rallies.length - 1];
      el('#undo').disabled = !lastR || S.confirmed || !!S.retired || !!S.timeout;
      // L10: undo never crosses an end_confirmed. With no point in this set / leg, the previous one is locked until the BTC reopens it.
      const locked = !lastR && (relay ? ctx.leg > 1 : ctx.setNo > 1);
      const lastEl = el('#last');
      lastEl.classList.toggle('lock', locked);
      lastEl.textContent = lastR ? `${t('lastPoint', { team: TEAM[lastR.side].name })} · #${S.rallies.length}` : locked ? t(relay ? 'undoLockedLeg' : 'undoLockedSet') : t('noPoints');
      el('#live-region').textContent = `${t('scoreAria', { ta: TEAM[S.left].name, a: S.score[S.left], tb: TEAM[other(S.left)].name, b: S.score[other(S.left)] })} ${plain(svc)}`;
      renderNet(); renderWl();
      syncOverlay();
    }

    function renderWl() {
      const w = el('#wl');
      if (!w) return;
      const on = ui.wl === 'on';
      w.className = `sc-wl ${on ? 'on' : 'off'}`;
      w.innerHTML = ui.wl ? `${on ? ICON_SUN : ICON_LOCK}<span>${t(on ? 'wlOn' : 'wlOff')}</span>` : '';
    }
    // Screen Wake Lock: released by the browser whenever the tab hides, so it is requested again when the page is visible.
    function acquireWl() {
      if (ro) return;
      if (!(navigator.wakeLock && navigator.wakeLock.request)) { ui.wl = 'off'; renderWl(); return; }
      navigator.wakeLock.request('screen').then((l) => {
        ui.lock = l; ui.wl = 'on'; renderWl();
        l.addEventListener('release', () => { if (ui.lock === l) { ui.wl = 'off'; renderWl(); } });
      }, () => { ui.wl = 'off'; renderWl(); });
    }
    function renderNet() {
      const n = el('#net');
      if (!n) return;
      if (ui.offline) { n.className = 'net net-off'; n.textContent = ui.pending ? t('offlineQ', { n: ui.pending }) : t('offline'); }
      else if (ui.pending) { n.className = 'net net-pend'; n.textContent = t('pending', { n: ui.pending }); }
      else { n.className = 'net net-ok'; n.textContent = t('synced'); }
    }
    // Mock sync: online points are acknowledged after a moment; offline points queue until the network is back.
    function queuePoint() {
      ui.pending += 1;
      if (!ui.offline) setTimeout(() => { if (!ui.offline) { ui.pending = Math.max(0, ui.pending - 1); renderNet(); } }, 700);
      renderNet();
    }
    function setOffline(v) {
      ui.offline = v;
      const b = $('#rb-net'); if (b) { b.setAttribute('aria-pressed', String(v)); b.textContent = v ? t('offlineOff') : t('offlineOn'); }
      clearInterval(ui.flush);
      if (!v && ui.pending) ui.flush = setInterval(() => { ui.pending -= 1; renderNet(); if (ui.pending <= 0) { ui.pending = 0; clearInterval(ui.flush); renderNet(); } }, 450);
      renderNet();
    }

    // ----- actions -----
    function point(side) {
      if (ro || S.ended || S.timeout || S.retired || S.endsDue) return;
      events.push({ k: 'point', side });
      const btn = el(`.plus[data-side="${side}"]`);
      btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
      queuePoint();
      update();
    }
    function undo() {
      const r = S.rallies[S.rallies.length - 1];
      if (!r || S.confirmed || S.retired || S.timeout) return;
      events.push({ k: 'undo', of: r.ev });
      update();
    }
    function wantedOverlay() {
      if (ui.sheet) return `sheet:${ui.sheet}`;
      if (ui.ov === 'takeover') return 'takeover';
      if (ro) return null;
      if (S.retired) return 'retired';
      if (ui.ov === 'retire') return 'retire';
      if (S.timeout || ui.ov === 'timeout') return `timeout:${S.timeout ? S.timeout.player.side + S.timeout.player.k : ''}`;
      if (S.confirmed) return 'next';
      if (S.endsDue) return 'ends';
      if (S.ended) return 'end';
      return null;
    }
    function syncOverlay() {
      const key = wantedOverlay();
      if (key === ui.ovKey) { if (key && key.startsWith('timeout')) tick(); return; }
      ui.ovKey = key;
      const host = el('#ovroot');
      if (!key) { host.innerHTML = ''; el('#sc').removeAttribute('aria-hidden'); return; }
      const kindOv = key.split(':')[0];
      host.innerHTML = `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="ov-h">${overlayBody(kindOv)}</div>`;
      const first = host.querySelector('[data-focus]') || host.querySelector('button, a');
      if (first) first.focus({ preventScroll: true });
      if (kindOv === 'timeout') tick();
    }
    const finalLine = () => {
      const h = S.score.H, a = S.score.A;
      return `<div class="bigscore"><span style="color:${S.winner === 'H' ? TEAM.H.color : ''}" class="${S.winner === 'H' ? '' : 'lose'}">${h}</span><span class="dash">–</span><span style="color:${S.winner === 'A' ? TEAM.A.color : ''}" class="${S.winner === 'A' ? '' : 'lose'}">${a}</span></div>`;
    };
    function overlayBody(k) {
      if (k === 'ends') {
        const r = S.rallies[S.rallies.length - 1];
        const L = S.left, R = other(L);
        return `<div class="ov-card bare"><div class="eyebrow">${t('endsReached', { team: esc(TEAM[r.side].name), n: r[r.side] })}</div>
          <h2 id="ov-h" class="ov-title huge">${t('endsTitle')}</h2>
          <div class="swapviz"><div class="tm" style="--tc:${TEAM[L].color}">${sw(L)}<span>${esc(TEAM[L].name)}</span></div>${ICON_SWAP}<div class="tm" style="--tc:${TEAM[R].color}">${sw(R)}<span>${esc(TEAM[R].name)}</span></div></div>
          <p class="ov-sub">${t('endsSub')}</p>
          <div class="ov-actions"><button class="btn btn-primary btn-xl" data-act="ends" data-focus type="button">${t('cont')}</button><button class="linkbtn" data-act="undo" type="button">${t('undoLast')}</button></div></div>`;
      }
      if (k === 'end') {
        const w = S.winner;
        return `<div class="ov-card bare"><div class="eyebrow">${relay ? `${t('leg')} ${ctx.leg}/5 · ${t('milestone')} ${ctx.milestone}` : `${t('set')} ${ctx.setNo} · ${t('type_' + ctx.type)}`}</div>
          <h2 id="ov-h" class="ov-title">${relay ? t('endLegQ') : t('endSetQ')}</h2>${finalLine()}
          <div class="winline">${sw(w)}${esc(relay ? t('wonLeg', { team: TEAM[w].name, n: ctx.milestone }) : t('wonSet', { team: TEAM[w].name, n: ctx.setNo }))}</div>
          <p class="ov-sub">${t('writes')}</p>
          <div class="ov-actions"><button class="btn btn-primary btn-xl" data-act="confirm-end" data-focus type="button">${t('confirm')}</button><button class="btn btn-lg" data-act="undo" type="button">${ICON_UNDO}${t('undoLast')}</button></div></div>`;
      }
      if (k === 'next') {
        const last = relay ? ctx.leg === 5 : ctx.setNo === 5;
        if (last) return `<div class="ov-card"><h2 id="ov-h" class="ov-title">${t('matchDone')}</h2>${finalLine()}<p class="ov-sub">${t('matchDoneSub')}</p><div class="ov-actions"><a class="btn btn-primary btn-xl" data-focus href="admin-matches.html">${t('backToList')}</a></div></div>`;
        if (relay) return `<div class="ov-card"><div class="eyebrow">${t('savedLeg', { n: ctx.leg })}</div><h2 id="ov-h" class="ov-title">${S.score.H}–${S.score.A}</h2><p class="ov-sub">${t('nextLeg', { n: ctx.leg + 1 })}</p><div class="ov-actions"><a class="btn btn-primary btn-xl" data-focus href="setup.html?mode=relay">${t('toLegSetup')}</a></div></div>`;
        return `<div class="ov-card"><div class="eyebrow">${t('savedSet', { n: ctx.setNo })}</div><h2 id="ov-h" class="ov-title">${S.score.H}–${S.score.A}</h2>
          <p class="ov-sub">${t('nextSet', { n: ctx.setNo + 1, type: t('type_' + SETS[ctx.setNo].type) })}</p>
          <div class="ov-actions"><a class="btn btn-primary btn-xl" data-focus href="setup.html?set=${ctx.setNo + 1}">${t('toSetup', { n: ctx.setNo + 1 })}</a><button class="btn btn-lg" data-act="next-now" type="button">${t('startNow')}</button></div></div>`;
      }
      if (k === 'timeout') {
        const p = S.timeout && S.timeout.player;
        const chips = ['H', 'A'].flatMap((s) => [0, 1].map((i) => `<button class="pchip" type="button" data-act="pick" data-side="${s}" data-k="${i}" style="--tc:${TEAM[s].color}" aria-pressed="${!!p && p.side === s && p.k === i}" ${p ? 'disabled' : ''}>${esc(nameOf(ctx, s, i))}<small>${esc(TEAM[s].name)}</small></button>`)).join('');
        return `<div class="ov-card"><div class="eyebrow">${t('injured')}</div><h2 id="ov-h" class="ov-title">${t('medTitle')}</h2>
          <div class="chips4" role="group" aria-label="${t('injured')}">${chips}</div>
          <div class="clock ${p ? '' : 'idle'}" id="clock" role="timer" aria-live="off">${mmss(MED_MS)}</div>
          <div class="tbar" aria-hidden="true"><i id="tbar" style="width:100%"></i></div>
          <p class="ov-sub" id="tsub">${p ? t('medLocked') : t('medPick')}</p>
          <div class="ov-actions"><button class="btn btn-primary btn-xl" data-act="tcontinue" data-focus type="button" ${p ? '' : 'disabled'}>${t('resume')}</button>
            <button class="btn btn-lg btn-danger" data-act="tretire" type="button" ${p ? '' : 'disabled'}>${t('retire')}</button>
            ${p ? `<button class="linkbtn mockhint" data-act="skip" type="button">${t('skipTo0')}</button>` : `<button class="linkbtn" data-act="tcancel" type="button">${t('cancel')}</button>`}</div></div>`;
      }
      if (k === 'sheet') return sheetBody(ui.sheet);
      if (k === 'retire') return retireBody(false);
      if (k === 'retired') return retireBody(true);
      if (k === 'takeover') {
        return `<div class="ov-card"><h2 id="ov-h" class="ov-title" style="font-size:clamp(30px,9vw,44px)">${t('takeTitle', { code: ctx.code })}</h2>
          <p class="ov-sub" style="font-size:15px">${t('takeBody', { name: esc(OTHER_SCORER) })}</p><p class="ov-sub">${t('takeLog')}</p>
          <div class="ov-actions"><a class="btn btn-primary btn-xl" data-focus href="${relay ? 'relay' : 'score'}.html${roleParam() ? `?role=${roleParam()}` : ''}">${t('takeover')}</a><button class="btn btn-lg" data-act="take-close" type="button">${t('cancel')}</button></div></div>`;
      }
      return '';
    }
    // Confirmed set / leg: read-only for the referee, reopen form for the BTC (spec §4.5). Relay legs are cumulative, so only
    // the last confirmed leg can be reopened and only while the current leg has no point.
    function retireSheet() {
      const inj = S.retired.player, pl = nameOf(ctx, inj.side, inj.k), tm = TEAM[inj.side].name;
      const li = (cls, ic, txt) => `<li class="${cls}"><span class="ic" aria-hidden="true">${ic}</span><span>${txt}</span></li>`;
      return `<div class="ov-card" data-sheet="retire"><div class="eyebrow">${relay ? `${t('leg')} ${ctx.leg}/5` : `${t('set')} ${ctx.setNo} · ${t('type_' + ctx.type)}`}</div><h2 id="ov-h" class="ov-title sm">${t('shRetired')}</h2><p class="ov-sub">${t('shRetiredSub', { p: esc(pl), team: esc(tm) })}</p>
        <div class="sheet-form"><label class="eyebrow" for="reason">${t('reasonLbl')}</label>
        <textarea id="reason" class="input" rows="3" required aria-describedby="reason-h" data-focus>${esc(ui.reason)}</textarea><p class="sheet-hint" id="reason-h">${t('reasonHint')}</p></div>
        <ul class="conseq">${li('bad', '✕', t('cRetireClr', { p: esc(pl) }))}${li('bad', '✕', t(relay ? 'cForfeitLegs' : 'cForfeitSets'))}${li('neu', 'i', t('cMatchLive'))}${li('neu', 'i', t('cAudit'))}</ul>
        <div class="ov-actions"><button class="btn btn-loss btn-xl" data-act="reopen" type="button" ${ui.reason.trim() ? '' : 'disabled'}>${t('reopenRet')}</button><button class="btn btn-lg" data-act="sheet-close" type="button">${t('close')}</button></div></div>`;
    }
    function sheetBody(n) {
      if (n === 'retire') return retireSheet();
      const [h, a] = n < (relay ? ctx.leg : ctx.setNo) ? ctx.finished[n - 1] : [S.score.H, S.score.A];
      const w = h > a ? 'H' : 'A';
      const u = unitOf(n);
      const who = confirmedAt[n] || (CONFIRMED[relay ? 'leg' : 'set'][n - 1] || [SCORER, '14:00']);
      const eyebrow = relay ? `${t('leg')} ${n}/5 · ${t('milestone')} ${MILESTONES[n - 1]}` : `${t('set')} ${n} · ${t('type_' + SETS[n - 1].type)}`;
      const score = `<div class="bigscore sm"><span class="${w === 'H' ? '' : 'lose'}" style="color:${w === 'H' ? TEAM.H.color : ''}">${h}</span><span class="dash">–</span><span class="${w === 'A' ? '' : 'lose'}" style="color:${w === 'A' ? TEAM.A.color : ''}">${a}</span></div>`;
      const head = `<div class="eyebrow">${eyebrow}</div><h2 id="ov-h" class="ov-title sm">${t('shConfirmed', { U: cap1(u) })}</h2>${score}<p class="ov-sub">${t('shBy', { name: esc(who[0]), time: who[1] })}</p>`;
      const closeBtn = (focus) => `<button class="btn btn-lg" data-act="sheet-close" ${focus ? 'data-focus' : ''} type="button">${t('close')}</button>`;
      if (role !== 'btc') return `<div class="ov-card" data-sheet="ref">${head}<p class="sheet-msg">${t('shRefereeMsg', { U: cap1(u) })}</p><div class="ov-actions">${closeBtn(true)}</div></div>`;
      const lastConf = ctx.finished.length;
      const blocked = relay ? (n !== lastConf ? 'blkOnlyLast' : !S.confirmed && S.rallies.length > 0 ? 'blkHasPoints' : null) : null;
      if (blocked) return `<div class="ov-card" data-sheet="blocked">${head}<ul class="conseq"><li class="bad"><span class="ic" aria-hidden="true">✕</span><span>${t(blocked)}</span></li></ul><div class="ov-actions">${closeBtn(true)}</div></div>`;
      const li = (cls, ic, txt) => `<li class="${cls}"><span class="ic" aria-hidden="true">${ic}</span><span>${txt}</span></li>`;
      return `<div class="ov-card" data-sheet="btc">${head}
        <div class="sheet-form"><label class="eyebrow" for="reason">${t('reasonLbl')}</label>
        <textarea id="reason" class="input" rows="3" required aria-describedby="reason-h" data-focus>${esc(ui.reason)}</textarea><p class="sheet-hint" id="reason-h">${t('reasonHint')}</p></div>
        <ul class="conseq">${li('bad', '✕', t('cSetCleared', { u }))}${li('neu', 'i', t('cMatchLive'))}${li('neu', 'i', t('cAudit'))}</ul>
        <div class="ov-actions"><button class="btn btn-loss btn-xl" data-act="reopen" type="button" ${ui.reason.trim() ? '' : 'disabled'}>${t('reopenBtn', { u })}</button>${closeBtn(false)}</div></div>`;
    }
    function closeSheet() {
      const n = ui.sheet; ui.sheet = null; ui.reason = ''; update();
      const b = n && root.querySelector(`#strip [data-act="sheet"][data-n="${n}"]`);
      if (b && !b.disabled) b.focus({ preventScroll: true });
    }
    let toastT = null;
    function toast(msg) {
      const tt = el('#toast'); tt.textContent = msg; tt.hidden = false;
      clearTimeout(toastT); toastT = setTimeout(() => { tt.hidden = true; }, 5000);
    }
    // Tapping a reopened cell: the set / leg is rebuilt at its finished score, ended but not confirmed again.
    function fixUrl(n) {
      const q = new URLSearchParams();
      if (relay) q.set('leg', n); else q.set('set', n);
      q.set('fix', '1');
      if (roleParam()) q.set('role', roleParam());
      return `${relay ? 'relay' : 'score'}.html?${q}`;
    }
    // "Sửa thiết lập": go to the setup screen with the current choices and the rally list; saving comes back with the same rallies.
    function editSetupUrl() {
      const q = new URLSearchParams();
      if (relay) q.set('mode', 'relay'); else q.set('set', ctx.setNo);
      q.set('edit', '1'); q.set('left', ctx.setup.left); q.set('serve', ctx.setup.serving); q.set('srv', ctx.setup.server); q.set('rcv', ctx.setup.receiver); q.set('r', rallyLetters(S));
      if (roleParam()) q.set('role', roleParam());
      return `setup.html?${q}`;
    }
    // Retirement consequences (spec-phase-2 §6, L8/L9)
    function retireBody(done) {
      const inj = S.retired ? S.retired.player : S.timeout.player;
      const pl = nameOf(ctx, inj.side, inj.k), idx = ctx.pairs[inj.side][inj.k];
      const tm = TEAM[inj.side].name, opp = other(inj.side), tm2 = TEAM[opp].name;
      const li = (cls, ic, txt) => `<li class="${cls}"><span class="ic" aria-hidden="true">${ic}</span><span>${txt}</span></li>`;
      let rows = '';
      if (relay) {
        const m = MILESTONES[4];
        const k = S.score[inj.side];
        rows += li('bad', '✕', t('rLeg', { n: ctx.leg, a: S.score.H, b: S.score.A, team: `<b>${esc(tm)}</b>`, team2: `<b>${esc(tm2)}</b>`, m, k }));
        rows += li('neu', '–', t('rLater', { a: ctx.leg + 1, b: 5 }));
        rows += li('bad', '✕', t('rMatch', { team: `<b>${esc(tm)}</b>`, team2: `<b>${esc(tm2)}</b>` }));
      } else {
        if (ctx.setNo > 1) rows += li('neu', '=', t('rKept', { a: 1, b: ctx.setNo - 1 }));
        const stored = inj.side === 'H' ? [S.score.H, 31] : [31, S.score.A];
        rows += li('bad', '✕', t('rCur', { n: ctx.setNo, a: S.score.H, b: S.score.A, team: `<b>${esc(tm)}</b>`, sa: stored[0], sb: stored[1] }));
        for (let n = ctx.setNo + 1; n <= 5; n++) {
          const cfg = SETS[n - 1];
          const inSet = cfg[inj.side === 'H' ? 'hp' : 'ap'].includes(idx);
          rows += inSet
            ? li('bad', '✕', t('rForfeit', { n, p: `<b>${esc(pl)}</b>`, team: `<b>${esc(tm)}</b>`, sa: inj.side === 'H' ? 0 : 31, sb: inj.side === 'H' ? 31 : 0 }))
            : li('ok', '✓', t('rPlayed', { n, p: `<b>${esc(pl)}</b>` }));
        }
      }
      rows += li('neu', 'i', t('rBadge', { p: `<b>${esc(pl)}</b>` }));
      if (done) {
        return `<div class="ov-card"><div class="eyebrow">${t('retiredChip')}</div><h2 id="ov-h" class="ov-title">${t('retDone')}</h2><p class="ov-sub">${t('retDoneSub', { p: esc(pl), team: esc(tm) })}</p><ul class="conseq">${rows}</ul>
          <div class="ov-actions"><a class="btn btn-primary btn-xl" data-focus href="admin-matches.html">${t('backToList')}</a>${role === 'btc' ? `<button class="btn btn-lg" data-act="retire-reopen" type="button">${t('reopenRet')}</button>` : ''}</div></div>`;
      }
      return `<div class="ov-card"><div class="eyebrow">${t('injury')}</div><h2 id="ov-h" class="ov-title">${t('retTitle')}</h2><p class="ov-sub">${t('retSub', { p: esc(pl), team: esc(tm) })}</p><ul class="conseq">${rows}</ul>
        <div class="ov-actions"><button class="btn btn-loss btn-xl" data-act="rconfirm" data-focus type="button">${t('retConfirm')}</button><button class="btn btn-lg" data-act="rback" type="button">${t('back')}</button></div></div>`;
    }
    // live countdown, only touches the clock text so focus is never lost
    function tick() {
      const c = el('#clock');
      if (!c || !S.timeout) return;
      const left = Math.max(0, MED_MS - (Date.now() - S.timeout.at));
      c.textContent = left > 0 ? mmss(left) : '0:00';
      c.classList.toggle('done', left === 0);
      el('#tbar').style.width = `${(left / MED_MS) * 100}%`;
      el('#tsub').textContent = left === 0 ? `${t('timeUp')}. ${t('timeUpSub')}` : t('medLocked');
      if (left === 0) { const h = el('#ov-h'); h.textContent = t('timeUp'); }
    }

    // ----- events -----
    function bind() {
      root.onclick = (e) => {
        const b = e.target.closest('[data-act]');
        const menu = el('#menu');
        if (menu && !e.target.closest('.sc-menu')) { menu.hidden = true; el('#menu-btn').setAttribute('aria-expanded', 'false'); }
        if (e.target.closest('#menu-btn')) { menu.hidden = !menu.hidden; el('#menu-btn').setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (!b) return;
        const act = b.dataset.act;
        if (menu) menu.hidden = true;
        if (act === 'plus') point(b.dataset.side);
        else if (act === 'undo') undo();
        else if (act === 'edit-setup') location.href = editSetupUrl();
        else if (act === 'sheet') { ui.sheet = +b.dataset.n; ui.reason = ''; update(); }
        else if (act === 'fix') location.href = fixUrl(+b.dataset.n);
        else if (act === 'retire-reopen') { ui.sheet = 'retire'; ui.reason = ''; update(); }
        else if (act === 'sheet-close') closeSheet();
        else if (act === 'reopen') {
          if (!ui.reason.trim()) return;
          const n = ui.sheet;
          if (n === 'retire') {
            // the retirement and the forfeits it caused are cleared (spec §4.5): back to play in the current set / leg
            events = events.filter((x) => x.k !== 'retire'); events.push({ k: 'timeout_end' }); ui.ov = null; ui.ovKey = '';
            closeSheet(); toast(t('retReopened'));
            return;
          }
          reopened.add(n); closeSheet(); toast(t('reopened', { u: unitOf(n) }));
        }
        else if (act === 'injury') { ui.ov = 'timeout'; update(); }
        else if (act === 'pick') { events.push({ k: 'timeout_start', player: { side: b.dataset.side, k: +b.dataset.k }, at: Date.now() }); ui.ovKey = ''; update(); }
        else if (act === 'tcancel') { ui.ov = null; update(); }
        else if (act === 'tcontinue') { events.push({ k: 'timeout_end' }); ui.ov = null; update(); }
        else if (act === 'tretire') { ui.ov = 'retire'; update(); }
        else if (act === 'rback') { ui.ov = S.timeout ? 'timeout' : null; update(); }
        else if (act === 'rconfirm') { events.push({ k: 'retire', player: S.timeout.player }); ui.ov = null; update(); }
        else if (act === 'skip') { const i = events.map((x) => x.k).lastIndexOf('timeout_start'); events[i].at = Date.now() - MED_MS; ui.ovKey = ''; update(); }
        else if (act === 'ends') { events.push({ k: 'ends' }); update(); }
        else if (act === 'confirm-end') { events.push({ k: 'end_confirmed' }); confirmedAt[relay ? ctx.leg : ctx.setNo] = [SCORER, new Date().toTimeString().slice(0, 5)]; ctx.finished = ctx.finished.concat([[S.score.H, S.score.A]]); update(); }
        else if (act === 'next-now') startNextSet();
        else if (act === 'take-open') { ui.ov = 'takeover'; update(); }
        else if (act === 'take-close') { ui.ov = null; update(); }
      };
      root.oninput = (e) => {
        if (e.target.id !== 'reason') return;
        ui.reason = e.target.value;
        const rb = root.querySelector('[data-act="reopen"]'); if (rb) rb.disabled = !ui.reason.trim();
      };
      const rr = $('#rb-role'); if (rr) rr.onclick = () => { role = role === 'btc' ? 'referee' : 'btc'; store.set('abt.role', role); ui.ovKey = ''; build(); bind(); update(); };
      document.onkeydown = (e) => { if (e.key === 'Escape' && ui.sheet) { closeSheet(); return; } if (e.key === 'Escape') { const m = el('#menu'); if (m && !m.hidden) { m.hidden = true; el('#menu-btn').focus(); } } };
      const net = $('#rb-net'); if (net) net.onclick = () => setOffline(!ui.offline);
      const rs = $('#rb-reset'); if (rs) rs.onclick = () => { events = []; ui.ov = null; ui.prev = null; ui.pending = 0; setOffline(false); update(); };
      const ps = $('#rb-pause'); if (ps) ps.onclick = () => { ui.paused = !ui.paused; ps.setAttribute('aria-pressed', String(ui.paused)); ps.textContent = ui.paused ? t('playSim') : t('pauseSim'); };
    }
    // In-page shortcut to the next set: confirmed sets stay in the strip, the new set starts with the default setup.
    function startNextSet() {
      const fin = ctx.finished.concat();
      ctx = groupCtx(ctx.setNo + 1, new URLSearchParams());
      ctx.finished = fin; events = []; ui.ov = null; ui.ovKey = ''; ui.prev = null;
      build(); bind(); update();
    }

    seedLog();
    if (demo === 'reopen' && !ro) ui.sheet = relay ? 1 : 2;
    build(); bind(); update();
    if (!ro) {
      setInterval(tick, 250);
      try { acquireWl(); } catch (e) { ui.wl = 'off'; renderWl(); } // not supported over file://
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { try { acquireWl(); } catch (e) { ui.wl = 'off'; renderWl(); } } });
    }
    // Viewer: pretend the other scorer keeps entering points.
    if (ro) {
      setInterval(() => {
        if (ui.paused || ui.ov === 'takeover') return;
        if (S.endsDue) events.push({ k: 'ends' });
        else if (!S.ended) events.push({ k: 'point', side: Math.random() < 0.52 ? 'H' : 'A' });
        else return;
        update();
      }, 2600);
    }
  }

  // =====================================================================================
  // Setup (L-B): ends -> serving team -> server -> receiver; ?mode=relay for the leg change
  // =====================================================================================
  function mountSetup() {
    const P = new URLSearchParams(location.search);
    // leg1: the start of a relay match is set up like the start of a set (ends, then the L1 serve rule);
    // `relay` below means a leg change (L3/L4).
    const leg1 = P.get('mode') === 'relay' && P.get('leg') === '1';
    const relay = P.get('mode') === 'relay' && !leg1;
    const setNo = +P.get('set') >= 1 && +P.get('set') <= 5 ? +P.get('set') : 3;
    const ctx = relay || leg1 ? relayCtx(new URLSearchParams(leg1 ? 'leg=1' : '')) : groupCtx(setNo, new URLSearchParams());
    const start = ctx.setup.start;
    // Relay: ends change at the leg change (L3) and the winner of the last rally serves first (L4).
    // Group set with a handicap: the side that starts at 0 serves first (L1). Only a 0–0 start asks who serves.
    const fixedServe = relay ? 'H' : start.H === start.A ? null : start.H < start.A ? 'H' : 'A';
    // Edit mode (Sửa thiết lập): the current choices come in the URL, the rally list is passed back untouched so the score stays.
    const edit = P.get('edit') === '1';
    const num = (v) => (v === null || v === '' || isNaN(+v) ? null : +v);
    const sel = { left: relay ? 'A' : 'H', serving: fixedServe, server: null, receiver: null };
    const rallies = P.get('r') || '';
    let editScore = { H: start.H, A: start.A };
    if (edit) {
      if (['H', 'A'].includes(P.get('left'))) sel.left = P.get('left');
      if (!fixedServe && ['H', 'A'].includes(P.get('serve'))) sel.serving = P.get('serve');
      if ([0, 1].includes(num(P.get('srv')))) sel.server = num(P.get('srv'));
      if ([0, 1].includes(num(P.get('rcv')))) sel.receiver = num(P.get('rcv'));
      if (!sel.serving) { sel.server = null; sel.receiver = null; }
      editScore = replay(ctx.setup, letterEvents(rallies)).score;
    }
    let step = relay ? 2 : 0;
    const minStep = relay ? 2 : 0;
    const root = $('#app');

    function preview() {
      const pos = { H: [0, 1], A: [0, 1] };
      let server = null, receiver = null;
      if (sel.serving && sel.server !== null) {
        const c = start[sel.serving] % 2, rs = other(sel.serving);
        pos[sel.serving][c] = sel.server; pos[sel.serving][1 - c] = 1 - sel.server;
        server = { side: sel.serving, k: sel.server, court: c };
        receiver = { side: rs, k: null, court: c };
        if (sel.receiver !== null) { pos[rs][c] = sel.receiver; pos[rs][1 - c] = 1 - sel.receiver; receiver.k = sel.receiver; }
      }
      return { left: sel.left, pos, server, receiver, pairs: ctx.pairs };
    }
    const titleTxt = () => (edit ? t(relay || leg1 ? 'editLegTitle' : 'editTitle', { n: relay || leg1 ? ctx.leg : setNo }) : leg1 ? t('setupLeg1Title') : relay ? t('setupLegTitle', { n: ctx.leg }) : t('setupTitle', { n: setNo, type: t('type_' + ctx.type) }));
    const startTeam = (s) => `<div class="t" style="--tc:${TEAM[s].color}"><b>${esc(TEAM[s].name)}${!relay && start[s] > 0 ? ` <span class="hc">${t('hcStart', { n: start[s] })}</span>` : ''}</b><span class="v">${start[s]}</span><small>${relay ? t('cumul') : start[s] > 0 ? t('hcStart', { n: start[s] }) : t('noHc')}</small></div>`;

    function stepPanel() {
      if (step === 0) {
        const L = sel.left, R = other(L);
        return `<h2 class="eyebrow">${t('endsPick')}</h2><div class="endsrow"><div class="e" style="--tc:${TEAM[L].color}"><small>${t('leftEnd')}</small><span>${esc(TEAM[L].name)}</span></div>
          <button class="btn" style="height:auto;flex-direction:column" data-act="swap" type="button" aria-label="${t('swap')}"><span style="width:24px;height:24px;display:block">${ICON_SWAP}</span><small>${t('swap')}</small></button>
          <div class="e" style="--tc:${TEAM[R].color}"><small>${t('rightEnd')}</small><span>${esc(TEAM[R].name)}</span></div></div>
          <button class="btn btn-primary btn-lg" data-act="next" type="button" style="margin-top:10px">${t('next')}</button>`;
      }
      if (step === 1) return `<h2 class="eyebrow">${t('pickServe')}</h2><div class="choice">${['H', 'A'].map((s) => `<button type="button" data-act="serve" data-side="${s}" style="--tc:${TEAM[s].color}" aria-pressed="${sel.serving === s}">${esc(TEAM[s].name)}<small>${start[s]} ${locale === 'vi' ? 'điểm' : 'pts'}</small></button>`).join('')}</div>`;
      if (step === 2) return `<h2 class="eyebrow">${t('pickServer', { team: esc(TEAM[sel.serving].name) })}</h2><div class="choice">${[0, 1].map((k) => `<button type="button" data-act="server" data-k="${k}" style="--tc:${TEAM[sel.serving].color}" aria-pressed="${sel.server === k}">${esc(nameOf(ctx, sel.serving, k))}</button>`).join('')}</div>`;
      const rs = other(sel.serving);
      return `<h2 class="eyebrow">${t('pickRecv', { team: esc(TEAM[rs].name) })}</h2><div class="choice">${[0, 1].map((k) => `<button type="button" data-act="receiver" data-k="${k}" style="--tc:${TEAM[rs].color}" aria-pressed="${sel.receiver === k}">${esc(nameOf(ctx, rs, k))}</button>`).join('')}</div>`;
    }
    function explain() {
      if (sel.server === null) return `<div class="explain">${t('exNone')}</div>`;
      const sc = start[sel.serving];
      let h = t('exServer', { c: t(sc % 2 ? 'leftFull' : 'rightFull'), n: sc, p: t(sc % 2 ? 'odd' : 'even') });
      if (sel.receiver !== null) h += `<br>${t('exRecv', { r: esc(nameOf(ctx, other(sel.serving), sel.receiver)), c: t(sc % 2 ? 'leftFull' : 'rightFull') })}`;
      return `<div class="explain">${h}</div>`;
    }
    const complete = () => sel.serving && sel.server !== null && sel.receiver !== null;

    function render() {
      const labels = [t('stEnds'), t('stServe'), t('stServer'), t('stReceiver')];
      const skip = (i) => i < minStep || (i === 1 && fixedServe);
      const role = roleParam() ? `&role=${roleParam()}` : '';
      const page = relay || leg1 ? `relay.html?leg=${ctx.leg}` : `score.html?set=${setNo}`;
      const url = `${page}&left=${sel.left}&serve=${sel.serving}&srv=${sel.server}&rcv=${sel.receiver}${edit ? `&r=${rallies}` : ''}${role}`;
      const cancelUrl = `${page}&left=${P.get('left')}&serve=${P.get('serve')}&srv=${P.get('srv')}&rcv=${P.get('rcv')}&r=${rallies}${role}`;
      root.innerHTML = `${ribbon()}
      <div class="su">
        <div><div class="eyebrow">${ctx.code} · ${ctx.court} · ${relay || leg1 ? `${t('leg')} ${ctx.leg}/5` : `${t('set')} ${setNo}/5`}</div><h1>${titleTxt()}</h1></div>
        ${relay ? `<div class="banner-ends">${ICON_SWAP}<div><b>${t('relayBanner')}</b><span class="text-sm">${t('relayBannerSub', { n: ctx.leg, m: ctx.milestone, a: start.H, b: start.A })}</span></div></div>` : ''}
        ${edit ? `<div class="explain" role="note">${t('editNote', { a: editScore.H, b: editScore.A })}</div>` : ''}
        <div class="sp">${['H', 'A'].map(startTeam).join('')}</div>
        <nav class="steps" aria-label="Steps">${labels.map((l, i) => `<button type="button" data-act="goto" data-i="${i}" class="${i < step ? 'done' : i === step ? 'now' : ''} ${skip(i) ? 'lock' : ''}" ${i === step ? 'aria-current="step"' : ''} ${skip(i) ? 'disabled' : ''}><b>${i < step ? '✓' : i + 1}</b>${l}</button>`).join('')}</nav>
        <div class="panel" style="padding:10px">${courtMarkup(true)}</div>
        ${relay ? `<div class="panel" style="padding:10px 12px;display:grid;gap:6px"><div class="eyebrow">${t('newPairs')}</div>${['H', 'A'].map((s) => `<div class="text-sm">${sw(s)} <b>${esc(TEAM[s].name)}</b>: ${esc(nameOf(ctx, s, 0))} · ${esc(nameOf(ctx, s, 1))}</div>`).join('')}
          <div class="text-sm" style="color:rgb(var(--warn));font-weight:600">${sw('H')} ${t('fixedServe')}: ${esc(TEAM.H.name)}</div></div>` : ''}
        ${!relay && fixedServe ? `<div class="panel text-sm" style="padding:10px 12px;color:rgb(var(--warn));font-weight:600">${sw(fixedServe)} ${t('hcServe', { team: esc(TEAM[fixedServe].name) })}</div>` : ''}
        ${explain()}
        <div class="panel" style="padding:12px">${stepPanel()}</div>
        ${step > minStep ? `<button class="linkbtn" data-act="back" type="button" style="justify-self:start">← ${t('back')}</button>` : ''}
      </div>
      <div class="su-cta"><div class="in"><button class="btn btn-primary btn-xl" id="go" type="button" ${complete() ? '' : 'disabled'} data-url="${url}">${complete() ? (edit ? t('saveSetup') : relay ? t('startLeg', { n: ctx.leg }) : t('startSet')) : t('needMore')}</button>${edit ? `<a class="btn btn-lg" href="${cancelUrl}">${t('cancel')}</a>` : ''}</div></div>`;
      const court = $('[data-court]');
      const v = preview();
      v.pick = step === 2 && sel.server !== null ? { side: sel.serving, k: sel.server } : step === 3 && sel.receiver !== null ? { side: other(sel.serving), k: sel.receiver } : null;
      drawCourt(court, v);
      // only the tags the current step can choose are tappable
      court.querySelectorAll('.ptag').forEach((tg) => {
        const s = tg.dataset.side;
        tg.disabled = !((step === 1) || (step === 2 && s === sel.serving) || (step === 3 && s === other(sel.serving)));
        tg.setAttribute('aria-label', `${TEAM[s].roster[ctx.pairs[s][+tg.dataset.k]]}`);
      });
      bindRibbon(render);
      root.onclick = (e) => {
        const b = e.target.closest('[data-act], #go');
        if (!b) return;
        if (b.id === 'go') { location.href = b.dataset.url; return; }
        const a = b.dataset.act;
        const set = (side, k) => {
          if (step === 1) { sel.serving = side; sel.server = null; sel.receiver = null; step = 2; }
          else if (step === 2 && side === sel.serving) { sel.server = k; if (!edit) sel.receiver = null; step = 3; }
          else if (step === 3 && side === other(sel.serving)) { sel.receiver = k; }
        };
        if (a === 'swap') sel.left = other(sel.left);
        else if (a === 'next') step = fixedServe ? 2 : 1;
        else if (a === 'back') step = Math.max(minStep, step === 2 && fixedServe ? 0 : step - 1);
        else if (a === 'goto') { const i = +b.dataset.i; if (!skip(i) && (edit || i <= step)) step = i; }
        else if (a === 'serve') set(b.dataset.side, 0);
        else if (a === 'server') set(sel.serving, +b.dataset.k);
        else if (a === 'receiver') set(other(sel.serving), +b.dataset.k);
        else if (a === 'tag') set(b.dataset.side, +b.dataset.k);
        render();
      };
    }
    render();
  }

  // =====================================================================================
  // Public P4 live panel with the rally timeline ("score worm")
  // =====================================================================================
  function mountPublic() {
    const P = new URLSearchParams(location.search);
    const ctx = groupCtx(3, new URLSearchParams());
    const setup = ctx.setup;
    const prefix = synth(setup, { H: 13, A: 20 });
    const full = synth(setup, { H: 30, A: 27 }, prefix, 5).concat([{ k: 'point', side: 'H' }]);
    let events = prefix.slice();
    let cursor = prefix.length;
    let state = ['live', 'ends', 'med'].includes(P.get('state')) ? P.get('state') : 'live';
    let paused = state !== 'live';
    let S, prevScore = null, timer = null;
    const MED_AT = Date.now() - 48000;
    const root = $('#app');

    // demo state: 'ends' stops right when the side that started at 0 reaches 16
    function applyState() {
      events = prefix.slice(); cursor = prefix.length;
      if (state === 'ends') { events = synth(setup, { H: 15, A: 20 }, [], 11); events.push({ k: 'point', side: 'H' }); cursor = full.length; }
      if (state === 'med') { events = synth(setup, { H: 14, A: 19 }, [], 11); events.push({ k: 'timeout_start', player: { side: 'A', k: 0 }, at: MED_AT }); cursor = full.length; }
      paused = state !== 'live';
    }
    function worm() {
      const W = 520, H = 270, pl = 34, pr = 10, pt = 18, pb = 26;
      const n = S.rallies.length;
      const d0 = setup.start.H - setup.start.A;
      const diffs = [d0].concat(S.rallies.map((r) => r.H - r.A));
      const xmax = Math.max(40, n + 6);
      const ymax = Math.max(12, Math.ceil(Math.max(...diffs.map(Math.abs)) / 4) * 4);
      const sx = (x) => pl + (x / xmax) * (W - pl - pr);
      const sy = (d) => pt + ((ymax - d) / (2 * ymax)) * (H - pt - pb);
      const y0 = sy(0);
      const pts = diffs.map((d, i) => `${sx(i).toFixed(1)},${sy(d).toFixed(1)}`);
      const area = `M${sx(0)},${y0} L${pts.join(' L')} L${sx(n)},${y0}Z`;
      let g = '';
      for (let d = -ymax; d <= ymax; d += 4) g += `<line class="${d === 0 ? 'zero' : 'grid'}" x1="${pl}" x2="${W - pr}" y1="${sy(d)}" y2="${sy(d)}"/><text x="${pl - 6}" y="${sy(d) + 3.5}" text-anchor="end">${d > 0 ? '+' + d : d}</text>`;
      for (let x = 0; x <= xmax; x += 10) g += `<text x="${sx(x)}" y="${H - 8}" text-anchor="middle">${x}</text>`;
      let segs = '';
      for (let i = 1; i < diffs.length; i++) segs += `<line x1="${sx(i - 1).toFixed(1)}" y1="${sy(diffs[i - 1]).toFixed(1)}" x2="${sx(i).toFixed(1)}" y2="${sy(diffs[i]).toFixed(1)}" stroke="${TEAM[S.rallies[i - 1].side].color}" stroke-width="2.6" stroke-linecap="round"/>`;
      const last = diffs.length - 1;
      const marks = [];
      if (S.endsAt) marks.push(`<line class="mark" x1="${sx(S.endsAt)}" x2="${sx(S.endsAt)}" y1="${pt}" y2="${H - pb}"/><text class="mk" x="${sx(S.endsAt) + 4}" y="${pt + 10}">${esc(t('endsLbl'))}</text>`);
      // The start-points label lives in the legend chip below; the chart only marks the point.
      if (d0 !== 0) marks.push(`<circle cx="${sx(0)}" cy="${sy(d0)}" r="4" fill="none" stroke="rgb(var(--accent))" stroke-width="1.6"/>`);
      return `<svg class="worm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('worm', { n: ctx.setNo }))}">
        <defs><clipPath id="cu"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath><clipPath id="cd"><rect x="0" y="${y0}" width="${W}" height="${H}"/></clipPath></defs>
        ${g}<path d="${area}" clip-path="url(#cu)" fill="${TEAM.H.color}" fill-opacity="0.16"/><path d="${area}" clip-path="url(#cd)" fill="${TEAM.A.color}" fill-opacity="0.16"/>
        ${marks.join('')}${segs}<circle class="dot" cx="${sx(last)}" cy="${sy(diffs[last])}" r="4.5"/>
        <text x="${pl + 4}" y="${pt - 3}" style="fill:${TEAM.H.color};font-weight:700">↑ ${esc(t('wormUp', { team: TEAM.H.name }))}</text>
        <text x="${pl + 4}" y="${H - pb - 4}" style="fill:${TEAM.A.color};font-weight:700">↓ ${esc(t('wormUp', { team: TEAM.A.name }))}</text></svg>`;
    }
    const pairLine = (cfg, s) => cfg[s === 'H' ? 'hp' : 'ap'].map((i) => esc(TEAM[s].roster[i])).join(' · ');
    function setRows() {
      return SETS.map((cfg, i) => {
        const n = i + 1;
        const cur = n === 3;
        const done = n < 3;
        const sc = done ? FINISHED[i] : cur ? [S.score.H, S.score.A] : null;
        const hcs = ['H', 'A'].filter((s) => cfg.start[s] > 0).map((s) => `<span class="hc">${esc(TEAM[s].name)} +${cfg.start[s]}</span>`).join(' ');
        return `<div class="setrow ${cur ? 'cur' : ''} ${!done && !cur ? 'pend' : ''}">
          <div class="no">${n}<small>${t('type_' + cfg.type)}</small></div>
          <div class="pairs"><div>${sw('H')} ${pairLine(cfg, 'H')}</div><div>${sw('A')} ${pairLine(cfg, 'A')}</div>${hcs ? `<div style="margin-top:2px">${hcs}</div>` : ''}</div>
          <div class="sc2">${cur ? `<span class="chip chip-live">${t('live')}</span>` : ''}${sc ? `<span style="${sc[0] > sc[1] ? '' : 'color:rgb(var(--muted))'}">${sc[0]}</span><span style="color:rgb(var(--muted))">–</span><span style="${sc[1] > sc[0] ? '' : 'color:rgb(var(--muted))'}">${sc[1]}</span>` : `<span class="text-sm" style="font-family:var(--font-body);font-weight:500;color:rgb(var(--muted))">${t('pending2')}</span>`}</div></div>`;
      }).join('');
    }
    function chip() {
      if (S.retired) return `<span class="chip chip-loss">${t('retiredChip')}</span>`;
      if (S.timeout) { const left = Math.max(0, MED_MS - (Date.now() - S.timeout.at)); return `<span class="chip chip-warn">${t('medChip')} · <span id="pclock" class="num">${mmss(left)}</span></span>`; }
      if (S.endsDue) return `<span class="chip chip-accent">${t('endsChip')}</span>`;
      if (S.ended) return `<span class="chip chip-win">${t('endedChip')}</span>`;
      return `<span class="chip chip-live">${t('live')}</span>`;
    }
    function render() {
      S = replay(setup, events);
      const srv = S.server;
      const setsH = 1, setsA = 1;
      const team = (s) => `<div class="pt ${S.serving === s ? 'serving' : ''}" style="--tc:${TEAM[s].color}" data-pt="${s}">
          <div class="tn">${sw(s)}<span class="t">${esc(TEAM[s].name)}</span></div>
          <div class="pl">${ctx.pairs[s].map((k) => esc(given(TEAM[s].roster[k]))).join(' · ')}</div>
          <div class="v">${S.score[s]}</div>
          <div class="srv"><span>${SHUTTLE}</span><span>${t('serving')}: ${esc(nameOf(ctx, srv.side, srv.k))}</span></div></div>`;
      root.innerHTML = `${ribbon(`<span class="hidden sm:inline">${t('stateLive')}:</span>${[['live', 'stLive'], ['ends', 'stEnds'], ['med', 'stMed']].map(([s, k]) => `<button class="lv-rb" data-state="${s}" aria-pressed="${state === s}">${t(k)}</button>`).join('')}<button class="lv-rb" id="rb-pause" aria-pressed="${paused && state === 'live'}">${paused && state === 'live' ? t('playSim') : t('pauseSim')}</button>${S.ended ? `<button class="lv-rb" id="rb-replay">${t('replay')}</button>` : ''}`)}
      <header class="topbar"><div class="gutter max-w-6xl mx-auto flex items-center gap-4 h-14"><a href="../public/home.html" class="wordmark">ABT<i>·</i>27</a>
        <nav class="hidden md:flex items-center gap-1 ml-2"><a class="navlink" href="../public/home.html">${t('pHome')}</a><a class="navlink" href="../public/standings.html">${t('pStand')}</a><a class="navlink" href="../public/matches.html" aria-current="page">${t('pMatches')}</a><a class="navlink" href="../public/bracket.html">${t('pBracket')}</a></nav></div></header>
      <main class="pw">
        <div class="text-sm text-muted"><a class="hover:underline" href="public-matches.html">← ${t('pMatches')}</a> · <b class="display text-fg text-base">${ctx.code}</b> · ${t('group')} · ${t('round')} 4 · ${ctx.court} · 10:30</div>
        <section class="panel pbd" aria-label="${t('live')}">
          <div class="pbd-top">${chip()}<span class="chip">${t('set')} ${ctx.setNo} · ${t('type_' + ctx.type)}</span>${['H', 'A'].filter((s) => setup.start[s] > 0).map((s) => `<span class="hc">${esc(TEAM[s].name)} +${setup.start[s]}</span>`).join('')}</div>
          <div class="pbd-grid">${team('H')}<div class="sets-mid"><span class="eyebrow">${t('setsWon')}</span><span class="v">${setsH}–${setsA}</span></div>${team('A')}</div>
          <div class="pbd-note ${paused ? 'paused' : ''}">${paused && state === 'live' ? t('liveNotePaused') : t('liveNote')}</div>
          <div class="sr-only-lv" aria-live="polite">${esc(TEAM.H.name)} ${S.score.H}, ${esc(TEAM.A.name)} ${S.score.A}</div>
        </section>
        <section class="panel pbd"><div class="flex flex-wrap items-baseline gap-x-3"><h2 class="display text-2xl font-bold uppercase">${t('worm', { n: ctx.setNo })}</h2><span class="text-sm text-muted">${t('wormSub')}</span></div>
          <div class="mt-2">${worm()}</div>
          <div class="legend mt-2"><span>${sw('H')}${esc(TEAM.H.name)}</span><span>${sw('A')}${esc(TEAM.A.name)}</span><span><i style="width:16px;border-top:2px dashed rgb(var(--accent));display:inline-block"></i>${t('endsLbl')}</span><span class="hc">${t('hcStartLbl', { team: TEAM.A.name, n: setup.start.A })}</span><span>x: ${t('rally')} · ${S.rallies.length}</span></div></section>
        <section><h2 class="display text-2xl font-bold uppercase mb-2">${t('matchSets')}</h2><div class="panel overflow-hidden">${setRows()}</div></section>
      </main>`;
      bindRibbon(render);
      root.querySelectorAll('[data-state]').forEach((b) => { b.onclick = () => { state = b.dataset.state; applyState(); render(); }; });
      const ps = $('#rb-pause'); if (ps) ps.onclick = () => { if (state !== 'live') { state = 'live'; applyState(); } paused = !paused; render(); };
      const rp = $('#rb-replay'); if (rp) rp.onclick = () => { state = 'live'; applyState(); render(); };
      if (prevScore) ['H', 'A'].forEach((s) => { if (prevScore[s] !== S.score[s]) { const v = root.querySelector(`[data-pt="${s}"] .v`); v.classList.add('pop'); } });
      prevScore = { ...S.score };
    }
    function loop() {
      clearInterval(timer);
      timer = setInterval(() => {
        const c = $('#pclock');
        if (c && S.timeout) c.textContent = mmss(Math.max(0, MED_MS - (Date.now() - S.timeout.at)));
        if (paused || state !== 'live' || cursor >= full.length) return;
        // slowed down in the final stretch only by the data itself; one event per 2.5 s tick
        events.push(full[cursor]); cursor += 1;
        render();
      }, 2500);
      setInterval(() => { const c = $('#pclock'); if (c && S.timeout) c.textContent = mmss(Math.max(0, MED_MS - (Date.now() - S.timeout.at))); }, 500);
    }
    applyState();
    render();
    loop();
  }

  // ---------- boot ----------
  document.documentElement.lang = locale;
  const screen = document.body.dataset.screen;
  if (screen === 'score' || screen === 'relay' || screen === 'viewer') mountScorer(screen);
  else if (screen === 'setup') mountSetup();
  else if (screen === 'public') mountPublic();
  window.ABTLive = { replay, synth };
})();
