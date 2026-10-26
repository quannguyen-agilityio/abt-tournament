// Admin screens A1–A8 + login (spec §6). Role preview via ?role=referee.
(function () {
  'use strict';
  const D = () => window.ABT;

  const V = {
    vi: {
      SLOT_INCOMPLETE: 'Set {n} chưa đủ 2 VĐV khác nhau', NOT_PRESENT: '{p} không có mặt', MIN_SETS: '{p} chưa được xếp set nào (tối thiểu {min})',
      MAX_SETS: '{p} đánh quá {max} set', CONSECUTIVE: '{p} đánh 2 set liên tiếp ({n} và {n2})', LOW_RANK_SLOT: 'Set {n} là set Rank thấp nhưng {p} là Rank {r}',
      HIGH_RANK_SLOT: 'Set {n} là set Rank cao nhưng {p} là Rank {r}', COMPENSATION: '{p} là Rank {r} duy nhất của đội ít người hơn, phải đánh ít nhất 2 set',
      MIN_PRESENT: 'Chỉ có {c} VĐV có mặt (tối thiểu {min})', refereeBlocked: 'Trọng tài không lưu được đội hình vi phạm. Hãy báo BTC.',
      noViolations: 'Đội hình hợp lệ', presentOf: '{c}/{t} có mặt', previewHc: 'Chấp dự kiến', lockedAt: 'Đã khóa lúc 14:20 bởi', enterScores: 'Nhập tỉ số cuối của từng set. Bên được chấp xuất phát từ số điểm chấp.',
      enterRelay: 'Nhập tỉ số cộng dồn tại mỗi mốc. Một bên phải chạm đúng mốc.', fee: 'Lệ phí', importDraw: 'Import kết quả bốc thăm', sizeWarn: 'Lệch số người giữa các đội',
      cloneSeason: 'Nhân bản từ mùa trước', regenHint: 'Chỉ sinh lại được khi chưa trận nào có đội hình hoặc tỉ số.', closedInfo: 'Vòng bảng đã chốt. Không mở lại được vì bracket đã bắt đầu.',
      allResolved: 'Mọi đội đã được phân định trước bước bốc thăm.', winnerKind: 'Loại người nhận', relatedMatch: 'Trận liên quan', tempPw: 'Mật khẩu tạm',
      tempPwHint: 'Người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.', lastLogin: 'Đăng nhập gần nhất', forgot: 'Quên mật khẩu? Liên hệ BTC.',
    },
    en: {
      SLOT_INCOMPLETE: 'Set {n} needs 2 different players', NOT_PRESENT: '{p} is not present', MIN_SETS: '{p} has no set (minimum {min})',
      MAX_SETS: '{p} plays more than {max} sets', CONSECUTIVE: '{p} plays two sets in a row ({n} and {n2})', LOW_RANK_SLOT: 'Set {n} is low-rank but {p} is Rank {r}',
      HIGH_RANK_SLOT: 'Set {n} is high-rank but {p} is Rank {r}', COMPENSATION: '{p} is the only Rank {r} of the smaller team and must play at least 2 sets',
      MIN_PRESENT: 'Only {c} players present (minimum {min})', refereeBlocked: 'Referees cannot save a lineup with violations. Ask the committee.',
      noViolations: 'Lineup is valid', presentOf: '{c}/{t} present', previewHc: 'Handicap preview', lockedAt: 'Locked at 14:20 by', enterScores: 'Enter each set’s final score. The receiving pair starts from its handicap.',
      enterRelay: 'Enter the running score at each milestone. One side must hit the milestone exactly.', fee: 'Fee', importDraw: 'Import draw result', sizeWarn: 'Team sizes differ',
      cloneSeason: 'Clone from last season', regenHint: 'Regenerating is only possible before any lineup or score exists.', closedInfo: 'The group is closed. It cannot be reopened because the bracket has started.',
      allResolved: 'Every team is separated before the draw step.', winnerKind: 'Winner type', relatedMatch: 'Related match', tempPw: 'Temporary password',
      tempPwHint: 'The user must change it at first sign-in.', lastLogin: 'Last sign-in', forgot: 'Forgot your password? Contact the committee.',
    },
  };
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

  // ---------- lineup validation (spec §4.1) ----------
  function validateLineup(slots, present, oppPresent, s) {
    const a = D(), out = [];
    const count = {}, where = {};
    if (present.length < s.minPresent) out.push({ code: 'MIN_PRESENT', c: present.length, min: s.minPresent });
    slots.forEach((pair, i) => {
      const n = i + 1;
      if (pair.filter(Boolean).length < 2 || pair[0] === pair[1]) out.push({ code: 'SLOT_INCOMPLETE', n, slot: n });
      pair.filter(Boolean).forEach((id) => {
        const p = a.P[id];
        count[id] = (count[id] || 0) + 1; (where[id] ||= []).push(n);
        if (!present.includes(id)) out.push({ code: 'NOT_PRESENT', p: p.name, slot: n, id });
        const type = s.slotTypes[i];
        if (type === 'low' && (p.rank < s.lowRange[0] || p.rank > s.lowRange[1])) out.push({ code: 'LOW_RANK_SLOT', n, p: p.name, r: p.rank, slot: n, id });
        if (type === 'high' && (p.rank < s.highRange[0] || p.rank > s.highRange[1])) out.push({ code: 'HIGH_RANK_SLOT', n, p: p.name, r: p.rank, slot: n, id });
      });
    });
    present.forEach((id) => { if (!count[id]) out.push({ code: 'MIN_SETS', p: a.P[id].name, min: s.minSets, id }); });
    Object.entries(where).forEach(([id, ns]) => {
      if (ns.length > s.maxSets) out.push({ code: 'MAX_SETS', p: a.P[id].name, max: s.maxSets, id });
      ns.forEach((x, i) => { if (ns[i + 1] === x + 1) out.push({ code: 'CONSECUTIVE', p: a.P[id].name, n: x, n2: x + 1, slot: x + 1, id }); });
    });
    const lowest = present.filter((id) => a.P[id].rank === s.maxRank);
    if (present.length < oppPresent && lowest.length === 1 && (count[lowest[0]] || 0) < 2) out.push({ code: 'COMPENSATION', p: a.P[lowest[0]].name, r: s.maxRank, id: lowest[0] });
    return out;
  }

  const head = (title, sub, actions = '') => `<div class="flex flex-wrap items-end gap-3 mb-5"><div class="min-w-0"><h1 class="display text-4xl font-extrabold uppercase leading-none">${title}</h1>${sub ? `<p class="text-muted mt-1">${sub}</p>` : ''}</div><div class="ml-auto flex flex-wrap gap-2">${actions}</div></div>`;
  const field = (id, label, val, opts = {}) => `<label class="flex flex-col gap-1 min-w-0" for="${id}"><span class="label">${label}</span><input id="${id}" class="input ${opts.cls || ''}" value="${val}" ${opts.type ? `type="${opts.type}"` : ''}></label>`;

  const S = {};

  S.login = (u) => {
    const v = V[u.locale];
    return `<div class="min-h-screen grid place-items-center gutter py-10">
      <div class="w-full max-w-sm">
        <div class="wordmark text-4xl mb-1">ABT<i>·</i>27</div><div class="courtline mb-6"></div>
        <form class="panel p-6 flex flex-col gap-4" onsubmit="event.preventDefault();location.href='matches.html'">
          <h1 class="display text-3xl font-bold uppercase">${u.t('signIn')}</h1>
          ${field('login-email', u.t('email'), 'tam.vo@example.com', { type: 'email' })}
          ${field('login-pw', u.t('password'), 'password', { type: 'password' })}
          <button class="btn btn-primary w-full">${u.t('signIn')}</button>
          <p class="text-xs text-muted">${u.t('signInHint')}</p>
        </form>
        <p class="text-sm text-muted mt-4">${v.forgot}</p>
        <div class="flex gap-2 mt-6"><button id="locale-btn" class="btn btn-sm">${u.locale === 'vi' ? 'EN' : 'VI'}</button><button id="theme-btn" class="btn btn-sm">${u.t('theme')}</button><a class="btn btn-sm ml-auto" href="../index.html">${u.t('allScreens')}</a></div>
      </div></div>`;
  };

  S.aSeason = (u) => {
    const a = D(), s = a.settings, v = V[u.locale];
    const statuses = ['draft', 'published', 'group', 'knockout', 'finished'];
    const param = (id, label, val, hint) => `<div class="flex flex-col gap-1">${field(id, label, val, { type: 'number', cls: 'num' })}${hint ? `<span class="text-xs text-muted">${hint}</span>` : ''}</div>`;
    return `${head(a.season.name, `${u.t('status')}: ${a.season.status}`, `<button class="btn">${v.cloneSeason}</button><button class="btn btn-primary">${u.t('save')}</button>`)}
      <div class="panel p-4 mb-5 scroll-x"><ol class="flex gap-6 w-max">${statuses.map((x, i) => { const cur = statuses.indexOf(a.season.status); return `<li class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}"><b>${i < cur ? '✓' : i + 1}</b>${x}</li>`; }).join('')}</ol></div>
      <div class="grid gap-5 xl:grid-cols-2">
        <section class="panel p-5 flex flex-col gap-4"><h2 class="display text-2xl font-bold uppercase">${u.t('season')}</h2>
          ${field('s-name', 'Tên', a.season.name)}${field('s-venue', u.t('venue'), a.season.venue)}
          <div class="grid grid-cols-2 gap-3">${a.season.days.map((d, i) => field(`s-day-${i}`, `${u.t('day')} ${i + 1}`, d, { type: 'date' })).join('')}</div>
          <div><div class="label mb-1">${u.t('courts')}</div><div class="flex flex-wrap gap-2">${a.season.courts.map((c) => `<span class="chip">${c} <button aria-label="remove" class="text-muted">×</button></span>`).join('')}<button class="btn btn-sm">+ ${u.t('add')}</button></div></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="s-current" checked> ${u.t('setCurrent')}</label>
        </section>
        <section class="panel p-5 flex flex-col gap-4"><h2 class="display text-2xl font-bold uppercase">${u.t('rulesParams')}</h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            ${param('p-target', 'Điểm chạm / set', s.setTarget)}${param('p-gcap', 'Chấp tối đa vòng bảng', s.groupHandicapCap, '/ set')}${param('p-kcap', 'Chấp tối đa knock-out', s.koHandicapCap, '/ trận')}
            ${param('p-min', 'Set tối thiểu / VĐV', s.minSets)}${param('p-max', 'Set tối đa / VĐV', s.maxSets)}${param('p-present', 'VĐV có mặt tối thiểu', s.minPresent)}
          </div>
          <div><div class="label mb-1">Thứ tự set</div><div class="flex flex-wrap gap-2">${s.slotTypes.map((x, i) => `<span class="chip ${x === 'open' ? '' : 'chip-accent'}">${i + 1}. ${u.t(x)}</span>`).join('')}</div></div>
          <div class="grid grid-cols-2 gap-3">${field('p-low', `${u.t('low')} (rank)`, s.lowRange.join('–'))}${field('p-high', `${u.t('high')} (rank)`, s.highRange.join('–'))}</div>
          ${field('p-ms', 'Mốc tiếp sức', s.milestones.join(', '))}
          <div class="grid grid-cols-3 gap-3">${Object.entries(s.fees).map(([k, val]) => field(`p-fee-${k}`, `${u.t('fees')}: ${u.t(k)}`, val, { type: 'number', cls: 'num' })).join('')}</div>
        </section>
      </div>`;
  };

  S.aPlayers = (u) => {
    const a = D();
    const paid = a.players.filter((p) => p.feePaid);
    const total = a.players.reduce((s, p) => s + p.fee, 0), got = paid.reduce((s, p) => s + p.fee, 0);
    return `${head(u.t('aPlayers'), `${a.players.length} ${u.t('players').toLowerCase()}`, `<button class="btn">${u.t('importCsv')}</button><button class="btn btn-primary">+ ${u.t('add')}</button>`)}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div class="panel p-4"><div class="eyebrow">${u.t('collected')}</div><div class="display text-3xl font-bold num">${u.money(got)}</div></div>
        <div class="panel p-4"><div class="eyebrow">${u.t('expected')}</div><div class="display text-3xl font-bold num text-muted">${u.money(total)}</div></div>
        <div class="panel p-4"><div class="eyebrow">${u.t('paid')}</div><div class="display text-3xl font-bold num">${paid.length}/${a.players.length}</div></div>
        <div class="panel p-4"><div class="eyebrow">${u.t('unpaid')}</div><div class="display text-3xl font-bold num text-loss">${a.players.length - paid.length}</div></div>
      </div>
      <div class="panel scroll-x"><table class="tbl num">
        <thead><tr><th>${u.t('players')}</th><th>${u.t('gender')}</th><th class="r">${u.t('rank')}</th><th class="r">${u.t('skill')}</th><th>${u.t('team')}</th><th>${u.t('memberType')}</th><th class="r">${u.t('fees')}</th><th>${u.t('paid')}</th><th></th></tr></thead>
        <tbody>${[...a.players].sort((x, y) => x.teamId.localeCompare(y.teamId) || x.rank - y.rank).map((p) => `<tr>
          <td class="font-semibold">${u.esc(p.name)}</td><td>${u.t(p.gender)}</td><td class="r">R${p.rank}</td><td class="r"><input aria-label="skill" class="input !h-8 !w-16 text-right num" value="${p.skill}"></td>
          <td>${u.teamChip(p.teamId)}</td><td><span class="chip">${u.t(p.memberType)}</span></td><td class="r">${u.money(p.fee)}</td>
          <td><label class="inline-flex items-center gap-2"><input type="checkbox" ${p.feePaid ? 'checked' : ''} aria-label="${u.t('paid')}"> <span class="${p.feePaid ? 'text-win' : 'text-loss'} text-sm">${p.feePaid ? u.t('paid') : u.t('unpaid')}</span></label></td>
          <td><button class="btn btn-sm">${u.t('edit')}</button></td></tr>`).join('')}</tbody></table></div>`;
  };

  S.aTeams = (u) => {
    const a = D(), v = V[u.locale];
    return `${head(u.t('aTeams'), `${a.teams.length} ${u.t('teams').toLowerCase()} × 8`, `<button class="btn">${v.importDraw}</button><button class="btn btn-primary">+ ${u.t('add')}</button>`)}
      <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">${a.teams.map((tm) => `<section class="panel">
        <div class="flex items-center gap-3 p-4 border-b border-line"><input type="color" value="${tm.color}" aria-label="color" class="w-8 h-8 rounded border border-line bg-transparent"><input class="input font-semibold" value="${u.esc(tm.name)}" aria-label="name"></div>
        <ol class="p-2">${tm.roster.map((id) => { const p = a.P[id]; return `<li class="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-surface2 cursor-grab"><span class="text-muted" aria-hidden="true">⋮⋮</span><b class="display w-7">R${p.rank}</b><span class="truncate min-w-0">${u.esc(p.name)}</span><span class="ml-auto text-xs text-muted num">${p.skill}</span>${id === tm.captainId ? `<span class="chip chip-accent">${u.t('captain')}</span>` : `<button class="text-xs text-muted hover:text-fg">${u.t('captain')}?</button>`}</li>`; }).join('')}</ol>
      </section>`).join('')}</div>`;
  };

  S.aSchedule = (u) => {
    const a = D(), v = V[u.locale];
    const ms = a.matches;
    const byDay = {};
    ms.forEach((m) => ((byDay[m.date] ||= {})[m.time] ||= []).push(m));
    return `${head(u.t('aSchedule'), v.regenHint, `<button class="btn" disabled>${u.t('generateRR')}</button>`)}
      <div class="panel p-3 mb-5 text-sm flex items-center gap-2"><span class="chip chip-win">✓</span>${u.t('noConflicts')}</div>
      ${Object.entries(byDay).map(([d, times]) => `<section class="mb-6"><h2 class="display text-2xl font-bold uppercase mb-3">${u.fmtDate(d, { weekday: 'long', day: '2-digit', month: '2-digit' })}</h2>
        <div class="panel scroll-x"><table class="tbl"><thead><tr><th>${u.t('time')}</th>${a.season.courts.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${Object.entries(times).map(([tm, xs]) => `<tr><td class="display text-lg font-semibold num align-top">${tm}</td>${a.season.courts.map((c) => { const m = xs.find((x) => x.court === c); return `<td class="align-top">${m ? `<div class="flex flex-col gap-1.5 min-w-[200px]"><div class="flex items-center gap-2"><b class="display">${m.code}</b>${u.statusChip(m)}</div><div class="text-sm">${m.home ? `${u.esc(a.T[m.home].name)} – ${u.esc(a.T[m.away].name)}` : `<span class="text-muted">${u.t('tbd')}</span>`}</div>
          <select class="select !h-8 text-sm" aria-label="${u.t('referee')}">${a.referees.map((r) => `<option ${r.id === m.referee ? 'selected' : ''}>${u.esc(r.name)}</option>`).join('')}</select></div>` : '<span class="text-muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('')}`;
  };

  S.aMatches = (u) => {
    const a = D();
    const me = u.role === 'referee' ? 'u3' : 'u1';
    const mine = a.matches.filter((m) => m.referee === me);
    const others = a.matches.filter((m) => m.referee !== me);
    const row = (m) => `<a href="${u.link('match.html', { code: m.code, ...(u.role === 'referee' ? { role: 'referee' } : {}) })}" class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-surface2">
      <b class="display text-lg w-12">${m.code}</b><span class="text-sm text-muted num w-28">${u.fmtDate(m.date)} ${m.time}</span><span class="text-sm text-muted w-14">${m.court}</span>
      <span class="min-w-0 flex-1 truncate text-sm">${m.home ? `${u.esc(a.T[m.home].name)} – ${u.esc(a.T[m.away].name)}` : u.t('tbd')}</span><span class="num">${m.score ? m.score.join('–') : ''}</span>${u.statusChip(m)}</a>`;
    return `${head(u.t('aMatches'), u.role === 'referee' ? u.t('refereeRole') : u.t('btc'))}
      ${mine.length ? `<section class="mb-6"><h2 class="eyebrow mb-2">${u.t('myMatches')} · ${mine.length}</h2><div class="panel divide-y divide-line">${mine.map(row).join('')}</div></section>` : ''}
      <section><h2 class="eyebrow mb-2">${u.t('other')} · ${others.length}</h2><div class="panel divide-y divide-line">${others.map(row).join('')}</div></section>`;
  };

  S.aMatch = (u) => {
    const a = D(), s = a.settings, v = V[u.locale];
    const m = a.matches.find((x) => x.code === (u.params.get('code') || 'F')) || a.matches[0];
    const demo = u.params.get('demo') === 'violations';
    const def = demo ? 'lineup' : ['completed', 'lineup_locked', 'in_progress', 'forfeit'].includes(m.status) ? 'scores' : 'attendance';
    const step = u.params.get('step') || def;
    const steps = ['attendance', 'lineup', 'lock', 'scores'];
    const cur = steps.indexOf(step);
    const relay = m.stage !== 'group';
    const home = m.home && a.T[m.home], away = m.away && a.T[m.away];
    if (!home) return `${head(m.code, u.t('tbd'))}<div class="panel p-8 text-center text-muted">${u.t('tbd')}</div>`;

    // Demo lineup with violations: start from a valid template and break three rules.
    const lineupOf = (tm, side) => {
      if (m.slots && m.slots[0].home.length) return m.slots.map((x) => (side ? x.away : x.home));
      return [[0, 6], [3, 4], [1, 5], [2, 0], [7, 3]].map((pr) => pr.map((i) => tm.roster[i]));
    };
    let hl = lineupOf(home, 0);
    const al = lineupOf(away, 1);
    let presentH = [...home.roster], presentA = [...away.roster];
    if (demo) {
      hl = [[home.roster[0], home.roster[6]], [home.roster[1], home.roster[4]], [home.roster[1], home.roster[5]], [home.roster[2], home.roster[0]], [home.roster[7], home.roster[4]]];
      presentA = away.roster.slice(0, 7);
    }
    const vh = validateLineup(hl, presentH, presentA.length, s), va = validateLineup(al, presentA, presentH.length, s);
    const bad = (vs, slot, id) => vs.some((x) => x.slot === slot && (!id || x.id === id));

    const stepBar = `<ol class="panel p-3 flex gap-5 scroll-x mb-5">${[...steps, 'done'].map((x, i) => `<li><a href="${u.link('match.html', { code: m.code, step: x === 'done' ? 'scores' : x, ...(demo ? { demo: 'violations' } : {}), ...(u.role === 'referee' ? { role: 'referee' } : {}) })}" class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}"><b>${i < cur ? '✓' : i + 1}</b>${u.t(`step${x[0].toUpperCase()}${x.slice(1)}`)}</a></li>`).join('')}</ol>`;
    const sideActions = `<div class="flex flex-wrap gap-2"><button class="btn btn-sm">${u.t('substitute')}</button><button class="btn btn-sm">${u.t('forfeitAction')}</button>${u.role === 'btc' ? `<button class="btn btn-sm btn-danger">${u.t('disqualify')}</button><button class="btn btn-sm">${u.t('reopen')}</button>` : ''}</div>`;
    const headHtml = `<a href="${u.link('matches.html', u.role === 'referee' ? { role: 'referee' } : {})}" class="text-sm text-muted hover:underline">← ${u.t('aMatches')}</a>
      <div class="flex flex-wrap items-center gap-3 mt-2 mb-4"><h1 class="display text-4xl font-extrabold uppercase">${m.code}</h1>${u.statusChip(m)}<span class="text-muted text-sm">${u.stageLabel(m)} · ${m.court} · ${m.time}</span><div class="ml-auto">${sideActions}</div></div>
      <div class="flex flex-wrap items-center gap-3 mb-5 text-lg">${u.teamChip(m.home)}<span class="text-muted">vs</span>${u.teamChip(m.away)}</div>`;

    let body = '';
    if (step === 'attendance') {
      body = `<div class="grid gap-4 md:grid-cols-2">${[[home, presentH], [away, presentA]].map(([tm, pr]) => `<section class="panel">
        <div class="flex items-center gap-2 p-4 border-b border-line">${u.teamChip(tm.id)}<span class="ml-auto chip ${pr.length < s.minPresent ? 'chip-loss' : ''} num">${fmt(v.presentOf, { c: pr.length, t: tm.roster.length })}</span></div>
        <ul class="p-2">${tm.roster.map((id) => `<li><label class="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface2"><input type="checkbox" ${pr.includes(id) ? 'checked' : ''}><b class="display w-7">R${a.P[id].rank}</b><span class="min-w-0 truncate">${u.esc(a.P[id].name)}</span><span class="ml-auto text-xs text-muted num">${a.P[id].skill}</span></label></li>`).join('')}</ul></section>`).join('')}</div>`;
    } else if (step === 'lineup') {
      const grid = (tm, lineup, vs, side) => `<section class="panel min-w-0">
        <div class="flex items-center gap-2 p-4 border-b border-line">${u.teamChip(tm.id)}<span class="ml-auto chip ${vs.length ? 'chip-loss' : 'chip-win'}">${vs.length ? `${vs.length} ${u.t('violations').toLowerCase()}` : v.noViolations}</span></div>
        <div class="p-3 flex flex-col gap-2">${lineup.map((pair, i) => {
          const hc = a.slotHandicap(side ? hl[i] : pair, side ? pair : al[i], s.groupHandicapCap);
          const mine = hc[side];
          return `<div class="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_48px] gap-2 items-center">
            <div class="flex flex-col"><b class="display">${u.t(relay ? 'leg' : 'set')} ${i + 1}</b><span class="text-xs ${s.slotTypes[i] === 'open' ? 'text-muted' : 'text-accent'}">${u.t(s.slotTypes[i])}</span></div>
            ${pair.map((id) => `<select class="select !h-9 text-sm ${bad(vs, i + 1, id) ? 'cell-bad' : ''}" aria-label="player">${tm.roster.map((pid) => `<option ${pid === id ? 'selected' : ''}>R${a.P[pid].rank} · ${u.esc(a.P[pid].name)}</option>`).join('')}</select>`).join('')}
            <span class="text-right">${!relay && mine ? `<span class="hc">+${mine}</span>` : ''}</span></div>`;
        }).join('')}</div>
        ${vs.length ? `<div class="border-t border-line p-4 flex flex-col gap-3"><div class="eyebrow text-loss">${u.t('violations')}</div><ul class="flex flex-col gap-1.5 text-sm">${vs.map((x) => `<li class="flex gap-2"><code class="text-xs text-muted pt-0.5">${x.code}</code><span>${u.esc(fmt(v[x.code], x))}</span></li>`).join('')}</ul>
          ${u.role === 'btc' ? `<label class="flex flex-col gap-1"><span class="label">${u.t('overrideReason')}</span><textarea id="ovr-${side}" class="input !h-16 py-2" placeholder="…"></textarea></label><button class="btn btn-sm self-start">${u.t('override')}</button>` : `<p class="text-sm chip chip-warn self-start whitespace-normal">${v.refereeBlocked}</p>`}</div>` : ''}
      </section>`;
      const rh = relay ? a.relayHandicap(hl.map((h, i) => ({ home: h, away: al[i] })), s.koHandicapCap) : null;
      body = `${relay ? `<div class="panel p-3 mb-4 text-sm">${v.previewHc}: <b class="display text-lg num">${rh.start[0]}–${rh.start[1]}</b> <span class="text-muted num">(net ${rh.net > 0 ? '+' : ''}${rh.net}, cap ${s.koHandicapCap})</span></div>` : ''}
        <div class="grid gap-4 xl:grid-cols-2">${grid(home, hl, vh, 0)}${grid(away, al, va, 1)}</div>
        <div class="flex justify-end mt-4"><button class="btn btn-primary" ${vh.length || va.length ? 'disabled style="opacity:.5"' : ''}>${u.t('lockLineups')}</button></div>`;
    } else if (step === 'lock') {
      body = `<div class="panel p-5 text-sm">${v.lockedAt} <b>${u.esc(u.userName(m.referee))}</b>.</div>`;
    } else {
      const slots = m.slots || [];
      body = `<p class="text-sm text-muted mb-3">${relay ? v.enterRelay : v.enterScores}</p>
        ${relay && m.relayStart ? `<div class="panel p-3 mb-3 text-sm">${u.t('relayStart')}: <b class="display text-lg num">${m.relayStart[0]}–${m.relayStart[1]}</b></div>` : ''}
        <div class="panel divide-y divide-line">${slots.map((x, i) => `<div class="grid grid-cols-[72px_minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-3 items-center p-3">
          <div class="flex flex-col"><b class="display text-lg">${u.t(relay ? 'leg' : 'set')} ${i + 1}</b><span class="text-xs text-muted">${relay ? `→ ${s.milestones[i]}` : u.t(x.type)}</span></div>
          <div class="text-sm min-w-0 truncate">${x.home.map((id) => u.esc(a.P[id].name)).join(' + ') || '—'}${!relay && x.hc && x.hc[0] ? ` <span class="hc">+${x.hc[0]}</span>` : ''}</div>
          <div class="flex items-center gap-1"><input aria-label="home score" class="input !w-16 text-center num display text-xl" value="${x.score ? x.score[0] : ''}"><span class="text-muted">–</span><input aria-label="away score" class="input !w-16 text-center num display text-xl" value="${x.score ? x.score[1] : ''}"></div>
          <div class="text-sm min-w-0 truncate text-right">${!relay && x.hc && x.hc[1] ? `<span class="hc">+${x.hc[1]}</span> ` : ''}${x.away.map((id) => u.esc(a.P[id].name)).join(' + ') || '—'}</div>
          <button class="btn btn-sm">${u.t('saveSet')}</button></div>`).join('')}</div>`;
    }
    return headHtml + stepBar + body;
  };

  S.aClose = (u) => {
    const a = D(), v = V[u.locale];
    const closed = a.state === 'knockout';
    const draws = a.table.filter((r) => r.why === 'draw');
    return `${head(u.t('aClose'), closed ? '' : u.t('provisional'), `<button class="btn btn-primary" ${closed ? 'disabled style="opacity:.5"' : ''}>${u.t('lockGroup')}</button>`)}
      ${closed ? `<div class="panel p-4 mb-5 text-sm flex items-center gap-2"><span class="chip chip-win">${u.t('closed')}</span>${v.closedInfo}</div>` : ''}
      <div class="panel mb-5">${window.ABTPublicTable(u)}</div>
      <section class="panel p-5"><h2 class="display text-2xl font-bold uppercase mb-2">${u.t('why_draw')}</h2>
        ${draws.length ? `<p class="text-sm text-muted mb-3">${u.t('drawOrder')}</p><ol class="flex flex-col gap-2 max-w-md">${draws.map((r) => `<li class="panel p-3 flex items-center gap-3 cursor-grab"><span class="text-muted">⋮⋮</span>${u.teamChip(r.id)}</li>`).join('')}</ol>` : `<p class="text-sm flex items-center gap-2"><span class="chip chip-win">✓</span>${v.allResolved}</p>`}
        <label class="flex flex-col gap-1 mt-4 max-w-md"><span class="label">${u.t('note')}</span><textarea id="close-note" class="input !h-16 py-2"></textarea></label></section>`;
  };

  S.aAwards = (u) => {
    const a = D(), v = V[u.locale];
    const x = a.awards[0];
    return `${head(u.t('aAwards'), `${a.awards.length}`, `<button class="btn btn-primary">+ ${u.t('add')}</button>`)}
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol class="panel divide-y divide-line self-start">${a.awards.map((w, i) => `<li class="flex items-center gap-3 p-3 ${i === 0 ? 'bg-surface2' : ''}"><span class="text-muted cursor-grab">⋮⋮</span><div class="min-w-0"><div class="font-semibold truncate">${u.esc(w.name)}</div><div class="text-xs text-muted truncate">${u.esc(w.sponsor)} · ${u.money(w.value)}</div></div><span class="ml-auto chip ${w.winners.length ? 'chip-win' : 'chip-warn'}">${w.winners.length || u.t('pending')}</span></li>`).join('')}</ol>
        <form class="panel p-5 flex flex-col gap-4" onsubmit="event.preventDefault()">
          <div class="grid grid-cols-2 gap-3">${field('aw-name', 'Tên (VI)', u.esc(x.name))}${field('aw-name-en', 'Name (EN)', u.esc(x.nameEn))}</div>
          <div class="grid grid-cols-2 gap-3">${field('aw-sponsor', u.t('sponsor'), u.esc(x.sponsor))}${field('aw-value', u.t('value'), x.value, { type: 'number', cls: 'num' })}</div>
          ${field('aw-criteria', u.t('criteria'), u.esc(x.criteria))}
          <div class="courtline"></div>
          <div class="eyebrow">${u.t('winners')}</div>
          ${x.winners.map((w) => `<div class="grid gap-3 sm:grid-cols-3"><label class="flex flex-col gap-1"><span class="label">${v.winnerKind}</span><select class="select"><option>${u.t('players')}</option><option selected>${u.t('pair')}</option><option>${u.t('team')}</option></select></label>
            <label class="flex flex-col gap-1 sm:col-span-2"><span class="label">${u.t('pair')}</span><div class="flex flex-wrap gap-2">${w.ids.map((id) => `<span class="chip">${u.esc(a.P[id].name)} ×</span>`).join('')}</div></label>
            <label class="flex flex-col gap-1"><span class="label">${v.relatedMatch}</span><select class="select"><option>${w.match}</option></select></label>${field('aw-note', u.t('note'), u.esc(w.note))}</div>`).join('')}
          <button class="btn btn-sm self-start">+ ${u.t('winners')}</button>
          <div class="flex justify-end gap-2"><button type="button" class="btn">${u.t('cancel')}</button><button class="btn btn-primary">${u.t('save')}</button></div>
        </form></div>`;
  };

  S.aUsers = (u) => {
    const a = D(), v = V[u.locale];
    return `${head(u.t('aUsers'), `${a.users.length}`)}
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="panel scroll-x self-start"><table class="tbl"><thead><tr><th>${u.t('players')}</th><th>${u.t('email')}</th><th>${u.t('role')}</th><th>${u.t('status')}</th><th></th></tr></thead>
          <tbody>${a.users.map((x) => `<tr><td class="font-semibold">${u.esc(x.name)}</td><td class="text-muted">${u.esc(x.email)}</td><td><span class="chip ${x.role === 'btc' ? 'chip-accent' : ''}">${x.role === 'btc' ? u.t('btc') : u.t('refereeRole')}</span></td>
            <td>${x.mustChange ? `<span class="chip chip-warn">${u.t('mustChange')}</span>` : `<span class="chip chip-win">${u.t('active')}</span>`}</td><td class="flex gap-2"><button class="btn btn-sm">${u.t('resetPw')}</button><button class="btn btn-sm btn-danger">${u.t('deactivate')}</button></td></tr>`).join('')}</tbody></table></div>
        <form class="panel p-5 flex flex-col gap-4 self-start" onsubmit="event.preventDefault()"><h2 class="display text-2xl font-bold uppercase">${u.t('newUser')}</h2>
          ${field('nu-name', 'Tên hiển thị', '')}${field('nu-email', u.t('email'), '', { type: 'email' })}
          <label class="flex flex-col gap-1"><span class="label">${u.t('role')}</span><select id="nu-role" class="select"><option>${u.t('refereeRole')}</option><option>${u.t('btc')}</option></select></label>
          ${field('nu-pw', v.tempPw, 'abt-2027-xk4q')}<p class="text-xs text-muted">${v.tempPwHint}</p>
          <button class="btn btn-primary">${u.t('newUser')}</button></form></div>`;
  };

  // Reuse the public standings table on the close-group screen.
  window.ABTPublicTable = (u) => {
    const a = D();
    return `<div class="scroll-x"><table class="tbl num"><thead><tr><th>#</th><th>${u.t('colTeam')}</th><th class="r">${u.t('colPts')}</th><th class="r">${u.t('colSD')}</th><th class="r">${u.t('colPD')}</th><th>${u.t('why')}</th></tr></thead>
      <tbody>${a.table.map((r) => `<tr class="${r.pos === 4 ? 'cut' : ''}"><td><b class="display text-lg ${r.pos <= 4 ? 'text-accent' : 'text-muted'}">${r.pos}</b></td><td>${u.teamChip(r.id)}</td><td class="r"><b class="display text-lg">${r.pts}</b></td><td class="r">${r.sd > 0 ? '+' : ''}${r.sd}</td><td class="r">${r.pd > 0 ? '+' : ''}${r.pd}</td><td>${r.why === 'pts' ? '' : `<span class="chip">${u.t(`why_${r.why}`)}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
  };

  window.ABTAdmin = { validateLineup };
  window.ABTUI.mount(S[document.body.dataset.screen]);
})();
