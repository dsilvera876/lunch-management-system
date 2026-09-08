-- Give period-focused tests an empty period timeline without touching the
-- persistent local dataset. The enclosing test transaction always rolls back.

reset role;

truncate table public.lunch_periods;
