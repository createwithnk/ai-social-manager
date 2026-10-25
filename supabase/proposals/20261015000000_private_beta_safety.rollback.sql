-- REVIEW ONLY. Operational rollback preserves data and all invite/media guards.
-- It deliberately does not restore unrestricted provider access or remove RLS.
-- Run ONLY after separately approved release rollback. No destructive cleanup.
begin;
update private.beta_controls set ai_enabled=false,uploads_enabled=false where singleton;
revoke execute on function public.reserve_ai_request(text) from authenticated;
revoke execute on function private.reserve_ai_request(text) from authenticated;
revoke execute on function public.report_runtime_error(text) from authenticated;
revoke execute on function private.report_runtime_error(text) from authenticated;
revoke execute on function public.finish_ai_request(uuid,text,integer,integer,integer) from service_role;
revoke execute on function private.finish_ai_request(uuid,text,integer,integer,integer) from service_role;
-- The legacy public.consume_ai_quota wrapper remains explicitly closed; neither
-- legacy nor new generators can consume provider quota after this rollback.
-- Membership/access functions and restrictive policies remain in effect so a
-- rollback cannot turn existing authenticated accounts into an open Beta.
-- Reinstatement: after a separately reviewed corrected runtime, grant the exact
-- six execute privileges above, then approve rates/limits and AI activation.
-- Tables, historical posts, memberships, approvals, usage and media are retained.
commit;
