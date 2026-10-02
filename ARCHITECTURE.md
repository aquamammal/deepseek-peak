# ARCHITECTURE — DeepSeek Peak Hours

## The one idea

Everything reduces to a single pure function evaluated at an instant:

```
peak = NOT weekend_in_Asia/Shanghai
       AND NOT chinese_public_holiday_in_Asia/Shanghai
       AND utc_time inside [01:00,04:00) or [06:00,10:00)
```

The instant is always normalized to UTC. The local timezone is applied **only** when rendering text for the user. This is why the indicator, the terminal command, and the reference website agree regardless of where the machine is.

## Layering

```
                       ┌──────────────────────────────┐
                       │  extension/lib/data.js       │  peak windows
                       │  lib/deepseek_peak_data.py   │  holiday dates
                       └──────────────┬───────────────┘  price tables
                                      │
                       ┌──────────────▼───────────────┐
                       │  extension/lib/core.js       │  PURE verdict engine
                       │  lib/deepseek_peak_core.py   │  no gi://, no DOM, no I/O
                       └──────────────┬───────────────┘  isPeak / reason
                                      │                   nextTransition
                       ┌──────────────▼───────────────┐   peakBlocksForBeijingDay
                       │  extension/lib/format.js     │  verdict -> text
                       │  lib/deepseek_peak_report.py │  timezone math, labels,
                       └──────────────┬───────────────┘  durations, JSON
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
   ┌──────────▼───────────┐                       ┌───────────▼────────────┐
   │ extension/extension.js│                      │ bin/deepseek-peak      │
   │  GNOME panel indicator│                      │  argparse CLI          │
   │  menu, timers, notify │                      └────────────────────────┘
   │ extension/prefs.js    │
   │  Adw settings window  │
   └──────────────────────┘
```

`core.js` importing only `data.js` is what makes the whole rule set testable in plain Node and in GJS without a session. Keep it that way.

## Data flow at runtime

1. `enable()` constructs the `PanelMenu.Button`, places it in the centre box before the clock, and does the first `_refresh()`.
2. A 30 s `GLib.timeout_add_seconds` re-runs `_refresh()`. **No polling of the clock text** — the label is a static string, and the menu strings carry their own "in 3h 05m".
3. `_refresh()` → `evaluate(new Date(), {timeZone, holidays})` → new report → label text/colour → menu texts → possibly a notification.
4. A notification fires only when `report.peak` differs from the previous report's, and only if `notify-on-change` is set. The very first refresh never notifies (`_firstRefresh` guard).
5. A 24 h timer attempts the holiday feed. Success replaces the bundled `Set` via the `holiday-overrides` setting, which drives a `changed::` handler back into `_refresh()`.

The verdict itself never consults the network.

## Why the next transition is cheap to find

The peak state can only flip at a UTC window edge — 01:00, 04:00, 06:00, 10:00. The weekend flag flips exactly when a Beijing day starts, which is 16:00 UTC, always an even hour; the holiday flag flips at the same instants. So probing the four window edges per day, for up to 400 days, is exhaustive and correct. `tests/core.test.mjs` walks 800 consecutive transitions and asserts each lands precisely on an edge and genuinely flips the verdict.

## Timezone handling

- `format.js` resolves the local zone once at module load (`DEFAULT_TIMEZONE` from `Intl`).
- `offsetMinutes(date, timeZone)` derives the offset for a specific instant from `Intl.formatToParts`, so DST transitions inside a displayed range render correctly.
- `peakBlocksForBeijingDay` computes the Beijing day's real UTC boundaries and clamps the UTC-midnight-anchored windows into them. This is the only place that mixes the two calendars, and it has its own golden vectors.

Beijing itself is a **fixed +08:00 constant**, deliberately not a timezone lookup — see `AGENTS.md`, "Known risks".

## Settings and persistence

- Schema `org.gnome.shell.extensions.deepseek-peak`, shipped inside `extension/schemas/`.
- GNOME Shell registers the compiled schema at load; the `gsettings` CLI does not search the extension directory, hence `GSETTINGS_SCHEMA_DIR` in `README.md`.
- `holiday-overrides` is the only key written by the extension at runtime (newline-separated `YYYY-MM-DD`), plus `holiday-overrides-fetched-at`. Both are plain settings, so `dconf dump` shows exactly what was downloaded.
- All timers and signal handlers are tracked in `_timers` / `_settingsHandlers` and released in `destroy()`. `smoke/run.mjs` asserts `disable()` leaves no timer, no settings handler, and no indicator signal behind.

## Testing strategy

The unusual part: **the rules are implemented twice on purpose** (JS for the shell, Python for a scriptable CLI that works without a GNOME session), and `tests/vectors.json` is the shared contract. `tests/test_deepseek_peak.py` shells out to `tests/dump-verdicts.mjs` and diffs the two implementations case by case, so they cannot silently drift.

Three layers:

| Layer | What it proves | How |
| --- | --- | --- |
| Logic (JS + PY) | rule correctness, edge instants, timezone independence, transition edges | `tests/vectors.json` + property tests |
| Behaviour (smoke) | panel placement, menu contents, settings wiring, timer, notification, lifecycle | real `extension.js` against faithful GI stubs |
| Live | it actually renders in a session | screenshots in `docs/`, `journalctl` check |

The smoke stubs exist to catch API misuse a live session would only reveal as `State: ERROR`. They are only as good as their fidelity — see the `St.Align` regression in `AGENTS.md`.

## Deliberate non-goals

- No network call on the verdict path (must work offline).
- No i18n/gettext yet; `gettext-domain` is declared in `metadata.json` but strings are plain English.
- No history, statistics, or spend estimation — it reports the *rate*, not your usage.
- No attempt to fetch 2027 holidays early; stale data is surfaced, not guessed.
