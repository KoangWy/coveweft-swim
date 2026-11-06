# Integration tests

Integration tests run against a local Supabase stack and are not part of the
default `pnpm test` run or the CI quality job.

```sh
pnpm dlx supabase start
pnpm test:integration
```

Tests in this directory should create their own data and clean it up, or run
inside a transaction that is rolled back. They must not depend on seed data
that other tests can change.
