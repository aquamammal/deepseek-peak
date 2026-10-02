# TESTING — DeepSeek Peak Hours

Two automated layers plus a live checklist. `make test` runs everything; it must be green before a change is considered done.

```bash
make test          # JS logic + PY logic + both smoke suites
make test-js       # 11 tests: rules, edges, timezones, transitions, formatting
make test-py       # 14 tests incl. a case-by-case diff against the JS implementation
make test-smoke    # 17 extension checks + 5 prefs checks, headless
make lint          # schema strict-compile, bash -n install.sh, parse all modules
```

---

## 1. Logic — `tests/core.test.mjs` and `tests/test_deepseek_peak.py`

Driven by `tests/vectors.json`, the shared contract for both implementations.

- [ ] `node --test tests/core.test.mjs` → `pass 11 / fail 0`.
- [ ] `python3 -m unittest discover -s tests -v` → `OK` (14 tests).
- [ ] The Python suite's `TestAgainstJavaScript` shells out to `tests/dump-verdicts.mjs` and asserts every vector's `peak`, `reason`, `next`, and `nextPeak` match the JS answers exactly.

What the vectors pin down:

- **Window edges.** 02:30/04:30/09:59 UTC on a Beijing Friday → peak, off-peak, peak; transitions at exactly 04:00 and 10:00.
- **Weekends win over windows.** A Saturday 10:00 Beijing *inside* a UTC window must be off-peak (`reason: weekend`), and the next transition is Monday 01:00 UTC.
- **Beijing week start.** Monday 00:30 UTC is still off-peak (`window`), flipping at 01:00.
- **Holidays.** National Day (2026-10-05) off-peak though it is a Monday; the day the holiday ends is a normal peak day; Spring Festival swallows a week; a weekend *also* listed as a holiday reports `weekend`, not `holiday`.
- **Timezone independence.** Five zones must give an identical verdict and an identical next-transition instant.
- **Local block rendering** (`TODAY_BLOCK_CASES`): New York `21:00-00:00, 02:00-06:00`, Kolkata `06:30-09:30, 11:30-15:30`, Auckland `13:00-16:00, 18:00-22:00`, UTC unchanged.

Property tests beyond the vectors:

- [ ] Every one of 800 consecutive transitions lands exactly on a UTC window edge, at second zero, and genuinely flips the verdict.
- [ ] Across all 365 days of 2026, no Beijing weekend or holiday day has any peak block.
- [ ] Holiday-data staleness flips exactly at `2027-01-01`.
- [ ] 2027 dates fall back to weekday rules; injecting a custom holiday changes the verdict.

To change expectations intentionally: edit `tests/build-vectors.mjs`, run `node tests/build-vectors.mjs`, then **justify the change in `PROGRESS.md`**.

---

## 2. Behaviour — `smoke/`

Loads the **real** `extension.js` and `prefs.js` against stubs for `GObject`, `GLib`, `Gio`, `St`, `Clutter`, `Adw`, `Gtk`, and the Shell's `Main`/`PanelMenu`/`PopupMenu`. `smoke/register.mjs` maps `gi://` and `resource://` to the stubs via `node:module` `registerHooks`.

```bash
TZ=UTC node --import ./smoke/register.mjs smoke/run.mjs     # 17 checks
TZ=UTC node --import ./smoke/register.mjs smoke/prefs.mjs   # 5 checks
```

**Must run with `TZ=UTC`** — checks assert on clock text and the script exits with an explanatory error if the resolved zone differs.

Extension checks:

- [ ] Registers through `GObject.registerClass`.
- [ ] Container ends up in the **centre box**, at index `clockIndex - 1` (immediately left of the clock).
- [ ] Inside a window: label `Peak`, colour `#ffbd5a`. Outside: `Off-peak`, `#8ce08a`.
- [ ] Exactly one 30 s timer scheduled.
- [ ] Menu carries the header, `Next rate change 04:00`, the reason line, today's windows, both per-1M price rows.
- [ ] "DeepSeek pricing documentation" opens the docs; "Settings" calls `openPreferences()`.
- [ ] `panel-mode` changes relabel in place: `time` → `▲ 04:00`, `dot` → `●`, back to `words`.
- [ ] `colourise` off clears the inline style; on restores it.
- [ ] A downloaded holiday date flips the verdict (proves the override set is wired into evaluation).
- [ ] The 30 s timer re-evaluates (peak → off-peak when the clock is advanced).
- [ ] A rate change sends exactly one notification with the right body.
- [ ] `notify-on-change=false` suppresses it even though the state really changed.
- [ ] Past 2026-12-31 the stale-holiday row becomes visible.
- [ ] `disable()` clears every timer, every settings handler, and the indicator signals; the widget is destroyed.
- [ ] A shell style change re-applies the colour without throwing.

Prefs checks:

- [ ] One `Adw.PreferencesPage` titled "DeepSeek Peak Hours" with groups `Top bar`, `Notifications`, `Holiday calendar`, `About`.
- [ ] The mode combo is pre-selected from `panel-mode` and has 5 entries.
- [ ] The four switches use `settings.bind`.
- [ ] Selecting a combo entry writes `panel-mode` back.
- [ ] Both links in the About group open externally.

**Stub fidelity is load-bearing.** The stubs previously exported a non-existent `St.Align`, which let a broken extension pass all 17 checks. When adding an API call, confirm it exists in the real namespace first (`strings /usr/lib/gnome-shell/libst-14.so | grep -x StXxx`) and make the stub match.

---

## 3. Live session checklist

The extension runs from the **installed copy**, not this repo:

```bash
./install.sh
# X11: Alt+F2, r   (or: kill -HUP $(pgrep -x gnome-shell))
gnome-extensions info deepseek-peak@akuma.dev     # want: Enabled: Yes / State: ACTIVE
```

- [ ] `State: ACTIVE` (not `ERROR`).
- [ ] No errors: `journalctl --user -b --since "-5min" | grep deepseek-peak`.
  A `TypeError: … .Align is undefined` or `Invalid value 'undefined' for property y-align` means a shell API drifted — see `AGENTS.md`.
- [ ] Label appears immediately left of the clock; green while off-peak.
- [ ] Click it: menu opens with the header, next change, reason, today's windows, prices, links.
- [ ] Screenshot to confirm framing (Gdk root-window capture works on this X11 box):
      `python3 -c "import gi;gi.require_version('Gdk','3.0');from gi.repository import Gdk;Gdk.pixbuf_get_from_window(Gdk.get_default_root_window(),0,0,1920,40).savev('/tmp/p.png','png',[],[])"`
- [ ] Toggle colouring live and confirm the label repaints without a reload:
      `GSETTINGS_SCHEMA_DIR=~/.local/share/gnome-shell/extensions/deepseek-peak@akuma.dev/schemas gsettings set org.gnome.shell.extensions.deepseek-peak colourise false`
- [ ] Toggle `panel-mode` to `time` and confirm the label becomes `▽ HH:MM` of the next change.
- [ ] Reset settings afterwards (`gsettings reset … colourise` / `panel-mode`).

### Holiday feed (the only network path)

- [ ] `dconf read /org/gnome/shell/extensions/deepseek-peak/holiday-overrides` returns ~33 dates within a minute of a fresh install.
- [ ] `dconf read …/holiday-overrides-fetched-at` carries today's timestamp.
- [ ] With the machine offline, the indicator keeps working and the bundled list stands (no error surface, log line only).

### Uninstall / reinstall

- [ ] `./install.sh --uninstall` removes the directory, clears settings, and the indicator disappears after the next reload.
- [ ] Re-running `./install.sh` is safe and restores it.
- [ ] `./install.sh --link` then editing `extension/extension.js` + reload picks up the edit.

---

## Manual sanity spot-checks

Deterministic, no clock dependence:

```bash
./bin/deepseek-peak --at 2026-09-11T02:30:00Z --summary   # PEAK, next change 04:00
./bin/deepseek-peak --at 2026-10-05T02:00:00Z --summary   # OFF-PEAK, National Day holiday
./bin/deepseek-peak --at 2026-09-12T02:00:00Z --summary   # OFF-PEAK, weekend in Beijing
./bin/deepseek-peak --timezone Pacific/Auckland           # blocks shift to the afternoon
./bin/deepseek-peak --json | python3 -m json.tool         # valid JSON
```

- [ ] `--at` values above reproduce exactly (they are also in `vectors.json`).
- [ ] The verdict at the same instant is identical for `--timezone UTC` and `--timezone Pacific/Auckland`.
