select
  u.email,
  p.id,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'owner';