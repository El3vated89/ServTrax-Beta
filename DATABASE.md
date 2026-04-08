# ServTrax Database Roadmap

---

## Core Rule

This document tracks Firebase Firestore collections, documents, fields, and system settings as they are built.

- Never delete production fields.
- Only add fields or introduce version-safe changes.
- Maintain backward compatibility.
- Preserve historical job accuracy through snapshot fields.
- Update this file whenever a new collection, document, field, or system setting is introduced.

---

## Migration Roadmap

- `v1_create_customers`
- `v2_create_service_plans`
- `v3_create_jobs`
- `v4_create_verification_records`
- `v5_add_payment_fields`
- `v6_add_visibility`
- `v7_add_share_links`
- `v8_add_quotes`
- `v9_add_routes`
- `v10_add_equipment`
- `v11_add_storage_usage`

---

## Schema Tracker

### 1. Users

Path: `users/{userId}`

- `uid` (string)
- `email` (string)
- `name` (string)
- `role` (string)
- `created_at` (timestamp)

### 2. Customers

Path: `customers/{customerId}`

- `ownerId` (string)
- `name` (string)
- `phone` (string)
- `email` (string)
- `street` (string)
- `line2` (string, optional)
- `city` (string)
- `state` (string)
- `zip` (string)
- `notes` (string)
- `access_notes` (string, optional)
- `status` (string) - `active`, `inactive`
- `created_at` (timestamp)

### 3. Service Plans

Path: `service_plans/{planId}`

- `ownerId` (string)
- `name` (string)
- `description` (string)
- `price` (number)
- `billing_frequency` (string) - `one_time`, `weekly`, `bi_weekly`, `monthly`, `yearly`
- `created_at` (timestamp)

### 4. Jobs

Path: `jobs/{jobId}`

- `ownerId` (string)
- `customerId` (string)
- `servicePlanId` (string, optional)
- `customer_name_snapshot` (string)
- `address_snapshot` (string)
- `phone_snapshot` (string)
- `service_snapshot` (string)
- `price_snapshot` (number)
- `scheduled_date` (timestamp)
- `completed_date` (timestamp, optional)
- `last_completed_date` (timestamp, optional)
- `next_due_date` (timestamp, optional)
- `approved_at` (timestamp, optional)
- `status` (string) - `pending`, `quote`, `approved`, `completed`, `canceled`
- `payment_status` (string) - `unpaid`, `paid`
- `visibility_mode` (string) - `internal_only`, `shareable`
- `service_setup_type` (string) - `one-time`, `recurring`, `flexible`
- `billing_frequency` (string)
- `interval_days` (number, optional)
- `override_enabled` (boolean, optional)
- `seasonal_enabled` (boolean, optional)
- `seasonal_rules` (array of objects, optional)
- `share_token` (string, optional)
- `is_billable` (boolean)
- `is_recurring` (boolean)
- `recurringPlanId` (string, optional)
- `internal_notes` (string)
- `customer_notes` (string)
- `created_at` (timestamp)

### 5. Verification Records

Path: `verification_records/{recordId}`

- `ownerId` (string)
- `jobId` (string)
- `photo_url` (string)
- `thumbnail_url` (string)
- `notes` (string)
- `visibility` (string) - `internal_only`, `shareable`
- `timestamp` (timestamp)
- `gps_location` (map, optional)
- `created_at` (timestamp)

### 6. Business Profiles

Path: `business_profiles/{profileId}`

- `ownerId` (string)
- `business_name` (string)
- `business_phone` (string)
- `business_email` (string)
- `business_tagline` (string, optional)
- `logo_url` (string, optional)
- `base_camp_label` (string, optional)
- `base_camp_address` (string, optional)
- `base_camp_lat` (number, optional)
- `base_camp_lng` (number, optional)
- `updated_at` (timestamp)

### 7. Equipment

Path: `equipment/{equipmentId}`

- `ownerId` (string)
- `name` (string)
- `brand` (string)
- `model` (string)
- `serial_number` (string)
- `part_number` (string)
- `category` (string)
- `status` (string) - `active`, `maintenance`, `retired`
- `service_history` (array of objects)
- `service_history.date` (timestamp)
- `service_history.type` (string)
- `service_history.notes` (string)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 8. Routes

Path: `routes/{routeId}`

- `ownerId` (string)
- `name` (string)
- `route_date` (timestamp)
- `status` (string) - `draft`, `active`, `in_progress`, `completed`, `archived`
- `base_camp_label` (string)
- `base_camp_address` (string)
- `base_camp_lat` (number)
- `base_camp_lng` (number)
- `return_to_base` (boolean)
- `optimization_mode` (string) - `none`, `close_to_far`, `far_to_close`, `optimized`
- `manual_override` (boolean)
- `created_by` (string)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 9. Route Stops

Path: `route_stops/{stopId}`

- `route_id` (string)
- `customer_id` (string, optional)
- `job_id` (string, optional)
- `stop_order` (number)
- `manual_order` (number)
- `optimized_order` (number)
- `status` (string) - `pending`, `completed`, `canceled`
- `due_state` (string) - `upcoming`, `due`, `overdue`, `delayed`, `completed`
- `city_snapshot` (string)
- `address_snapshot` (string)
- `lat_snapshot` (number)
- `lng_snapshot` (number)
- `service_type_snapshot` (string)
- `customer_name_snapshot` (string)
- `scheduled_date` (timestamp)
- `due_date` (timestamp)
- `delayed_reason` (string, optional)
- `completed_at` (timestamp, optional)
- `notes_internal` (string, optional)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 10. Business Settings

Path: `business_settings/{settingsId}`

- `recurrence` (map)
- `winter_mode` (map)
- `grace_ranges` (map)
- `grace_ranges.due_grace_days` (number)
- `grace_ranges.overdue_grace_days` (number)
- `grace_ranges.critical_overdue_days` (number)
- `seasonal_enabled` (boolean, optional)
- `seasonal_defaults` (map)
- `seasonal_defaults.default_interval_days` (number)
- `seasonal_defaults.seasonal_rules` (array of objects)

### 11. Recurring Plans

Path: `recurring_plans/{planId}`

- `ownerId` (string)
- `customerId` (string)
- `servicePlanId` (string, optional)
- `name` (string)
- `price` (number)
- `frequency` (string)
- `status` (string) - `active`, `inactive`, `paused`
- `start_date` (timestamp)
- `next_due_date` (timestamp)
- `last_completed_date` (timestamp, optional)
- `interval_days` (number, optional)
- `override_enabled` (boolean, optional)
- `seasonal_enabled` (boolean, optional)
- `seasonal_rules` (array of objects, optional)
- `notes` (string)
- `created_at` (timestamp)

### 12. Quotes

Path: `quotes/{quoteId}`

- `ownerId` (string)
- `customerId` (string)
- `customer_name_snapshot` (string)
- `address_snapshot` (string)
- `phone_snapshot` (string)
- `service_snapshot` (string)
- `price_snapshot` (number)
- `billing_frequency` (string)
- `status` (string) - `draft`, `sent`, `approved`, `rejected`
- `notes` (string)
- `created_at` (timestamp)
- `approved_at` (timestamp, optional)

---

## Future Collections

- `verification_photos`
- `messages`
- `payments`
- `feature_flags`
- `storage_usage`
- `tasks`
- `notes`
