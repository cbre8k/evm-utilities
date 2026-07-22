// ============================================================
// aliases.ts — Runtime resolution for the @shared/* path alias
// ============================================================
//
// In production the app runs compiled JS (`node dist/backend/src/index.js`),
// where `@shared/*` must point at `dist/shared` — that mapping lives in
// package.json `_moduleAliases` and is applied by `module-alias`.
//
// In development (`tsx watch`), there is no `dist/`; tsx resolves `@shared/*`
// from source via tsconfig `paths`. Registering module-alias there would
// wrongly redirect `@shared/*` to the non-existent `dist/shared` and crash on
// the first import. So only register it when actually running compiled JS.
//
// This module must be imported before any `@shared/*` import is evaluated.

if (__filename.endsWith('.js')) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('module-alias/register');
}
