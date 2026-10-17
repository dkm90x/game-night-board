# Game Night Board

**Who's coming to game night?** A shared "who's coming" board for a local game
store — built so a good event night never dies empty.

## The problem

Every game store knows this night: a scheduled event — Commander, Pokémon
League, Friday Night Magic — draws *nobody*. Not because nobody wanted to
play, but because every player separately thought *"nobody else will be
there, why bother driving out?"* — so nobody came, which proved everybody
right. The fix isn't more advertising. It's making the intention to show up
**visible before the night starts**.

## What it does

The board shows the store's real weekly schedule. For any event, any player
can tap **“I'll be there”** — optionally with a first name/handle and how many
guests they're bringing. Everyone who opens the board sees the same live
count and the same names, so a night visibly builds momentum instead of
quietly dying.

- **Week board** — the next 7 days from today, one section per day, with the
  store's hours on each day. Days the store is closed render as closed (for
  this store: Tuesdays and Wednesdays — *“Closed — the goblins are resting”*),
  and the server refuses check-ins for those days.
- **One-tap check-ins** — tap to say you're coming, tap again to back out.
  Totals count you plus your guests. No accounts, no passwords: your taps are
  remembered on your device with a random token in `localStorage`.
- **Started slots lock** — once today's start time passes, that slot closes.
- **Drop-ins** — no scheduled event? Players can still flag "I'm coming by
  today/tomorrow around this time to play X," and it shows in that day's
  count for everyone.
- **Manage view** — the owner renames the store and adds / edits / deletes
  recurring weekly events right on the page. Changes are live immediately.
- **Shared state** — all counts live on the server, so every visitor sees
  the same board.

## The backstory

I built this for free for **Goblins of the Gorge**, a game store in downtown
Gresham, Oregon, after hearing the owner describe exactly the problem above.
It's styled after their own branding — the cartoon goblins, the bright green
and wizard purple, the chunky lettering — and seeded with their real weekly
schedule and store hours. It's also my first portfolio piece as I get started
in software development: small, finished, and solving a real problem for a
real business.

## Tech notes

- **Zero dependencies.** The server is one file of Node.js standard library
  (`node:http`, `node:fs`) — no framework, no build step, nothing to install.
  The front end is vanilla HTML/CSS/JS.
- **Persistence** is a single local `data.json` file, seeded on first run and
  rewritten on each change. Deliberately boring: at game-store scale this is
  the right amount of database.
- **Tests** use the built-in `node:test` runner against the real HTTP API,
  with an injected clock so the closed-day and already-started rules test
  deterministically.

## Setup

Prerequisites: Node.js 18 or newer. That's it.

```sh
git clone https://github.com/dkm90x/game-night-board.git
cd game-night-board
node server.js
```

Open <http://localhost:3000>. The board seeds itself with the store's
schedule on first run and saves its state to `data.json` (gitignored — your
live board's data stays yours).

Configuration is optional and comes from the environment:

| Variable    | Default     | What it does                                   |
| ----------- | ----------- | ---------------------------------------------- |
| `PORT`      | `3000`      | Port the server listens on.                    |
| `DATA_FILE` | `data.json` | Where board state is stored.                  |
| `TZ`        | system      | Timezone for "today" — set it to the store's, e.g. `TZ=America/Los_Angeles node server.js`, if the host computer lives elsewhere. |

Copy `.env.example` to `.env` if you use a tool that loads one; the server
reads plain environment variables and works fine without it.

Run the tests:

```sh
npm test
# which runs: node --test test/server.test.js
```

## Project layout

```text
server.js            The whole backend: static hosting + JSON API + data.json store
public/
  index.html         Page structure: header, week board, drop-ins, manage
  styles.css         The goblin look: cream, green, purple, sticker shadows
  app.js             Vanilla JS front end (device-token identity, rendering, API calls)
test/
  server.test.js     API tests: toggles, cross-device visibility, closed days, started slots
docs/
  EMBED.md           How a store puts the board on its own website
```

## For store owners

Want this on your website? You don't need to touch code — see
[docs/EMBED.md](docs/EMBED.md) for the embed snippet, the button option, and
the counter QR code idea. If you'd like help setting it up, or changes like
your hours, your games, or your colors, that's exactly the kind of small
contract work I'm happy to take on.

## License

MIT © 2026 Jordan McDonley — see [LICENSE](LICENSE). The seeded schedule and
branding in this repo belong to the store it was built for; the code is free
to reuse.
