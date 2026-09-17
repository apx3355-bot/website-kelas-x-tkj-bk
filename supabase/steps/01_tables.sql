-- STEP 1: Legacy public.users compatibility + Vercel tables.
-- Run this before 02_compatible_users.sql and 03_compatible_storage.sql.
\i ../migrations/20260917140000_vercel_supabase.sql
