# Staff accessibility — manual release checklist

Use before production releases and after major Staff UI changes. Automated `npm run test:a11y` does not replace these checks.

## Browsers and assistive tech

- [ ] **Firefox** — full Staff ordering path: `/home` → `/lunch` → cart guidance → `/my-orders` → `/account`
- [ ] **NVDA** (Windows) or **VoiceOver** (macOS) — login, dashboard, order lunch, my orders, account preferences
- [ ] Verify announcements: toasts, validation errors, tab changes, modal open/close (no double live regions)

## Zoom and reflow

- [ ] **200% browser zoom** — `/lunch`, `/my-orders`, `/lunch/orders/[id]` — no lost controls; provider tabs scroll horizontally; no essential text clipped
- [ ] **400% browser zoom** (~320px effective width) — same routes; Place Order and Save changes reachable; submit bar does not cover fields

## Windows High Contrast / forced colors

- [ ] Selected provider tab, My Orders tab, calendar selected/today, focus rings, primary buttons remain visible
- [ ] If automation is unavailable, use Windows **High contrast** theme on `/lunch` and `/my-orders`

## Reduced motion

- [ ] OS **Reduce motion** enabled — pages remain usable; no required animation to complete tasks

## Keyboard-only Staff flow

- [ ] Skip link → main content
- [ ] Provider tabs: Arrow, Home, End
- [ ] My Orders tabs: same
- [ ] Location / past-date dialogs: focus trapped, Escape closes, focus returns
- [ ] Blocked Place Order and blocked side Add do not activate

## Touch (optional device pass)

- [ ] Toast dismiss, cart Remove, calendar controls, email preference checkbox — comfortable targets
