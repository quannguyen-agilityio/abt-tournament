// Public dashboard screens P1–P9 (spec §5). One render function per screen.
(function () {
  'use strict';
  const D = () => window.ABT;

  // Every set (group) or leg (relay) a team played, with per-slot points.
  // Relay scores are cumulative, so a leg's points are the delta from the previous leg.
  function slotRows() {
    const rows = [];
    D().matches.forEach((m) => {
      if (!m.slots || !['completed', 'in_progress'].includes(m.status)) return;
      m.slots.forEach((s, i) => {
        if (!s.score || !s.home.length) return;
        let hs = s.score[0], as = s.score[1];
        if (m.stage !== 'group') {
          const prev = i === 0 ? m.relayStart : m.slots[i - 1].score;
          hs -= prev[0]; as -= prev[1];
        }
        const homeWon = s.score[0] > s.score[1];
        rows.push({ m, s, side: 0, pair: s.home, pts: hs, opp: as, won: homeWon });
        rows.push({ m, s, side: 1, pair: s.away, pts: as, opp: hs, won: !homeWon });
      });
    });
    return rows;
  }

  function matchCard(m, u, opts = {}) {
    const { t, teamChip, statusChip, scoreHtml, link, esc } = u;
    return `<a href="${link('match.html', { code: m.code })}" class="panel p-4 flex flex-col gap-3 hover:border-accent/60 transition-colors min-w-0">
      <div class="flex items-center gap-2 text-xs text-muted"><span class="display text-sm font-semibold text-fg">${m.code}</span><span>·</span><span>${u.stageLabel(m)}</span><span class="ml-auto">${statusChip(m)}</span></div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 items-center">
        <div class="truncate">${m.home ? `<span class="inline-flex items-center gap-2 font-semibold"><span class="swatch" style="background:${u.team(m.home).color}"></span>${esc(u.team(m.home).name)}</span>` : `<span class="text-muted">${t('tbd')}</span>`}</div>
        <div class="score text-xl text-right ${m.score && m.score[0] > m.score[1] ? '' : 'text-muted'}">${m.score ? m.score[0] : ''}</div>
        <div class="truncate">${m.away ? `<span class="inline-flex items-center gap-2 font-semibold"><span class="swatch" style="background:${u.team(m.away).color}"></span>${esc(u.team(m.away).name)}</span>` : `<span class="text-muted">${t('tbd')}</span>`}</div>
        <div class="score text-xl text-right ${m.score && m.score[1] > m.score[0] ? '' : 'text-muted'}">${m.score ? m.score[1] : ''}</div>
      </div>
      ${opts.compact ? '' : `<div class="flex items-center gap-3 text-xs text-muted num"><span>${u.fmtDate(m.date)} · ${m.time}</span><span>${esc(m.court)}</span><span class="ml-auto truncate">${t('referee')}: ${esc(u.userName(m.referee))}</span></div>`}
    </a>`;
  }

  function standingsTable(u, rows, opts = {}) {
    const { t, teamChip } = u;
    const closed = D().state === 'knockout';
    return `<div class="scroll-x"><table class="tbl num">
      <thead><tr><th>${t('colPos')}</th><th>${t('colTeam')}</th><th class="r">${t('colP')}</th><th class="r">${t('colW')}</th><th class="r">${t('colL')}</th><th class="r">${t('colPts')}</th>
      ${opts.mini ? '' : `<th class="r">${t('colSets')}</th><th class="r">${t('colSD')}</th><th class="r">${t('colPoints')}</th><th class="r">${t('colPD')}</th><th>${t('why')}</th>`}</tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.pos === 4 && !opts.mini ? 'cut' : ''}">
        <td><span class="display text-lg font-bold ${r.pos <= 4 ? 'text-accent' : 'text-muted'}">${r.pos}</span></td>
        <td>${teamChip(r.id)}</td><td class="r">${r.p}</td><td class="r">${r.w}</td><td class="r">${r.l}</td><td class="r"><b class="display text-lg">${r.pts}</b></td>
        ${opts.mini ? '' : `<td class="r">${r.sw}–${r.sl}</td><td class="r">${r.sd > 0 ? '+' : ''}${r.sd}</td><td class="r text-muted">${r.pf}–${r.pa}</td><td class="r">${r.pd > 0 ? '+' : ''}${r.pd}</td>
        <td>${r.why === 'pts' ? '' : `<span class="chip ${r.why === 'draw' ? 'chip-warn' : ''}">${t(`why_${r.why}`)}</span>`}</td>`}
      </tr>`).join('')}</tbody></table></div>
      ${opts.mini ? '' : `<p class="text-sm text-muted mt-3 flex items-center gap-2">${closed ? `<span class="chip chip-win">${t('closed')}</span>` : `<span class="chip chip-warn">${t('provisional')}</span>`}<span>${t('top4')}</span></p>`}`;
  }

  const sectionHead = (title, more) => `<div class="flex items-end gap-3 mb-3"><h2 class="display text-2xl font-bold uppercase tracking-wide">${title}</h2>${more || ''}</div>`;

  const S = {};

  S.home = (u) => {
    const { t, link, esc } = u;
    const a = D();
    const ms = a.matches;
    const live = ms.filter((m) => m.status === 'in_progress');
    const upcoming = ms.filter((m) => ['scheduled', 'lineup_locked'].includes(m.status) && m.home).slice(0, 3);
    const latest = ms.filter((m) => ['completed', 'forfeit'].includes(m.status)).slice(-4).reverse();
    const third = ms.find((m) => m.code === '3RD');
    const final = ms.find((m) => m.code === 'F');
    return `
    <section class="mb-8">
      <div class="eyebrow mb-2">${a.season.days.map((d) => u.fmtDate(d, { day: '2-digit', month: '2-digit', year: 'numeric' })).join(' · ')} · ${esc(a.season.venue)}</div>
      <h1 class="display text-5xl sm:text-6xl font-extrabold uppercase leading-none">Agility Badminton<br><span class="text-accent">Tournament 2027</span></h1>
      <div class="courtline mt-5 max-w-md"></div>
      <p class="text-sm text-muted mt-3">${t('lastUpdated')} 14:32 · ${t('autoRefresh')}</p>
    </section>
    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div class="flex flex-col gap-8 min-w-0">
        ${live.length ? `<section>${sectionHead(t('now'))}<div class="grid gap-3 sm:grid-cols-2">${live.map((m) => matchCard(m, u)).join('')}</div></section>` : ''}
        <section>${sectionHead(t('next'), `<a class="ml-auto text-sm text-accent hover:underline" href="${link('matches.html')}">${t('seeAll')} →</a>`)}
          <div class="grid gap-3 sm:grid-cols-2">${upcoming.map((m) => matchCard(m, u)).join('')}</div></section>
        <section>${sectionHead(t('latest'))}<div class="grid gap-3 sm:grid-cols-2">${latest.map((m) => matchCard(m, u)).join('')}</div></section>
      </div>
      <aside class="flex flex-col gap-8 min-w-0">
        <section>${sectionHead(t('standings'), `<a class="ml-auto text-sm text-accent hover:underline" href="${link('standings.html')}">${t('seeAll')} →</a>`)}
          <div class="panel">${standingsTable(u, a.table.slice(0, 4), { mini: true })}</div></section>
        ${a.state === 'knockout' ? `<section>${sectionHead(t('bracket'), `<a class="ml-auto text-sm text-accent hover:underline" href="${link('bracket.html')}">${t('seeAll')} →</a>`)}
          <div class="flex flex-col gap-3">${matchCard(final, u, { compact: true })}${matchCard(third, u, { compact: true })}</div></section>` : ''}
      </aside>
    </div>`;
  };

  S.standings = (u) => {
    const a = D();
    return `<h1 class="display text-4xl font-extrabold uppercase mb-1">${u.t('standings')}</h1>
      <p class="text-muted mb-5">${u.t('group')} · ${a.teams.length} ${u.t('teams').toLowerCase()} · ${a.matches.filter((m) => m.stage === 'group' && ['completed', 'forfeit'].includes(m.status)).length}/${a.matches.filter((m) => m.stage === 'group').length}</p>
      <div class="panel">${standingsTable(u, a.table)}</div>
      <div class="mt-6 grid gap-2 text-sm text-muted max-w-3xl">
        <div class="eyebrow">${u.t('why')}</div>
        <p>${u.locale === 'vi' ? 'Thứ tự xét: điểm → đối đầu (2 đội) hoặc mini-league (từ 3 đội: điểm, hiệu số set, hiệu số điểm giữa các đội đó) → hiệu số set toàn giải → hiệu số điểm toàn giải → bốc thăm.' : 'Order: points → head-to-head (2 teams) or mini-league (3+ teams: points, set difference, point difference among them) → overall set difference → overall point difference → draw.'}</p>
      </div>`;
  };

  S.matches = (u) => {
    const { t, esc } = u;
    const a = D();
    const f = { day: u.params.get('day') || '', team: u.params.get('team') || '', court: u.params.get('court') || '', stage: u.params.get('stage') || '' };
    const list = a.matches.filter((m) => (!f.day || m.date === f.day) && (!f.team || m.home === f.team || m.away === f.team) && (!f.court || m.court === f.court) && (!f.stage || (f.stage === 'group' ? m.stage === 'group' : m.stage !== 'group')));
    const sel = (id, label, opts, val) => `<label class="flex flex-col gap-1 min-w-0"><span class="label">${label}</span><select id="${id}" class="select" data-filter="${id.replace('f-', '')}"><option value="">${t('all')}</option>${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const byDay = {};
    list.forEach((m) => (byDay[m.date] ||= []).push(m));
    return `<h1 class="display text-4xl font-extrabold uppercase mb-5">${t('matches')}</h1>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        ${sel('f-day', t('day'), a.season.days.map((d) => [d, u.fmtDate(d)]), f.day)}
        ${sel('f-team', t('team'), a.teams.map((x) => [x.id, x.name]), f.team)}
        ${sel('f-court', t('court'), a.season.courts.map((c) => [c, c]), f.court)}
        ${sel('f-stage', t('stage'), [['group', t('group')], ['ko', t('bracket')]], f.stage)}
      </div>
      ${list.length ? Object.entries(byDay).map(([d, ms]) => {
        const byTime = {};
        ms.forEach((m) => (byTime[m.time] ||= []).push(m));
        return `<section class="mb-8"><h2 class="display text-2xl font-bold uppercase mb-1">${u.fmtDate(d, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</h2><div class="courtline mb-4 max-w-xs"></div>
          ${Object.entries(byTime).map(([tm, xs]) => `<div class="grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)] mb-4"><div class="display text-xl font-semibold text-muted num pt-3">${tm}</div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-w-0">${xs.map((m) => matchCard(m, u)).join('')}</div></div>`).join('')}</section>`;
      }).join('') : `<div class="panel p-8 text-center text-muted">${t('noMatches')}</div>`}`;
  };

  S.match = (u) => {
    const { t, esc, teamChip, playerLink } = u;
    const a = D();
    const m = a.matches.find((x) => x.code === (u.params.get('code') || 'V01')) || a.matches[0];
    const relay = m.stage !== 'group';
    const showLineup = m.slots && m.status !== 'scheduled';
    const pairCell = (ids, hcPts, side) => (ids && ids.length ? `<div class="flex flex-col gap-0.5 ${side ? 'sm:items-end sm:text-right' : ''}">${ids.map((id) => `<div>${playerLink(id, { rank: true })}</div>`).join('')}${hcPts ? `<div><span class="hc">+${hcPts} ${t('start')}</span></div>` : ''}</div>` : '<span class="text-muted">—</span>');
    const typeChip = (s) => `<span class="chip ${s.type === 'open' ? '' : 'chip-accent'}">${t(s.type)}</span>`;
    let body = '';
    if (m.status === 'forfeit') {
      body = `<div class="panel p-5 flex items-start gap-3"><span class="chip chip-warn">${t('forfeit')}</span><div><div class="font-semibold">${esc(a.T[m.forfeitTeam].name)}: ${t(`forfeitReason_${m.forfeitReason}`)}</div><div class="text-sm text-muted">5–0 · 31–0 × 5</div></div></div>`;
    } else if (!showLineup) {
      body = `<div class="panel p-8 text-center text-muted">${t('lineupHidden')}</div>`;
    } else if (!relay) {
      body = `<div class="panel divide-y divide-line">${m.slots.map((s) => {
        const done = !!s.score;
        const hw = done && s.score[0] > s.score[1];
        return `<div class="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_120px_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 items-center">
          <div class="flex sm:flex-col gap-2 items-start row-span-3 sm:row-span-1"><span class="display text-lg font-bold">${t('set')} ${s.no}</span>${typeChip(s)}</div>
          ${pairCell(s.home, s.hc && s.hc[0], 0)}
          <div class="text-center">${done ? `<span class="score text-3xl"><span class="${hw ? 'w' : 'l'}">${s.score[0]}</span><span class="text-muted px-1">–</span><span class="${hw ? 'l' : 'w'}">${s.score[1]}</span></span>` : `<span class="text-muted text-sm">${t('scheduled')}</span>`}</div>
          ${pairCell(s.away, s.hc && s.hc[1], 1)}
        </div>`;
      }).join('')}</div>`;
    } else {
      const st = m.relayStart;
      const last = m.slots.filter((s) => s.score).pop();
      const cur = last ? last.score : st;
      body = `<div class="panel p-4 mb-4"><div class="flex flex-wrap items-center gap-3 text-sm"><span class="text-muted">${t('relayNote')}</span>
          <span class="ml-auto">${t('relayStart')}: <b class="display text-lg num">${st[0]}–${st[1]}</b> <span class="text-muted num">(net ${m.relayNet > 0 ? '+' : ''}${m.relayNet}, cap ${a.settings.koHandicapCap})</span></span></div>
          <div class="mt-4 grid gap-2">${[0, 1].map((i) => `<div class="grid grid-cols-[120px_minmax(0,1fr)_40px] items-center gap-3"><span class="truncate text-sm font-semibold">${esc(a.T[i ? m.away : m.home].name)}</span>
            <div class="relay"><span style="width:${(cur[i] / 125) * 100}%;background:${a.T[i ? m.away : m.home].color}"></span>${[25, 50, 75, 100].map((x) => `<i class="tick" style="left:${(x / 125) * 100}%"></i>`).join('')}</div><span class="score text-lg text-right">${cur[i]}</span></div>`).join('')}</div></div>
        <div class="panel divide-y divide-line">${m.slots.map((s, i) => {
          const done = !!s.score;
          return `<div class="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_140px_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 items-center">
            <div class="flex sm:flex-col gap-2 items-start row-span-3 sm:row-span-1"><span class="display text-lg font-bold">${t('leg')} ${s.no}</span>${typeChip(s)}<span class="text-xs text-muted num">→ ${a.settings.milestones[i]}</span></div>
            ${pairCell(s.home, 0, 0)}
            <div class="text-center">${done ? `<span class="score text-3xl">${s.score[0]}<span class="text-muted px-1">–</span>${s.score[1]}</span>` : `<span class="text-muted text-sm">${t(m.status)}</span>`}</div>
            ${pairCell(s.away, 0, 1)}
            ${s.sub ? `<div class="col-span-full text-sm"><span class="chip chip-warn">${t('substitution')}</span> ${playerLink(s.sub.out)} → ${playerLink(s.sub.in)} <span class="text-muted">(${t(s.sub.reason)}, rank ±1)</span></div>` : ''}
          </div>`;
        }).join('')}</div>`;
    }
    return `<a href="${u.link('matches.html')}" class="text-sm text-muted hover:underline">← ${t('matches')}</a>
      <div class="panel p-5 sm:p-6 mt-3 mb-6">
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted mb-4"><span class="display text-lg font-bold text-fg">${m.code}</span><span>${u.stageLabel(m)}</span><span class="ml-auto">${u.statusChip(m)}</span></div>
        <div class="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
          <div class="text-lg sm:text-2xl min-w-0">${teamChip(m.home)}</div>
          <div class="col-span-2 row-start-2 text-center sm:col-span-1 sm:row-start-auto">${u.scoreHtml(m, 'text-5xl sm:text-6xl')}</div>
          <div class="text-lg sm:text-2xl text-right min-w-0">${teamChip(m.away)}</div>
        </div>
        <div class="courtline my-4"></div>
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted num"><span>${u.fmtDate(m.date)} · ${m.time}</span><span>${esc(m.court)}</span><span>${t('referee')}: ${esc(u.userName(m.referee))}</span></div>
      </div>${body}`;
  };

  S.bracket = (u) => {
    const a = D();
    const k = (c) => a.matches.find((m) => m.code === c);
    const [sf1, sf2, th, fi] = ['SF1', 'SF2', '3RD', 'F'].map(k);
    const seedNote = (m, i) => (a.state === 'knockout' ? '' : `<div class="text-xs text-muted">${u.t('seed')} #${m.seeds ? m.seeds[i] : '?'}</div>`);
    const box = (m) => `<div class="flex flex-col gap-1 min-w-0">${a.state === 'knockout' ? '' : `<div class="flex gap-3 px-1">${seedNote(m, 0)}${seedNote(m, 1)}</div>`}${matchCard(m, u)}</div>`;
    const podium = fi.score ? '' : '';
    return `<h1 class="display text-4xl font-extrabold uppercase mb-1">${u.t('bracket')}</h1>
      <p class="text-muted mb-6">${u.t('relayNote')}</p>
      ${a.state === 'knockout' ? '' : `<div class="panel p-4 mb-6 text-sm"><span class="chip chip-warn">${u.t('provisional')}</span> <span class="text-muted">SF1 = #1 v #4 · SF2 = #2 v #3</span></div>`}
      <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-center">
        <div class="flex flex-col gap-6">${box(sf1)}${box(sf2)}</div>
        <svg class="hidden md:block w-10 h-64 text-line" viewBox="0 0 40 256" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M0 64H20V192H0M20 128H40"/></svg>
        <div class="flex flex-col gap-2"><div class="eyebrow">${u.t('final')}</div>${matchCard(fi, u)}</div>
      </div>
      <div class="mt-8 max-w-md"><div class="eyebrow mb-2">${u.t('third_place')}</div>${matchCard(th, u)}</div>${podium}`;
  };

  S.teams = (u) => {
    const a = D();
    return `<h1 class="display text-4xl font-extrabold uppercase mb-5">${u.t('teams')}</h1>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${a.table.map((r) => {
        const tm = a.T[r.id];
        return `<a href="${u.link('team.html', { id: tm.id })}" class="panel p-5 flex flex-col gap-3 hover:border-accent/60">
          <div class="flex items-center gap-3"><span class="w-9 h-9 rounded-md grid place-items-center display text-xl font-bold" style="background:${tm.color};color:#fff">${u.esc(tm.name[0])}</span>
            <div class="min-w-0"><div class="font-semibold truncate">${u.esc(tm.name)}</div><div class="text-xs text-muted">${u.t('captain')}: ${u.esc(a.P[tm.captainId].name)}</div></div>
            <span class="ml-auto display text-2xl font-bold text-muted">#${r.pos}</span></div>
          <div class="flex gap-4 text-sm num"><span>${r.w}–${r.l}</span><span class="text-muted">${u.t('colSD')} ${r.sd > 0 ? '+' : ''}${r.sd}</span><span class="text-muted">${u.t('colPD')} ${r.pd > 0 ? '+' : ''}${r.pd}</span></div>
        </a>`;
      }).join('')}</div>`;
  };

  S.team = (u) => {
    const a = D();
    const tm = a.T[u.params.get('id') || 't1'] || a.teams[0];
    const r = a.table.find((x) => x.id === tm.id);
    const ms = a.matches.filter((m) => m.home === tm.id || m.away === tm.id);
    return `<a href="${u.link('teams.html')}" class="text-sm text-muted hover:underline">← ${u.t('teams')}</a>
      <div class="flex flex-wrap items-center gap-4 mt-3 mb-6"><span class="w-14 h-14 rounded-lg grid place-items-center display text-3xl font-bold" style="background:${tm.color};color:#fff">${u.esc(tm.name[0])}</span>
        <div><h1 class="display text-4xl font-extrabold uppercase leading-none">${u.esc(tm.name)}</h1><div class="text-muted mt-1">#${r.pos} · ${r.w}–${r.l} · ${u.t('colSets')} ${r.sw}–${r.sl} · ${u.t('colPD')} ${r.pd > 0 ? '+' : ''}${r.pd}</div></div></div>
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section class="min-w-0"><h2 class="display text-2xl font-bold uppercase mb-3">${u.t('roster')}</h2><div class="panel scroll-x"><table class="tbl num">
          <thead><tr><th>${u.t('rank')}</th><th>${u.t('players')}</th><th class="r">${u.t('skill')}</th><th>${u.t('gender')}</th></tr></thead>
          <tbody>${tm.roster.map((id) => { const p = a.P[id]; return `<tr><td><b class="display text-lg">R${p.rank}</b></td><td>${u.playerLink(id)} ${id === tm.captainId ? `<span class="chip chip-accent">${u.t('captain')}</span>` : ''}</td><td class="r">${p.skill}</td><td>${u.t(p.gender)}</td></tr>`; }).join('')}</tbody></table></div></section>
        <section class="min-w-0"><h2 class="display text-2xl font-bold uppercase mb-3">${u.t('results')}</h2><div class="grid gap-3">${ms.map((m) => matchCard(m, u)).join('')}</div></section>
      </div>`;
  };

  S.players = (u) => {
    const a = D();
    const f = { team: u.params.get('team') || '', rank: u.params.get('rank') || '', gender: u.params.get('gender') || '' };
    const list = a.players.filter((p) => (!f.team || p.teamId === f.team) && (!f.rank || String(p.rank) === f.rank) && (!f.gender || p.gender === f.gender)).sort((x, y) => x.rank - y.rank || y.skill - x.skill);
    const sel = (id, label, opts, val) => `<label class="flex flex-col gap-1 min-w-0"><span class="label">${label}</span><select id="${id}" class="select" data-filter="${id.replace('f-', '')}"><option value="">${u.t('all')}</option>${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${u.esc(l)}</option>`).join('')}</select></label>`;
    return `<h1 class="display text-4xl font-extrabold uppercase mb-5">${u.t('players')} <span class="text-muted">${list.length}</span></h1>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <label class="flex flex-col gap-1 col-span-2 sm:col-span-1"><span class="label">${u.t('search')}</span><input id="f-q" class="input" placeholder="${u.t('search')}"></label>
        ${sel('f-team', u.t('team'), a.teams.map((x) => [x.id, x.name]), f.team)}
        ${sel('f-rank', u.t('rank'), [1, 2, 3, 4, 5, 6, 7].map((r) => [String(r), `Rank ${r}`]), f.rank)}
        ${sel('f-gender', u.t('gender'), [['male', u.t('male')], ['female', u.t('female')]], f.gender)}
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" id="player-grid">${list.map((p) => `<a data-name="${u.esc(p.name.toLowerCase())}" href="${u.link('player.html', { id: p.id })}" class="panel p-4 flex items-center gap-3 hover:border-accent/60 min-w-0">
        <span class="w-11 h-11 rounded-full grid place-items-center bg-surface2 display text-lg font-bold flex-none">${u.esc(p.name.split(' ').pop()[0])}</span>
        <div class="min-w-0"><div class="font-semibold truncate">${u.esc(p.name)}</div><div class="text-xs text-muted flex items-center gap-2"><span class="swatch" style="background:${a.T[p.teamId].color}"></span>${u.esc(a.T[p.teamId].name)} · ${u.t(p.gender)}</div></div>
        <div class="ml-auto text-right flex-none"><div class="display text-xl font-bold">R${p.rank}</div><div class="text-xs text-muted num">${p.skill} pts</div></div></a>`).join('')}</div>`;
  };

  S.player = (u) => {
    const a = D();
    const p = a.P[u.params.get('id') || 'p1'] || a.players[0];
    const rows = slotRows().filter((r) => r.pair.includes(p.id));
    const w = rows.filter((r) => r.won).length;
    const pf = rows.reduce((s, r) => s + r.pts, 0), pa = rows.reduce((s, r) => s + r.opp, 0);
    const partners = {};
    rows.forEach((r) => r.pair.filter((x) => x !== p.id).forEach((x) => { partners[x] = (partners[x] || 0) + 1; }));
    const best = Object.entries(partners).sort((x, y) => y[1] - x[1])[0];
    const tm = a.T[p.teamId];
    const stat = (label, val) => `<div class="panel p-4"><div class="eyebrow mb-1">${label}</div><div class="display text-3xl font-bold num">${val}</div></div>`;
    const hist = [{ y: 2027, team: tm.name, rank: p.rank, skill: p.skill }];
    if (p.firstSeason <= 2026) hist.push({ y: 2026, team: 'Đội 4', rank: Math.min(7, p.rank + 1), skill: p.skill - 1 });
    if (p.firstSeason <= 2025) hist.push({ y: 2025, team: 'Đội 2', rank: Math.min(7, p.rank + 1), skill: p.skill - 2 });
    return `<a href="${u.link('players.html')}" class="text-sm text-muted hover:underline">← ${u.t('players')}</a>
      <div class="flex flex-wrap items-center gap-4 mt-3 mb-6">
        <span class="w-16 h-16 rounded-full grid place-items-center bg-surface2 display text-3xl font-bold">${u.esc(p.name.split(' ').pop()[0])}</span>
        <div class="min-w-0"><h1 class="display text-4xl font-extrabold uppercase leading-none">${u.esc(p.name)}</h1>
          <div class="flex flex-wrap items-center gap-2 mt-2 text-sm">${u.teamChip(p.teamId)}<span class="chip">Rank ${p.rank}</span><span class="chip num">${p.skill} ${u.t('skill').toLowerCase()}</span><span class="chip">${u.t(p.gender)}</span>${p.id === tm.captainId ? `<span class="chip chip-accent">${u.t('captain')}</span>` : ''}</div></div></div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">${stat(u.t('setsPlayed'), rows.length)}${stat(u.t('setRecord'), `${w}–${rows.length - w}`)}${stat(u.t('pointsFor'), `${pf}–${pa}`)}
        <div class="panel p-4"><div class="eyebrow mb-1">${u.t('partner')}</div><div class="font-semibold mt-2">${best ? `${u.playerLink(best[0])} <span class="text-muted text-sm num">× ${best[1]}</span>` : '—'}</div></div></div>
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section class="min-w-0"><h2 class="display text-2xl font-bold uppercase mb-3">${u.t('results')}</h2><div class="panel scroll-x"><table class="tbl num">
          <thead><tr><th>${u.t('matches')}</th><th>${u.t('set')}</th><th>${u.t('pair')}</th><th class="r">${u.t('results')}</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td><a class="hover:underline font-semibold" href="${u.link('match.html', { code: r.m.code })}">${r.m.code}</a></td><td><span class="chip">${u.t(r.s.type)} ${r.s.no}</span></td>
            <td>${r.pair.filter((x) => x !== p.id).map((x) => u.playerLink(x)).join('')}</td><td class="r"><span class="chip ${r.won ? 'chip-win' : 'chip-loss'}">${r.pts}–${r.opp}</span></td></tr>`).join('')}</tbody></table></div></section>
        <section><h2 class="display text-2xl font-bold uppercase mb-3">${u.t('history')}</h2><ol class="panel divide-y divide-line">${hist.map((h) => `<li class="p-4 flex items-center gap-3"><span class="display text-2xl font-bold">${h.y}</span><div class="min-w-0"><div class="font-semibold truncate">${u.esc(h.team)}</div><div class="text-xs text-muted num">Rank ${h.rank} · ${h.skill} pts</div></div></li>`).join('')}</ol></section>
      </div>`;
  };

  S.awards = (u) => {
    const a = D();
    const nm = (x, k) => (u.locale === 'en' && x[`${k}En`]) || x[k];
    const winner = (w) => {
      const body = w.kind === 'team' ? u.teamChip(w.team) : w.ids.map((id) => u.playerLink(id)).join(' + ');
      return `<div class="flex flex-wrap items-center gap-2"><span class="chip">${u.t(w.kind === 'team' ? 'team' : w.kind === 'pair' ? 'pair' : 'players')}</span><span class="font-semibold">${body}</span>${w.match ? `<a href="${u.link('match.html', { code: w.match })}" class="text-sm text-accent hover:underline">${w.match}${w.note ? ` · ${u.esc(w.note)}` : ''}</a>` : ''}</div>`;
    };
    return `<h1 class="display text-4xl font-extrabold uppercase mb-5">${u.t('awards')}</h1>
      <div class="grid gap-4 md:grid-cols-2">${a.awards.map((x) => `<article class="panel p-5 flex flex-col gap-3">
        <div class="flex items-start gap-3"><h2 class="display text-2xl font-bold uppercase leading-tight">${u.esc(nm(x, 'name'))}</h2><span class="ml-auto display text-xl font-bold text-accent num whitespace-nowrap">${u.money(x.value)}</span></div>
        <p class="text-sm">${u.esc(nm(x, 'criteria'))}</p>
        <div class="text-xs text-muted">${u.t('sponsor')}: ${u.esc(x.sponsor)}</div>
        <div class="courtline"></div>
        <div class="flex flex-col gap-2">${x.winners.length ? x.winners.map(winner).join('') : `<span class="chip chip-warn self-start">${u.t('pending')}</span>`}</div>
      </article>`).join('')}</div>`;
  };

  S.rules = (u) => {
    const s = D().settings;
    const vi = u.locale === 'vi';
    const sec = (title, items) => `<section class="panel p-5"><h2 class="display text-2xl font-bold uppercase mb-3">${title}</h2><ul class="flex flex-col gap-2 list-disc pl-5 max-w-prose">${items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`;
    const types = s.slotTypes.map((x, i) => `<span class="chip ${x === 'open' ? '' : 'chip-accent'}">${i + 1}. ${u.t(x)}</span>`).join(' ');
    return `<h1 class="display text-4xl font-extrabold uppercase mb-5">${u.t('rules')}</h1>
      <div class="grid gap-4 lg:grid-cols-2">
      ${sec(vi ? 'Vòng bảng' : 'Group stage', vi ? [
        `Vòng tròn một lượt, 1 bảng. Mỗi trận ${s.slotTypes.length} set đôi, chạm <b>${s.setTarget}</b>, không cần cách 2 điểm.`,
        `Thứ tự set: ${types}`, `Rank thấp: Rank ${s.lowRange.join('–')} · Rank cao: Rank ${s.highRange.join('–')}.`,
        `Mỗi VĐV đánh ${s.minSets}–${s.maxSets} set, không đánh 2 set liên tiếp.`,
        `Thắng set được 1 điểm trận; thắng trận được 1 điểm BXH.`] : [
        `Single round-robin, one group. Each match is ${s.slotTypes.length} doubles sets to <b>${s.setTarget}</b>, no 2-point lead needed.`,
        `Set order: ${types}`, `Low-rank: Rank ${s.lowRange.join('–')} · High-rank: Rank ${s.highRange.join('–')}.`,
        `Each player plays ${s.minSets}–${s.maxSets} sets, never two in a row.`, `A set win is worth 1 match point; a match win is worth 1 table point.`])}
      ${sec(vi ? 'Điểm chấp' : 'Handicap', vi ? [
        `Cặp có tổng điểm kỹ năng thấp hơn được cộng sẵn hiệu số, tối đa <b>${s.groupHandicapCap}</b>/set.`,
        `Knock-out: cộng có dấu hiệu số 5 lượt, tối đa <b>${s.koHandicapCap}</b>, cộng từ đầu lượt 1.`, `Tỉ số trên bảng (đã gồm chấp) được dùng cho hiệu số điểm.`] : [
        `The pair with the lower total skill points starts with the difference, up to <b>${s.groupHandicapCap}</b> per set.`,
        `Knock-out: the signed differences of the 5 legs are summed, capped at <b>${s.koHandicapCap}</b>, and added at the start of leg 1.`, `Scoreboard points (handicap included) count toward point difference.`])}
      ${sec(vi ? 'Xếp hạng' : 'Ranking', vi ? ['Điểm → đối đầu (2 đội) hoặc mini-league (từ 3 đội) → hiệu số set → hiệu số điểm → bốc thăm.'] : ['Points → head-to-head (2 teams) or mini-league (3+ teams) → set difference → point difference → draw.'])}
      ${sec(vi ? 'Knock-out' : 'Knock-out', vi ? ['Bán kết: #1 v #4, #2 v #3. Tranh hạng 3 và chung kết.', `Đánh tiếp sức 5 lượt, mốc ${s.milestones.join('/')}.`, `Đến trễ quá 10 phút: xử thua. Dưới ${s.minPresent} VĐV: loại khỏi giải.`] : ['Semi-finals: #1 v #4, #2 v #3, then the third-place match and the final.', `Relay of 5 legs, milestones ${s.milestones.join('/')}.`, `More than 10 minutes late: forfeit. Fewer than ${s.minPresent} players: disqualified.`])}
      </div>`;
  };

  // Filters: re-render with updated query params (kept in the URL so links are shareable).
  function wireFilters() {
    document.querySelectorAll('[data-filter]').forEach((el) => {
      el.onchange = () => {
        const p = new URLSearchParams(location.search);
        el.value ? p.set(el.dataset.filter, el.value) : p.delete(el.dataset.filter);
        location.search = p.toString();
      };
    });
    const q = document.getElementById('f-q');
    if (q) q.oninput = () => document.querySelectorAll('#player-grid > a').forEach((x) => { x.hidden = !x.dataset.name.includes(q.value.toLowerCase()); });
  }

  window.ABTPublic = { screens: S, matchCard, standingsTable, slotRows };
  window.ABTUI.after = wireFilters;
  window.ABTUI.mount(S[document.body.dataset.screen]);
})();
