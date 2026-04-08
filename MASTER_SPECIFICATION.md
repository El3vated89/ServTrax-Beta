# ServTrax Product Specification

---

## 1. Core Vision

ServTrax is a lightweight operational system that helps small service businesses complete jobs faster, verify work, communicate clearly, and get paid with less friction.

ServTrax is not a bloated CRM. It is a mobile-first field-service platform built for real work in the field.

Core promise:

**Track. Verify. Get Paid.**

Supporting workflow:

Track -> Verify -> Communicate -> Get Paid

---

## 2. Product Goals

ServTrax must:

- Launch early without requiring a future rebuild.
- Stay modular and upgradeable.
- Remain backward compatible.
- Support plan-based feature expansion.
- Keep mobile field workflows fast.
- Preserve historical job records accurately.
- Keep internal notes private.
- Control all customer-facing data intentionally.

---

## 3. Target Users

ServTrax is primarily for:

- Lawn care businesses.
- Pressure washing businesses.
- Small contractors.
- Recurring service businesses.
- Owner-operators.
- Small crews that need proof, messaging, and payment workflow.

---

## 4. Core Workflow

1. A job is scheduled or due.
2. The work is completed.
3. Proof is captured.
4. A ready-to-send customer message is generated.
5. A proof page or portal view can be shared.
6. The customer pays.
7. The business owner has a clean record of what happened.

---

## 5. Product Principles

- Mobile-first from day one.
- Camera-first verification workflow.
- Minimal typing in the field.
- Fast tap-based actions.
- Simple UI for daily use.
- Historical records must remain accurate.
- Internal notes must never be exposed to customers.
- Customer-facing data must always be controlled.
- Future features must be addable without rebuilding the system.

---

## 6. Core Features

### Customers

- Contact information.
- Billing notes.
- Payment preferences.
- Multiple service locations where needed.
- Status tracking.
- Internal notes.

### Service Plans

- Recurring or one-time service structure.
- Pricing.
- Billing frequency.
- Recurrence.
- Next due date.
- Start date.
- Active, paused, or inactive status.
- Route grouping.

### Jobs

- Manual or generated from recurring plans.
- Linked customer.
- Linked service plan where applicable.
- Scheduled and completed dates.
- Payment status.
- Visibility mode.
- Share token.
- Billable status.
- Customer-facing notes.
- Internal notes.
- Snapshot-based historical fields.

### Verification

- Photos.
- GPS coordinates.
- Timestamp.
- Service notes.
- Proof notes.
- Customer-visible notes.
- Internal-only notes.

### Messaging

All tiers with messaging support:

- Templates.
- Ready-to-copy messages.
- Variable insertion for customer name, service, date, amount due, payment instructions, and proof links.

Pro support:

- AI-assisted messaging that uses correct job variables while improving tone and personalization.

### Quotes

Starter Lite and above:

- Create quote.
- Send quote.
- Customer approves quote.
- Convert quote to job.

### Customer Access

Free and Starter Lite:

- Temporary links only.

Starter and Pro:

- Permanent job links.
- Customer portal.
- Customer job history where enabled.

### Routes

All supported core plans:

- Manual routes.
- Assign jobs/customers to routes.
- City or zip grouping where enabled.

Pro:

- Smart route generation.
- Route optimization.

### Search

All plans:

- Search and filtering for customers, jobs, addresses, notes, service types, routes, cities, zip codes, and equipment.

Pro:

- AI search.

### Equipment

Starter Lite and above:

- Equipment tracking.
- Maintenance logs.
- Maintenance dates.
- Status.
- Assigned notes.

---

## 7. Snapshot Data Model

ServTrax must separate master data from historical job data.

Jobs must store snapshot values such as:

- `customer_name_snapshot`
- `address_snapshot`
- `phone_snapshot`
- `service_snapshot`
- `price_snapshot`

Purpose:

- Preserve historical accuracy.
- Prevent old jobs from changing when customer records are updated.
- Keep records stable for proof, invoices, and audits.

Historical jobs must never be rewritten by later edits to the customer record.

---

## 8. Visibility Rules

- Jobs and proof support `internal_only` and `shareable` visibility modes.
- Photos should support per-photo visibility controls.
- Internal notes must never be shown to customers.
- Customer-facing data must be intentionally selected.

---

## 9. Payment System

ServTrax supports:

- Amount due tracking.
- Paid/unpaid visibility.
- Payment status tracking.
- Payment instructions in messages.
- Stripe where enabled.
- User-supplied payment instructions for off-platform payments.

Plan rules:

- Free and Starter Lite: Stripe plus 0.5% ServTrax fee.
- Starter and Pro: Stripe with no ServTrax fee.

---

## 10. Monetization

- Quotes -> Starter Lite and above.
- Portal -> Starter and above.
- Branding -> Starter and above.
- AI -> Pro.
- Smart routes -> Pro.
- Fees -> Free and Starter Lite.
- Storage -> Add-on.

---

## 11. Pricing

- Free - $0.
- Starter Lite - $4 launch / $5 standard.
- Starter - $8 launch / $10 standard.
- Pro - $12 launch / $20 standard.
- Biz - future plan.

Plan positioning:

- Free -> Track.
- Starter Lite -> Win work.
- Starter -> Show work.
- Pro -> Optimize.

---

## 12. Storage

ServTrax must use a compressed, storage-controlled photo system.

Core rules:

- Raw images must never be the primary working asset.
- Capture -> Compress -> Generate Thumbnail -> Upload -> Store Metadata.
- Store file references in Firestore.
- Store files in Firebase Cloud Storage.
- Support retention limits by plan.
- Support paid storage add-ons.
- Compress images before upload.

Storage add-ons:

- +5GB.
- +10GB.
- +25GB.
- +50GB.

---

## 13. Architecture

ServTrax uses:

- Frontend: React and Vite.
- Backend and database: Firebase.
- Database: Firestore.
- Auth: Firebase Auth.
- File storage: Firebase Cloud Storage.

Required architecture rules:

- Modules must not be tightly coupled.
- Modules communicate through defined services or APIs.
- Business logic must be separated from UI.
- UI should not directly manipulate database records.
- Services handle validation and logic.
- New features should be feature-gated.

Core module examples:

- `auth`
- `customers`
- `service_plans`
- `jobs`
- `verification`
- `messaging`
- `payments`
- `routes`
- `equipment`
- `quotes`
- `search`
- `storage`
- `tasks`
- `notes`

---

## 14. Feature Flags

ServTrax must include a feature flag system.

Purpose:

- Enable or disable features without rebuilding core logic.
- Allow phased rollout.
- Support plan-based access.

Examples:

- `quotes` -> Starter Lite and above.
- `portal` -> Starter and above.
- `branding` -> Starter and above.
- `ai` -> Pro.
- `smart_messaging` -> Pro.
- `smart_routes` -> Pro.
- `bulk_messaging` -> Biz.
- `api_access` -> Biz.

---

## 15. Database Rules

- Do not design only for current features.
- Include future-safe nullable fields where useful.
- Never remove production fields.
- Avoid destructive schema changes.
- Support version-safe updates only.
- All schema changes should use versioned migrations.

Example migration style:

- `v1_create_customers`
- `v2_create_service_plans`
- `v3_create_jobs`
- `v4_create_verification`
- `v5_add_payment_fields`
- `v6_add_visibility`
- `v7_add_share_links`

---

## 16. UI Structure

Core navigation:

- Dashboard.
- Jobs.
- Customers.
- Tasks.
- Equipment.

Future additions:

- Routes.
- Reports.
- Settings.
- AI tools.

UI rules:

- Minimal clicks for core actions.
- New sections must be addable without redesign.
- Fast list views.
- Photo-first workflows where needed.
- Clean customer-facing pages.

---

## 17. Development Phases

### Phase 1 - MVP

- Customers.
- Service plans.
- Job tracking.
- Verification.
- Smart messaging.
- Shareable proof pages.
- Search/filtering foundation.

### Phase 2 - Routes And Expansion

- Routes.
- Payment tracking.
- Quoting system.
- Email support.
- Customer timeline.
- Customer portal foundation.

### Phase 3 - Equipment

- Equipment tracking.
- Maintenance logs.
- Stronger payment visibility.
- Expanded route tools.

### Phase 4 - Payments And Portal Polish

- Stripe payment processing.
- Payment links.
- More polished portal/payment flow.
- Custom branding.

### Phase 5 - AI

- Smart lookup.
- AI search.
- Smart notes.
- Smart tasks.
- AI messaging improvements.
- Route optimization.
- Automation groundwork.

### Phase 6 - Future Expansion

- Biz plan features.
- Bulk messaging.
- Automation.
- API access.
- Advanced reporting.
- External integrations.
- Multi-user support.

---

## 18. Non-Negotiable Rules

- Never overwrite historical records.
- Never expose internal notes to customers.
- Always validate data before saving.
- All customer-facing data must be intentionally controlled.
- Support backward compatibility for data.
- Use externalized storage architecture.
- Optimize for mobile performance.
- Use pagination for lists.
- Lazy load heavy content such as photos and long history.

---

## 19. Final Product Summary

ServTrax helps service businesses:

- Track recurring and one-time jobs.
- Verify work with proof.
- Generate customer-ready communication.
- Share proof professionally.
- Collect payment faster.
- Grow into a more advanced operating system over time.

It is intentionally designed to launch simple, expand safely, and scale without being rebuilt.
