# Deployment

VaultRecover has two deployment shapes. The **hosted** shape runs on Vercel and
recovers traditional-PKWARE ZIP passwords in-process; the **local** shape runs the
full worker and recovers every supported format.

## Hosted on Vercel (ZIP in-browser)

### Why ZIP only
Vercel's serverless functions have no persistent background worker and no `qpdf`/
`unzip` binaries. ZIP (traditional PKWARE / ZipCrypto) is verified in pure TypeScript
([`lib/analyzers/zipcrypto.ts`](../lib/analyzers/zipcrypto.ts)) so it runs inside a
single function invocation. PDF, Office and 7-Zip need the binaries, so the hosted UI
reports them as "run locally" rather than faking a result.

### What the hosted build needs
- **PostgreSQL** — a free [Neon](https://neon.tech) database is enough.
- **Three secrets** — `AUTH_SECRET`, `DOWNLOAD_URL_SECRET` (each `openssl rand -base64
  32`), and the Neon `DATABASE_URL`.
- **`NEXT_PUBLIC_DEPLOY_TARGET=vercel`** — switches the UI and the ZIP engine to the
  in-process path.
- Redis is **not** required; the rate limiter falls back to an in-process counter when
  `REDIS_URL` is unset.

### Steps
1. Create a Neon project and copy its pooled connection string.
2. Apply the schema once from your machine:
   ```bash
   DATABASE_URL="<neon-url>" npx prisma migrate deploy
   ```
3. Import the repo into Vercel (or `vercel link` from the CLI) and set env vars:
   ```bash
   vercel env add DATABASE_URL
   vercel env add AUTH_SECRET
   vercel env add DOWNLOAD_URL_SECRET
   vercel env add NEXT_PUBLIC_DEPLOY_TARGET   # value: vercel
   ```
4. Deploy:
   ```bash
   vercel --prod
   ```

`vercel.json` already sets the build command (`prisma generate && next build`) and a
60-second `maxDuration` for the recovery function. The online attempt is itself capped
to a ~45-second budget so it always returns within the function limit.

### Limits on the hosted build
The in-browser attempt tries the common-password list, your Deep Recovery hint words,
and a bounded numeric range within the time budget. For an exhaustive search, run
VaultRecover locally where the worker has no such ceiling.

## Local (full functionality)

Prerequisites: Node 20+, PostgreSQL, Redis, and `qpdf` + `zip`/`unzip` on `PATH`.

```bash
cp .env.example .env            # keep STORAGE_DRIVER=local, set the secrets
docker compose up -d postgres redis   # or use native services
npx prisma migrate deploy
npm run seed                    # optional demo account

npm run dev                     # web  -> http://localhost:3000
npm run worker                  # BullMQ worker (PDF / Office / 7z / ZIP)
npm run cleanup                 # optional retention cleanup
```

### Docker Compose (all services)
```bash
docker compose up -d postgres redis minio
npx prisma migrate deploy
docker compose up -d web worker
```

`minio` provides an S3-compatible endpoint for when an S3 `StorageProvider` is
implemented; the current build uses local disk (`STORAGE_DRIVER=local`).

## Environment variables

See [`.env.example`](../.env.example) for the full list. The essentials:

| Variable | Hosted | Local | Notes |
|---|---|---|---|
| `DATABASE_URL` | required | required | PostgreSQL connection string |
| `AUTH_SECRET` | required | required | Auth.js session secret |
| `DOWNLOAD_URL_SECRET` | required | required | HMAC key for signed download URLs |
| `NEXT_PUBLIC_DEPLOY_TARGET` | `vercel` | unset | Switches to the in-process ZIP engine |
| `REDIS_URL` | optional | required | Queue + SSE + shared rate limiting |
| `STORAGE_DRIVER` | `local` | `local` | Local disk today |
| `QPDF_BIN` / `UNZIP_BIN` | n/a | `qpdf` / `unzip` | Binary names/paths for the worker |
