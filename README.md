# Ignite Explorer

A TV-guide style browser for the Microsoft Ignite 2026 session catalog (San Francisco, Nov 16-20, 2026). Rooms run down the left, time runs across the top, and a "now" line shows what is on. Built because the official Microsoft Events Android app is hard to use for finding sessions.

This is an independent, unofficial tool. Session data comes from Microsoft's public Ignite catalog feed.

## Features

- **Guide:** grid of every session by room and time for each day, with a pinned "My schedule" row for starred sessions. Titles wrap in full; zoom in and out; "Now" jumps to the current time.
- **List:** the same sessions grouped by start time.
- **Search:** titles, speakers, tags, session codes and descriptions.
- **Filters:** session type, topic, level, audience, venue, in-person or online, recorded, and all of Microsoft's tags.
- **Color key:** one chip per session type with a count; tap to filter by type.
- **Session kinds called out:** every catalog entry is shown, and the ones that are not ordinary in-person sessions are labeled. Overflow viewing rooms (codes ending in O, a live stream of another session) are hatched and link to the main session, which lists its overflow rooms. Online-only broadcasts get a dashed outline. On-demand recordings and digital labs are labeled too. The Filters sheet has a Kind group to narrow by these.
- **Tag list:** type tag words (for example `github copilot, azure, ai`) or pick tags, then match any or all of them.
- **Hide tags:** in the Tag list, switch "Tap a tag to" to Hide (or type a word starting with `-`, such as `-copilot`) to remove every session that has that tag. Hidden tags always win over other filters; tap a selected tag to switch it between show and hide. Starred sessions in the pinned row and the agenda are not affected.
- **My tags:** create your own tags from keywords. They apply automatically to every matching session. Prefixes such as `title:`, `speaker:`, `type:` and `level:` target one field, and `-word` excludes. Tags can also be added or removed on a single session.
- **Speakers:** search all speakers and follow them. Their sessions get a pink outline and their names show in pink.
- **My schedule:** starred sessions with overlaps flagged, sessions from followed speakers, and notes.
- **Notes:** per-session notes that save as you type.
- **Data in the page address:** on this GitHub version, your stars, follows, tags and notes are kept in the part of the address after `~` (inside the `#` fragment, never sent to a server) and updated as you change things. Copy or bookmark the address to save everything, or open it on another device. If a link's data differs from what that device already has, you choose: use the link's data, merge both, or keep the device's. Turn it off in My schedule. Since the address then carries your notes, use the Share button (not the address bar) to send sessions to other people.
- **Move to another device:** in My schedule, Copy transfer link packs your stars, followed speakers, tags and notes into the part of a link after `#` (never sent to any server). Open it on your other device and confirm to merge; merging only adds. The claude.ai version can make these links too (they open this GitHub copy). Anyone with the link can read your notes, so only send it to yourself.
- **Agenda in the guide:** an Event agenda row at the top of each day's grid and agenda entries in the List time slots (same-time items such as lunch spots or shuttle stops are combined). Tap one for its places and map links. The Agenda toggle hides them; they also step aside while a search, filter or the Starred / Followed toggles are on.
- **Event info tab:** badge pickup, keynote and celebration shuttles, lunch spots, Hub and Swag Central hours, certifications and receptions for each day, with live/ended status and a map link for every place. Data comes from the public Event Agenda feed of Microsoft's venue map and refreshes with the rest of the data.
- **Venue map links:** the map button in the header opens Microsoft's venue map (wayfinding.event.microsoft.com) at the campus view; the Map button in a session's details, every room name in the guide grid, and every place in Event info open it focused on that spot. The map can't be embedded in this site: Microsoft only allows it inside its own Ignite sites. The map itself stays on Microsoft's site; no map data is copied here.
- **Share a session:** the Share button in a session's details opens the phone's share sheet (or copies to the clipboard) with the session's time, room, speakers, a link that opens it in this guide (`#s-CODE`), and the official page.
- **Reminders (optional):** turn on in My schedule. A banner appears 5, 10, 15 or 30 minutes before each starred session while the page is open; on this GitHub Pages version you can also enable system notifications (`sw.js` handles taps). Phones pause background tabs, so for alerts with the page closed use **Add starred sessions to my calendar**, which downloads an `.ics` file with an alarm on each session. Cancelled sessions are skipped.
- **Change alerts:** the page remembers what each starred session looked like and alerts you (banner, plus a system notification if enabled) when one is cancelled, moves to another time or day, changes room, or disappears from the catalog. Changes are also listed under Schedule changes in My schedule. While open, the page checks for new data every 15 minutes and when you return to the tab.
- **Cancelled sessions:** Microsoft marks cancellations only with a "CANCELLED:" title prefix; these get a red CANCELLED label, a struck-through title, a warning in My schedule, and a Kind filter option.
- **Import your existing schedule:** three ways, and you review the matches before anything is starred.
  - Calendar file (most accurate): open https://ignite.microsoft.com/en-US/schedule and sign in, then tap the download (down arrow) button. If it isn't there, tap your profile picture at the top right; the panel has My schedule with the download button under the day picker. Save the `.ics` file and pick it in the import panel. It is read entirely in the page.
  - Codes or titles: paste or type them, for example `BRK543, THR920`.
  - Screenshots (claude.ai version only): pick screenshots of My Schedule from the Microsoft Events app and Claude reads the session codes from them.

All times are Pacific, the event's time zone.

## Where your data is saved

- Opened as a claude.ai artifact: stars, follows, tags and notes save to a private per-user store tied to your claude.ai account, and sync between devices.
- Opened anywhere else, for example GitHub Pages or a local web server: everything saves in the browser's local storage on that device.
- View settings (day, filters, zoom) always stay in the browser.

## Running it

It is a static page: `index.html` plus `data.json`. Serve the repository root with any static web server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Opening `index.html` directly from disk does not work because the browser blocks loading `data.json` from a `file://` page.

To host it on GitHub Pages: Settings > Pages, source "Deploy from a branch", branch `main`, folder `/ (root)`. No build step is needed.

## Refreshing the session data

```
python3 tools/build_data.py
```

A GitHub Actions workflow (`.github/workflows/refresh-data.yml`) runs this every 30 minutes through Nov 21, 2026, commits `data.json` only when the catalog changed, and rebuilds the Pages site. Run it by hand from the Actions tab, or disable it there (or delete the file) to stop it.

The script downloads the current session and speaker feeds from Microsoft and rewrites `data.json` (it leaves the file alone when nothing changed). Keep `tools/instance_keys.json` in the repo: it holds the keys for sessions that run more than once, so stars stay on the same run after a refresh. It needs Python 3.9 or newer and no extra packages. The script also cleans up known problems in the feeds; see the notes at the top of `tools/build_data.py`.

## Security and privacy

- Static site: no server code, accounts or secrets. The repository holds only the app and Microsoft's public session catalog.
- Strict Content Security Policy in `index.html`: scripts, styles, fonts, data and workers load only from this site; no inline scripts, embeds or outside connections. `app.js` holds the code so inline scripts can stay forbidden.
- No third-party requests: fonts are self-hosted in `fonts/` (SIL Open Font License, license files included), and there is no analytics or tracking. Links to Microsoft are sent without a referrer.
- All catalog text, notes, tag names, searches and imported calendar files are escaped before display.
- Stars, notes and tags are stored in your browser's local storage on that device and never sent anywhere. Every GitHub Pages site under the same account shares the `<user>.github.io` origin, so avoid hosting untrusted code in other Pages sites on the same account.
- The data-refresh workflow uses the per-run `GITHUB_TOKEN` (write access to this repository and Pages only), and its only third-party action, `actions/checkout`, is pinned to an exact commit.

`index.html`, `app.js` and `fonts.css` are generated from the claude.ai version of the page; edit them together.

