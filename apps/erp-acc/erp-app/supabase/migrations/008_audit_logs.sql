-- ============================================================
-- Migration 008: Audit Logs
-- ============================================================

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_audit_table_record on audit_logs(table_name, record_id);
create index idx_audit_user on audit_logs(user_id);
create index idx_audit_created on audit_logs(created_at);
