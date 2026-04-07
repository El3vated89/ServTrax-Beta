# 📦 ServTrax — Photo Storage & Compression System

---

## 1. Core Principle

ServTrax uses a compressed, storage-controlled photo system optimized for:

- Fast mobile uploads
- Low bandwidth usage
- Predictable storage costs
- Scalable long-term growth

⚠️ Raw images must NEVER be used as the primary stored asset.

All images must be processed before storage.

---

## 2. Processing Pipeline

Capture → Compress → Generate Thumbnail → Upload → Store Metadata

---

## 3. Compression Standards

### 3.1 Standard Image (Primary Proof)

- Max width: 1600px
- Maintain aspect ratio
- Format: WebP (preferred), JPEG fallback
- Quality: 75–80
- Strip unnecessary metadata

Expected:

- Original: 3MB–12MB
- Compressed: 200KB–400KB
- Average: ~300KB

---

### 3.2 Thumbnail

- Width: 300–400px
- Format: WebP/JPEG
- Quality: 65–75

Expected:

- Size: 30KB–80KB
- Average: ~50KB

---

### 3.3 Total Per Photo

- Standard ≈ 300KB  
- Thumbnail ≈ 50KB  
- Total ≈ 350KB  

---

## 4. Storage Model

### 4.1 Capacity-Based

- No photo count limits
- Storage is based on total usage (MB/GB)

> “Unlimited photos within your storage limit”

---

### 4.2 Efficiency

- 1 photo ≈ 350KB  
- 1 job (~3 photos) ≈ 1MB  

---

### 4.3 Reference

| Storage | Photos | Jobs |
|--------|--------|------|
| 100MB | ~300 | ~100 |
| 500MB | ~1,400 | ~400–500 |
| 1GB | ~3,000 | ~1,000 |
| 5GB | ~15,000 | ~5,000 |

---

## 5. Plan Storage Limits

### Free
- 100MB
- ~300 photos
- ~100 jobs
- Retention: 14 days

---

### Starter Lite
- 500MB
- Retention: 30 days

---

### Starter
- 1GB
- Retention: 60–90 days

---

### Pro
- 5GB
- Retention: 6–12 months

---

## 6. Storage Add-Ons

Storage is independent of plan tier.

Examples:

- +5GB → $3/mo  
- +10GB → $5/mo  

System must support:

- Dynamic upgrades
- Non-destructive expansion

---

## 7. Retention System

Each photo must include:
- Upload timestamp
- Expiration timestamp (based on plan)
- Job ID reference
- Owner ID reference
