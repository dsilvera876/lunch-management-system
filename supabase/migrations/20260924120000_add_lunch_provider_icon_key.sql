-- Curated provider icon keys for HR lunch provider branding (no arbitrary SVG/URLs).

alter table public.lunch_providers
  add column icon_key text not null default 'utensils';

alter table public.lunch_providers
  add constraint lunch_providers_icon_key_allowed
  check (
    icon_key in (
      'utensils',
      'bowl',
      'fruit',
      'drink',
      'pizza',
      'burger',
      'leaf',
      'food-bag'
    )
  );
