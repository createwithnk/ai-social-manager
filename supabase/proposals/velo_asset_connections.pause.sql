-- REVIEW ONLY operational pause. Preserve records, grants and original files.
-- This does not revoke consent at Canva/Google or change existing launch gates.
begin;
update private.velo_asset_controls set enabled=false where singleton;
commit;
