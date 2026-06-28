-- 0075_post_with_checklist.sql
-- Creates one open task posted by anshutiwarirnc@gmail.com with a
-- delivery checklist embedded in the `brief` jsonb column. The
-- checklist items live inside `brief.checklist_items` (key/text pairs)
-- and get materialised into `public.delivery_checklist_items` once a
-- contract is created via `hire_applicant` / `create_instant_hire_offer`.
--
-- After running, sign in as anshutiwarirnc, open the task in the UI,
-- have preranabothra9 apply (or use the "Hire directly" flow if she's
-- already verified), and the contract-creation RPC will copy the
-- checklist from brief → delivery_checklist_items automatically.

do $$
declare
  v_buyer   uuid;
  v_cat     uuid;
  v_task    uuid;
  v_brief   jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_keys    text[] := array['item_1','item_2','item_3','item_4','item_5'];
  v_texts   text[] := array[
    'Pull all 3 vendor CSVs (Acme, Brightline, Cosmic) into a single sheet',
    'Dedupe rows by invoice number, flagging any amount mismatches in a new "mismatch" column',
    'Add a running total + month-over-month delta per vendor',
    'Save the cleaned sheet to a single .xlsx file with a "summary" tab',
    'Send the file + a one-paragraph note on what was deduped / flagged'
  ];
  v_i       int;
begin
  -- 1) Resolve the buyer
  select id into v_buyer from public.users where email = 'anshutiwarirnc@gmail.com';
  if v_buyer is null then
    raise notice 'post: buyer missing — run 0074 first';
    return;
  end if;

  -- 2) Pick the spreadsheet sub-category (the one tied to the
  --    contract shown in the screenshots)
  select id into v_cat from public.skill_categories
   where slug = 'spreadsheet-data-work' and status = 'active' limit 1;
  if v_cat is null then
    select id into v_cat from public.skill_categories
     where parent_category_id is not null and status = 'active' limit 1;
  end if;
  if v_cat is null then
    raise notice 'post: no active category found';
    return;
  end if;

  -- 3) Build the brief with 5 checklist items
  for v_i in 1..5 loop
    v_items := v_items || jsonb_build_object(
      'key',  v_keys[v_i],
      'text', v_texts[v_i]
    );
  end loop;

  v_brief := jsonb_build_object(
    'checklist_items', v_items,
    'notes',  'Use the standardised column order from the previous monthly reconciliation. Anything ambiguous — mark it "needs review" rather than guessing.',
    'sample_url', ''
  );

  -- 4) Idempotent: skip if the same title already exists for this buyer
  select id into v_task from public.task_posts
   where buyer_id = v_buyer
     and title = 'Reconcile 3 vendor CSVs into one clean sheet'
   limit 1;

  if v_task is not null then
    raise notice 'post: task already exists (%) — skipping insert', v_task;
  else
    insert into public.task_posts (
      buyer_id, category_id, title, description,
      pricing_model, budget_min, budget_max,
      status, openings, skills_required, brief,
      published_at, show_in_upcoming
    ) values (
      v_buyer, v_cat,
      'Reconcile 3 vendor CSVs into one clean sheet',
      'Need a verified pro to merge three monthly vendor exports (CSV) into one canonical sheet, dedupe by invoice number, and flag any amount mismatches. The full delivery checklist is in the brief.',
      'fixed',
      500000,  -- ₹5,000
      600000,  -- ₹6,000
      'open',
      1,
      array['Excel','Google Sheets','CSV cleanup'],
      v_brief,
      now(),
      true
    )
    returning id into v_task;
    raise notice 'post: created task %', v_task;
  end if;
end $$;

-- Show what we just inserted
select id, title, status, pricing_model, budget_min, budget_max,
       jsonb_array_length(brief->'checklist_items') as checklist_count
  from public.task_posts
 where buyer_id = (select id from public.users where email = 'anshutiwarirnc@gmail.com')
   and title = 'Reconcile 3 vendor CSVs into one clean sheet';
