-- Notify the other party when a workspace message is sent.
-- The recipient gets a notification so the toast can pop up.
-- If the recipient is already viewing that workspace the toast
-- component will suppress the popup (checked client-side via URL).

create or replace function public.notify_workspace_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace record;
  v_recipient_id uuid;
begin
  select * into v_workspace from public.workspaces where id = NEW.workspace_id;

  -- Determine the recipient (the other party)
  if NEW.sender_id = v_workspace.buyer_id then
    v_recipient_id := v_workspace.employee_id;
  else
    v_recipient_id := v_workspace.buyer_id;
  end if;

  -- Create notification for the recipient
  perform public.create_notification(
    v_recipient_id,
    'new_message',
    'New message',
    coalesce(NEW.body, '(attachment)'),
    '/dashboard/workspaces/' || NEW.workspace_id
  );

  return NEW;
end;
$$;

drop trigger if exists trg_workspace_message_notification on public.workspace_messages;
create trigger trg_workspace_message_notification
  after insert on public.workspace_messages
  for each row
  when (NEW.is_ghosted = false)
  execute function public.notify_workspace_message();
