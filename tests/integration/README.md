# Integration tests

Integration tests run against a local Supabase stack and are not part of the
default `pnpm test` run or the CI quality job.

```sh
pnpm dlx supabase start
pnpm test:integration
```

`scripts/test-integration.mjs` resolves the local URL and keys from
`.env.local` or from `supabase status`, then runs Vitest with
`vitest.integration.config.mts`. The files run one at a time because they share
one database.

Coverage:

- privacy consent at sign-up and the profile trigger;
- row level security for profiles, carts, orders, and payment history;
- order placement, shipping fees from `store_settings`, idempotency, and
  concurrent last-item checkout;
- simulated payments, expiry, cancellation, and the payment/cancel/expire
  races;
- administrator order transitions and stock adjustments.

Tests create their own users, products, and variants, and clean them up in
`afterAll`. They must not depend on seed data that other tests can change.
