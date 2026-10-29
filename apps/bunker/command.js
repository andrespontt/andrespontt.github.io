// Command desk: the protectorate game inside the situation terminal. Resource bar and game clock, five tabs
// (overview, settlements, military, operations, event log) and the priority-alert / combat-report dialog.
// It only reads the game state and turns clicks into orders (onAction); protectorate.mjs decides what happens.
// Panels are re-rendered from the state several times a second; morph() patches the DOM in place so buttons
// keep focus and clicks are never lost to a redraw.
import { RULES, DAY, RESOURCES, military, settlement, security, siege, winChance, riskLabel, trainable, travelTime, reason, objective, clock, dateLabel } from './protectorate.mjs';

const STATUS = { protected: 'PROTECTED', under_attack: 'UNDER ATTACK', occupied: 'OCCUPIED', neutral: 'NEUTRAL' };
const TABS = [['overview', 'Overview', 'Brief'], ['settlements', 'Settlements', 'Towns'], ['military', 'Military', 'Military'], ['operations', 'Operations', 'Ops'], ['log', 'Event log', 'Log']];
const KIND = { deploy: 'Garrison deployment', reinforce: 'Reinforcements', liberate: 'Liberation force', agreement: 'Agreement escort', return: 'Returning soldiers' };
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const pct = v => Math.round(v * 100) + '%';
const days = ms => (ms / DAY).toFixed(1) + ' days';
const hint = text => text ? `<p class="cmd-hint">${esc(text)}</p>` : '';
const disabled = why => why ? ` disabled title="${esc(why)}"` : '';

// What a moving unit is, for the map's unit card. time: current game time.
export function describeUnit(s, id, time) {
  const convoy = s.convoys.find(c => c.id === id);
  if (convoy) {
    const x = settlement(s, convoy.settlement), out = time < convoy.arriveAt;
    return { title: out ? 'Incoming supply convoy' : 'Supply truck returning', rows: [['Origin', x.name], ['Cargo', out ? `${convoy.amount} ${RESOURCES[convoy.cargo].toLowerCase()}` : 'Empty'], ['Destination', out ? 'Outpost 07' : x.name], ['Status', out ? 'EN ROUTE' : 'RETURNING'], ['ETA', clock((out ? convoy.arriveAt : convoy.returnAt) - time)]] };
  }
  const m = s.movements.find(m => m.id === id);
  if (!m) return null;
  const x = settlement(s, m.settlement);
  return { title: KIND[m.kind] || 'Military movement', rows: [['Soldiers', m.soldiers], ['From', m.outbound ? 'Outpost 07' : x.name], ['To', m.outbound ? x.name : 'Outpost 07'], ['ETA', clock(m.arriveAt - time)]] };
}

export function createCommandDesk({ stock, desk, overlay, onAction, onTrack, onReset }) {
  const ui = { tab: 'overview', selected: null, qty: {}, scrollTo: null, confirmReset: false, overlayKey: null };
  let game = null, now = 0;

  // ── DOM patching ──────────────────────────────────────────────────────────────────────────────────
  function morph(el, html) { const t = document.createElement('template'); t.innerHTML = html; patch(el, t.content); }
  function patch(a, b) {
    const old = [...a.childNodes], next = [...b.childNodes];
    next.forEach((n, i) => {
      const o = old[i];
      if (!o) a.append(n);
      else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) a.replaceChild(n, o);
      else if (n.nodeType === 3) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; }
      else if (n.nodeType === 1) {
        for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
        for (const { name, value } of [...n.attributes]) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
        patch(o, n);
      }
    });
    for (let i = old.length - 1; i >= next.length; i--) old[i].remove();
  }

  // ── Quantity steppers ────────────────────────────────────────────────────────────────────────────
  // Each stepper remembers its value by key; until touched it follows a sensible default.
  const amount = (key, max, fallback) => max < 1 ? 0 : Math.max(1, Math.min(max, ui.qty[key] ?? fallback));
  function stepper(key, max, fallback, label) {
    const n = amount(key, max, fallback);
    return `<div class="cmd-stepper" role="group" aria-label="${esc(label)}"><button data-act="qty" data-key="${key}" data-delta="-50" data-max="${max}" aria-label="50 fewer soldiers"${n <= 1 ? ' disabled' : ''}>−50</button><output aria-live="polite">${n}</output><button data-act="qty" data-key="${key}" data-delta="50" data-max="${max}" aria-label="50 more soldiers"${n >= max ? ' disabled' : ''}>+50</button><button data-act="qty" data-key="${key}" data-delta="${max}" data-max="${max}" aria-label="Select all available"${n >= max ? ' disabled' : ''}>All</button></div>`;
  }
  const order = (label, a, cls = '') => { const why = reason(game, a); return `<button class="cmd-btn ${cls}" data-act="${a.type}"${a.id ? ` data-id="${a.id}"` : ''}${a.count != null ? ` data-count="${a.count}"` : ''}${disabled(why)}>${label}</button>`; };

  // ── Pieces ───────────────────────────────────────────────────────────────────────────────────────
  const chip = x => `<span class="cmd-chip st-${x.status}">${STATUS[x.status]}</span>`;
  function nextTruck(x) {
    if (x.status === 'under_attack') return 'Suspended: under attack';
    if (x.status !== 'protected' || x.nextDeliveryTick == null) return x.status === 'occupied' ? 'Stopped' : 'No agreement';
    const road = game.convoys.find(c => c.settlement === x.id && c.arriveAt > now);
    return road ? `On the road · ETA ${clock(road.arriveAt - now)}` : `Leaves in ${clock(x.nextDeliveryTick - now)}`;
  }
  function attackControls(x) {
    const g = siege(game, x), max = game.available, key = 'reinforce:' + x.id;
    const n = amount(key, max, Math.max(1, Math.min(max, x.enemyForces - x.assignedSoldiers - g.inTime)));
    const eta = travelTime(game, x), inTime = now + eta <= x.attack.resolvesAt;
    const after = 1 - winChance(x.enemyForces, x.assignedSoldiers + g.inTime + (inTime ? n : 0));
    return `<div class="cmd-attack">
      <dl class="cmd-facts"><dt>Enemy forces</dt><dd class="warn">${g.enemies}</dd><dt>Defending soldiers</dt><dd>${g.defenders}${g.inTime ? ` + ${g.inTime} arriving in time` : ''}${g.late ? ` (${g.late} too late)` : ''}</dd>
      <dt>Threat assessment</dt><dd class="threat-${g.threat.toLowerCase()}">${g.threat} · hold chance ${pct(g.holdChance)}</dd><dt>Combat in</dt><dd class="warn">${clock(g.left)}</dd></dl>
      <div class="cmd-control"><span>Reinforce</span>${stepper(key, max, n, 'Reinforcements')}${order(`Send ${n}`, { type: 'assign', id: x.id, count: n }, 'primary')}</div>
      <p class="cmd-note">${max ? `ETA ${clock(eta)} · ${inTime ? `arrives before the fight · hold chance ${pct(after)}` : 'arrives after the fight starts and will not take part'}` : 'No soldiers available at the bunker.'}</p>
      <div class="cmd-actions">${order('Hold position', { type: 'hold', id: x.id })}${order('Order retreat', { type: 'retreat', id: x.id }, 'danger')}</div>
    </div>`;
  }
  function liberationControls(x) {
    const max = game.available, key = 'liberate:' + x.id;
    const n = amount(key, max, Math.min(max, Math.ceil(x.enemyForces * RULES.defenseBonus * 1.4)));
    const chance = winChance(n, x.enemyForces), underway = game.movements.filter(m => m.settlement === x.id && m.kind === 'liberate');
    return `<div class="cmd-attack hostile">
      <dl class="cmd-facts"><dt>Estimated enemy forces</dt><dd class="warn">${x.enemyForces}</dd><dt>Available soldiers</dt><dd>${max}</dd>
      <dt>Lost income</dt><dd>−${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()} per delivery</dd>
      ${underway.length ? `<dt>Under way</dt><dd>${underway.map(m => `${m.soldiers} soldiers · ETA ${clock(m.arriveAt - now)}`).join(', ')}</dd>` : ''}</dl>
      <div class="cmd-control"><span>Liberation force</span>${stepper(key, max, n, 'Liberation force')}${order(`Launch · ${n}`, { type: 'liberate', id: x.id, count: n }, 'primary')}</div>
      <p class="cmd-note">${max ? `Success chance ${pct(chance)} · risk ${riskLabel(chance)} · ETA ${clock(travelTime(game, x))}. Defenders in cover fight ${Math.round((RULES.defenseBonus - 1) * 100)}% harder.` : 'No soldiers available at the bunker.'}</p>
    </div>`;
  }
  function settlementControls(x) {
    if (x.status === 'under_attack') return attackControls(x);
    if (x.status === 'occupied') return liberationControls(x);
    if (x.status === 'neutral') {
      const key = 'garrison:' + x.id, max = game.available, n = amount(key, max, Math.max(RULES.agreementEscort, Math.min(max, x.recommendedGarrison)));
      const a = { type: 'assign', id: x.id, count: n };
      return `<div class="cmd-control"><span>Agreement escort</span>${stepper(key, max, n, 'Escort')}${order(`Negotiate · send ${n}`, a, 'primary')}</div>${hint(reason(game, a))}
        <p class="cmd-note">The escort stays as the first garrison. ${esc(x.name)} then sends +${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()} every ${RULES.deliveryDays} days and ${x.availableVolunteers} volunteers can enlist.</p>`;
    }
    const gKey = 'garrison:' + x.id, gMax = Math.max(game.available, x.assignedSoldiers), gN = amount(gKey, gMax, Math.max(1, x.recommendedGarrison - x.assignedSoldiers));
    const rKey = 'recruit:' + x.id, rN = amount(rKey, x.availableVolunteers, x.availableVolunteers);
    const assign = { type: 'assign', id: x.id, count: gN }, recall = { type: 'recall', id: x.id, count: gN }, recruit = { type: 'recruit', id: x.id, count: rN };
    return `<div class="cmd-control"><span>Garrison</span>${stepper(gKey, gMax, gN, 'Soldiers')}${order(`+ Assign ${gN}`, assign, 'primary')}${order(`− Recall ${gN}`, recall)}</div>
      <div class="cmd-control"><span>Volunteers</span>${stepper(rKey, x.availableVolunteers, rN, 'Volunteers')}${order(`Recruit ${rN}`, recruit)}</div>
      ${hint(game.available ? '' : 'No soldiers available at the bunker to assign.')}`;
  }
  function settlementCard(x) {
    const inbound = game.movements.filter(m => m.settlement === x.id && m.outbound).reduce((n, m) => n + m.soldiers, 0);
    const sec = security(x);
    return `<article class="cmd-card st-${x.status}${ui.selected === x.id ? ' selected' : ''}" id="cmd-town-${x.id}">
      <div class="cmd-card-head"><div><small>${esc(x.kind.toUpperCase())} · POP ${x.population}</small><h4>${esc(x.name)}</h4></div>${chip(x)}</div>
      <dl class="cmd-facts">
        <dt>Garrison</dt><dd>${x.assignedSoldiers} / ${x.recommendedGarrison} recommended${inbound ? ` · ${inbound} en route` : ''}</dd>
        <dt>Security</dt><dd class="sec-${sec.toLowerCase().replace(' ', '-')}">${sec}</dd>
        <dt>Contribution</dt><dd>+${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()} per delivery · every ${RULES.deliveryDays} days</dd>
        <dt>Supply truck</dt><dd>${nextTruck(x)}</dd>
        <dt>Volunteers</dt><dd>${x.status === 'protected' ? x.availableVolunteers : x.status === 'neutral' ? x.availableVolunteers + ' (after an agreement)' : 'Unavailable'}</dd>
        <dt>Confidence</dt><dd><span class="cmd-meter"><i style="width:${x.confidence}%"></i></span> ${x.confidence}%</dd>
      </dl>
      ${settlementControls(x)}
      <div class="cmd-card-foot"><button class="cmd-link" data-act="focus" data-id="${x.id}">⌖ Show on map</button></div>
    </article>`;
  }
  function unitRows(list, empty) {
    if (!list.length) return `<p class="cmd-empty">${empty}</p>`;
    return `<ul class="cmd-list">${list.map(u => `<li><i class="dot ${u.cls}"></i><span><b>${esc(u.title)}</b><small>${esc(u.detail)}</small></span><em>${u.eta}</em><button class="cmd-link" data-act="track" data-unit="${u.id}" aria-label="Track ${esc(u.title)}">Track</button></li>`).join('')}</ul>`;
  }
  const convoyRows = () => game.convoys.map(c => { const x = settlement(game, c.settlement), out = now < c.arriveAt; return { id: c.id, cls: 'convoy', title: out ? `${c.amount} ${RESOURCES[c.cargo].toLowerCase()} from ${x.name}` : `${x.name} truck returning`, detail: out ? 'Supply convoy · en route to Outpost 07' : 'Empty · heading home', eta: clock((out ? c.arriveAt : c.returnAt) - now) }; });
  const movementRows = () => game.movements.map(m => { const x = settlement(game, m.settlement); return { id: m.id, cls: m.kind, title: `${plural(m.soldiers, 'soldier')} · ${KIND[m.kind]}`, detail: m.outbound ? `Outpost 07 → ${x.name}` : `${x.name} → Outpost 07`, eta: clock(m.arriveAt - now) }; });

  // ── Panels ───────────────────────────────────────────────────────────────────────────────────────
  function overview() {
    const f = military(game), towns = game.settlements;
    const count = st => towns.filter(x => x.status === st).length;
    return `<div class="cmd-objective"><small>CURRENT OBJECTIVE</small><p>${esc(objective(game))}</p></div>
      <div class="cmd-stats">
        ${[['Total soldiers', f.totalSoldiers], ['Available', f.availableSoldiers], ['Deployed', f.deployedSoldiers], ['In transit', f.soldiersInTransit], ['Recruits', f.untrainedRecruits], ['In training', f.recruitsInTraining]].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}
      </div>
      <h4 class="cmd-h">Protectorates <span>${count('protected') + count('under_attack')} protected · ${count('occupied')} occupied${count('neutral') ? ` · ${count('neutral')} neutral` : ''}</span></h4>
      <div class="cmd-towns">${towns.map(x => `<button class="cmd-town st-${x.status}" data-act="select" data-id="${x.id}"><i class="dot st-${x.status}"></i><span><b>${esc(x.name)}</b><small>${esc(x.kind)} · ${x.status === 'occupied' ? `~${x.enemyForces} hostiles` : x.status === 'neutral' ? 'no agreement' : `garrison ${x.assignedSoldiers}/${x.recommendedGarrison} · ${security(x)}`}</small></span>${chip(x)}</button>`).join('')}</div>
      <h4 class="cmd-h">Incoming convoys</h4>${unitRows(convoyRows(), 'No trucks on the road. Protected settlements send one every two days.')}
      <h4 class="cmd-h">Military movements</h4>${unitRows(movementRows(), 'No soldiers on the road.')}`;
  }
  function settlementsPanel() {
    return `<p class="cmd-intro">Each settlement sends its own trucks while it is protected. Smaller garrisons are cheaper but invite raids; under-protecting is your call.</p>${game.settlements.map(settlementCard).join('')}`;
  }
  function militaryPanel() {
    const f = military(game), total = Math.max(1, f.totalSoldiers);
    const bar = [['available', f.availableSoldiers], ['deployed', f.deployedSoldiers], ['transit', f.soldiersInTransit]].map(([k, v]) => v ? `<i class="seg-${k}" style="width:${v / total * 100}%" title="${k}: ${v}"></i>` : '').join('');
    const pool = game.bunkerVolunteers ?? RULES.bunkerRecruitment.initial;
    const canTrain = trainable(game), why = reason(game, { type: 'train' });
    return `<h4 class="cmd-h">Forces <span>${f.totalSoldiers} soldiers</span></h4>
      <div class="cmd-forcebar" aria-hidden="true">${bar}</div>
      <dl class="cmd-facts cmd-legend"><dt><i class="seg-available"></i>Available at the bunker</dt><dd>${f.availableSoldiers}</dd><dt><i class="seg-deployed"></i>Deployed in garrisons</dt><dd>${f.deployedSoldiers}</dd><dt><i class="seg-transit"></i>On the road</dt><dd>${f.soldiersInTransit}</dd><dt>Killed in action</dt><dd>${game.stats.killed}</dd></dl>
      <ul class="cmd-list compact">${game.settlements.filter(x => x.status === 'protected' || x.status === 'under_attack').map(x => `<li><i class="dot st-${x.status}"></i><span><b>${esc(x.name)}</b><small>${security(x)}</small></span><em>${x.assignedSoldiers}/${x.recommendedGarrison}</em><button class="cmd-link" data-act="select" data-id="${x.id}">Manage</button></li>`).join('')}</ul>
      <p class="cmd-note">Command groups of soldiers: −50 / +50 adjusts the order; All selects the entire available pool. Map markers represent whole formations.</p><h4 class="cmd-h">Recruitment <span>${f.untrainedRecruits} untrained recruits</span></h4>
      <article class="cmd-card"><h4 class="cmd-h">Bunker recruitment <span>${pool} / ${RULES.bunkerRecruitment.capacity}</span></h4>
      <p class="cmd-note">Independent volunteers arrive even when all towns are occupied. +${RULES.bunkerRecruitment.perDay} per game day · next intake in ${clock(DAY - now % DAY)}. The pool holds ${RULES.bunkerRecruitment.capacity}; enlist volunteers to make room.</p>
      ${order(`Enlist ${pool} volunteers`, { type: 'recruit-bunker', count: pool }, 'primary wide')}
      <p class="cmd-note">Volunteers join your untrained recruits. Training still needs equipment and food.</p></article>
      ${game.settlements.map(x => {
        const key = 'recruit:' + x.id, n = amount(key, x.availableVolunteers, x.availableVolunteers);
        return `<div class="cmd-control recruit"><span><b>${esc(x.name)}</b><small>${x.status === 'protected' ? plural(x.availableVolunteers, 'volunteer') : x.status === 'neutral' ? 'No agreement' : STATUS[x.status]}</small></span>${stepper(key, x.availableVolunteers, n, 'Volunteers from ' + x.name)}${order(`Recruit ${n}`, { type: 'recruit', id: x.id, count: n })}</div>`;
      }).join('')}
      <h4 class="cmd-h">Military training center</h4>
      <dl class="cmd-facts"><dt>Training capacity</dt><dd>${f.trainingCapacity}</dd><dt>Currently training</dt><dd>${f.recruitsInTraining}</dd><dt>Untrained recruits</dt><dd>${f.untrainedRecruits}</dd></dl>
      ${game.training.map(b => { const total = RULES.trainingDays * DAY, k = b.elapsed / total; return `<div class="cmd-batch${b.waiting ? ' paused' : ''}"><div><b>${plural(b.count, 'recruit')}</b><span>${pct(k)}</span></div><span class="cmd-meter"><i style="width:${k * 100}%"></i></span><small>${b.waiting ? `Paused: needs ${b.count * RULES.trainingFood} food for the next day` : `Time remaining: ${days(total - b.elapsed)} (${clock(total - b.elapsed)})`}</small></div>`; }).join('')}
      <button class="cmd-btn primary wide" data-act="train"${disabled(why)}>Start training${canTrain ? ` · ${canTrain}` : ''}</button>${hint(why)}
      <p class="cmd-note">Basic training takes ${RULES.trainingDays} days. Each recruit is issued ${RULES.equipment.metal} metal and ${RULES.equipment.components} component, and eats ${RULES.trainingFood} food per training day. Soldiers at the bunker or in the field eat ${RULES.upkeep} food a day each.</p>`;
  }
  function operationsPanel() {
    const attacked = game.settlements.filter(x => x.status === 'under_attack'), occupied = game.settlements.filter(x => x.status === 'occupied');
    const battles = [...game.history].reverse();
    return `<h4 class="cmd-h">Active attacks</h4>${attacked.length ? attacked.map(x => `<article class="cmd-card st-under_attack"><div class="cmd-card-head"><div><small>PRIORITY ALERT</small><h4>${esc(x.name)} under attack</h4></div>${chip(x)}</div>${attackControls(x)}</article>`).join('') : '<p class="cmd-empty">No active attacks.</p>'}
      <h4 class="cmd-h">Liberation operations</h4>${occupied.length ? occupied.map(x => `<article class="cmd-card st-occupied"><div class="cmd-card-head"><div><small>OCCUPIED SETTLEMENT</small><h4>${esc(x.name)}</h4></div>${chip(x)}</div>${liberationControls(x)}</article>`).join('') : '<p class="cmd-empty">No settlement is occupied.</p>'}
      <h4 class="cmd-h">Military movements</h4>${unitRows(movementRows(), 'No soldiers on the road.')}
      <h4 class="cmd-h">Combat reports</h4>${battles.length ? `<ul class="cmd-list reports">${battles.map(r => `<li><i class="dot ${/VICTORY|LIBERATED|SIGNED/.test(r.outcome) ? 'st-protected' : 'st-occupied'}"></i><span><b>${esc(r.title)} · ${r.outcome}</b><small>${dateLabel(r.at)}${r.lost != null ? ` · ${r.friendly} engaged, ${r.lost} lost${r.enemy != null ? ` · ${r.enemy} hostiles` : ''}` : ''}</small></span></li>`).join('')}</ul>` : '<p class="cmd-empty">No engagements yet.</p>'}`;
  }
  function logPanel() {
    return `<ol class="cmd-log">${[...game.log].reverse().map(e => `<li class="k-${e.kind}"><time>${dateLabel(e.at)}</time><span>${esc(e.text)}</span></li>`).join('')}</ol>
      <div class="cmd-reset"><button class="cmd-btn ${ui.confirmReset ? 'danger' : ''}" data-act="reset">${ui.confirmReset ? 'Confirm: start a new campaign' : 'New campaign'}</button>${ui.confirmReset ? '<button class="cmd-btn" data-act="reset-cancel">Keep playing</button>' : ''}</div>`;
  }

  // ── Dialog: a new attack first, then unacknowledged reports ─────────────────────────────────────
  function dialog() {
    const attacked = game.settlements.find(x => x.attack && !x.attack.seen);
    if (attacked) return { key: 'attack:' + attacked.id + ':' + attacked.attack.startedAt, html: `<div class="cmd-dialog alert" role="alertdialog" aria-labelledby="cmd-dialog-title"><small>PRIORITY ALERT</small><h3 id="cmd-dialog-title">${esc(attacked.name.toUpperCase())} UNDER ATTACK</h3>${attackControls(attacked)}</div>` };
    const r = game.reports[0];
    if (!r) return null;
    const good = /VICTORY|LIBERATED|SIGNED/.test(r.outcome), x = settlement(game, r.settlement);
    const title = r.type === 'agreement' ? 'PROTECTION AGREEMENT' : r.type === 'retreat' || (r.type === 'defense' && !good) ? 'SETTLEMENT LOST' : r.type === 'liberation' ? 'LIBERATION REPORT' : 'COMBAT REPORT';
    const rows = r.type === 'agreement' ? [['Settlement', r.title], ['Garrison', r.friendly], ['Status', r.status], ['Contribution', r.income]]
      : [['Outcome', r.outcome], [r.type === 'liberation' ? 'Soldiers committed' : 'Defending soldiers', r.friendly], ['Enemy forces', r.enemy], ['Soldiers lost', r.lost], ['Soldiers surviving', r.surviving + (good || !r.surviving ? '' : ' · returning to the bunker')], ['Settlement status', r.status], ...(r.income && !good ? [['Lost income', r.income]] : []), ...(x.status === 'occupied' && !good ? [['Enemy garrison', x.enemyForces]] : [])];
    const plan = x.status === 'occupied' && !good ? `<button class="cmd-btn" data-act="plan" data-id="${x.id}" data-report="${r.id}">Plan liberation</button>` : '';
    return { key: 'report:' + r.id, html: `<div class="cmd-dialog ${good ? 'good' : 'bad'}" role="alertdialog" aria-labelledby="cmd-dialog-title"><small>${title}</small><h3 id="cmd-dialog-title">${esc(r.title.toUpperCase())}</h3><dl class="cmd-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="cmd-actions">${plan}<button class="cmd-btn primary" data-act="ack" data-report="${r.id}">Acknowledge</button></div></div>` };
  }

  // ── Render ───────────────────────────────────────────────────────────────────────────────────────
  function income(type) {
    const towns = game.settlements.filter(x => x.resourceType === type && x.status === 'protected');
    return towns.reduce((n, x) => n + x.resourceAmount, 0);
  }
  function renderStock() {
    const f = military(game), upkeep = Math.ceil(f.totalSoldiers * RULES.upkeep) + game.training.reduce((n, b) => n + b.count * RULES.trainingFood, 0);
    const res = (key, note, warn) => `<div class="cmd-res${warn ? ' warn' : ''}"><small>${RESOURCES[key]}</small><b>${game.resources[key]}</b><span>${note}</span></div>`;
    const flow = type => { const n = income(type); return n ? `+${n} / ${RULES.deliveryDays} days` : 'No supplier'; };
    morph(stock, `${res('food', `${flow('food')} · −${upkeep}/day`, game.resources.food < upkeep * 2)}${res('metal', flow('metal'), game.resources.metal < RULES.equipment.metal)}${res('components', flow('components'), game.resources.components < RULES.equipment.components)}${res('fuel', `${RULES.sortieFuel} per sortie`, game.resources.fuel < RULES.sortieFuel)}
      <button class="cmd-res cmd-forces" data-act="tab" data-tab="military" aria-label="Soldiers: ${f.availableSoldiers} available of ${f.totalSoldiers}. Open Military."><small>Soldiers</small><b>${f.availableSoldiers}<i>/${f.totalSoldiers}</i></b><span>available / total</span></button>
      <div class="cmd-clock"><small>Game clock</small><b>${dateLabel(now)}</b><div class="cmd-speed" role="group" aria-label="Game speed">${[[0, '❚❚', 'Pause'], [1, '1×', 'Normal speed'], [3, '3×', 'Fast speed']].map(([v, t, l]) => `<button data-act="speed" data-speed="${v}" aria-pressed="${game.speed === v}" aria-label="${l}">${t}</button>`).join('')}</div></div>`);
  }
  function render() {
    if (!game) return;
    renderStock();
    const alerts = game.settlements.filter(x => x.status === 'under_attack').length;
    const panel = { overview, settlements: settlementsPanel, military: militaryPanel, operations: operationsPanel, log: logPanel }[ui.tab]();
    morph(desk, `<div class="cmd-head"><div><small>OUTPOST 07 · PROTECTORATE COMMAND</small><h3>Command desk</h3></div><span class="cmd-live${game.speed ? '' : ' paused'}">${game.speed ? '● LIVE · ' + game.speed + '×' : '❚❚ PAUSED'}</span></div>
      <div class="cmd-tabs" role="tablist" aria-label="Command sections">${TABS.map(([id, long, short]) => `<button role="tab" id="cmd-tab-${id}" data-act="tab" data-tab="${id}" aria-selected="${ui.tab === id}" aria-controls="cmd-panel" tabindex="${ui.tab === id ? 0 : -1}"><span class="long">${long}</span><span class="short">${short}</span>${id === 'operations' && alerts ? `<b class="cmd-badge">${alerts}</b>` : ''}</button>`).join('')}</div>
      <section class="cmd-panel" id="cmd-panel" role="tabpanel" aria-labelledby="cmd-tab-${ui.tab}">${panel}</section>`);
    const d = dialog();
    overlay.hidden = !d;
    morph(overlay, d ? d.html : '');
    if (d && d.key !== ui.overlayKey) overlay.querySelector('.cmd-btn.primary:not([disabled]),.cmd-btn:not([disabled])')?.focus({ preventScroll: true });
    ui.overlayKey = d?.key || null;
    if (ui.scrollTo) { desk.querySelector('#cmd-town-' + ui.scrollTo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); ui.scrollTo = null; }
  }

  // ── Input ────────────────────────────────────────────────────────────────────────────────────────
  function click(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !game) return;
    const { act, id } = b.dataset;
    if (act === 'qty') { const max = Number(b.dataset.max), key = b.dataset.key, current = Number(b.parentElement.querySelector('output').textContent); ui.qty[key] = Math.max(1, Math.min(max, current + Number(b.dataset.delta))); render(); return; }
    if (act === 'tab') { ui.tab = b.dataset.tab; ui.confirmReset = false; render(); return; }
    if (act === 'select') { select(id); return; }
    if (act === 'focus') { onTrack?.({ settlement: id }); return; }
    if (act === 'track') { onTrack?.({ unit: Number(b.dataset.unit) }); return; }
    if (act === 'reset') { if (ui.confirmReset) { ui.confirmReset = false; ui.qty = {}; onReset?.(); } else { ui.confirmReset = true; render(); } return; }
    if (act === 'reset-cancel') { ui.confirmReset = false; render(); return; }
    if (act === 'plan') { onAction({ type: 'ack', report: Number(b.dataset.report) }); ui.tab = 'operations'; render(); return; }
    if (act === 'speed') { onAction({ type: 'speed', speed: Number(b.dataset.speed) }); return; }
    if (act === 'ack') { onAction({ type: 'ack', report: Number(b.dataset.report) }); return; }
    const a = { type: act, ...(id ? { id } : {}), ...(b.dataset.count ? { count: Number(b.dataset.count) } : {}) };
    onAction(a);
    // A spent stepper goes back to following its default.
    for (const key of Object.keys(ui.qty)) if (key.endsWith(':' + id)) delete ui.qty[key];
  }
  function keys(e) {
    const tab = e.target.closest('[role=tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === ui.tab), n = TABS.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
    ui.tab = TABS[next][0]; render(); desk.querySelector('#cmd-tab-' + ui.tab)?.focus();
  }
  for (const el of [stock, desk, overlay]) el.addEventListener('click', click);
  desk.addEventListener('keydown', keys);

  function select(id) { ui.tab = 'settlements'; ui.selected = id; ui.scrollTo = id; render(); }
  return {
    set(state, time) { game = state; now = time; render(); },
    select,
    tab(name) { ui.tab = name; render(); },
    get selected() { return ui.selected; },
  };
}
