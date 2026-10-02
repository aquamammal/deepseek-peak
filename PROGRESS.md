# PROGRESS — DeepSeek Peak Hours

Newest first. Each entry: what changed, what was verified, what is next.

## 2026-10-02 — Published to GitHub

- Created **public** repo `https://github.com/aquamammal/deepseek-peak` and pushed
  `main`. Initial commit: 42 files, 4601 insertions. Matches the account's
  convention (public for projects like `ichnaea`, `viewlette`, `Geodex`); no
  LICENSE file, consistent with the sibling projects.
- `.gitignore` extended to exclude the built `deepseek-peak@akuma.dev.zip`.
  Verified on the remote: 42 blobs, and the zip, `gschemas.compiled`, and
  `__pycache__` are all absent. No secrets or tokens in the tree.
- Commit identity: `aquamammal <1587772+aquamammal@users.noreply.github.com>`
  (GitHub email is private, so the noreply form is used).
- **Fixed a README gap the publish exposed:** the Install section assumed the
  files were already on disk. It now starts with `git clone …` and states the
  GNOME 45+ / `glib-compile-schemas` requirements, and notes that Node/Python are
  test-only.

---

## 2026-10-02 — Moved into `~/Documents/Projects/Programming/` and adopted the house doc format

- **Moved** the project from its scratch location under the DSH agent workspace
  (`~/Documents/deepseek-harness/default-workspace/deepseek-peak/`) to
  `~/Documents/Projects/Programming/deepseek-peak/`. Verified byte-identical
  before/after: 44 files, tree checksum
  `7033dda3d84d37606341cecfafa49649fc8c5577ebdace7afb53a177b098c4b7` unchanged.
  Nothing was copied twice or lost.
- **Added the house documentation set**: `AGENTS.md` (agent contract, repo layout,
  commands, sharp edges), `ARCHITECTURE.md` (layering, data flow, testing
  strategy), `TESTING.md` (automated layers + live checklist), this `PROGRESS.md`.
  `README.md` and `docs/` already existed.
- **No code changes.** `make test` re-run from the new location: 11 JS + 14 PY +
  17 smoke + 5 prefs, all green.
- `install.sh` resolves its own directory, so `./install.sh` works from the new
  path with no edits. The installer was re-run from the new location to confirm.
- **Note for the next agent:** the running extension still lives at
  `~/.local/share/gnome-shell/extensions/deepseek-peak@akuma.dev/` and is a
  snapshot of this repo. Moving the repo does not disturb it; editing the repo
  does not affect it until `./install.sh` re-copies and the shell reloads.
- Details of the earlier build work (inception, debugging, live verification) are
  recorded below in the order they happened.

---

## 2026-10-02 — Verified live in a real session, and fixed 2 GNOME 46 API bugs the mocks had hidden

**Live verification (this box: Ubuntu 24.04, GNOME Shell 46.0, X11, GJS 1.80):**

- Confirmed `State: ACTIVE`, label rendering immediately left of the clock, and
  the menu opening with correct contents (header, next change, reason, today's
  windows, both price rows, both links). Screenshots captured to `docs/`.
- Confirmed live settings repaint: toggling `colourise` off/on flipped the label
  between the default panel colour and `#8ce08a` with no reload.
- Confirmed the **daily holiday feed works against the live endpoint**: fetched
  33 dates at `2026-10-02T19:29:17Z` that are **identical to the bundled list**.
  This was the one code path the tests could only exercise with synthetic input.
- Confirmed the `gsettings` CLI needs
  `GSETTINGS_SCHEMA_DIR=~/.local/share/gnome-shell/extensions/deepseek-peak@akuma.dev/schemas`
  for a user-installed extension (the other installed third-party extension's
  schema is equally invisible, so this is normal, not a defect). README corrected.

**Bugs found and fixed (both were shell-runtime-only, invisible to the tests):**

1. `St.Align.MIDDLE` — GNOME 46 removed `St.Align` entirely. Threw
   `TypeError: (intermediate value).Align is undefined` during class construction,
   surfacing only as `State: ERROR`. Fixed to `Clutter.ActorAlign.CENTER`.
2. `Clutter.ActorAlign.MIDDLE` — there is no `MIDDLE`; the real members are
   `FILL`/`START`/`CENTER`/`END`. Threw
   `Error: Invalid value 'undefined' for property y-align in object initializer`.
   Confirmed from `Clutter-14.typelib` and by the shell's own usage
   (`ActorAlign.CENTER` ×165).

**Root cause of the miss — the mocks lied.** `smoke/stubs/gi/St.js` exported a
fabricated `St.Align`, so all 17 smoke checks passed against an API that does not
exist. This is the most important lesson in the repo: an invented stub is worse
than no stub. Both stubs were corrected to mirror the real namespaces (`St` has
no `Align`; `Clutter` exposes only `ActorAlign` with its four members), and the
old code was confirmed to fail locally afterwards.

Also verified against the real binary/typelibs before fixing, rather than guessed:

- `addToStatusArea(role, indicator, position, box)` exists with centre-box
  support; `_addToPanelBox` does `box.insert_child_at_index(container, position)`.
- This session's panel config is `center: ['dateMenu']`, so position 0 is
  immediately left of the clock.
- `org.gnome.Shell.Eval` is disabled on GNOME 46 (`(false, '')`) — live
  introspection is not available; screenshots are the fallback.

---

## 2026-10-02 — Built the extension, the terminal twin, and the test suites

- Researched the billing rule from DeepSeek's official pricing page and
  cross-checked the interpretation against seekpeak.dev's own implementation
  (`api/src/Domain/Verdict.php`), which confirmed the weekend/holiday handling is
  evaluated in **Beijing time** while the windows are evaluated in **UTC**.
- Bundled the 2026 Chinese public holidays from the State Council notice
  (国办发明电〔2025〕7号) and wrote a test that re-derives the 33 days from the
  notice's date ranges and asserts all six make-up workdays are excluded.
- Wrote the layered implementation: `data.js` → `core.js` (pure) → `format.js`
  (timezone rendering) → `extension.js` / `prefs.js` / `bin/deepseek-peak`.
- Wrote the Python twins so the rules are usable without a GNOME session and can
  be diffed against the JS implementation via the shared `tests/vectors.json`.
- Built the headless smoke harness (`smoke/`) that loads the real
  `extension.js`/`prefs.js` against GI stubs, covering panel placement, menu
  contents, settings wiring, the refresh timer, notifications, and that
  `disable()` leaks no timer or signal handler.

**Bugs found by the tests during the build** (worth keeping, they are the reason
the suites exist):

- `peakBlocksForBeijingDay` originally anchored the UTC windows to the *Beijing*
  day start instead of UTC midnight, shifting every local block by 8 hours. Caught
  by `TODAY_BLOCK_CASES` once the harness was fixed to use a TZ=UTC-aware
  expectation model.
- The smoke harness itself was wrong several times (stubs that did not call
  `_init`, a `PopupMenuItem` stub that mishandled the positional label string, a
  `ComboRow` whose setter threw during construction). Each was fixed by making the
  stub match the real contract rather than by weakening the check.
- `module.register` is deprecated on Node 26 → moved to `registerHooks`.

---

## 2026-10-02 — Inception

- User request: an Ubuntu top-bar indicator like seekpeak.dev, living where the
  clock lives, showing whether DeepSeek is in peak hours and when the next peak
  period starts.
- Chose a GNOME Shell extension (the only way to occupy the panel beside the
  clock) with a `center` box placement, plus a standalone CLI so the rules are
  usable without a session.
- Install path decided: `~/.local/share/gnome-shell/extensions/` (GNOME
  requirement) with an `install.sh` that also writes `enabled-extensions`, since a
  running shell does not rescan for newly installed extensions.

---

## Next steps / known gaps

- **2027 Chinese public holidays are not published yet** (expected ~Nov 2026).
  The daily feed will pick them up automatically once seekpeak's `config.json`
  carries them; until then dates past `2026-12-31` use weekday rules and the menu
  shows the stale-list warning. No action needed unless the feed stops updating.
- **No i18n.** `gettext-domain` is declared in `metadata.json` but every string is
  plain English. Wrapping strings in `gettext()` would be a contained change.
- **Menu screenshot in `docs/menu.png` is framed slightly tight on the left.** It
  shows the full content but is not a clean crop; re-capture if it is ever used
  publicly.
- **The smoke stubs are hand-written and only as faithful as their author.** Only
  APIs actually used by the extension are modelled. Consider adding a check that
  greps the real typelibs for every `St.*`/`Clutter.*`/`Adw.*` symbol the extension
  references — that would have caught the `St.Align` regression mechanically.
