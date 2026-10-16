# TestBoard

Lightweight, self-hosted test-tracking board for SIT/UAT phases in HR system
implementations (e.g. SAP SuccessFactors), modelled on Azure Boards.

> Work in progress: Phase 1 (work items & board) is done. A full README with
> architecture and data model diagrams follows in the final phase.

## Quick start

```bash
npm install
npm run setup      # creates .env, migrates SQLite, generates Prisma client, seeds demo data
npm run dev        # http://localhost:3000
```

Demo users (fictional) – password `demo1234` for all:

| User | Role |
| --- | --- |
| siri.holmvik@demo.test | Admin |
| erik.brattland@demo.test | Test Lead |
| nora.lindeberg@demo.test | Member (consultant) |
| jonas.fjellstad@demo.test | Member (consultant) |
| maja.sorli@demo.test | Member (business tester) |
| lars.myrvold@demo.test | Member (business tester) |

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright smoke tests (needs `npx playwright install chromium`) |
| `npm run db:seed` | Reset demo data |
| `npm run typecheck` / `npm run lint` | Static checks |

## Stack

Next.js 16 (App Router), React 19, TypeScript, Prisma 7 + SQLite
(better-sqlite3 adapter), Tailwind 4, dnd-kit, Tiptap, Vitest, Playwright.
