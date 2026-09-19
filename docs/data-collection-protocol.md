# AegisDoc Forensic Data Collection & Ground-Truth Protocol
**Standard**: Scientific Rigor, Ethical AI, and Legal Compliance (ISO/IEC 27037 & GDPR / DPDP)  
**Document Version**: 3.0.0-canonical  
**Scope**: Acquisition, Annotation, Privacy-Enclave Redaction, and Partitioning of Financial Document Corpora  

---

## 1. Ethical & Legal Data Sourcing

Document forensics directly touches sensitive Personally Identifiable Information (PII) and financial records. AegisDoc adheres strictly to white-hat data provenance principles:

### 1.1 Permitted Data Sources
1. **Curated Public Scientific Research Benchmarks**:
   - **DocTamper** (Document Tampering Detection Benchmark; CAS/NLPR): 170,000+ document images covering copy-move, splicing, and removal.
   - **FindIt Benchmark**: Real-world receipt and invoice tampering dataset.
   - **CASIA v2.0**: Uncompressed and JPEG-compressed splicing and copy-move reference vectors.
   - **Columbia DVMM Dataset**: Rigorously documented splicing benchmark with known camera calibration.
2. **Controlled In-House Synthetic Generators**:
   - Programmatically synthesized bank statements and corporate invoices built using legitimate open-source layout engines (e.g. ReportLab, Weasyprint).
   - Documented realism gap: Synthetically perturbed images allow precise pixel-level ground truth, though they exhibit cleaner quantization boundaries than multi-generation mobile camera acquisitions.
3. **Consented User-Submitted Corpora**:
   - Documents submitted by financial institutions or beta testers with explicit signed data contribution consent under institutional research agreements.

### 1.2 Prohibited Data Practices (Strict Zero-Tolerance)
- **NO Web Scraping**: Under no circumstances does the project scrape real customer statements, bank receipts, or identity documents from public web search indexes, unsecured S3 buckets, or social media.
- **NO Unredacted Financial Records**: No live account numbers, IBANs, taxpayer identifiers, or physical home addresses may enter the corpus without cryptographic redaction.

---

## 2. Forensic Labeling & Ground-Truth Annotation Protocol

Forensic models cannot rely on weak document-level binary flags. Every labeled document in the AegisDoc corpus must contain dual-tier spatial and semantic ground truth.

### 2.1 Dual-Tier Ground Truth Artifacts
1. **Binary Pixel Mask (`mask.png`)**:
   - 8-bit single-channel PNG matching the exact dimensions $(W \times H)$ of the document image.
   - **0 (Black)**: Legitimate, un-tampered document substrate and text.
   - **255 (White)**: Tampered pixel region (manipulated text, spliced block, pasted signature, or cloned seal).
2. **Metadata Descriptor (`manifest.json`)**:
   - JSON record identifying:
     - `documentId`: Unique UUID v4.
     - `documentClass`: `bank_statement` | `invoice` | `tax_slip` | `loan_sanction`.
     - `modality`: `copy_move` | `splice` | `text_edit` | `seal_clone`.
     - `primaryQualityQ`: Known or estimated original JPEG quality factor.
     - `compressionGenerations`: Integer count of recompression cycles.
     - `tamperingBoundingBoxes`: Array of $[x, y, width, height]$ coordinates.

### 2.2 Inter-Annotator Agreement (Cohen's Kappa)
- Every real-world document is independently inspected and masked by **two trained digital forensic examiners**.
- Spatial pixel agreement is scored using Cohen's Kappa $(\kappa)$ across $32 \times 32$ tiles.
- **Acceptance Threshold**: $\kappa \ge 0.85$. If $\kappa < 0.85$, an independent Senior Forensic Examiner conducts adjudication.

---

## 3. Data Partitioning & Cross-Corpus Generalization

To prevent memorization and over-fitting to specific synthetic font engines or scanner profiles, data splits follow strict isolation protocols:

```
Full Evaluated Corpus (100%)
├── Training Split (60%)       : Parameter estimation & baseline calibration
├── Validation Split (20%)     : Hyperparameter selection (window sizes, MAD multipliers)
└── Held-Out Test Split (20%)   : Final untouched audit benchmark (evaluates DET & ECE)
```

### 3.1 Cross-Corpus Generalization Protocol
- **Split A (In-Distribution)**: Train and validate on synthetic bank statements generated via Engine A.
- **Split B (Out-of-Distribution Transfer)**: Test strictly on DocTamper and FindIt real-world document sets without retraining.
- Any degradation in AUC-ROC greater than 12% triggers an adaptive threshold recalibration to protect real-world generalization.

---

## 4. Privacy, Redaction & Enclave Security

Document forensics must never jeopardize the confidentiality of legitimate document owners.

### 4.1 Automated Enclave Redaction Pipeline
Before any document is committed to the research corpus:
1. **Automated OCR Masking**: Text regions matching regex patterns for:
   - Account numbers: `\d{9,18}`
   - Taxpayer IDs / SSN: `\d{3}-\d{2}-\d{4}`
   - Names & Signatures: Hand-drawn signature crops are decoupled from identity fields.
2. **Irreversible Pixel Replacement**: Sensitive numbers are replaced with synthetic randomized digits matching the ambient font style and substrate noise, destroying biometric and financial linkage.

### 4.2 Cryptographic Storage & Access Control
- **At Rest**: AES-256-GCM encryption on isolated local storage arrays.
- **Access Control**: Role-based access requiring dual-key authentication for researchers.
- **Retention**: Consented test vectors are retained for 180 days post-benchmark audit, then securely shredded using NIST SP 800-88 cryptographic wipe protocols.

---

## 5. Scientific Reproducibility & Versioning

To ensure judicial auditability under FRE 702 / Daubert challenges, all benchmark results must be completely reproducible:

1. **Semantic Versioning**: Corpora are versioned using SemVer (e.g. `AegisCorpus-v3.0.0`).
2. **Cryptographic Root Hash**: The complete corpus directory is fingerprinted with a Merkle tree SHA-256 digest committed into the repository:
   ```bash
   find corpus/v3.0 -type f -exec sha256sum {} + | sort | sha256sum > CORPUS_MERKLE_ROOT.sha256
   ```
3. **Published Partition Indices**: `splits/train_idx.json`, `splits/val_idx.json`, and `splits/test_idx.json` are permanently archived so independent auditors can replicate the exact benchmark tables.
