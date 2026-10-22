# Development

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed            # demo@vaultrecover.test / DemoPassword123!
npm run dev
```

For the full local engine you also need `qpdf` and `zip`/`unzip` on `PATH`, plus a
BullMQ worker (`npm run worker`) and Redis. For the hosted ZIP-only path, set
`NEXT_PUBLIC_DEPLOY_TARGET=vercel` and `VAULT_PURE_ZIP=1` in `.env.local` and you need
neither the worker nor the binaries.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run worker` | BullMQ recovery worker (PDF / Office / 7z) |
| `npm run cleanup` | Scheduled expired-file cleanup |
| `npm run seed` | Seed a demo account |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run test` | Vitest (unit + real-binary e2e + ZipCrypto parity) |

## Layout

```
app/            App Router pages + API routes
components/     Client components (UploadDropzone, progress, badges)
lib/
  analyzers/    Format detection + verification (zip, pdf, office, 7z, zipcrypto)
  recovery/     Strategies, wordlist, the single recovery provider
  storage/      StorageProvider interface + local-disk driver
  security/     Validation, signed URLs, rate limiting, audit
  auth/         Auth.js config
  queue/        BullMQ queue (local)
worker/         Standalone worker + cleanup (local)
prisma/         Schema, migrations, seed
tests/          Vitest suites
docs/           This documentation + the Pages site
```

## Conventions

- **Never report an unverified success.** Every candidate is checked against the real
  file before it can be returned.
- **Server-generated keys only** for storage; user filenames never touch a path.
- **Reuse the seams**: add formats via `RecoveryAnalyzer`, strategies via
  `RecoveryStrategy` + `strategiesForMode()`, storage backends via `StorageProvider`.
- Keep the hosted (serverless) path free of worker/Redis/binary dependencies.

## Tests

`tests/recovery.e2e.test.ts`, `recovery.7z.e2e.test.ts`, `recovery.office.e2e.test.ts`
create genuinely encrypted files and recover them against the real binaries (they skip
gracefully if a binary is missing). `tests/zipcrypto.test.ts` asserts the pure-TS
ZipCrypto verifier matches `unzip` exactly, with zero false positives over thousands of
wrong candidates.
