# Security

Lunar Site Planner is a static website: HTML, JavaScript and data files served
by GitHub Pages. There is no server, database or user account, and every
calculation runs in the visitor's browser.

## Reporting a problem

Please open a GitHub issue, or for anything sensitive use GitHub's private
"Report a vulnerability" button on the repository's Security tab.

## How the project keeps itself safe

- **Dependencies:** Dependabot (`.github/dependabot.yml`) checks npm packages and
  GitHub Actions weekly and opens pull requests. Nothing is merged automatically:
  each update is reviewed, tested and built first. CesiumJS is pinned and updated
  by hand.
- **CI audit:** the deploy workflow runs `npm audit --omit=dev --audit-level=high`
  on the packages that ship to the browser; a high or critical advisory stops the
  build. Don't use `npm audit fix --force`: review breaking changes instead.
- **Actions:** third-party GitHub Actions are pinned to full commit SHAs (the
  version is in a comment next to each). Workflows use the least permissions they
  need (`contents: read` unless a job commits data back).
- **Deployment:** the site is only published from `main`. Pull requests are built
  and tested but never published. When a data workflow (terrain, JPL Horizons,
  PGDA, LROC) finishes, the site is rebuilt only if that run **succeeded** on `main`.
- **Dev server:** `npm run dev` listens on `localhost` only. To test on a phone
  over Wi-Fi, opt in with `npm run dev -- --host`; anyone on that network can then
  reach the dev server, so only do it on a network you trust.

## Cesium ion token

The expert planner can optionally load Cesium ion assets. The token is typed in by
the user (kept in that browser's `localStorage`) or set at build time with
`VITE_CESIUM_ION_TOKEN`. Anything used in browser code can be read by visitors, so:

- only ever use a **public, restricted** token (read access to the needed assets,
  allowed URLs limited to the site's domain);
- never put an account-level or write token in the frontend or in CI;
- the token is not written into exported reports (CSV/JSON).

The deploy workflow does not set `VITE_CESIUM_ION_TOKEN`, so the public site ships
without one.

## Log

| Date | Issue | What was done |
|---|---|---|
| 2026-11-21 | Vite advisory [GHSA-p4f5-76q4-ffq7](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7): remote code execution in the **dev server** (Vite ≤ 6.4.5) when it is exposed to the network with `--host` / `server.host`. The project had Vite 6.4.5 and `server.host: true`. | Upgraded to Vite 6.4.6 (lockfile updated); the dev server now listens on localhost only. The advisory concerns the development server, not the built static site on GitHub Pages; there is no evidence the live site was affected. |
| 2026-11-21 | Deploy workflow published after a data workflow finished, without checking it had succeeded. | Deploy now requires the upstream run to have succeeded on `main`; manual runs only publish from `main`. |
| 2026-11-21 | GitHub Actions referenced by moving tags (`@v5`). | Pinned to commit SHAs; Dependabot proposes updates. |
| 2026-11-22 | Dependabot PR: Vite 6.4.6 → 8.3.8 (merged). | Checked after merging: build, 87 unit tests, browser smoke test 8/8, Terrain 3D (CesiumJS plugin) loads and renders with no errors. Major Vite and Tailwind versions are now excluded from automatic PRs. |

## Known follow-ups

- The data workflows pull `ghcr.io/osgeo/gdal:ubuntu-small-latest`. These are run
  by hand from the Actions tab; pinning the image to a digest would make them
  reproducible.
- GitHub Pages can't set HTTP response headers (Content-Security-Policy,
  `X-Content-Type-Options`, `Referrer-Policy`). A tested set is ready in
  `docs/hosting/_headers.example` (both CSPs enforced against the production build
  with no violations); add it, report-only first, if the site moves to a host that
  supports headers. See `docs/HOSTING.md`.
