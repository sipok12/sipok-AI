-- Schéma initial indicatif pour la future mémoire Supabase.
-- À exécuter seulement lorsque l'intégration Supabase sera mise en place.

create table if not exists public.sipok_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now()
);

create table if not exists public.sipok_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sipok_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists sipok_messages_conversation_created_idx
  on public.sipok_messages(conversation_id, created_at);

-- Avant toute mise en production, activer RLS et définir des politiques
-- liées à l'identité de l'utilisateur. Ne pas exposer la service_role key.
