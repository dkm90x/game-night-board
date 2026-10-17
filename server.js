'use strict';

/**
 * Game Night Board — a "who's coming" board for a local game store.
 *
 * Dependency-free Node server (node:http + node:fs only).
 * Serves the static front end from public/ and a small JSON API.
 * State persists to a local data.json file (seeded on first run).
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_DATA_FILE = path.join(__dirname, 'data.json');

// Store hours by JS weekday (0 = Sunday ... 6 = Saturday). null = closed.
const STORE_HOURS = {
  0: { open: '11:00', close: '18:00' }, // Sunday
  1: { open: '11:00', close: '20:00' }, // Monday
  2: null, // Tuesday — closed
  3: null, // Wednesday — closed
  4: { open: '11:00', close: '20:00' }, // Thursday
  5: { open: '11:00', close: '21:00' }, // Friday
  6: { open: '11:00', close: '20:00' }, // Saturday
};

const CLOSED_MESSAGE = 'The store is closed on Tuesdays and Wednesdays.';

const SEED_STORE_NAME = 'Goblins of the Gorge';

const SEED_EVENTS = [
  { game: 'Beyblade', weekday: 0, startTime: '12:30' },
  { game: 'Lorcana', weekday: 0, startTime: '13:30' },
  { game: 'Riftbound', weekday: 0, startTime: '14:00' },
  { game: 'Dungeons & Dragons', weekday: 0, startTime: '15:00' },
  { game: 'Pokémon TCG / VG / GO', weekday: 1, startTime: '18:00' },
  { game: 'Dungeons & Dragons', weekday: 5, startTime: '17:00' },
  { game: 'Friday Night Magic — Sealed League & Commander', weekday: 5, startTime: '17:30' },
  { game: 'Magic: Booster Draft', weekday: 6, startTime: '13:00' },
  { game: 'Magic: Commander', weekday: 6, startTime: '16:00' },
  { game: 'Magic: Pauper', weekday: 6, startTime: '16:00' },
];

// ---------- date helpers (all local-time, YYYY-MM-DD strings) ----------

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof str === 'string' ? str : '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
  return d;
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function timeToMinutes(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(t || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

// ---------- validation helpers ----------

function cleanHandle(v) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, 40);
}

function cleanGuests(v) {
  const n = v === undefined || v === null ? 0 : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10) return null;
  return n;
}

function cleanDeviceToken(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 128) return null;
  return t;
}

function cleanGame(v) {
  if (typeof v !== 'string') return null;
  const g = v.trim();
  if (!g || g.length > 80) return null;
  return g;
}

function cleanWeekday(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

function cleanStartTime(v) {
  if (typeof v !== 'string' || timeToMinutes(v) === null) return null;
  return v;
}

// ---------- data store ----------

function seedData() {
  return {
    storeName: SEED_STORE_NAME,
    events: SEED_EVENTS.map((e, i) => ({ id: `seed-${i + 1}`, ...e })),
    rsvps: [],
    dropins: [],
  };
}

function loadData(dataFile) {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.events) && Array.isArray(parsed.rsvps) && Array.isArray(parsed.dropins)) {
      return parsed;
    }
  } catch {
    // Missing or unreadable file: fall through to seeding.
  }
  const data = seedData();
  saveData(dataFile, data);
  return data;
}

function saveData(dataFile, data) {
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, dataFile);
}

function newEventId() {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- server ----------

function createServer(options = {}) {
  const dataFile = options.dataFile || process.env.DATA_FILE || DEFAULT_DATA_FILE;
  const now = options.now || (() => new Date());
  const data = loadData(dataFile);

  const save = () => saveData(dataFile, data);
  const todayStr = () => formatDate(now());

  function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }

  function fail(res, status, message) {
    sendJson(res, status, { error: message });
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024) {
          reject(new Error('Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (!text) return resolve({});
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  // ----- API handlers -----

  function handleState(req, res, url) {
    const deviceToken = url.searchParams.get('deviceToken') || '';
    const from = parseDate(url.searchParams.get('from') || '') ? url.searchParams.get('from') : todayStr();
    const to = parseDate(url.searchParams.get('to') || '') ? url.searchParams.get('to') : addDays(from, 6);
    const inRange = (dateStr) => dateStr >= from && dateStr <= to;

    const rsvpGroups = new Map();
    for (const r of data.rsvps) {
      if (!inRange(r.occurrenceDate)) continue;
      const key = `${r.eventId}|${r.occurrenceDate}`;
      if (!rsvpGroups.has(key)) {
        rsvpGroups.set(key, { eventId: r.eventId, occurrenceDate: r.occurrenceDate, total: 0, people: [] });
      }
      const group = rsvpGroups.get(key);
      group.total += 1 + r.guests;
      group.people.push({ handle: r.handle, guests: r.guests, mine: r.deviceToken === deviceToken && deviceToken !== '' });
    }

    const dropinGroups = new Map();
    for (const d of data.dropins) {
      if (!inRange(d.visitDate)) continue;
      const key = `${d.visitDate}|${d.game}|${d.timeWindow}`;
      if (!dropinGroups.has(key)) {
        dropinGroups.set(key, { visitDate: d.visitDate, game: d.game, timeWindow: d.timeWindow, total: 0, people: [] });
      }
      const group = dropinGroups.get(key);
      group.total += 1 + d.guests;
      group.people.push({ handle: d.handle, guests: d.guests, mine: d.deviceToken === deviceToken && deviceToken !== '' });
    }

    sendJson(res, 200, {
      storeName: data.storeName,
      hours: STORE_HOURS,
      events: [...data.events].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)),
      rsvps: [...rsvpGroups.values()],
      dropins: [...dropinGroups.values()],
    });
  }

  function handleRsvpToggle(res, body) {
    const deviceToken = cleanDeviceToken(body.deviceToken);
    if (!deviceToken) return fail(res, 400, 'A device token is required.');
    const event = data.events.find((e) => e.id === body.eventId);
    if (!event) return fail(res, 404, 'Event not found.');
    const date = parseDate(body.occurrenceDate);
    if (!date) return fail(res, 400, 'occurrenceDate must be YYYY-MM-DD.');

    const existingIdx = data.rsvps.findIndex(
      (r) => r.eventId === event.id && r.occurrenceDate === body.occurrenceDate && r.deviceToken === deviceToken
    );
    if (existingIdx >= 0) {
      data.rsvps.splice(existingIdx, 1);
      save();
      return sendJson(res, 200, { attending: false });
    }

    const weekday = date.getDay();
    if (!STORE_HOURS[weekday]) return fail(res, 400, CLOSED_MESSAGE);
    if (weekday !== event.weekday) return fail(res, 400, 'That event does not run on that day of the week.');

    const today = todayStr();
    if (body.occurrenceDate < today) return fail(res, 400, 'That day has already passed.');
    if (body.occurrenceDate === today && minutesOfDay(now()) >= timeToMinutes(event.startTime)) {
      return fail(res, 400, 'That slot has already started.');
    }

    const guests = cleanGuests(body.guests);
    if (guests === null) return fail(res, 400, 'guests must be a whole number from 0 to 10.');

    data.rsvps.push({
      eventId: event.id,
      occurrenceDate: body.occurrenceDate,
      deviceToken,
      handle: cleanHandle(body.handle),
      guests,
    });
    save();
    return sendJson(res, 200, { attending: true });
  }

  function handleDropinToggle(res, body) {
    const deviceToken = cleanDeviceToken(body.deviceToken);
    if (!deviceToken) return fail(res, 400, 'A device token is required.');
    const game = cleanGame(body.game);
    if (!game) return fail(res, 400, 'A game name is required.');
    const date = parseDate(body.visitDate);
    if (!date) return fail(res, 400, 'visitDate must be YYYY-MM-DD.');
    const timeWindow = typeof body.timeWindow === 'string' ? body.timeWindow.trim().slice(0, 40) : '';
    if (!timeWindow) return fail(res, 400, 'A time window is required.');

    const existingIdx = data.dropins.findIndex(
      (d) => d.game === game && d.visitDate === body.visitDate && d.timeWindow === timeWindow && d.deviceToken === deviceToken
    );
    if (existingIdx >= 0) {
      data.dropins.splice(existingIdx, 1);
      save();
      return sendJson(res, 200, { attending: false });
    }

    const today = todayStr();
    const tomorrow = addDays(today, 1);
    if (body.visitDate < today) return fail(res, 400, 'That day has already passed.');
    if (body.visitDate > tomorrow) return fail(res, 400, 'Drop-ins can only be set for today or tomorrow.');
    if (!STORE_HOURS[date.getDay()]) return fail(res, 400, CLOSED_MESSAGE);

    const guests = cleanGuests(body.guests);
    if (guests === null) return fail(res, 400, 'guests must be a whole number from 0 to 10.');

    data.dropins.push({
      game,
      visitDate: body.visitDate,
      timeWindow,
      deviceToken,
      handle: cleanHandle(body.handle),
      guests,
    });
    save();
    return sendJson(res, 200, { attending: true });
  }

  function handleEventCreate(res, body) {
    const game = cleanGame(body.game);
    const weekday = cleanWeekday(body.weekday);
    const startTime = cleanStartTime(body.startTime);
    if (!game) return fail(res, 400, 'A game name is required.');
    if (weekday === null) return fail(res, 400, 'weekday must be a whole number from 0 (Sunday) to 6 (Saturday).');
    if (!startTime) return fail(res, 400, 'startTime must be HH:MM (24-hour).');
    const event = { id: newEventId(), game, weekday, startTime };
    data.events.push(event);
    save();
    return sendJson(res, 201, { event });
  }

  function handleEventUpdate(res, body) {
    const event = data.events.find((e) => e.id === body.id);
    if (!event) return fail(res, 404, 'Event not found.');
    if (body.game !== undefined) {
      const game = cleanGame(body.game);
      if (!game) return fail(res, 400, 'A game name is required.');
      event.game = game;
    }
    if (body.weekday !== undefined) {
      const weekday = cleanWeekday(body.weekday);
      if (weekday === null) return fail(res, 400, 'weekday must be a whole number from 0 (Sunday) to 6 (Saturday).');
      event.weekday = weekday;
    }
    if (body.startTime !== undefined) {
      const startTime = cleanStartTime(body.startTime);
      if (!startTime) return fail(res, 400, 'startTime must be HH:MM (24-hour).');
      event.startTime = startTime;
    }
    save();
    return sendJson(res, 200, { event });
  }

  function handleEventDelete(res, body) {
    const idx = data.events.findIndex((e) => e.id === body.id);
    if (idx < 0) return fail(res, 404, 'Event not found.');
    const [removed] = data.events.splice(idx, 1);
    data.rsvps = data.rsvps.filter((r) => r.eventId !== removed.id);
    save();
    return sendJson(res, 200, { deleted: removed.id });
  }

  function handleSettings(res, body) {
    if (typeof body.storeName !== 'string' || !body.storeName.trim()) {
      return fail(res, 400, 'A store name is required.');
    }
    data.storeName = body.storeName.trim().slice(0, 80);
    save();
    return sendJson(res, 200, { storeName: data.storeName });
  }

  // ----- static files -----

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  function serveStatic(req, res, url) {
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    let decoded;
    try {
      decoded = decodeURIComponent(rel);
    } catch {
      return fail(res, 400, 'Bad path.');
    }
    const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
    if (!filePath.startsWith(PUBLIC_DIR)) return fail(res, 403, 'Forbidden.');
    fs.readFile(filePath, (err, content) => {
      if (err) return fail(res, 404, 'Not found.');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(content);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/state') return handleState(req, res, url);
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const body = await readBody(req);
        switch (url.pathname) {
          case '/api/rsvp/toggle':
            return handleRsvpToggle(res, body);
          case '/api/dropin/toggle':
            return handleDropinToggle(res, body);
          case '/api/events':
            return handleEventCreate(res, body);
          case '/api/events/update':
            return handleEventUpdate(res, body);
          case '/api/events/delete':
            return handleEventDelete(res, body);
          case '/api/settings':
            return handleSettings(res, body);
          default:
            return fail(res, 404, 'Unknown API endpoint.');
        }
      }
      if (req.method === 'GET') return serveStatic(req, res, url);
      return fail(res, 405, 'Method not allowed.');
    } catch (err) {
      return fail(res, 400, err.message || 'Bad request.');
    }
  });

  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, () => {
    console.log(`Game Night Board is running at http://localhost:${port}`);
  });
}

module.exports = { createServer, STORE_HOURS };
