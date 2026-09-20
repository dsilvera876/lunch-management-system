# Local development seed data

This project loads **development-only** fixtures after migrations when you reset the local Supabase database.

## Reset command

```bash
npx supabase db reset
```

That reapplies migrations and runs `supabase/seeds/development.sql` (configured in `supabase/config.toml` under `[db.seed]`).

**Do not** use development seed credentials or fixture data in staging or production. `db push` does not run seed files on remote databases.

## Development accounts

| Role     | Email               | Password        |
|----------|---------------------|-----------------|
| Owner    | `owner@lunch.test`  | `LunchTest123!` |
| HR       | `hr@lunch.test`     | `LunchTest123!` |
| Accounts | `accounts@lunch.test` | `LunchTest123!` |
| Staff    | `staff1@lunch.test` | `LunchTest123!` |
| Staff    | `staff2@lunch.test` | `LunchTest123!` |

## What is seeded

- Office locations (Camp Road, Office 2)
- Lunch providers (Alberries Caterors, Davis Catering, Peel Good Food) with recurring menus
- Daily lunch subsidy (`500` JMD in app settings)
- Previous (finalized) and current lunch periods aligned to Jamaica calendar dates
- Grouped staff orders for My Orders, My Spend, HR deliveries, and Accounts reporting

Dates are computed from the current Jamaica date on each reset so fixtures stay usable on weekdays and after weekends.
