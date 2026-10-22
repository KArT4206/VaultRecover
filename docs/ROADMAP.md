# Roadmap

## Shipped
- Real, verified recovery for ZIP (local `unzip` + hosted pure-TS ZipCrypto) and PDF
  (`qpdf`), plus Office and 7-Zip in the local worker.
- Hosted serverless ZIP recovery on Vercel with no worker/Redis/binary dependency.
- Auth (credentials), dashboard + job history, signed download URLs, audit log,
  retention cleanup, usage limits (no paywall).

## Deferred / planned
- **S3 / R2 storage provider** behind the existing `StorageProvider` interface, so the
  hosted build can persist uploads across requests.
- **PDF/Office/7z online** via a separate always-on worker host wired to the same DB.
- **AES ZIP** (WinZip AE-x) support in the pure-TS path.
- **Google OAuth** tested end-to-end (button present, env-gated today).
- **Automated malware scanning** (`scanForMalware` is a stub).
- **Admin panel + RBAC** beyond `USER` (the `role` field exists).
- **Full Playwright E2E** in CI (unit + real-binary integration tests today).
