# InvoiceTrack — Invoice & Payment Management System

A browser-based invoicing tool built with plain HTML, CSS and JavaScript for a CS50 Computer Science for Business project. It tracks invoices, partial payments, overdue balances and collections, with no backend or dependencies.

## Features
- Invoice create / view / edit / delete with automatic numbering (`INV-YYYY-0001`)
- Live subtotal, tax and total calculation; inline validation
- Payment recording with partial payments, overpayment prevention and per-invoice history
- Status computed from the data and today's date (never set by hand)
- Dashboard: 5 KPIs, 6-month invoiced vs collected chart, recent invoices, upcoming dues
- Search (invoice no. / customer), status filter, date range, sorting, match count
- CSV export (all invoices, filtered invoices, payments), JSON backup, printable invoice and report
- localStorage persistence, demo data (clearly labelled), reset with confirmation
- Responsive layout with keyboard-accessible dialogs and visible focus states

## Tech stack
HTML5, CSS3 (variables), vanilla JavaScript (ES6+), localStorage, Blob API, `window.print()`. No libraries, CDNs or build step.

## Run locally
Download the three files into one folder and open `index.html` in a modern desktop browser.

## Business rules
- Subtotal = Σ(quantity × unit price); Tax = subtotal × tax% ÷ 100; Total = subtotal + tax
- Amount paid = sum of recorded payments; Outstanding = total − paid
- Status priority: **Paid** (balance 0) → **Overdue** (balance > 0 and due date < today) → **Partially Paid** (some payment) → **Unpaid**
- Total invoiced = Σ totals; Total collected = Σ payments; Outstanding = Σ balances; Overdue = Σ balances of past-due invoices
- Collection rate = collected ÷ invoiced × 100 (0% when nothing is invoiced)
- Payments cannot exceed the balance; an edit cannot push an invoice total below what is already paid; deleting an invoice also deletes its payments (after confirmation)

## Testing checklist
- [ ] New invoice: 2 × ₹1,000 at 18% → subtotal ₹2,000, tax ₹360, total ₹2,360
- [ ] Part payment → Partially Paid; payment of the rest → Paid; further payment blocked
- [ ] Unpaid invoice with a past due date → Overdue
- [ ] Quantity 0 (zero total) → dashboard and rate show no errors
- [ ] Edit an invoice → payment history unchanged
- [ ] Search, status filter, date range, sort and Clear filters behave correctly
- [ ] CSV with commas/quotes in a customer name opens correctly in Excel
- [ ] Refresh keeps data; Clear demo / Reset ask for confirmation
- [ ] Customer name `<b>x</b>` displays as plain text

## Limitations and future work
- localStorage is browser-specific, unencrypted and not suitable as a secure multi-user database
- One line item per invoice in the form (data model already supports several)
- No JSON restore yet (backup is export-only), no PDF generation beyond the browser's print dialog
- Ideas: multiple line items, JSON import, recurring invoices, reminders
