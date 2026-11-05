# Compact Leads workspace — 2 November 2026

Applies to `/leads` only. The business API, database, trip report and mobile application are unchanged.

- White canvas, a compact 58 px header and one toolbar instead of attention chips plus a separate filter card.
- Attention, stage, source and search remain visible; contact outcome, next action and received-date range remain available under Filters. Existing URL parameters and pagination are preserved. Search is debounced.
- Rows measured at 52 px. Customer/job/location each occupy one line with full text available through tooltips and the existing detail page.
- Stage is a dot and colored text without a pill background. The list's primary accent is reserved for New lead. Row actions are neutral, radii are 6 px, and rows use separators rather than enclosing cards.
- One primary action per row: Contact for new/contacting leads, Book job for qualified leads, Open job for a converted lead, or View lead for a closed lead. Remaining relevant actions are under the ellipsis; redundant closed-lead menus are omitted.
- Contact outcome and next action share the Status column. Received shows a short date; exact received/last-contact times remain in tooltips and the lead detail page. Follow-up remains visible. Dispatcher is hidden below 1360 px and remains available in the customer tooltip/detail page.
- Dates and amounts use tabular numerals. The action column stays accessible when the table needs horizontal scrolling on smaller screens.
- Existing contact/follow-up/qualification and booking dialogs are reused. They mount only when requested, rather than for every row. No new runtime dependency was added.

Verification: TypeScript, scoped ESLint and full Next.js production build passed. Browser checks on synthetic in-memory fixtures covered primary Contact, booking from the overflow menu, stage filtering, filter reset and advanced filter visibility. Measured 14 rows at 52 px, header at 58 px, numeric style `tabular-nums`, and no document-level horizontal overflow at the default 1265 px viewport.

Screenshot: [compact Leads](previews/leads-compact.png). All records in this screenshot are synthetic local fixtures.
