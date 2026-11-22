# Accessibility

## Automated check (axe-core 4.14, WCAG 2.0/2.1 A and AA rules)

Run in Chromium on the production build, laptop size, on the landing page,
Beginner, Professional (Site and Check steps) and Terrain 3D (21 Nov 2026).

| Finding | Where | Fix |
|---|---|---|
| Timeline slider had no value | `#timelineCanvas` (`role="slider"`) | `aria-valuenow` (0–100% of the window) and `aria-valuetext` (the UTC time), kept current |
| View switcher was a tab list without tabs | Flight button inside `role="tablist"` | The button is a `role="tab"` with `aria-selected` |
| White text on the dark-theme blue was ~3:1 | Next / primary buttons | Solid buttons use `--xp-accent-fill` (#0071e3, 4.6:1) |
| Button names didn't contain their visible text | Terrain 3D −1 d / −1 h / +1 h / +1 d | Names now start with the visible text |

Before: 3–4 rules failing on every page. **After: 0 violations on all five.**

Re-run 22 Nov 2026 (second audit) on eight views, adding the report column, the
Flight view and Terrain 3D opened from Professional mode. Three new findings, all
from that day's additions, fixed: the red NO GO pill (white on #ff453a) now uses
#c62828; the report's scrolling area is focusable (`tabindex="0"`, labelled); the
"Back to Professional" button uses #0071e3. **0 violations on all eight.**
An automated check finds only some problems; it is not a substitute for testing
with a screen reader.

## Checked by hand (keyboard, in Chromium)

- Every control in Professional mode is reachable with Tab, and every stop but one shows
  a focus ring (the exception is inside the browser's own date-time field).
- Enter opens a step; the settings dialog takes focus when it opens and Esc closes it.
- Text is selectable again (the page-wide `select-none` is gone); only the 3D views,
  maps, timeline and buttons opt out, so dragging the Moon doesn't select text.
- The Check step's verdict is a polite live region, so a screen reader announces it
  when the site or date changes. Flight captions were already live regions.
- Status is never colour alone: the lights carry GO / GO WITH CARE / NO GO and a
  symbol (✓ ! ✕); timeline rows are labelled.
- `prefers-reduced-motion` is honoured by the animations (11 rules).
- Without WebGL, the 3D views say so and the 2D South-Pole Map opens instead.
- Numbers have text alternatives: the Report step's table and the CSV export.

## Still to do

- Screen-reader passes with VoiceOver (iOS, macOS) and NVDA (Windows).
- Real phones: touch targets, landscape, the browser bar resizing the page.
- A "skip to results" link: in Professional mode, keyboard users tab past 38 site
  buttons before reaching Next.
- The 3D views have no keyboard camera controls; the View menu's preset views are
  the keyboard route.
