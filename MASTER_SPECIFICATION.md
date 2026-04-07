# SERVTRAX — FINAL MASTER SPECIFICATION

## 1. CORE BRAND

**Primary Tagline:**  
Track. Verify. Get Paid.

**Supporting Brand Line:**  
Elevating the customer connection.

**Hero Hook:**  
Complete the job. Copy the message. Send it. Done.

**Core Positioning:**  
ServTrax is a mobile-first field-service operations platform for small service businesses such as lawn care, pressure washing, and contractors.

It is built to remove the friction that happens after the work is done by making it easy to:

- track work
- verify work
- communicate clearly
- get paid faster

ServTrax is **not** intended to be a bloated CRM.  
It is a lightweight operational platform built for real field work.

---

## 2. CORE PRODUCT GOAL

ServTrax must function as:

A lightweight operational system that can launch early, evolve safely, scale over time, and grow into a full business management platform without being rebuilt.

The system must be:

- modular
- upgradeable
- backward compatible
- mobile-first
- simple for the user
- powerful under the hood

---

## 3. CORE WORKFLOW

### Public Brand Workflow
Track → Verify → Get Paid

### Internal Operational Workflow
Track → Verify → Communicate → Get Paid

ServTrax exists to support this real-world flow:

1. A job is scheduled or due
2. The work is completed
3. Proof is captured
4. A ready-to-send customer message is generated
5. A proof page or portal view can be shared
6. The customer pays
7. The business owner has a clean record of what happened

---

## 4. PRODUCT PRINCIPLES

ServTrax must always follow these rules:

- mobile-first from day one
- camera-first workflow
- minimal typing in the field
- fast tap-based actions
- simple UI for core daily use
- historical records must remain accurate
- internal notes must never be exposed to customers
- customer-facing data must always be controlled
- future features must be addable without rebuilding the system

ServTrax is built for speed in the field, not office complexity.

---

## 5. TARGET USERS

ServTrax is primarily for:

- lawn care businesses
- pressure washing businesses
- small contractors
- recurring service businesses
- owner-operators
- small crews that need proof, messaging, and payment workflow

---

## 6. CORE MVP FEATURES

The MVP foundation includes:

- Customers
- Service Plans
- Job Tracking
- Verification Records
- Photos
- Notes
- GPS capture
- Timestamp capture
- Smart Messaging
- Shareable Job Proof Pages
- Search and Filtering

This is the minimum version that still delivers the full core value of the platform.

---

## 7. CORE DATA MODEL

ServTrax is built on four primary data layers:

### 7.1 Customers
Master customer profile data.

Examples:
- customer name
- phone
- email
- billing notes
- payment preferences
- multiple service locations if needed
- status
- internal notes

### 7.2 Service Plans
The recurring or one-time service agreement structure.

Examples:
- service type
- pricing
- recurrence
- next due date
- start date
- active/paused/inactive
- route grouping
- notes

### 7.3 Job Occurrences
Actual visits/jobs performed.

Examples:
- linked customer
- linked service plan
- scheduled date
- completed date
- payment status
- visibility mode
- share token
- billable status
- job notes
- customer-facing notes
- internal notes

### 7.4 Verification Records
Proof that the work was completed.

Examples:
- photos
- timestamp
- GPS location
- notes
- proof metadata
- public/shareable visibility control

---

## 8. SNAPSHOT DATA MODEL (CRITICAL)

ServTrax must separate:

- master data
- historical job data

Jobs must store snapshot values such as:

- customer_name_snapshot
- address_snapshot
- phone_snapshot
- service_snapshot
- price_snapshot

Purpose:

- preserve historical accuracy
- prevent old jobs from changing when customer records are updated
- keep records stable for proof, invoices, and audits

Historical jobs must never be rewritten by later edits to the customer record.

---

## 9. CUSTOMER / JOB RELATIONSHIP RULES

ServTrax must support:

- one customer with multiple job locations
- service location not always matching customer master address
- multiple jobs tied to one customer
- multiple service plans tied to one customer
- quote-to-job conversion for applicable plans

This is important for real service businesses where billing person and service address are not always the same.

---

## 10. VERIFICATION SYSTEM

Verification is a core ServTrax differentiator.

Each completed job can include:

- before/after or completion photos
- GPS coordinates
- timestamp
- service notes
- proof notes
- customer-visible notes
- internal-only notes

### Visibility Rules
Jobs and proof must support visibility modes such as:

- internal_only
- shareable

Photos should also support per-photo visibility controls.

Internal notes must never be shown to customers.

---

## 11. SMART MESSAGING

ServTrax includes smart messaging as a core workflow tool.

### Base Messaging
All tiers that include messaging must support:

- ready-to-copy templates
- variable-based field insertion
- customer name
- service type
- date
- amount due
- payment instructions
- proof page link if available

### AI Messaging
Pro includes AI-assisted messaging to make the message sound more natural and more personalized while still pulling the correct job variables.

ServTrax messaging supports the workflow after the job, not a bulky CRM-style communication system.

---

## 12. SHAREABLE PROOF PAGES AND PORTAL

ServTrax supports customer-facing proof sharing in two forms:

### 12.1 Shareable Job Proof Pages
A clean page showing job completion proof such as:

- service completed
- date/time
- selected photos
- notes
- payment status or amount due where enabled

### 12.2 Customer Portal
Higher plans include a persistent portal experience where customers can review service history, proof, and relevant payment information.

### Link Rules
- Free and Starter Lite use temporary links only
- Starter and Pro include permanent job links
- Starter and Pro include customer portal access

---

## 13. QUOTING SYSTEM

ServTrax includes quoting starting at Starter Lite.

Quote workflow:

Create quote → Send quote → Customer approves → Convert to job

This allows the system to support both lead-to-job flow and recurring service operations without becoming a full sales CRM.

---

## 14. PAYMENT SYSTEM

ServTrax supports payment collection and payment visibility.

### Payment Features
- amount due tracking
- paid/unpaid visibility
- payment status tracking
- payment instructions in messages
- support for Stripe where enabled
- support for user-supplied payment instructions such as custom directions or off-platform payment methods

### Plan Rules
- Free and Starter Lite: Stripe + 0.5% ServTrax fee
- Starter and Pro: Stripe with no ServTrax fee

Payment collection is important, but ServTrax is still positioned first as an operations and proof platform.

---

## 15. ROUTES

Routes are an important expansion feature and must be designed into the foundation early.

### Route Support Must Allow:
- route grouping
- assigning customers/jobs to routes
- sorting by city or zip
- manual route management in lower tiers
- smart route generation in Pro
- future Google-based routing support

Route structure should exist early even if advanced UI is enabled later.

---

## 16. EQUIPMENT TRACKING

Starter Lite and above include equipment support.

Equipment records can include:

- equipment name
- category
- serial/model
- purchase notes
- maintenance logs
- maintenance dates
- status
- assigned notes

Future expansion may include vehicle tracking and service reminders.

---

## 17. SEARCH AND FILTERING

Search must be available platform-wide.

Users must be able to search stored data such as:

- customer names
- addresses
- notes
- service types
- jobs
- routes
- cities
- zip codes
- equipment records

### Search Rules
- full search and filtering available in all current core plans
- AI search available in Pro
- standard filtering is not restricted to only premium tiers
- premium differentiator is AI assistance, not basic usability

---

## 18. PHOTO STORAGE, COMPRESSION, AND RETENTION

ServTrax must use a compressed, storage-controlled photo system.

### Core Rule
Raw images must never be the primary working asset.

### Image Pipeline
Capture → Compress → Generate Thumbnail → Upload → Store Metadata

### Standard Image Rules
- max width: 1600px
- maintain aspect ratio
- WebP preferred, JPEG fallback
- quality target around 75–80
- unnecessary metadata stripped when appropriate

### Thumbnail Rules
- smaller thumbnail version generated for list and portal views

### Storage Rules
- store file references in database
- do not store files directly in app folders
- use external storage architecture
- support retention limits by plan
- support paid storage add-ons
- compress images on upload to reduce cost and bandwidth

This keeps uploads fast, storage predictable, and scaling manageable.

---

## 19. PRICING AND PLAN STRUCTURE

ServTrax uses launch pricing to accelerate adoption, then transitions to standard pricing.

### 19.1 Free — $0
Best for basic tracking and proof of work.

Includes:
- job tracking
- verification with photos, notes, GPS, and timestamp
- template messaging (copy/paste)
- manual routes
- full search and filtering

Limitations:
- no quotes
- no customer portal
- temporary links only
- Stripe + 0.5% ServTrax fee
- “via ServTrax” branding

### 19.2 Starter Lite — $4 launch / $5 standard
Best for small operators who want to win work and manage equipment.

Includes everything in Free, plus:
- quotes
- quote approval workflow
- equipment tracking
- maintenance logs

Limitations:
- Stripe + 0.5% ServTrax fee
- no customer portal
- no branding control
- temporary links only

### 19.3 Starter — $8 launch / $10 standard
Best for businesses that want a more professional customer-facing experience.

Includes everything in Starter Lite, plus:
- customer portal
- permanent job links
- payment visibility
- custom branding

Payments:
- Stripe only
- no ServTrax transaction fee

### 19.4 Pro — $12 launch / $20 standard
Best for businesses that want smarter automation and operational efficiency.

Includes everything in Starter, plus:
- AI messaging
- smart routes
- AI search

### 19.5 Biz — Future Plan
For larger operations and more advanced control.

Planned features:
- bulk messaging
- automation
- API access

---

## 20. STORAGE ADD-ONS

Users must be able to purchase more storage separately.

Planned add-ons:

- +5GB
- +10GB
- +25GB
- +50GB

Storage and retention limits should exist from day one, even if exact caps are adjustable later.

---

## 21. SYSTEM POSITIONING BY PLAN

- Free → Track
- Starter Lite → Win work
- Starter → Show work
- Pro → Optimize

This keeps the plan ladder simple and easy to understand.

---

## 22. ARCHITECTURE REQUIREMENTS

ServTrax must be built as a modular, upgradeable system from day one.

### Module Examples
/modules
- auth
- customers
- service_plans
- jobs
- verification
- messaging
- payments
- routes
- equipment
- notes
- tasks
- search

### Architecture Rules
- modules must not be tightly coupled
- modules communicate through defined services or APIs
- new features must be addable without breaking old functionality
- foundation first, enable later

---

## 23. SERVICE LAYER REQUIREMENTS

Business logic must be separated from UI and direct database access.

Example services:
- CustomerService
- JobService
- PaymentService
- MessagingService
- TaskService
- RouteService
- VerificationService

Rules:
- UI should not directly manipulate database records
- services handle validation and logic
- this supports scaling and clean upgrades

---

## 24. DATABASE DESIGN RULES

The database must be designed for expansion.

Rules:
- do not design tables only for current features
- include future-safe nullable fields where useful
- never remove columns once in production
- avoid destructive schema changes
- support version-safe updates only

Examples of future-safe fields on jobs:
- payment_status
- visibility_mode
- share_token
- is_billable
- internal_notes
- customer_notes

---

## 25. FEATURE FLAGS

ServTrax must include a feature flag system.

Purpose:
- enable or disable features without rebuilding core logic
- allow phased rollout
- support plan-based access

Examples:
- smart_messaging → Pro
- smart_routes → Pro
- bulk_messaging → Biz
- api_access → Biz

This allows the app to be built forward without exposing unfinished features.

---

## 26. VERSION-SAFE UPDATES AND MIGRATIONS

All updates must be backward compatible.

Rules:
- never break existing functionality
- never remove existing fields in production
- only add fields, tables, or feature-gated logic

All schema changes must use versioned migrations.

Example style:
- v1_create_customers
- v2_create_service_plans
- v3_create_jobs
- v4_create_verification
- v5_add_payment_fields
- v6_add_visibility
- v7_add_share_links

---

## 27. UI STRUCTURE

The UI must be mobile-first and expandable.

### Core Navigation
- Dashboard
- Jobs
- Customers
- Tasks
- Equipment

### Future Additions
- Routes
- Reports
- Settings
- AI Tools

### UI Rules
- minimal clicks for core actions
- new sections must be addable without redesign
- fast list views
- photo-first workflow where needed
- clean customer-facing pages

---

## 28. DEVELOPMENT PHASES

### Phase 1 — MVP
- customers
- service plans
- job tracking
- verification
- smart messaging
- shareable proof pages
- full search/filtering foundation

### Phase 2
- routes
- payment tracking
- quoting system
- email support
- customer timeline
- customer portal foundation

### Phase 3
- equipment tracking
- maintenance logs
- stronger payment visibility
- expanded route tools

### Phase 4
- Stripe payment processing
- payment links
- more polished portal/payment flow

### Phase 5
- smart lookup
- AI search
- smart notes
- smart tasks
- AI messaging improvements
- automation groundwork

### Phase 6 / Future Expansion
- Biz plan features
- bulk messaging
- automation
- API access
- advanced reporting
- external integrations

Routes are important enough that the data foundation should exist early, even if full route UI appears later.

---

## 29. PLANNED TECH STACK

- Frontend: React
- Backend & Database: Firebase (Firestore, Firebase Auth, Cloud Storage) & Google Cloud

This stack supports modern web development, mobile-first UI, and scalable structured data within a unified Google ecosystem.

---

## 30. NON-NEGOTIABLE SAFETY AND DATA RULES

- never overwrite historical records
- never expose internal notes to customers
- always validate data before saving
- all customer-facing data must be intentionally controlled
- support backward compatibility for data
- use externalized storage architecture
- optimize for mobile performance
- use pagination for lists
- lazy load heavy content such as photos and long history

---

## 31. FINAL PRODUCT SUMMARY

ServTrax is a mobile-first field-service operations platform built for small service businesses.

It is designed around one core promise:

**Track. Verify. Get Paid.**

ServTrax helps service businesses:

- track recurring and one-time jobs
- verify work with proof
- generate customer-ready communication
- share proof professionally
- collect payment faster
- grow into a more advanced operating system over time

It is intentionally designed to launch simple, expand safely, and scale without being rebuilt.
