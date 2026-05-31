-- SPEC-009b.2 hardening: lock down purge_old_share_audit_log().
--
-- Migration 020 added purge_old_share_audit_log() as SECURITY DEFINER and
-- its comment stated it should be service-role only ("No grant to anon or
-- authenticated"). But it relied on *not granting* EXECUTE — and Postgres
-- grants EXECUTE to PUBLIC by default. So in practice any anon or
-- authenticated caller could invoke it via /rest/v1/rpc and delete
-- share_audit_log rows older than 90 days. The Supabase security advisor
-- flagged this (lint 0028/0029).
--
-- Revoke the default PUBLIC grant (and the inherited anon/authenticated
-- access) so only the function owner / service_role can run the retention
-- sweep, matching the original intent. log_share_access stays anon-callable
-- by design (the anonymous shared page must write audit entries).

revoke execute on function public.purge_old_share_audit_log()
  from public, anon, authenticated;
