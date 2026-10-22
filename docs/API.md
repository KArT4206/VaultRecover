# API

All routes are App Router handlers under `app/api/**`. Unless noted, they require an
authenticated session (Auth.js) and return JSON. Errors use conventional status codes
with `{ "error": "..." }` bodies.

## Auth

### `POST /api/auth/register`
Create an account with email + password (bcrypt, cost 12). Rate-limited. Returns the
new user id or a validation error.

### `GET|POST /api/auth/[...nextauth]`
Auth.js (NextAuth v5) handler: credentials sign-in/out and session, plus Google OAuth
when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set.

## Files

### `POST /api/files/upload`  (local flow)
Multipart `file`. Validates magic bytes, size and extension; runs a malware-scan stub;
stores the file under a server-generated UUID key; records a `File` row. Returns
`{ fileId, format, sizeBytes, sha256 }`.

## Recovery

### `POST /api/recovery/online`  (hosted flow)
Multipart `file`, `mode` (`FAST_CHECK` | `DEEP_RECOVERY`), optional `hints` JSON
(`{ knownWords: string[] }`). Verifies ZIP (ZipCrypto) passwords in-process within a
~45-second budget. Records `File` + `RecoveryJob` (+ `RecoveryResult` on success) for
dashboard history, and deletes the temp file afterwards.

Responses:
- ZIP solved: `{ jobId, format:"ZIP", success:true, password, strategy, candidatesTried }`
- ZIP not found: `{ jobId, success:false, candidatesTried, exhausted }`
- Non-ZIP or AES ZIP: `{ jobId, localOnly:true, message }`

### `POST /api/recovery/create`  (local flow)
JSON `{ fileId, mode, hints? }`. Analyses the file; for a supported, genuinely
encrypted file, creates a `QUEUED` `RecoveryJob` and enqueues it on BullMQ. Unsupported
formats get an `UNSUPPORTED` job (no fake queuing). Returns `{ jobId }`.

### `GET /api/recovery/[id]`
Job status + metadata for the owner.

### `POST /api/recovery/[id]/start`
Re-enqueue / start a created job (local flow).

### `GET /api/recovery/[id]/events`  (local flow)
Server-Sent Events stream of `status` / `progress` / `done`, relayed from the worker
over Redis pub/sub.

### `GET /api/recovery/[id]/result`
Mints a short-TTL `Download` row and an HMAC-signed token for the unlocked file.

### `GET /api/recovery/[id]/download`
Verifies the signed token + `Download` row + expiry, then streams the unlocked file.

### `POST /api/recovery/[id]/cancel`
Marks a running job `CANCELLED`; the worker checks this between candidates and aborts.

### `POST /api/recovery/[id]/delete`
Soft-deletes the job and its file.

## Conventions

- **Verification is mandatory.** A password is only ever returned after a verified
  decrypt (CRC check for ZIP, `qpdf --decrypt` for PDF). No route reports an unverified
  success.
- **Ownership is enforced** on every `[id]` route via the session user id.
- **Rate limiting** is applied to register, upload, job-create and online-recover.
- **Audit logging**: upload, job start, success, download and delete write `AuditLog`
  rows.
