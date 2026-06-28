-- 0066 — File-level review + workspace delivery review state
--
-- The buyer needs to review each uploaded file individually
-- (approve / reject with comment) before they can mark the workspace
-- as done and release the payment. Until now, review was only at
-- the checklist-item level — the vault was out of the review flow.
--
-- New columns on workspace_vault:
--   * review_status  — pending | approved | rejected
--   * review_comment — buyer's per-file note
--   * reviewed_at    — timestamp of buyer's decision
--   * reviewed_by    — user_id of the reviewer (always the buyer)
--
-- The buyer must approve every file before "Mark as done" is
-- unlocked. This protects the employee from the buyer rubber-
-- stamping a half-finished vault.

alter table public.workspace_vault
  add column if not exists review_status  text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  add column if not exists review_comment text,
  add column if not exists reviewed_at    timestamptz,
  add column if not exists reviewed_by    uuid references public.users(id) on delete set null;

create index if not exists wv_review_status_idx
  on public.workspace_vault(workspace_id, review_status);

comment on column public.workspace_vault.review_status is
  'Per-file review state set by the buyer. Must be approved for Mark as done.';
comment on column public.workspace_vault.review_comment is
  'Buyer per-file note. Required when status=rejected.';

-- Helper view: counts of each review status per workspace, used by
-- the "Mark as done" enable check.
create or replace view public.workspace_vault_review_counts as
select
  workspace_id,
  count(*) filter (where not is_folder)                                       as total_files,
  count(*) filter (where not is_folder and review_status = 'approved')       as approved_files,
  count(*) filter (where not is_folder and review_status = 'rejected')       as rejected_files,
  count(*) filter (where not is_folder and review_status = 'pending')        as pending_files
from public.workspace_vault
group by workspace_id;

grant select on public.workspace_vault_review_counts to authenticated;

-- Helper RPC: get the review status of a workspace (used by the
-- "Mark as done" button to decide whether it's enabled).
create or replace function public.get_workspace_review_summary(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws record;
  v_total int;
  v_approved int;
  v_rejected int;
  v_pending int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_uid not in (v_ws.buyer_id, v_ws.employee_id)
     and not (public.is_admin('super_admin') or public.is_admin('trust_safety_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  select total_files, approved_files, rejected_files, pending_files
    into v_total, v_approved, v_rejected, v_pending
  from public.workspace_vault_review_counts
  where workspace_id = p_workspace_id;
  if not found then
    v_total := 0; v_approved := 0; v_rejected := 0; v_pending := 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'workspace_id', p_workspace_id,
    'status', v_ws.status,
    'escrow_funded', v_ws.escrow_funded,
    'total_files', coalesce(v_total, 0),
    'approved_files', coalesce(v_approved, 0),
    'rejected_files', coalesce(v_rejected, 0),
    'pending_files', coalesce(v_pending, 0),
    'can_mark_done',
      v_ws.status in ('delivered', 'in_review')
      and coalesce(v_total, 0) > 0
      and coalesce(v_pending, 0) = 0
      and coalesce(v_rejected, 0) = 0
  );
end $$;
grant execute on function public.get_workspace_review_summary(uuid) to authenticated;
