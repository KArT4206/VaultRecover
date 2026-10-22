# Architecture

## Components

- **web** (Next.js): UI + API route handlers. Server Components read the DB
  directly via Prisma; route handlers perform validation, auth checks, and
  enqueue work.
- **worker** (standalone Node process, `worker/index.ts`): a BullMQ `Worker`
  listening on the `recovery-jobs` queue. Pulls a job, downloads the file
  from storage into a per-job temp dir, runs `runRecovery()`, verifies the
  winning candidate against the real file, persists the result, and
  publishes progress over Redis pub/sub so the web SSE route can relay it.
- **cleanup** (`worker/cleanup.ts`): a `node-cron` scheduled job that deletes
  expired files from storage and clears old recovered-result blobs.
- **postgres**: primary datastore (Prisma schema in `prisma/schema.prisma`).
- **redis**: BullMQ queue backend, SSE progress pub/sub channel, and the
  rate-limiter's counters.
- **minio** (docker-compose only): S3-compatible object storage, ready for
  when `STORAGE_DRIVER=s3` is implemented against the same
  `StorageProvider` interface the local-disk driver uses today.

## Data flow (ZIP/PDF recovery)

1. `POST /api/files/upload` — validates magic bytes/size/extension, stores
   the file under a random UUID object key, records a `File` row.
2. `POST /api/recovery/create` — re-reads the file, runs the appropriate
   `RecoveryAnalyzer` (`PdfAnalyzer`/`ZipAnalyzer`), persists `FileAnalysis`,
   and if the file is genuinely encrypted and the format is supported,
   creates a `RecoveryJob` (`QUEUED`) and adds it to the BullMQ queue.
   Unsupported formats get a `RecoveryJob` in `UNSUPPORTED` state instead —
   no fake queuing.
3. `worker/index.ts` picks up the job, runs `runRecovery()` from
   `lib/recovery/provider.ts`, which iterates strategy candidate generators
   (`lib/recovery/strategies.ts`) and verifies each candidate against the
   real file (`qpdf --decrypt` for PDF, `unzip -t -P` for ZIP). Progress is
   persisted to Postgres and published to Redis every 5 candidates.
4. The client's `/api/recovery/[id]/events` SSE route subscribes to that
   Redis channel and streams `status`/`progress`/`done` events to the
   browser (`components/RecoveryProgress.tsx`).
5. On success, a `RecoveryResult` row (password + strategy + a storage key
   for the unlocked file) is created and the job flips to `RECOVERED`. On
   failure/timeout/cancel it flips to `FAILED`/`CANCELLED` with a message —
   never a false positive.
6. `GET /api/recovery/[id]/result` mints a short-TTL `Download` row and an
   HMAC-signed token; `GET /api/recovery/[id]/download` verifies the token,
   checks the `Download` row and expiry, and streams the file.

## Interfaces designed for extension

- `StorageProvider` (`lib/storage/types.ts`): local disk today; an S3/R2
  provider can be dropped in without touching callers.
- `RecoveryAnalyzer` (`lib/analyzers/types.ts`): PDF/ZIP implemented; RAR/7Z
  analyzers can be added and registered in `lib/analyzers/index.ts`.
- `RecoveryStrategy` (`lib/recovery/strategies.ts`): pluggable candidate
  generators; add new ones and wire them into `strategiesForMode()`.
- `SystemSetting` table + `lib/limits.ts`: usage limits default from env but
  are DB-overridable, ready for a future admin UI.

## Hosted (serverless) data flow — ZIP only

On Vercel there is no worker, no Redis and no CLI binary, so a single request does
everything:

1. `POST /api/recovery/online` (multipart `file` + `mode` + `hints`) validates the
   upload, records `File` + `RecoveryJob` for dashboard history, and writes the file to
   the function's `/tmp`.
2. `lib/analyzers/zipcrypto.ts#loadZipCryptoTarget` reads the first traditional-PKWARE
   entry once; `verifyPassword` then tests each candidate from `strategiesForMode()`
   against it, within a ~45-second budget.
3. Verification runs the full PKWARE key schedule, decrypts the entry, inflates it and
   compares CRC-32 — so a reported password is definitive, never a header-check guess.
4. On success a `RecoveryResult` row is written and the job flips to `RECOVERED`; the
   temp file is removed in a `finally`. Non-ZIP (and AES ZIP) return `localOnly:true`
   with a message pointing to the local worker.

The UI selects this path when `NEXT_PUBLIC_DEPLOY_TARGET=vercel`
([`components/UploadDropzone.tsx`](../components/UploadDropzone.tsx)); otherwise it uses
the queue + worker + SSE flow above.
