# Usage limits (no paywall)

VaultRecover has **no payment system anywhere**. Fair use is enforced with technical
limits instead, read from `SystemSetting` rows (DB-overridable) with env defaults
([`lib/limits.ts`](../lib/limits.ts)).

| Limit | Default | Meaning |
|---|---|---|
| `MAX_FILE_SIZE` | 100 MB | Rejected server-side before the buffer is stored |
| `MAX_ACTIVE_JOBS_PER_USER` | 3 | Concurrent running jobs per user |
| `MAX_DAILY_JOBS` | 20 | Jobs started per user per day |
| `MAX_JOB_RUNTIME` | 5 min | A job aborts once the deadline passes |
| `FILE_RETENTION_MS` | 24 h | Files auto-delete after this |

On the hosted build the online ZIP attempt is additionally capped to a ~45-second
budget so it returns within the serverless function limit. For an unbounded search,
run VaultRecover locally.

Rate limits also apply to registration, upload and job creation
([`lib/security/rateLimit.ts`](../lib/security/rateLimit.ts)).
