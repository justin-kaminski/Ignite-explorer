#!/usr/bin/env python3
"""Build data.json for the Ignite Session Guide from Microsoft's public Ignite catalog.

Usage:
    python3 tools/build_data.py                 # download the catalog and write ../data.json
    python3 tools/build_data.py --sessions all.json --speakers speakers.json   # use saved feeds

The catalog feeds are the same ones the official session catalog page loads:
    https://ignite.microsoft.com/api/session/all/en-US
    https://ignite.microsoft.com/api/speaker/all/en-US

Cleanup applied to the raw feeds:
- HTML in descriptions and bios is converted to plain text; broken characters (U+FFFD) become apostrophes.
- Times are converted to Pacific (event time zone) as day + minutes from midnight.
- Sessions that run more than once share a code; each run gets its own key (CODE, CODE-2, ...).
- Speaker records that appear twice with the same ID are folded together.
- Speaker records that appear twice with different IDs but the same name and at least one shared
  session are merged; the old ID is kept in "alias" so the page can move existing follows over.
- Speakers a session lists but the speaker feed is missing are rebuilt from the session's name list.
- Session -> speaker and speaker -> session links are made consistent in both directions.
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

SESSIONS_URL = "https://ignite.microsoft.com/api/session/all/en-US"
SPEAKERS_URL = "https://ignite.microsoft.com/api/speaker/all/en-US"
PT = ZoneInfo("America/Los_Angeles")
ZERO_WIDTH = re.compile(r"[​-‏﻿]")


def fetch_json(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ignite-session-guide-build"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # network hiccup: retry with backoff
            last = e
            time.sleep(2 * (i + 1))
    raise SystemExit(f"Could not download {url}: {last}")


def fetch_speakers(tries=3):
    """The speaker feed sometimes returns duplicate entries while it is being updated; retry until it is clean."""
    best = None
    for _ in range(tries):
        data = fetch_json(SPEAKERS_URL)
        ids = [p.get("speakerId") for p in data]
        if len(ids) == len(set(ids)):
            return data
        if best is None or len(set(ids)) > len({p.get("speakerId") for p in best}):
            best = data
        time.sleep(3)
    return best


def text(h):
    if not h:
        return ""
    h = re.sub(r"<\s*(br|/p|/li|/div)\s*/?>", "\n", h, flags=re.I)
    h = re.sub(r"<li[^>]*>", "- ", h, flags=re.I)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h).replace("�", "'")
    h = ZERO_WIDTH.sub("", h)
    h = re.sub(r"[ \t ]+", " ", h)
    h = re.sub(r"\n\s*\n+", "\n\n", h)
    return h.strip()


def display_values(x):
    return [i["displayValue"] for i in (x or []) if i and i.get("displayValue")]


def to_pt(iso):
    if not iso:
        return None
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(PT)


def build_sessions(raw):
    raw = sorted(raw, key=lambda s: (s.get("sessionCode") or s["sessionId"], s.get("startDateTime") or "z"))
    sessions, seen, instance_key = [], {}, {}
    for s in raw:
        code = s.get("sessionCode") or s["sessionId"]
        seen[code] = seen.get(code, 0) + 1
        key = code if seen[code] == 1 else f"{code}-{seen[code]}"
        instance_key["en-US-" + s["sessionInstanceId"]] = key
        loc = (s.get("location") or {}).get("displayValue") or ""
        building, room = ([x.strip() for x in loc.split("|", 1)] if "|" in loc else (loc, ""))
        o = {
            "k": key, "c": code, "id": s["sessionId"],
            "t": ZERO_WIDTH.sub("", html.unescape(s.get("title") or "").replace("�", "'")).strip(),
            "d": text(s.get("description")),
            "ty": (s.get("sessionType") or {}).get("displayValue") or "Other",
            "b": building, "r": room,
            "tp": display_values(s.get("topic")), "tg": display_values(s.get("tags")),
            "lv": display_values(s.get("sessionLevel")), "au": display_values(s.get("audienceTypes")),
            "dl": display_values(s.get("deliveryTypes")),
            "rec": "Will be recorded" in display_values(s.get("viewingOptions")),
            "sp": list(s.get("speakerIds") or []),
        }
        start, end = to_pt(s.get("startDateTime")), to_pt(s.get("endDateTime"))
        if start and end:
            o["day"] = start.strftime("%Y-%m-%d")
            o["s"] = start.hour * 60 + start.minute
            o["e"] = o["s"] + max(5, int((end - start).total_seconds() // 60))
        if s.get("hasOnDemand") and s.get("onDemand"):
            o["vid"] = s["onDemand"]
        if s.get("seatingExperience"):
            o["seat"] = s["seatingExperience"]
        sessions.append(o)
    return sessions, instance_key


def build_speakers(raw_speakers, raw_sessions, sessions, instance_key):
    speakers = []
    for p in raw_speakers:
        name = (p.get("displayName") or f"{p.get('firstName', '')} {p.get('lastName', '')}")
        speakers.append({
            "id": p["speakerId"], "n": ZERO_WIDTH.sub("", name).strip(),
            "j": p.get("jobTitle") or "", "co": p.get("company") or "", "bio": text(p.get("bio")),
            "ss": [instance_key[x] for x in (p.get("sessionsPresenting") or []) if x in instance_key],
        })

    # Speakers a session lists that the speaker feed lacks: rebuild from the session's name list.
    known = {p["id"] for p in speakers}
    raw_by_code = {}
    for s in raw_sessions:
        raw_by_code.setdefault(s.get("sessionCode") or s["sessionId"], s)
    stubs = {}
    for o in sessions:
        r = raw_by_code.get(o["c"]) or {}
        ids = r.get("speakerIds") or []
        names = [ZERO_WIDTH.sub("", x).strip() for x in (r.get("speakerNames") or "").split(",")]
        for i in o["sp"]:
            if i in known or i not in ids or len(names) != len(ids) or not names[ids.index(i)]:
                continue
            st = stubs.setdefault(i, {"id": i, "n": names[ids.index(i)], "j": "", "co": "", "bio": "", "ss": []})
            st["ss"].append(o["k"])
    speakers += stubs.values()

    # Same ID listed twice: fold together.
    uniq = {}
    for p in speakers:
        q = uniq.get(p["id"])
        if q is None:
            uniq[p["id"]] = p
            continue
        q["ss"] = list(dict.fromkeys(q["ss"] + p["ss"]))
        for f in ("j", "co", "bio"):
            q[f] = q[f] or p[f]
    speakers = list(uniq.values())

    # Same name, different IDs, shared sessions: same person. Keep the record sessions point to.
    refs = {}
    for o in sessions:
        for i in o["sp"]:
            refs[i] = refs.get(i, 0) + 1
    by_name = {}
    for p in speakers:
        by_name.setdefault(p["n"].lower(), []).append(p)
    alias = {}
    for group in by_name.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda p: (-refs.get(p["id"], 0), -len(p["j"]), -len(p["bio"])))
        keep = group[0]
        for other in group[1:]:
            if not set(other["ss"]) & set(keep["ss"]):
                continue  # same name, different person
            alias[other["id"]] = keep["id"]
            keep["ss"] = list(dict.fromkeys(keep["ss"] + other["ss"]))
            for f in ("j", "co", "bio"):
                keep[f] = keep[f] or other[f]
    speakers = [p for p in speakers if p["id"] not in alias]

    # Make links consistent both ways.
    by_key = {o["k"]: o for o in sessions}
    for o in sessions:
        o["sp"] = list(dict.fromkeys(alias.get(i, i) for i in o["sp"]))
    for p in speakers:
        for k in p["ss"]:
            if k in by_key and p["id"] not in by_key[k]["sp"]:
                by_key[k]["sp"].append(p["id"])
    listed = {}
    for o in sessions:
        for i in o["sp"]:
            listed.setdefault(i, []).append(o["k"])
    for p in speakers:
        p["ss"] = [k for k in dict.fromkeys(p["ss"] + listed.get(p["id"], [])) if k in by_key]
    known = {p["id"] for p in speakers}
    for o in sessions:
        o["sp"] = [i for i in o["sp"] if i in known]
    return speakers, alias, len(stubs)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sessions", help="saved session feed JSON (skips download)")
    ap.add_argument("--speakers", help="saved speaker feed JSON (skips download)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data.json"))
    a = ap.parse_args()

    raw_sessions = json.load(open(a.sessions, encoding="utf-8")) if a.sessions else fetch_json(SESSIONS_URL)
    raw_speakers = json.load(open(a.speakers, encoding="utf-8")) if a.speakers else fetch_speakers()

    sessions, instance_key = build_sessions(raw_sessions)
    speakers, alias, stubs = build_speakers(raw_speakers, raw_sessions, sessions, instance_key)
    out = {
        "event": "Microsoft Ignite 2026",
        "tz": "America/Los_Angeles",
        "fetched": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sessions": sessions,
        "speakers": speakers,
        "alias": alias,
    }
    body = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    if "�" in body:
        sys.exit("Output still contains U+FFFD replacement characters; check the feed.")
    Path(a.out).write_text(body, encoding="utf-8")
    timed = sum(1 for s in sessions if "day" in s)
    print(f"Wrote {a.out}: {len(sessions)} sessions ({timed} scheduled), {len(speakers)} speakers, "
          f"{len(alias)} merged duplicates, {stubs} rebuilt speakers, {len(body) // 1024} KB")


if __name__ == "__main__":
    main()
