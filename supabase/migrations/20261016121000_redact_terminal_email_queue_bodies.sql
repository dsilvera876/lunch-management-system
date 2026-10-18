-- Authentication links are needed only while a queue item can still be delivered.
-- Redact bodies whenever a queue row becomes terminal, including superseded retries.

create or replace function private.redact_terminal_email_delivery_body()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.message_type in ('auth_hook', 'account_setup_invite')
    and new.status in ('sent', 'failed')
    and old.status not in ('sent', 'failed')
  then
    if new.text_body not like '[redacted%' then
      new.text_body := '[redacted after terminal status]';
    end if;
    if new.html_body not like '[redacted%' then
      new.html_body := '[redacted after terminal status]';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.redact_terminal_email_delivery_body()
  from public, anon, authenticated;

drop trigger if exists redact_terminal_email_delivery_body
  on private.email_delivery_queue;

create trigger redact_terminal_email_delivery_body
  before update of status on private.email_delivery_queue
  for each row
  execute function private.redact_terminal_email_delivery_body();

update private.email_delivery_queue
set
  text_body = '[redacted after terminal status]',
  html_body = '[redacted after terminal status]'
where status in ('sent', 'failed')
  and message_type in ('auth_hook', 'account_setup_invite')
  and (
    text_body not like '[redacted%'
    or html_body not like '[redacted%'
  );
