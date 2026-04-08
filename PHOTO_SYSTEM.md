# ServTrax Storage System

---

## 1. Core Principle

ServTrax uses a compressed, storage-controlled photo system designed for:

- Fast mobile uploads.
- Low bandwidth usage.
- Predictable storage costs.
- Scalable long-term growth.

Raw images must never be used as the primary stored asset.

All images must be processed before storage.

---

## 2. Processing Pipeline

Capture -> Compress -> Generate Thumbnail -> Upload -> Store Metadata

---

## 3. Compression Standards

### 3.1 Standard Image

All uploaded images must be converted into a standard proof format.

Rules:

- Max width: 1600px.
- Maintain aspect ratio.
- Format: WebP preferred, JPEG fallback.
- Quality: 75-80.
- Strip unnecessary metadata where appropriate.

Expected result:

- Original: 3MB-12MB.
- Compressed: 200KB-400KB.
- Average: about 300KB.

### 3.2 Thumbnail Image

All proof images must generate a thumbnail.

Rules:

- Width: 300-400px.
- Format: WebP preferred, JPEG fallback.
- Quality: 65-75.

Expected result:

- Size: 30KB-80KB.
- Average: about 50KB.

### 3.3 Total Per Photo

- Standard image: about 300KB.
- Thumbnail: about 50KB.
- Total: about 350KB per photo.

---

## 4. Storage Model

### 4.1 Capacity-Based Storage

ServTrax must:

- Not limit photo count directly.
- Limit usage by total storage capacity in MB/GB.

Rule:

"Photos are unlimited within your storage plan."

### 4.2 Storage Efficiency

With compression:

- 1 photo is about 350KB.
- 1 job with 3 average photos is about 1MB.

### 4.3 Storage Reference

| Storage | Photos | Jobs |
| --- | --- | --- |
| 100MB | about 300 | about 100 |
| 500MB | about 1,400 | about 400-500 |
| 1GB | about 3,000 | about 1,000 |
| 5GB | about 15,000 | about 5,000 |

---

## 5. Plan Storage Limits

### Free

- Storage: 100MB.
- About 300 photos.
- About 100 jobs.
- Retention: 14 days.

### Starter Lite

- Storage: 500MB.
- Retention: 30 days.

### Starter

- Storage: 1GB.
- Retention: 60-90 days.

### Pro

- Storage: 5GB.
- Retention: 6-12 months.

---

## 6. Storage Add-Ons

Storage is independent from plan tiers.

Planned add-ons:

- +5GB.
- +10GB.
- +25GB.
- +50GB.

Example launch pricing:

- +5GB -> $3/month.
- +10GB -> $5/month.

System must support:

- Add-on purchases.
- Dynamic storage limits.
- Non-destructive upgrades.

---

## 7. Retention System

Each photo must include:

- Upload timestamp.
- Expiration timestamp based on plan.
- Job ID reference.
- Owner ID reference.
- Verification record reference.

Rules:

- Photos may be automatically deleted after expiration.
- Retention is determined by the user's plan and storage settings.
- Deletion should be safe and auditable.

### 7.1 Storage Full Behavior

When storage is full, the user should be prompted to:

- Upgrade storage.
- Delete older photos.
- Enable auto-clean if supported.

---

## 8. Visibility System

Each photo must include a visibility mode:

- `internal_only`
- `customer_visible`

Rules:

- Internal photos are never exposed externally.
- Customer-visible photos use controlled access.
- Thumbnails are controlled and not automatically exposed.
- Internal notes must never be exposed to customers.

---

## 9. Storage Structure

Firebase Cloud Storage paths should follow a predictable verification-centered structure, for example:

- `/verifications/{verificationId}/thumb/{photoId}.webp`
- `/verifications/{verificationId}/standard/{photoId}.webp`
- `/verifications/{verificationId}/original/{photoId}.jpg`

Original storage is optional and should not be required for MVP.

---

## 10. Firestore Metadata Design

Photo metadata should be stored in Firestore, not as app-folder files.

Suggested collection: `verification_photos/{photoId}`

Suggested fields:

- `ownerId` (string)
- `verificationId` (string)
- `jobId` (string)
- `uploadedBy` (string)
- `photo_role` (string, default `proof`)
- `visibility_mode` (string, default `internal_only`)
- `original_path` (string, optional)
- `standard_path` (string)
- `thumb_path` (string)
- `original_size_bytes` (number, optional)
- `standard_size_bytes` (number, optional)
- `thumb_size_bytes` (number, optional)
- `width` (number, optional)
- `height` (number, optional)
- `mime_type` (string, optional)
- `captured_at` (timestamp, optional)
- `uploaded_at` (timestamp)
- `retention_expires_at` (timestamp, optional)
- `deleted_at` (timestamp, optional)

---

## 11. Frontend Compression

Compression must occur before upload.

Steps:

1. Capture image from camera or file input.
2. Resize to max width 1600px.
3. Convert to WebP at quality 75-80 where supported.
4. Generate thumbnail at 300-400px width.
5. Upload standard and thumbnail files to Firebase Cloud Storage.
6. Store file paths and metadata in Firestore.

---

## 12. Original Image Handling

- Not required for MVP.
- May be temporarily stored for processing.
- Should be deleted after processing unless a plan explicitly allows original retention.
- Pro may later support original retention.

---

## 13. Performance Rules

- Always load thumbnails first.
- Lazy-load full images only when opened.
- Never load full-size images in lists.
- Optimize for mobile data usage.
- Use pagination for long proof/history lists.

---

## 14. Cost Control Strategy

System must minimize:

- Bandwidth usage.
- Storage growth.
- Unnecessary image loading.

Key controls:

- Compression.
- Thumbnail usage.
- Retention limits.
- Storage-based limits.
- Paid storage add-ons.

---

## 15. System Design Rule

Photos are part of the verification system, not a gallery system.

Primary purpose:

- Prove work was completed.
- Support customer communication.
- Support payment flow.

The system prioritizes speed and efficiency over raw image fidelity.
