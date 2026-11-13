-- Shopping Assistant conversations stored per customer.
--
-- These two tables are the only place that stores conversation content.
-- `ai_usage_daily`, `ai_usage_minute`, and `ai_usage_global` stay counters
-- only. Customers read their own rows through RLS; every write goes through
-- the server with the service role, so there are no insert, update, or delete
-- policies. Deleting a conversation cascades to its messages, and deleting an
-- account cascades to both tables.

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assistant_conversations is
  'Shopping Assistant conversations, one per customer thread. Stores the title only; messages are in assistant_messages.';

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.assistant_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  status text not null default 'complete'
    check (status in ('complete', 'interrupted', 'failed')),
  product_skus text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint assistant_messages_content_length check (
    char_length(content) between 1 and 8000
    or (role = 'assistant' and status = 'failed' and char_length(content) = 0)
  ),
  constraint assistant_messages_products_assistant_only
    check (role = 'assistant' or product_skus = '{}')
);

comment on table public.assistant_messages is
  'Conversation turns kept verbatim. Assistant rows keep product SKUs only; prices, stock, and images are rebuilt from the catalog.';

comment on column public.assistant_messages.content is
  'The text the customer typed or the model answered. Empty only for an assistant turn that failed before any text.';

comment on column public.assistant_messages.status is
  'complete: the answer finished; interrupted: the stream stopped after some text; failed: no text was streamed.';

comment on column public.assistant_messages.product_skus is
  'SKUs of the product cards shown with an assistant answer, in display order. Empty for user turns.';

create index assistant_conversations_user_recent
  on public.assistant_conversations (user_id, updated_at desc, id desc);

create index assistant_messages_transcript
  on public.assistant_messages (conversation_id, created_at, id);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

revoke all on public.assistant_conversations, public.assistant_messages
  from public, anon, authenticated;

grant select on table public.assistant_conversations, public.assistant_messages
  to authenticated;

grant select, insert, update, delete on table
  public.assistant_conversations,
  public.assistant_messages
to service_role;

drop policy if exists assistant_conversations_select_own on public.assistant_conversations;

create policy assistant_conversations_select_own
on public.assistant_conversations
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists assistant_messages_select_own on public.assistant_messages;

create policy assistant_messages_select_own
on public.assistant_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.assistant_conversations c
    where c.id = conversation_id
      and c.user_id = (select auth.uid())
  )
);
