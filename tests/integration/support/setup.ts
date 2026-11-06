import { integrationEnv } from "./env";

// Services read the same environment as the Next.js server. The integration
// runner provides the local URL and keys; mirror them into the names the app
// expects before any service module is loaded.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= integrationEnv.url;
process.env.SUPABASE_URL_INTERNAL ??= integrationEnv.url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= integrationEnv.publishableKey;
process.env.SUPABASE_SECRET_KEY ??= integrationEnv.secretKey;
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";

// A deterministic media package so image URL assertions do not depend on a
// developer's .env.local.
process.env.MEDIA_VERSION ??= "studio-v1";
process.env.MEDIA_BASE_URL ??= "https://media.example.test/studio-v1";
