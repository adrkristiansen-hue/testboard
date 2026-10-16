# TestBoard

Lightweight, self-hosted test-tracking board for SIT/UAT phases in HR system
implementations (e.g. SAP SuccessFactors), modelled on Azure Boards.

> Work in progress: Phase 1 (work items & board) and Phase 2 (assignment,
> collaboration, notifications) are done. A full README with
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
| `npm run test:e2e` | Playwright smoke tests (needs `npx playwright install chromium`, or set `PW_CHROMIUM_PATH` to an existing Chromium) |
| `npm run db:seed` | Reset demo data |
| `npm run typecheck` / `npm run lint` | Static checks |

## Email notifications

In-app notifications (bell, Notifications page, My work) always work. Email is
off by default. To turn it on, set in `.env`:

| Variable | Meaning |
| --- | --- |
| `EMAIL_NOTIFICATIONS_ENABLED` | `true` to send emails |
| `EMAIL_TRANSPORT` | `console` (log to server output, default) or `file` (write `.eml` files) |
| `EMAIL_OUTBOX_DIR` | Folder for the `file` transport (default `outbox`) |
| `EMAIL_FROM` | Sender address |
| `APP_URL` | Base URL used for links in emails |

Users can opt out from their user menu. A real mail service (SMTP, SendGrid,
Microsoft Graph) is added as a new transport in `src/server/email.ts`.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Prisma 7 + SQLite
(better-sqlite3 adapter), Tailwind 4, dnd-kit, Tiptap, Vitest, Playwright.
