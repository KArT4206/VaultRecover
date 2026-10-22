# Contributing

Thanks for your interest in VaultRecover.

## Ground rules
- VaultRecover recovers passwords for files the user owns or is authorised to access.
  Contributions that turn it into a mass-cracking or unauthorised-access tool will not
  be accepted.
- Never report an unverified success. Any recovery path must verify the candidate
  against the real file before returning it.

## Workflow
1. Fork and branch from `main`.
2. `npm install`, then make your change.
3. Keep the suite green:
   ```bash
   npm run lint && npm run typecheck && npm run test && npm run build
   ```
4. Add or update tests for behaviour you change. Recovery changes need a test that
   creates a genuinely encrypted file and recovers it.
5. Open a PR describing the change and the testing you ran. CI (lint, typecheck, test,
   build, CodeQL) must pass.

## Style
- TypeScript, no `any` where a real type fits.
- Match the existing module seams: `RecoveryAnalyzer`, `RecoveryStrategy`,
  `StorageProvider`.
- Keep the hosted (serverless) path free of worker/Redis/binary dependencies.
