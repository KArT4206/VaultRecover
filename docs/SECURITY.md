# Security

## Implemented in this pass

- **Content-based validation, never trust the extension**: uploads are
  sniffed by real magic bytes (`lib/security/fileValidation.ts`) before any
  further processing; extension/MIME are hints only.
- **Size limits**: `MAX_FILE_SIZE` enforced server-side before the buffer is
  written to disk.
- **Zip-bomb guard**: `ZipAnalyzer` walks only the central directory
  (never inflates) and aborts analysis if entry count or cumulative
  uncompressed size exceed hard caps, before the file is queued for
  recovery.
- **Path-traversal-safe storage keys**: object keys are always
  `<prefix>/<server-generated-uuid>.<ext>` (`lib/storage/types.ts#newObjectKey`)
  — user-supplied filenames are never used in a storage path. `LocalDiskProvider`
  additionally normalizes and bounds-checks every resolved path.
- **Signed, short-TTL download URLs**: `lib/security/signedUrl.ts` HMACs a
  `downloadId` + expiry with `DOWNLOAD_URL_SECRET`; the download route
  verifies the signature, checks expiry, and checks the corresponding
  `Download` row before streaming bytes.
- **Rate limiting**: `lib/security/rateLimit.ts` (Redis fixed-window) is
  applied to registration, upload, and job-creation routes.
- **Worker execution timeouts**: `runRecovery()` takes a `maxRuntimeMs`
  deadline (from `MAX_JOB_RUNTIME`, DB-overridable) and aborts strategy
  iteration once exceeded, so no job can run forever.
- **Never executes uploaded files**: files are only ever passed as
  arguments to `qpdf`/`unzip` in read/verify modes; nothing uploaded is
  ever `exec`'d.
- **Per-job isolated temp dirs**: the worker copies the file into a fresh
  `mkdtemp` directory per job and removes it in a `finally` block.
- **AuditLog**: upload, job-creation, download, and delete actions all write
  an `AuditLog` row with actor, action, entity, and metadata.
- **Automatic cleanup**: `worker/cleanup.ts` deletes files past
  `File.expiresAt` (set from `FILE_RETENTION_MS` at upload time) and clears
  old recovered-result blobs, on a cron schedule.
- **Usage limits instead of a paywall**: `MAX_FILE_SIZE`,
  `MAX_ACTIVE_JOBS_PER_USER`, `MAX_DAILY_JOBS`, `MAX_JOB_RUNTIME` are read
  from `SystemSetting` (DB) with env-sourced defaults — no billing code
  exists anywhere in the app.
- **Password hashing**: bcrypt (cost 12) for credentials; no plaintext
  passwords are ever stored.
- **Security headers**: `middleware.ts` sets `X-Frame-Options`,
  `X-Content-Type-Options`, and `Referrer-Policy` on every response.

## Explicitly deferred

- Automated malware/antivirus scanning — `scanForMalware()` in
  `lib/security/audit.ts` is a stub with a `TODO` to integrate ClamAV or a
  hosted scanner before accepting untrusted uploads at scale.
- Full container-per-job worker sandboxing — the worker runs recovery
  strategies in-process with a timeout, not a separate ephemeral container
  per job.
- RBAC beyond `USER`/`ADMIN` — the `role` field exists on `User` but no
  admin panel enforces it yet.
- CAPTCHA / bot-detection on auth routes — rate limiting is the only
  current mitigation.

## Hosted (serverless) path

- **No binary execution at all** on the hosted build: ZIP is verified in pure
  TypeScript (`lib/analyzers/zipcrypto.ts`), so there is no `exec` surface in that
  deployment.
- **No false positives**: the pure verifier confirms every candidate with a full
  decrypt + CRC-32 check, parity-tested against `unzip` over thousands of wrong
  candidates (`tests/zipcrypto.test.ts`).
- **Ephemeral handling**: the uploaded file lives only in the function's `/tmp` for the
  duration of the single request and is deleted in a `finally` block; the online attempt
  is time-boxed to stay within the function limit.
- **Redis-optional rate limiting**: `rateLimit()` uses an in-process fixed-window
  counter when `REDIS_URL` is unset, so the hosted build keeps rate limiting without a
  Redis dependency.
