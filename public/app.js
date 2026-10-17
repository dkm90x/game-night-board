'use strict';

/* Game Night Board front end — vanilla JS, no build step.
   Your taps are remembered per device with a random token in localStorage.
   No accounts, no passwords. Counts come from the server, so everyone
   looking at the board sees the same night. */

// ---------- device identity + remembered handle ----------

function getDeviceToken() {
  let token = localStorage.getItem('gnb-device-token');
  if (!token) {
    token =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('gnb-device-token', token);
  }
  return token;
}

const deviceToken = getDeviceToken();

// ---------- date helpers (local time, YYYY-MM-DD) ----------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return formatDate(date);
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function todayStr() {
  return formatDate(new Date());
}

function minutesNow() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function prettyTime(t) {
  let [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m === 0 ? `${h} ${suffix}` : `${h}:${pad2(m)} ${suffix}`;
}

function prettyDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- tiny DOM helper (textContent everywhere: names are user input) ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- API ----------

let state = null;

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function loadState() {
  const from = todayStr();
  const to = addDays(from, 6);
  const params = new URLSearchParams({ deviceToken, from, to });
  const res = await fetch(`/api/state?${params}`);
  if (!res.ok) throw new Error('Could not load the board.');
  state = await res.json();
  render();
}

// ---------- lookups into state ----------

function rsvpGroup(eventId, occurrenceDate) {
  return state.rsvps.find((g) => g.eventId === eventId && g.occurrenceDate === occurrenceDate) || null;
}

function myRsvp(group) {
  return group ? group.people.find((p) => p.mine) || null : null;
}

function currentHandle() {
  return document.getElementById('yourHandle').value.trim();
}

// ---------- rendering ----------

function render() {
  document.getElementById('storeName').textContent = state.storeName;
  document.title = `Who's Coming? — ${state.storeName}`;
  renderStrip();
  renderBoard();
  renderDropinOptions();
  renderDropinList();
  renderManage();
}

function dayDates() {
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(addDays(todayStr(), i));
  return dates;
}

function renderStrip() {
  const strip = document.getElementById('dayStrip');
  strip.replaceChildren();
  dayDates().forEach((dateStr, i) => {
    const weekday = weekdayOf(dateStr);
    const closed = !state.hours[weekday];
    const chip = el('button', 'day-chip' + (i === 0 ? ' is-today' : '') + (closed ? ' is-closed' : ''));
    chip.type = 'button';
    chip.append(el('span', null, i === 0 ? 'Today' : WEEKDAYS_SHORT[weekday]));
    chip.append(el('small', null, closed ? 'Closed' : prettyDay(dateStr)));
    chip.addEventListener('click', () => {
      document.getElementById(`day-${dateStr}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    strip.append(chip);
  });
}

function renderBoard() {
  const board = document.getElementById('board');
  board.replaceChildren();
  const today = todayStr();

  for (const dateStr of dayDates()) {
    const weekday = weekdayOf(dateStr);
    const hours = state.hours[weekday];
    const section = el('section', 'day-section');
    section.id = `day-${dateStr}`;

    const head = el('div', 'day-head');
    head.append(el('h2', null, `${WEEKDAYS[weekday]} · ${prettyDay(dateStr)}`));
    if (dateStr === today) head.append(el('span', 'today-badge', 'TODAY'));
    head.append(
      el('span', 'hours', hours ? `Open ${prettyTime(hours.open)} – ${prettyTime(hours.close)}` : 'Closed')
    );
    section.append(head);

    if (!hours) {
      section.append(el('div', 'closed-panel', '🌙 Closed — the goblins are resting'));
      board.append(section);
      continue;
    }

    const events = state.events
      .filter((e) => e.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (!events.length) {
      section.append(el('p', null, 'No scheduled events — a perfect drop-in day.'));
      board.append(section);
      continue;
    }

    const grid = el('div', 'event-grid');
    for (const event of events) grid.append(eventCard(event, dateStr));
    section.append(grid);
    board.append(section);
  }
}

function eventCard(event, dateStr) {
  const group = rsvpGroup(event.id, dateStr);
  const mine = myRsvp(group);
  const total = group ? group.total : 0;
  const started = dateStr === todayStr() && minutesNow() >= timeToMinutes(event.startTime);

  const card = el('article', 'event-card' + (started ? ' is-started' : ''));
  card.append(el('h3', 'event-game', event.game));
  card.append(el('p', 'event-meta', `Starts ${prettyTime(event.startTime)}`));

  const badge = el('span', 'count-badge' + (total === 0 ? ' zero' : ''),
    total === 0 ? 'Nobody yet — be the first!' : total === 1 ? '1 coming' : `${total} coming`);
  card.append(badge);

  if (group && group.people.length) {
    const list = el('ul', 'people');
    for (const person of group.people) {
      const label = person.handle ? person.handle : 'Someone';
      const guests = person.guests > 0 ? ` +${person.guests}` : '';
      const li = el('li', person.mine ? 'mine' : null, `${label}${guests}${person.mine ? ' (you)' : ''}`);
      list.append(li);
    }
    card.append(list);
  }

  const controls = el('div', 'card-controls');
  const error = el('p', 'form-error');
  if (started) {
    controls.append(el('p', 'started-note', 'Already started — see you next week!'));
  } else {
    const guestsLabel = el('label', 'guests-label', 'Bringing: ');
    const guestsSelect = document.createElement('select');
    for (let i = 0; i <= 5; i++) {
      const opt = el('option', null, i === 0 ? 'just me' : `+${i} guest${i > 1 ? 's' : ''}`);
      opt.value = String(i);
      guestsSelect.append(opt);
    }
    if (mine) guestsSelect.value = String(Math.min(mine.guests, 5));
    guestsLabel.append(guestsSelect);
    controls.append(guestsLabel);

    const button = el('button', 'btn ' + (mine ? 'btn-in' : 'btn-green'),
      mine ? "You're in — tap to remove" : "I'll be there");
    button.type = 'button';
    button.addEventListener('click', async () => {
      error.textContent = '';
      button.disabled = true;
      try {
        await api('/api/rsvp/toggle', {
          eventId: event.id,
          occurrenceDate: dateStr,
          deviceToken,
          handle: currentHandle(),
          guests: Number(guestsSelect.value),
        });
        await loadState();
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
      }
    });
    controls.append(button);
  }
  controls.append(error);
  card.append(controls);
  return card;
}

// ---------- drop-ins ----------

function renderDropinOptions() {
  const daySelect = document.getElementById('dropinDay');
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  daySelect.replaceChildren();
  for (const [value, label] of [[today, `Today · ${prettyDay(today)}`], [tomorrow, `Tomorrow · ${prettyDay(tomorrow)}`]]) {
    const opt = el('option', null, label);
    opt.value = value;
    daySelect.append(opt);
  }
  const games = [...new Set(state.events.map((e) => e.game))].sort();
  const datalist = document.getElementById('gameList');
  datalist.replaceChildren();
  for (const game of games) {
    const opt = document.createElement('option');
    opt.value = game;
    datalist.append(opt);
  }
}

function renderDropinList() {
  const wrap = document.getElementById('dropinList');
  wrap.replaceChildren();
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const groups = state.dropins.filter((g) => g.visitDate === today || g.visitDate === tomorrow);

  if (!groups.length) {
    wrap.append(el('p', null, 'No drop-ins yet today or tomorrow.'));
    return;
  }

  for (const group of groups) {
    const box = el('div', 'dropin-group');
    const dayLabel = group.visitDate === today ? 'Today' : 'Tomorrow';
    box.append(el('span', 'dg-title', `${group.game} — ${dayLabel} · ${group.timeWindow}`));
    box.append(el('span', 'count-badge', group.total === 1 ? '1 coming' : `${group.total} coming`));

    const list = el('ul', 'people');
    for (const person of group.people) {
      const label = person.handle ? person.handle : 'Someone';
      const guests = person.guests > 0 ? ` +${person.guests}` : '';
      list.append(el('li', person.mine ? 'mine' : null, `${label}${guests}${person.mine ? ' (you)' : ''}`));
    }
    box.append(list);

    if (group.people.some((p) => p.mine)) {
      const remove = el('button', 'btn btn-danger', 'Remove mine');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        try {
          await api('/api/dropin/toggle', {
            game: group.game,
            visitDate: group.visitDate,
            timeWindow: group.timeWindow,
            deviceToken,
          });
          await loadState();
        } catch (err) {
          alert(err.message);
        }
      });
      box.append(remove);
    }
    wrap.append(box);
  }
}

// ---------- manage ----------

function renderManage() {
  document.getElementById('storeNameInput').value = state.storeName;
  const wrap = document.getElementById('manageEvents');
  wrap.replaceChildren();

  const sorted = [...state.events].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  for (const event of sorted) {
    const row = el('div', 'manage-event');

    const gameLabel = el('label', null, 'Game');
    const gameInput = document.createElement('input');
    gameInput.type = 'text';
    gameInput.maxLength = 80;
    gameInput.value = event.game;
    gameLabel.append(gameInput);

    const dayLabel = el('label', null, 'Day');
    const daySelect = document.createElement('select');
    WEEKDAYS.forEach((name, idx) => {
      const opt = el('option', null, name);
      opt.value = String(idx);
      daySelect.append(opt);
    });
    daySelect.value = String(event.weekday);
    dayLabel.append(daySelect);

    const timeLabel = el('label', null, 'Start');
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.value = event.startTime;
    timeLabel.append(timeInput);

    const saveBtn = el('button', 'btn btn-purple', 'Save');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', async () => {
      try {
        await api('/api/events/update', {
          id: event.id,
          game: gameInput.value,
          weekday: Number(daySelect.value),
          startTime: timeInput.value,
        });
        await loadState();
      } catch (err) {
        showManageError(err.message);
      }
    });

    const deleteBtn = el('button', 'btn btn-danger', 'Delete');
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete “${event.game}” (${WEEKDAYS[event.weekday]} ${prettyTime(event.startTime)})?`)) return;
      try {
        await api('/api/events/delete', { id: event.id });
        await loadState();
      } catch (err) {
        showManageError(err.message);
      }
    });

    row.append(gameLabel, dayLabel, timeLabel, saveBtn, deleteBtn);
    wrap.append(row);
  }
}

function showManageError(message) {
  document.getElementById('manageError').textContent = message;
}

// ---------- wiring ----------

function init() {
  const handleInput = document.getElementById('yourHandle');
  handleInput.value = localStorage.getItem('gnb-handle') || '';
  handleInput.addEventListener('input', () => {
    localStorage.setItem('gnb-handle', handleInput.value.trim());
  });

  document.getElementById('dropinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('dropinError');
    error.textContent = '';
    try {
      await api('/api/dropin/toggle', {
        game: document.getElementById('dropinGame').value,
        visitDate: document.getElementById('dropinDay').value,
        timeWindow: document.getElementById('dropinWindow').value,
        guests: Number(document.getElementById('dropinGuests').value),
        deviceToken,
        handle: currentHandle(),
      });
      await loadState();
    } catch (err) {
      error.textContent = err.message;
    }
  });

  document.getElementById('storeNameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/settings', { storeName: document.getElementById('storeNameInput').value });
      await loadState();
    } catch (err) {
      showManageError(err.message);
    }
  });

  document.getElementById('addEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/events', {
        game: document.getElementById('newGame').value,
        weekday: Number(document.getElementById('newWeekday').value),
        startTime: document.getElementById('newTime').value,
      });
      e.target.reset();
      await loadState();
    } catch (err) {
      showManageError(err.message);
    }
  });

  loadState().catch((err) => {
    document.getElementById('board').replaceChildren(
      el('p', 'form-error', `The board could not load: ${err.message}`)
    );
  });
}

document.addEventListener('DOMContentLoaded', init);
