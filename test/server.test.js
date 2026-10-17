'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

// Start a server on an ephemeral port with a throwaway data file and a
// fixed clock, so date-sensitive rules (closed days, started slots)
// test the same way on any machine at any hour.
async function startTestServer(nowDate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnb-test-'));
  const dataFile = path.join(dir, 'data.json');
  const server = createServer({ dataFile, now: () => nowDate });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function get(base, pathAndQuery) {
  const res = await fetch(`${base}${pathAndQuery}`);
  return { status: res.status, body: await res.json() };
}

async function post(base, pathname, payload) {
  const res = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

async function stateFor(base, deviceToken, from, to) {
  const params = new URLSearchParams({ deviceToken, from, to });
  const { body } = await get(base, `/api/state?${params}`);
  return body;
}

// Saturday, Oct 17 2026, 9:00 AM local — before any of that day's events.
const SAT_MORNING = new Date(2026, 9, 17, 9, 0);

test('state seeds the store name and the nine-event weekly schedule', async (t) => {
  const srv = await startTestServer(SAT_MORNING);
  t.after(() => srv.close());

  const state = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  assert.equal(state.storeName, 'Goblins of the Gorge');
  assert.equal(state.events.length, 9);
  assert.equal(state.hours[2], null, 'Tuesday is closed');
  assert.equal(state.hours[3], null, 'Wednesday is closed');
  assert.deepEqual(state.hours[5], { open: '11:00', close: '21:00' }, 'Friday hours');
});

test('rsvp toggle on adds the person and their guests to the totals', async (t) => {
  const srv = await startTestServer(SAT_MORNING);
  t.after(() => srv.close());

  const state0 = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const fnm = state0.events.find((e) => e.game === 'Friday Night Magic');
  assert.ok(fnm, 'seed includes Friday Night Magic');

  const on = await post(srv.base, '/api/rsvp/toggle', {
    eventId: fnm.id,
    occurrenceDate: '2026-10-23', // the Friday of that week
    deviceToken: 'device-a',
    handle: 'Alex',
    guests: 2,
  });
  assert.equal(on.status, 200);
  assert.equal(on.body.attending, true);

  const state1 = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const group = state1.rsvps.find((g) => g.eventId === fnm.id && g.occurrenceDate === '2026-10-23');
  assert.ok(group, 'rsvp group exists');
  assert.equal(group.total, 3, '1 attendee + 2 guests');
  assert.deepEqual(group.people, [{ handle: 'Alex', guests: 2, mine: true }]);
});

test('rsvp toggle off removes the person and the total', async (t) => {
  const srv = await startTestServer(SAT_MORNING);
  t.after(() => srv.close());

  const state0 = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const fnm = state0.events.find((e) => e.game === 'Friday Night Magic');
  const payload = { eventId: fnm.id, occurrenceDate: '2026-10-23', deviceToken: 'device-a', handle: 'Alex', guests: 1 };

  await post(srv.base, '/api/rsvp/toggle', payload);
  const off = await post(srv.base, '/api/rsvp/toggle', payload);
  assert.equal(off.status, 200);
  assert.equal(off.body.attending, false);

  const state1 = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const group = state1.rsvps.find((g) => g.eventId === fnm.id && g.occurrenceDate === '2026-10-23');
  assert.equal(group, undefined, 'group is gone once nobody is coming');
});

test("a second device sees the first device's rsvp", async (t) => {
  const srv = await startTestServer(SAT_MORNING);
  t.after(() => srv.close());

  const state0 = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const fab = state0.events.find((e) => e.game === 'Flesh and Blood Armory');
  await post(srv.base, '/api/rsvp/toggle', {
    eventId: fab.id,
    occurrenceDate: '2026-10-17', // that same Saturday, 1 PM — still ahead at 9 AM
    deviceToken: 'device-a',
    handle: 'Sam',
    guests: 0,
  });

  const seenByB = await stateFor(srv.base, 'device-b', '2026-10-17', '2026-10-23');
  const groupB = seenByB.rsvps.find((g) => g.eventId === fab.id && g.occurrenceDate === '2026-10-17');
  assert.ok(groupB, 'device B sees the rsvp');
  assert.equal(groupB.total, 1);
  assert.deepEqual(groupB.people, [{ handle: 'Sam', guests: 0, mine: false }]);

  const seenByA = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const groupA = seenByA.rsvps.find((g) => g.eventId === fab.id && g.occurrenceDate === '2026-10-17');
  assert.equal(groupA.people[0].mine, true, 'device A sees it as its own');
});

test('the server rejects rsvps and drop-ins on closed Tuesdays', async (t) => {
  // Tuesday, Oct 20 2026, 10:00 AM local.
  const srv = await startTestServer(new Date(2026, 9, 20, 10, 0));
  t.after(() => srv.close());

  const created = await post(srv.base, '/api/events', { game: 'Tuesday Test Game', weekday: 2, startTime: '18:00' });
  assert.equal(created.status, 201);

  const rsvp = await post(srv.base, '/api/rsvp/toggle', {
    eventId: created.body.event.id,
    occurrenceDate: '2026-10-20',
    deviceToken: 'device-a',
    handle: 'Alex',
    guests: 0,
  });
  assert.equal(rsvp.status, 400);
  assert.match(rsvp.body.error, /closed/i);

  const dropin = await post(srv.base, '/api/dropin/toggle', {
    game: 'Magic: The Gathering',
    visitDate: '2026-10-20',
    timeWindow: '5 PM – 8 PM',
    deviceToken: 'device-a',
    handle: 'Alex',
    guests: 0,
  });
  assert.equal(dropin.status, 400);
  assert.match(dropin.body.error, /closed/i);
});

test("a slot that already started today is rejected, a later one is fine", async (t) => {
  // Saturday, Oct 17 2026, 3:00 PM local — the 1 PM event has started.
  const srv = await startTestServer(new Date(2026, 9, 17, 15, 0));
  t.after(() => srv.close());

  const state0 = await stateFor(srv.base, 'device-a', '2026-10-17', '2026-10-23');
  const fab = state0.events.find((e) => e.game === 'Flesh and Blood Armory'); // Sat 13:00

  const past = await post(srv.base, '/api/rsvp/toggle', {
    eventId: fab.id,
    occurrenceDate: '2026-10-17',
    deviceToken: 'device-a',
    handle: 'Alex',
    guests: 0,
  });
  assert.equal(past.status, 400);
  assert.match(past.body.error, /already started/i);

  const created = await post(srv.base, '/api/events', { game: 'Evening Draft', weekday: 6, startTime: '18:00' });
  assert.equal(created.status, 201);
  const future = await post(srv.base, '/api/rsvp/toggle', {
    eventId: created.body.event.id,
    occurrenceDate: '2026-10-17',
    deviceToken: 'device-a',
    handle: 'Alex',
    guests: 0,
  });
  assert.equal(future.status, 200);
  assert.equal(future.body.attending, true);
});
