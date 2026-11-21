# UIUX Foundation and Look Acceptance

Date: 2026-11-21
Scope: Studio Neutral setup dashboard, phone bottom sheet, host/local appearance, shared Direct Canvas Studio.
Spec: docs/superpowers/specs/2026-11-21-pocketpet-uiux-direction-design.md

This record covers slice 1 only: the setup dashboard Pair/Look/System cards, the phone Live/Look/About
sheet, host defaults plus per-phone local overrides, and the shared Direct Canvas Studio. Agent Setup
Center and Update Center UI are out of this slice. No real agent, update, hook, login service, or
PocketPet config was installed or modified for this record.

## Evidence Rules

- Use a temporary home for automated runs. Never attach a real config or token.
- Redact the pairing token and any QR/URL containing it.
- Mark every item that was not executed as NOT RUN. Do not infer success from a green unit suite.

## Automated evidence at this head

Code head under test: `cbbe36c` (`feat: add phone studio local overrides`). The documentation commit
that adds this file changes no product code or tests.

| Command | Result |
|---|---|
| `npm test` | PASS: 29 test files, 314 tests (4.53s) |
| `npm run typecheck` | PASS: `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.web.json` |
| `npm run build` | PASS: Vite web build and bridge `tsc` |
| `npm run test:e2e` | PASS: 25 tests, 1 worker (8.1s): 17 phone + 8 setup |

The E2E run used the temporary `.tmp-e2e` home from `playwright.config.ts` (`POCKETPET_HOME=.tmp-e2e`),
not a real config. No token was committed or retained in the repository; temporary run output was
deleted. Nothing was pushed.

Build evidence: `dist/web/manifest.json` exists (generated, git-ignored). It maps the setup entry
`src/setup/main.ts` to `assets/setup-Bd2s9b91.js` with `assets/setup-BbuXWz05.css`, and the setup page
loads those hashed tags from the manifest (covered by `tests/server.test.ts:197` and the JS-enabled E2E
setup tests). `/setup` also renders the no-JavaScript Pair/System fallback (E2E setup shell test).

The suite runs with `workers: 1` in `playwright.config.ts` because setup and phone tests share and
mutate host appearance/pet state. The plan's File Map already lists `playwright.config.ts`, so no plan
edit was needed.

## Gates

| Item | Producer | Evidence | Status |
|---|---|---|---|
| Setup dashboard on the real computer (Pair/Look/System) | Tester | Screenshot with token/QR redacted | NOT RUN |
| Setup Studio saves host appearance; reload keeps it | Tester + E2E | `e2e/setup.spec.ts:64` saves through `/api/setup/look`, asserts the API and reload; manual screenshot not taken | PASS (E2E); manual NOT RUN |
| Setup pet picker sets the host pet | Tester + E2E | `e2e/setup.spec.ts:122` changes the host pet through setup Look; manual screenshot not taken | PASS (E2E); manual NOT RUN |
| Phone follows host appearance after setup save | Tester + E2E | `e2e/phone.spec.ts:384` saves a host appearance and observes the phone update through the WS snapshot; manual phone screenshot not taken | PASS (E2E); manual NOT RUN |
| Phone local Studio override persists and does not change host | Tester + E2E | `e2e/phone.spec.ts:343` and `e2e/setup.spec.ts:197`: local storage, reload, and unchanged host API; manual evidence not taken | PASS (E2E); manual NOT RUN |
| Folded and wide postures on the real phone, with the bottom sheet | Tester | Two screenshots | NOT RUN |
| Storage denied: boot continues and host values are used | Tester + E2E | `e2e/phone.spec.ts:183,226`: boot succeeds and the storage notice is shown; manual screenshot/exception record not taken | PASS (E2E); manual NOT RUN |
| Keyboard-only Studio (setup and phone) | Tester | Keyboard sequence and screenshot | NOT RUN |
| No horizontal overflow at folded/wide | Tester | Screenshots | NOT RUN |
| macOS real host | Tester | Screenshot and exact OS label | NOT RUN |
| Windows/Linux host | Tester | Not claimed; separate spec | NOT RUN |
| Real agent event flow | Tester | Not part of this slice | NOT RUN |
| Real update/auto-update | Tester | Not part of this slice | NOT RUN |

The E2E rows are automated browser evidence only. They do not replace the real-computer, real-phone,
macOS host, Windows/Linux, agent, or update gates, which remain NOT RUN.

### Additional automated coverage (not manual gates)

- Studio Neutral tokens and no shadow/gradient/emoji: `web/src/tokens.css` is the shared token file;
  the CSS scan finds no `box-shadow`, gradient, or emoji in the web styles. This is code inspection,
  not a screenshot gate.
- Setup no-JS fallback and CSP: `tests/server.test.ts` (setup shell assets) and `tests/setupPage.test.ts`
  (fallback, no inline script, same-origin assets).
- Setup loopback + Host + CSRF: `tests/server.test.ts:150,197,375,388,430` (403 cases and the valid
  request).
- Setup-only pet asset route: `tests/server.test.ts:358,464`.
- Host/version fields in state and WS: `tests/server.test.ts:228`, `tests/host.test.ts`.
- Appearance normalization and sparse diff: `tests/appearance.test.ts`.
- i18n EN/繁/简 parity: `tests/serverI18n.test.ts`, `tests/webI18n.test.ts`.
- Reduced motion: `tests/stage.test.ts` resolves the motion setting. There is no reduced-motion
  screenshot; keyboard-only Studio remains NOT RUN above.

## Legacy `/api/active-pet` audit

- `rg -n "api/active-pet" web/src` returns no matches. The phone UI has no legacy write path.
- The phone writes only its sparse local override (`localStorage["pocketpet.look"]`) through
  `web/src/look/store.ts`; it never calls `/api/setup/look` or `/api/active-pet`.
- The UI writes the host pet only from the setup Look card through `PUT /api/setup/look`
  (`web/src/setup/main.ts:80`). E2E fixtures set it through the same setup API
  (`e2e/phone.spec.ts:37`), and `e2e/prepare.mjs:17` seeds the temporary config directly.
- The server route remains at `src/server.ts:337`. Its only remaining callers are server integration
  tests: `tests/server.test.ts:78` (unknown pet rejected) and `tests/server.test.ts:488` (local pets
  listed and active pet switched). No E2E or UI caller remains.
- Decision: keep the endpoint as a tested non-UI legacy route and document it here. No source or test
  change was required in this task.

## Manual gates still open

Real-device posture and overflow, keyboard-only Studio, the real macOS host screenshot, Windows/Linux,
real agent events, and real update/auto-update have not been executed. They remain NOT RUN and must not
be inferred from the green automated suite.
