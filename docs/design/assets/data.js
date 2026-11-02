// Fake, deterministic tournament data for the mockups. No real people.
// Every name is generated as "Family Middle Given" from the lists below.
// Rules follow docs/spec.md §4 (lineups, handicaps, relay, standings).
(function () {
  'use strict';

  // ---------- seeded RNG ----------
  let seed = 20270515;
  const rng = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (a) => a[Math.floor(rng() * a.length)];

  // ---------- season ----------
  const SETTINGS = {
    setTarget: 31, groupHandicapCap: 20, koHandicapCap: 15,
    milestones: [25, 50, 75, 100, 125], slotTypes: ['open', 'low', 'open', 'high', 'open'],
    lowRange: [4, 7], highRange: [1, 3], maxRank: 7, minSets: 1, maxSets: 2, minPresent: 5,
    fees: { employee: 300000, intern: 150000, guest: 300000 }, timezone: 'Asia/Ho_Chi_Minh',
  };
  const season = {
    year: 2027, name: 'ABT 2027', venue: 'Sân cầu lông Hòa Xuân', status: 'knockout',
    days: ['2027-05-15', '2027-05-22'], courts: ['Sân 1', 'Sân 2', 'Sân 3'], settings: SETTINGS,
  };
  const seasons = [
    { year: 2027, name: 'ABT 2027', current: true },
    { year: 2026, name: 'ABT 2026' },
    { year: 2025, name: 'ABT 2025' },
  ];

  // ---------- people ----------
  const FAM = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Huỳnh', 'Phan', 'Vũ'];
  const MID_M = ['Văn', 'Minh', 'Quốc', 'Đức', 'Hữu', 'Gia', 'Thanh', 'Công'];
  const MID_F = ['Thị', 'Ngọc', 'Thu', 'Mỹ', 'Bảo', 'Khánh', 'Phương', 'Hồng'];
  const GIV_M = ['Khoa', 'Bình', 'Phúc', 'Tâm', 'Long', 'Hưng', 'Kiên', 'Đạt', 'Sơn', 'Tú', 'Hiếu', 'Luân', 'Quý', 'Lộc', 'Khải', 'Trí', 'Tín', 'Hào', 'Phát', 'Sang', 'Thông', 'Cường', 'Định', 'Tuệ', 'Khang', 'Vĩ', 'Nghĩa', 'Thuận'];
  const GIV_F = ['Lan', 'Mai', 'Hạnh', 'Vy', 'Quyên', 'Yến', 'Nhi', 'Diễm', 'Uyên', 'Giang', 'Tiên', 'Thư', 'Ly', 'Hân', 'Cúc', 'Đào', 'Nhàn', 'Thơ'];
  const used = new Set();
  const makeName = (g) => {
    for (;;) {
      const n = `${pick(FAM)} ${g === 'male' ? pick(MID_M) : pick(MID_F)} ${g === 'male' ? pick(GIV_M) : pick(GIV_F)}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
  };
  const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const TEAMS = [
    ['t1', 'Sấm Sét', '#E4572E'], ['t2', 'Lông Vũ Xanh', '#2E86AB'], ['t3', 'Smash Bros', '#8B5CF6'],
    ['t4', 'Gió Ngược', '#2A9D8F'], ['t5', 'Net Ninjas', '#E09F3E'], ['t6', 'Drop Shot', '#D62C7A'], ['t7', 'Cầu Lửa', '#5C7AEA'],
  ];
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 7];
  const skillFor = (r) => ({ 1: ri(34, 40), 2: ri(26, 33), 3: ri(21, 25), 4: ri(20, 21), 5: 18, 6: 17, 7: 16 })[r];

  const players = [];
  const teams = TEAMS.map(([id, name, color], ti) => {
    const roster = RANKS.map((rank, i) => {
      const gender = rank <= 3 ? (rng() < 0.8 ? 'male' : 'female') : (rng() < 0.5 ? 'male' : 'female');
      const name2 = makeName(gender);
      const p = {
        id: `p${ti * 8 + i + 1}`, name: name2, slug: slugify(name2), gender, rank, skill: skillFor(rank), teamId: id,
        memberType: rng() < 0.12 ? 'intern' : rng() < 0.06 ? 'guest' : 'employee', feePaid: rng() < 0.86,
        firstSeason: rng() < 0.3 ? 2027 : pick([2025, 2026]),
      };
      p.fee = SETTINGS.fees[p.memberType];
      players.push(p);
      return p.id;
    });
    return { id, name, color, roster, captainId: roster[0], form: (rng() - 0.5) * 0.24 };
  });
  const P = Object.fromEntries(players.map((p) => [p.id, p]));
  const T = Object.fromEntries(teams.map((t) => [t.id, t]));

  const users = [
    { id: 'u1', name: 'Phạm Gia Bảo', email: 'bao.pham@example.com', role: 'btc', active: true },
    { id: 'u2', name: 'Đỗ Thu Hà', email: 'ha.do@example.com', role: 'btc', active: true },
    { id: 'u3', name: 'Võ Minh Tâm', email: 'tam.vo@example.com', role: 'referee', active: true },
    { id: 'u4', name: 'Ngô Khánh Vy', email: 'vy.ngo@example.com', role: 'referee', active: true },
    { id: 'u5', name: 'Bùi Đức Long', email: 'long.bui@example.com', role: 'referee', active: true, mustChange: true },
  ];
  const referees = users.filter((u) => u.role === 'referee');

  // ---------- rules (spec §4) ----------
  const pairSkill = (ids) => ids.reduce((s, id) => s + P[id].skill, 0);
  const slotHandicap = (h, a, cap) => {
    const d = pairSkill(h) - pairSkill(a);
    const v = Math.min(Math.abs(d), cap);
    return d > 0 ? [0, v] : d < 0 ? [v, 0] : [0, 0];
  };
  const relayHandicap = (slots, cap) => {
    const net = slots.reduce((s, sl) => s + pairSkill(sl.home) - pairSkill(sl.away), 0);
    const v = Math.min(Math.abs(net), cap);
    return { net, start: net > 0 ? [0, v] : net < 0 ? [v, 0] : [0, 0] };
  };
  // Lineup templates by roster index (sorted by rank). All satisfy §4.1.
  const TEMPLATES = [
    [[0, 6], [3, 4], [1, 5], [2, 0], [7, 3]],
    [[1, 7], [4, 5], [0, 6], [2, 1], [3, 0]],
    [[2, 7], [5, 6], [0, 4], [1, 2], [3, 0]],
  ];
  const lineupFor = (team) => pick(TEMPLATES).map((pair) => pair.map((i) => team.roster[i]));

  // ---------- schedule: circle-method round robin (spec §4.7) ----------
  const ring = [...teams.map((t) => t.id), null];
  const rounds = [];
  for (let r = 0; r < ring.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i], b = ring[ring.length - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ring.splice(1, 0, ring.pop());
  }
  const SLOTS = [
    ['2027-05-15', '08:00'], ['2027-05-15', '09:15'], ['2027-05-15', '10:30'], ['2027-05-15', '13:30'],
    ['2027-05-15', '14:45'], ['2027-05-22', '08:00'], ['2027-05-22', '09:15'],
  ];

  const matches = [];
  let n = 0;
  rounds.forEach((pairs, r) => pairs.forEach(([h, a], i) => {
    n += 1;
    matches.push({
      code: `V${String(n).padStart(2, '0')}`, stage: 'group', round: r + 1, home: h, away: a,
      date: SLOTS[r][0], time: SLOTS[r][1], court: season.courts[i], referee: referees[(r + i) % 3].id, status: 'scheduled',
    });
  }));

  // ---------- play a match ----------
  const winProb = (h, a) => Math.max(0.2, Math.min(0.8, 0.5 + T[h].form - T[a].form));
  function playGroup(m) {
    const hl = lineupFor(T[m.home]), al = lineupFor(T[m.away]);
    const p = winProb(m.home, m.away);
    m.slots = hl.map((home, i) => {
      const away = al[i];
      const hc = slotHandicap(home, away, SETTINGS.groupHandicapCap);
      const homeWins = rng() < p + (hc[0] - hc[1]) / 120;
      const loserStart = homeWins ? hc[1] : hc[0];
      const lose = Math.max(loserStart, ri(Math.max(loserStart + 3, 11), 30));
      return { no: i + 1, type: SETTINGS.slotTypes[i], home, away, hc, score: homeWins ? [31, lose] : [lose, 31] };
    });
    m.status = 'completed';
  }
  function playRelay(m) {
    const hl = lineupFor(T[m.home]), al = lineupFor(T[m.away]);
    m.slots = hl.map((home, i) => ({ no: i + 1, type: SETTINGS.slotTypes[i], home, away: al[i] }));
    const rh = relayHandicap(m.slots, SETTINGS.koHandicapCap);
    m.relayNet = rh.net; m.relayStart = rh.start;
    const p = winProb(m.home, m.away);
    let cur = [...rh.start];
    m.slots.forEach((s, i) => {
      const M = SETTINGS.milestones[i];
      const lead = rng() < p ? 0 : 1, other = 1 - lead;
      const next = [0, 0];
      next[lead] = M;
      next[other] = ri(Math.max(cur[other], M - 13), M - 1);
      s.score = next; cur = next;
    });
    m.status = 'completed';
  }
  const lockOnly = (m) => {
    const hl = lineupFor(T[m.home]), al = lineupFor(T[m.away]);
    m.slots = hl.map((home, i) => ({ no: i + 1, type: SETTINGS.slotTypes[i], home, away: al[i] }));
    if (m.stage === 'group') m.slots.forEach((s) => { s.hc = slotHandicap(s.home, s.away, SETTINGS.groupHandicapCap); });
    else { const rh = relayHandicap(m.slots, SETTINGS.koHandicapCap); m.relayNet = rh.net; m.relayStart = rh.start; }
    m.status = 'lineup_locked';
  };

  // ---------- standings (spec §4.6, A2) ----------
  function tally(ms, ids) {
    const row = Object.fromEntries(ids.map((id) => [id, { id, p: 0, w: 0, l: 0, pts: 0, sw: 0, sl: 0, pf: 0, pa: 0 }]));
    ms.forEach((m) => {
      if (!row[m.home] || !row[m.away] || !['completed', 'forfeit'].includes(m.status)) return;
      const H = row[m.home], A = row[m.away];
      let hs = 0, as = 0;
      m.slots.forEach((s) => { H.pf += s.score[0]; H.pa += s.score[1]; A.pf += s.score[1]; A.pa += s.score[0]; s.score[0] > s.score[1] ? hs++ : as++; });
      H.p++; A.p++; H.sw += hs; H.sl += as; A.sw += as; A.sl += hs;
      if (hs > as) { H.w++; H.pts++; A.l++; } else { A.w++; A.pts++; H.l++; }
    });
    Object.values(row).forEach((r) => { r.sd = r.sw - r.sl; r.pd = r.pf - r.pa; });
    return row;
  }
  function standings(ms) {
    const group = ms.filter((m) => m.stage === 'group');
    const row = tally(group, teams.map((t) => t.id));
    const byPts = {};
    Object.values(row).forEach((r) => (byPts[r.pts] ||= []).push(r));
    const out = [];
    Object.keys(byPts).map(Number).sort((a, b) => b - a).forEach((pts) => {
      const g = byPts[pts];
      if (g.length === 1) { g[0].why = 'pts'; out.push(g[0]); return; }
      if (g.length === 2) {
        const [a, b] = g;
        const m = group.find((x) => x.status !== 'scheduled' && x.slots && x.score && ((x.home === a.id && x.away === b.id) || (x.home === b.id && x.away === a.id)));
        const aFirst = m ? (m.winner === a.id) : a.sd >= b.sd;
        const ord = aFirst ? [a, b] : [b, a];
        ord.forEach((r) => { r.why = m ? 'h2h' : 'sd'; out.push(r); });
        return;
      }
      const mini = tally(group.filter((m) => g.some((r) => r.id === m.home) && g.some((r) => r.id === m.away)), g.map((r) => r.id));
      const key = (r) => [mini[r.id].pts, mini[r.id].sd, mini[r.id].pd, r.sd, r.pd];
      g.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; });
      g.forEach((r, i) => {
        const nb = [g[i - 1], g[i + 1]].filter(Boolean);
        const k = key(r);
        const tiedMini = nb.some((o) => key(o).slice(0, 3).join() === k.slice(0, 3).join());
        const tiedAll = nb.some((o) => key(o).join() === k.join());
        r.why = tiedAll ? 'draw' : tiedMini ? (nb.some((o) => key(o).slice(0, 4).join() === k.slice(0, 4).join()) ? 'pd' : 'sd') : 'mini';
        r.mini = mini[r.id];
        out.push(r);
      });
    });
    out.forEach((r, i) => { r.pos = i + 1; });
    return out;
  }
  const finishScore = (m) => {
    if (!m.slots || !m.slots[0].score) return;
    if (m.stage === 'group') {
      const hs = m.slots.filter((s) => s.score[0] > s.score[1]).length;
      m.score = [hs, 5 - hs];
    } else {
      m.score = [...m.slots[4].score];
    }
    m.winner = m.score[0] > m.score[1] ? m.home : m.away;
  };

  // ---------- build the season state ----------
  // state=knockout (default): group closed, semis + 3rd place played, final lineups locked.
  // state=group: day 1 played, one match in progress, knock-out still TBD.
  const state = new URLSearchParams(location.search).get('state') === 'group' ? 'group' : 'knockout';
  const forfeitCode = 'V12';
  matches.forEach((m) => {
    const playedDay1 = m.date === '2027-05-15';
    if (state === 'knockout' || playedDay1) {
      if (m.code === forfeitCode) {
        m.status = 'forfeit'; m.forfeitTeam = m.away; m.forfeitReason = 'late';
        m.slots = SETTINGS.slotTypes.map((type, i) => ({ no: i + 1, type, home: [], away: [], hc: [0, 0], score: [31, 0] }));
      } else playGroup(m);
      finishScore(m);
    }
  });
  if (state === 'group') {
    const live = matches.find((m) => m.round === 6);
    playGroup(live);
    live.slots.slice(2).forEach((s) => { delete s.score; });
    live.status = 'in_progress';
    live.score = [live.slots.slice(0, 2).filter((s) => s.score[0] > s.score[1]).length, live.slots.slice(0, 2).filter((s) => s.score[0] < s.score[1]).length];
    season.status = 'group';
  }

  const table = standings(matches);
  const ko = [
    { code: 'SF1', stage: 'semi_final', date: '2027-05-22', time: '10:30', court: 'Sân 1', referee: 'u3', seeds: [1, 4] },
    { code: 'SF2', stage: 'semi_final', date: '2027-05-22', time: '10:30', court: 'Sân 2', referee: 'u4', seeds: [2, 3] },
    { code: '3RD', stage: 'third_place', date: '2027-05-22', time: '13:30', court: 'Sân 1', referee: 'u5' },
    { code: 'F', stage: 'final', date: '2027-05-22', time: '14:45', court: 'Sân 1', referee: 'u3' },
  ].map((m) => ({ ...m, status: 'scheduled', home: null, away: null }));
  if (state === 'knockout') {
    const seedId = (n2) => table[n2 - 1].id;
    ko.slice(0, 2).forEach((m) => { m.home = seedId(m.seeds[0]); m.away = seedId(m.seeds[1]); playRelay(m); finishScore(m); });
    const [s1, s2] = ko;
    const loser = (m) => (m.winner === m.home ? m.away : m.home);
    ko[2].home = loser(s1); ko[2].away = loser(s2); playRelay(ko[2]); finishScore(ko[2]);
    ko[3].home = s1.winner; ko[3].away = s2.winner; lockOnly(ko[3]);
    // One substitution, to show how it reads (spec §4.1 SUB_RANK).
    const leg = s2.slots[2];
    const out = leg.away[1];
    const sub = T[P[out].teamId].roster.find((id) => id !== out && Math.abs(P[id].rank - P[out].rank) === 1 && !leg.away.includes(id));
    if (sub) { leg.sub = { side: 'away', out, in: sub, reason: 'injury' }; leg.away = [leg.away[0], sub]; }
  }
  matches.push(...ko);

  // ---------- side awards ----------
  const completedSets = matches.filter((m) => m.stage === 'group' && m.status === 'completed').flatMap((m) => m.slots.map((s) => ({ m, s })));
  const widest = completedSets.reduce((a, b) => (Math.abs(b.s.score[0] - b.s.score[1]) > Math.abs(a.s.score[0] - a.s.score[1]) ? b : a), completedSets[0]);
  const closest = completedSets.find((x) => Math.abs(x.s.score[0] - x.s.score[1]) === 1) || completedSets[1];
  const winPair = (x) => (x.s.score[0] > x.s.score[1] ? x.s.home : x.s.away);
  const losePair = (x) => (x.s.score[0] > x.s.score[1] ? x.s.away : x.s.home);
  const awards = [
    { id: 'a1', name: 'Chuỗi bất tử', nameEn: 'Unbreakable Streak', sponsor: 'Lý Thanh Sơn', value: 300000, criteria: 'Cặp đôi thắng set cách biệt nhất vòng bảng', criteriaEn: 'Pair with the widest set win of the group stage', winners: [{ kind: 'pair', ids: winPair(widest), match: widest.m.code, note: `${widest.s.score[0]}–${widest.s.score[1]}` }] },
    { id: 'a2', name: 'Suýt nữa thì', nameEn: 'So Close', sponsor: 'Phòng Nhân sự', value: 200000, criteria: 'Cặp đôi thua set sát nút nhất', criteriaEn: 'Pair with the narrowest set loss', winners: [{ kind: 'pair', ids: losePair(closest), match: closest.m.code, note: `${closest.s.score[0]}–${closest.s.score[1]}` }] },
    { id: 'a3', name: 'Sàn diễn di động', nameEn: 'Runway on Court', sponsor: 'Hồ Ngọc Diễm', value: 200000, criteria: 'Đội có trang phục ấn tượng nhất', criteriaEn: 'Team with the most striking kit', winners: [{ kind: 'team', team: 't6' }] },
    { id: 'a4', name: 'Bét nhưng not bad', nameEn: 'Last but Not Bad', sponsor: 'Trần Quốc Hưng', value: 200000, criteria: 'VĐV lần đầu tham gia có tinh thần tốt nhất', criteriaEn: 'First-timer with the best spirit', winners: [{ kind: 'player', ids: [players.find((p) => p.firstSeason === 2027).id] }] },
    { id: 'a5', name: 'Đôi bạn cùng gánh', nameEn: 'Carry Duo', sponsor: 'Vũ Minh Khoa', value: 600000, criteria: '300k cho đôi nam nữ thắng đậm nhất, 300k cho đôi nam nữ thua sát nhất', criteriaEn: '300k to the mixed pair with the widest win, 300k to the mixed pair with the closest loss', winners: [] },
  ];

  window.ABT = {
    state, season, seasons, settings: SETTINGS, teams, players, P, T, users, referees, matches,
    table, awards, pairSkill, slotHandicap, relayHandicap, standings,
  };
})();
