# DeepSeek Peak Hours — Agent Contract

## What this is

A GNOME Shell top-bar indicator for Ubuntu that shows whether the DeepSeek API is billing at **peak (2×)** or **off-peak** rates right now, and when that changes. It sits immediately left of the clock. Sibling terminal command (`bin/deepseek-peak`) implements the same rules.

Verdict is computed **on UTC**; the local timezone only changes which clock you read, never the answer — the same rule [seekpeak.dev](https://seekpeak.dev/) uses.

## Non-negotiable constraints

- **Peak = 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays.** Weekends (Sat/Sun) and Chinese public holidays, both evaluated in **Beijing time (fixed UTC+8, never a DST zone)**, are off-peak all day. Peak is exactly 2× off-peak. Source: <https://api-docs.deepseek.com/quick_start/pricing/>
- **The verdict must never depend on the local timezone.** Only on UTC + the Beijing calendar. Any change that makes the answer timezone-dependent is a bug.
- **`extension/lib/*.js` and `lib/deepseek_peak_*.py` are deliberate twins.** Same rules, two implementations, pinned to the same expected answers by `tests/vectors.json`. Change one, change the other, re-run `make test`.
- **`extension/lib/core.js` stays pure** — no `gi://` imports, no DOM, no I/O. Only `data.js` and `format.js` may be imported, so it is testable in plain Node.
- **Exactly one outbound request exists: the once-a-day holiday feed.** Off by default in code, on by default in settings; it must always fail soft (bundled list stands). Never add a request on the verdict path — the verdict must work offline.
- **`extension/lib/data.js` is the single source of truth** for peak windows and holiday dates. The Python twin (`lib/deepseek_peak_data.py`) mirrors it by hand.
- Shell support: GNOME **45–48** (ESM extensions). Plain JavaScript ESM only; no build step, no TypeScript, no bundler, no npm dependencies at runtime.

## Repository layout

```
├─ extension/                    # the GNOME Shell extension — this directory alone is what gets installed
│  ├─ metadata.json              # uuid deepseek-peak@akuma.dev, shell-version 45-48, settings-schema
│  ├─ extension.js               # panel indicator: placement, menu, 30s timer, notifications, holiday feed
│  ├─ prefs.js                   # Settings window (libadwaita / Adw)
│  ├─ lib/
│  │  ├─ data.js                 # peak windows, bundled holiday calendar, per-1M price tables, URLs
│  │  ├─ core.js                 # pure verdict logic: isPeak, reason, nextTransition, peakBlocksForBeijingDay
│  │  └─ format.js               # verdict -> text on any timezone: label, menu strings, durations, window table
│  └─ schemas/                   # GSettings schema (org.gnome.shell.extensions.deepseek-peak)
├─ lib/                          # Python twins of extension/lib/*.js
│  ├─ deepseek_peak_data.py      # mirror of data.js
│  ├─ deepseek_peak_core.py      # mirror of core.js
│  └─ deepseek_peak_report.py    # mirror of format.js (default-tz detection, tz math, JSON output)
├─ bin/deepseek-peak             # terminal command (--summary, --json, --prices, --watch, --at, --timezone)
├─ tests/
│  ├─ core.test.mjs              # JS suite (node --test)
│  ├─ test_deepseek_peak.py      # PY suite (unittest) + diff against the JS implementation
│  ├─ vectors.json               # SHARED golden vectors — the contract both implementations must satisfy
│  ├─ build-vectors.mjs          # regenerates vectors.json (run after intentionally changing expectations)
│  └─ dump-verdicts.mjs          # prints JS verdicts as JSON; consumed by the Python cross-check
├─ smoke/                        # headless GNOME Shell harness (no session needed)
│  ├─ run.mjs                    # loads real extension.js against stubs: placement, menu, timers, lifecycle
│  ├─ prefs.mjs                  # loads real prefs.js against stubs
│  ├─ register.mjs               # node:module hook mapping gi:// and resource:// to stubs
│  └─ stubs/                     # faithful stand-ins for GObject, GLib, Gio, St, Clutter, Adw, Gtk, Shell UI
├─ docs/                         # verification screenshots (referenced by README.md)
├─ install.sh                    # install / enable / zip / uninstall
└─ Makefile                      # test, lint, install, zip, run
```

## Commands

```bash
make test          # JS logic + PY logic + both smoke suites   <- must pass before a change is done
make test-js       # node --test tests/core.test.mjs
make test-py       # python3 -m unittest discover -s tests -v
make test-smoke    # TZ=UTC node --import ./smoke/register.mjs smoke/run.mjs  (+ smoke/prefs.mjs)
make lint          # schema strict-compile, bash -n install.sh, parse every extension module
make install       # ./install.sh
./bin/deepseek-peak --summary            # live verdict
./bin/deepseek-peak --at 2026-10-05T02:00:00Z --summary   # deterministic, no clock dependence
```

- `smoke/run.mjs` **must run with `TZ=UTC`** (it asserts on clock text and exits if the zone is not UTC).
- Required tools: `node` 20+, `python3` 3.10+, `bash`, `glib-compile-schemas`, `gnome-extensions`. None are needed at *runtime* — the shipped extension is dependency-free.

## Where the code actually runs from (read before editing)

**The running extension is the copy at `~/.local/share/gnome-shell/extensions/deepseek-peak@akuma.dev/`, not this repo.** GNOME Shell only loads extensions from its own directory. Editing this repo changes nothing until `./install.sh` re-copies it and the shell reloads.

- `./install.sh --link` symlinks instead of copying, so edits land in place (still needs a shell reload).
- Verdict logic can be iterated with zero reloads via `./bin/deepseek-peak` and `make test`.

## Operational rules for agents

- Keep changes minimal and scoped; match the existing module boundaries (data / core / format / extension).
- **Documentation protocol (mandatory):** after every code change, update the relevant sections of `README.md`, `PROGRESS.md`, `TESTING.md`, and `ARCHITECTURE.md`. Log each completed change / bug / next step in `PROGRESS.md` (newest entry at top, dated). Do not wait to be asked.
- Run `make test` before considering a change done. If you change `vectors.json`, regenerate it with `node tests/build-vectors.mjs` and justify the new expectations in `PROGRESS.md`.
- When you add a GNOME/Shell API call, **check it exists in the real namespace** (see "Known risks") and make the corresponding stub faithful. An invented stub API is worse than no stub.

## Known risks / sharp edges

All of the following were hit and verified on this box (GNOME Shell 46.0, Ubuntu 24.04, X11, GJS 1.80).

- **`St.Align` does not exist in GNOME 46.** Verified absent from `libst-14.so`. `St.Align.MIDDLE` throws `TypeError: (intermediate value).Align is undefined` during class construction. The shell reports only `State: ERROR` in `gnome-extensions info`; the real message is in `journalctl --user -b | grep deepseek-peak`.
- **`Clutter.ActorAlign` has no `MIDDLE`.** The real members are `FILL` / `START` / `CENTER` / `END` (confirmed from `Clutter-14.typelib`). Passing a non-existent member yields `Error: Invalid value 'undefined' for property y-align in object initializer`. The shell's own panel code uses `ActorAlign.CENTER` (165 uses) — use that. There is also no bare `Clutter.Align`.
- **The smoke stubs must not invent API.** They previously exported `St.Align`, which made a broken extension pass every test. `smoke/stubs/gi/St.js` now deliberately has no `Align`, and `Clutter.js` exposes only `ActorAlign` with the four real members.
- **`gsettings` cannot see a user-installed extension's schema.** GNOME Shell registers bundled schemas at runtime from the extension directory, but the `gsettings`/`dconf-editor` CLI does not search there — `gsettings get org.gnome.shell.extensions.deepseek-peak panel-mode` says *No such schema*. Use:
  `GSETTINGS_SCHEMA_DIR=~/.local/share/gnome-shell/extensions/deepseek-peak@akuma.dev/schemas gsettings …`
  This affects only CLI access; the shell reads and writes settings normally.
- **A running GNOME Shell does not rescan for newly installed extensions.** `gnome-extensions enable` fails with *does not exist* until a reload. The installer therefore writes `org.gnome.shell enabled-extensions` directly, which is what makes it start. Reload on X11: `Alt`+`F2`, `r` — or `kill -HUP $(pgrep -x gnome-shell)`. On Wayland: log out and back in. `org.gnome.Shell.Eval` is disabled on GNOME 46 (`(false, '')`), so do not plan on live introspection.
- **Beijing is a fixed UTC+8 offset, not a timezone lookup.** `Intl` in GJS/Node can throw or need tzdata; `core.js` and `core.py` use a constant `BEIJING_UTC_OFFSET_MINUTES` and UTC-based date arithmetic. Do not "improve" this into a `zoneinfo`/`Intl` conversion for the weekend/holiday test — a DST-observing zone would break it.
- **`peakBlocksForBeijingDay` anchors windows to UTC midnight, not to the Beijing day.** The Beijing day starts at 16:00 UTC the previous day. Clamping a UTC-midnight-anchored window into the Beijing day is what handles both, and it is why a New York user (UTC−4) sees the local blocks `21:00-00:00` and `02:00-06:00`. Clamping the *other* way shifts every block by 8 hours and is covered by `TODAY_BLOCK_CASES` in `vectors.json`.
- **Next-transition search only probes UTC window edges** (01:00/04:00/06:00/10:00). This is sufficient because both the weekend and holiday flags flip exactly when a Beijing day starts (16:00 UTC, an even hour) — proven by the 800-step "every transition lands exactly on a UTC window edge" test. A lookahead of 400 days is used.
- **Make-up workdays (调休) are NOT holidays.** Only the holiday days from the State Council notice belong in `data.js`, even when the notice designates a weekend as a working day. The rate rule keys off the Beijing *weekend*, so such a day stays off-peak. Getting this wrong makes the indicator 2× wrong for days people actually work.
- **2027 holidays are not published** (expected ~Nov 2026). Dates past `CHINA_HOLIDAYS_KNOWN_THROUGH` (`2026-12-31`) fall back to plain weekday rules and the menu surfaces a "Holiday list ends …" warning. Do not fake 2027 dates.
- **`Module.registerHooks` vs `module.register`:** `smoke/register.mjs` uses the newer `registerHooks` (synchronous) because `module.register` is deprecated on Node 26. Keep it that way.
- **The indicator position is deliberate:** `addToStatusArea(uuid, indicator, 0, 'center')` then `insert_child_below(this.container, clockContainer)`. Verified against `libshell-14.so` (`_addToPanelBox` → `box.insert_child_at_index(container, position)`) and this box's panel config (`center: ['dateMenu']`), so position 0 lands immediately left of the clock.

## Verification status

Verified live in a real session on this box: `State: ACTIVE`, label rendering left of the clock, menu opening with correct contents, live settings repaint (`colourise` toggled on/off via `GSETTINGS_SCHEMA_DIR`), and the daily holiday feed actually fetching 33 dates that match the bundled list. Screenshots in `docs/`. See `TESTING.md` for how to re-verify.

## Governance

`AGENTS.md` may only be updated to add missing factual run/test info, document verified sharp edges, or correct incorrect instructions.
