-- 0141: RPC to update gig saved_count (bypasses RLS via SECURITY DEFINER)

create or replace function public.update_gig_saved_count(p_gig_id uuid, p_count int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gigs set saved_count = p_count where id = p_gig_id;
  return p_count;
end;
$$;

grant execute on function public.update_gig_saved_count to authenticated;
