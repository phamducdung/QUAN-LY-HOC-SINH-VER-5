import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://duupbswparlpzsdcgcme.supabase.co';

export const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1dXBic3dwYXJscHpzZGNnY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMzc3MDMsImV4cCI6MjEwOTgxMzcwM30.hleWbWSpG_YI_A5DNDCOLd8qOTkhO5dAz99WE5vqU_w';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const SUPABASE_SETUP_SQL = `-- Khởi tạo 13 bảng đồng bộ Smart Edu Manager trên Supabase (PostgreSQL)
CREATE TABLE IF NOT EXISTS public.school_years (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.classes (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.students (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.class_students (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.student_sessions (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.knowledge_tags (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.knowledge_results (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.warnings (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ai_diagnoses (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.settings (
  id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deleted_records (
  id text PRIMARY KEY,
  table_name text NOT NULL,
  record_id text NOT NULL,
  deleted_at text NOT NULL
);

-- Bật quyền truy cập đồng bộ cho Anon/Authenticated Role
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'school_years','classes','students','class_students',
    'sessions','student_sessions','knowledge_tags','knowledge_results',
    'warnings','ai_diagnoses','audit_logs','settings','deleted_records'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow full access" ON public.%I;', t);
    EXECUTE format('CREATE POLICY "Allow full access" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;
`;
