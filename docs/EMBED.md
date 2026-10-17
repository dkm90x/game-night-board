# Putting the Game Night Board on your store's website

Everything a store needs to go from "we have a board" to "it's on our site
and players are using it."

## What you get

Your board is hosted on a computer that stays on (your web host, a small
cloud server, or a machine at the shop) and lives at **its own web address**,
for example:

```text
https://board.yourstore.com/
```

That one address is the whole product: players open it on their phones, tap
**“I'll be there”** on the night they're coming to, and everyone sees the
same live count. There are two good ways to connect it to your existing
website — you can use either, or both.

## Option A — Embed it in a page (recommended)

Create a page on your site (e.g. "Who's Coming?") and paste this snippet
into the page's HTML where you want the board to appear:

```html
<!-- Game Night Board — replace the src URL with your board's address -->
<iframe
  src="https://YOUR-BOARD-ADDRESS.example/"
  title="Who's coming to game night?"
  style="width:100%; max-width:880px; height:900px; border:0; display:block; margin:0 auto;"
  loading="lazy">
</iframe>
```

Swap `https://YOUR-BOARD-ADDRESS.example/` for your board's real address.
The board is phone-friendly and will size itself to the page; if your
site builder (WordPress, Squarespace, Wix, Lightspeed, …) has an
"embed / custom HTML" block, the snippet goes in there exactly as written.

## Option B — A button or link

If you'd rather not embed anything, add a button or menu link on your
homepage and events pages that sends people to the board:

```html
<a href="https://YOUR-BOARD-ADDRESS.example/"
   style="display:inline-block; background:#39d353; color:#16130c; font-weight:800;
          padding:0.7rem 1.4rem; border:3px solid #16130c; border-radius:999px;
          text-decoration:none;">
  🎲 Who's coming tonight?
</a>
```

Link text ideas: **“Who's coming tonight?”** · **“See who's playing this
week”** · **“Count me in”**.

## The counter QR code

The board's address works great as a **QR code** taped to the counter, the
register, or the door: *"Scan to see who's coming this week — and tap in so
your night doesn't die empty."* Any free QR generator will turn the board's
URL into a printable code. This is the single best way to get regulars using
it, because it reaches them in the shop, at the moment they're thinking
about their next visit.

## Editing the schedule

Scroll to the **Manage** section at the bottom of the board itself:

- **Store name** — change it and hit *Save name*.
- **Weekly events** — every recurring event can be edited (game, day, start
  time) or deleted, and new ones added with the form at the bottom.

Changes are live the moment you save. Special one-off events (a prerelease,
a tournament) can be added as a regular event for that week and deleted
afterwards — or just promoted as a drop-in.

## Good to know

- **No player accounts.** Nobody signs up or remembers a password. A
  player's taps are remembered on their own phone/browser, and counts are
  shared for everyone.
- **Closed days are automatic.** Days the store is closed show as closed on
  the board, and the board won't accept check-ins for them. (In the code,
  the hours live in one small table at the top of `server.js` — ask whoever
  set the board up if your hours change seasonally.)
- **Today's started events lock.** Once an event's start time passes, that
  slot stops taking check-ins, so the count never lies about a night that's
  already underway.
- **Your data lives with your board.** Everything is stored in one
  `data.json` file next to the board itself — no third-party service sees
  your players' names, and backing up the board is copying one file.
- **Names are optional and public on the board.** Players can tap in with
  just a handle or no name at all ("Someone"). It's a show-of-hands board,
  not a registration system.
