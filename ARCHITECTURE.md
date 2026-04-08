# ServTrax Architecture

---

## Core Principle

ServTrax must be modular, upgradeable, mobile-first, and scalable without requiring a rebuild as new plan tiers and modules are enabled.

---

## Current Stack

- Frontend: React and Vite.
- Backend and database: Firebase.
- Database: Firestore.
- Auth: Firebase Auth.
- File storage: Firebase Cloud Storage.

---

## Modules

Planned and current modules include:

- `/auth`
- `/customers`
- `/service_plans`
- `/jobs`
- `/verification`
- `/messaging`
- `/payments`
- `/routes`
- `/equipment`
- `/quotes`
- `/search`
- `/storage`
- `/system`
- `/tasks`
- `/notes`

---

## Architecture Rules

- Modules must remain independent.
- Modules communicate through defined services or APIs.
- UI should not directly own business logic.
- Services handle validation, Firestore access, and workflow rules.
- New functionality should be feature-gated instead of hard-wired.
- Historical records must remain stable through snapshot fields.

---

## Services

Expected service layer examples:

- `CustomerService`
- `JobService`
- `VerificationService`
- `MessagingService`
- `PaymentService`
- `RouteService`
- `QuoteService`
- `StorageService`

---

## Messaging Structure

Expected messaging areas:

- `/messaging/sms`
- `/messaging/email`
- `/messaging/templates`
- `/messaging/ai`

---

## Storage System

Expected storage areas:

- `/storage/uploads`
- `/storage/images`
- `/storage/limits`

Photo proof storage uses Firebase Cloud Storage and stores metadata/references in Firestore.

---

## System Module

Expected system areas:

- `/system/settings`
- `/system/features`
- `/system/plans`
- `/system/branding`

---

## Feature Flags

- `quotes` -> Starter Lite and above.
- `portal` -> Starter and above.
- `branding` -> Starter and above.
- `ai` -> Pro.
- `routes_basic` -> core route building and viewing.
- `routes_optimization` -> Pro smart routing.

---

## UI Structure

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

---

## Performance

- Mobile-first.
- Camera-first where verification is involved.
- Lazy load heavy content.
- Load thumbnails before full images.
- Use pagination for lists.
