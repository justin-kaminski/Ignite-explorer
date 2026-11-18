# Ignite Explorer

A TV-guide style browser for the Microsoft Ignite 2026 session catalog (San Francisco, Nov 16-20, 2026). Rooms run down the left, time runs across the top, and a "now" line shows what is on. Built because the official Microsoft Events Android app is hard to use for finding sessions.

This is an independent, unofficial tool. Session data comes from Microsoft's public Ignite catalog feed.

## Features

- **Guide:** grid of every session by room and time for each day, with a pinned "My schedule" row for starred sessions. Titles wrap in full; zoom in and out; "Now" jumps to the current time.
- **List:** the same sessions grouped by start time.
- **Search:** titles, speakers, tags, session codes and descriptions.
- **Filters:** session type, topic, level, audience, venue, in-person or online, recorded, and all of Microsoft's tags.
- **Color key:** one chip per session type with a count; tap to filter by type.
- **Tag list:** type tag words (for example `github copilot, azure, ai`) or pick tags, then match any or all of them.
- **My tags:** create your own tags from keywords. They apply automatically to every matching session. Prefixes such as `title:`, `speaker:`, `type:` and `level:` target one field, and `-word` excludes. Tags can also be added or removed on a single session.
- **Speakers:** search all speakers and follow them. Their sessions get a pink outline and their names show in pink.
- **My schedule:** starred sessions with overlaps flagged, sessions from followed speakers, and notes.
- **Notes:** per-session notes that save as you type.
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

This downloads the current session and speaker feeds from Microsoft and rewrites `data.json`. Keep `tools/instance_keys.json` in the repo: it holds the keys for sessions that run more than once, so stars stay on the same run after a refresh. It needs Python 3.9 or newer and no extra packages. The script also cleans up known problems in the feeds; see the notes at the top of `tools/build_data.py`.
