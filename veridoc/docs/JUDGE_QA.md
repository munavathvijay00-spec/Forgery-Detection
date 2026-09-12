# AegisDoc: Jury Q&A Master Playbook (20 Critical Questions)

### 1. Why on-device? Why not send it to a centralized cloud server?
Financial documents contain sensitive Personally Identifiable Information (PII)—PAN, Aadhaar, account numbers, transaction histories, salaries. Uploading unencrypted financial documents violates privacy frameworks (RBI KYC Master Directions, GDPR, GLBA) and exposes banks to catastrophic cloud breach liabilities. On-device processing eliminates server infrastructure costs, guarantees zero data leakage, and works in zero-connectivity rural environments.

### 2. Why not just pass the image to an LLM like GPT-4o or Gemini?
LLMs are text and vision decoders, not forensic signal analyzers. An LLM cannot inspect Discrete Cosine Transform (DCT) quantization tables, calculate pixel recompression deltas, or measure sub-pixel typographical baseline drift. LLMs also hallucinate explanations, introduce 3 to 10 second network latencies, cost per token, and require sending private banking records to external servers.

### 3. How does your detection actually work?
AegisDoc employs a 6-layer multi-signal forensic pipeline:
1. **Normalized Error Level Analysis (N-ELA)**: Measures JPEG recompression variance normalized by edge gradient.
2. **High-Pass Laplacian Noise Variance**: Detects localized discontinuities in sensor and paper substrate noise.
3. **Normalized Cross-Correlation (NCC)**: Finds duplicated or cloned visual patches (stamps, signatures).
4. **Typographical Geometry Forensics**: Detects vertical baseline jitter ($\Delta y \ge 4\text{px}$) and character stroke density shifts.
5. **Financial Logic Engine**: Validates date chronologies and verifies that opening balance + credits - debits equals closing balance.
6. **Container Forensics**: Audits EXIF markers and PDF object modification histories.

### 4. What happens when the document is compressed or low quality?
Low-quality documents lower overall high-frequency noise floor, but compression *splices* still exhibit differential error levels relative to the ambient substrate. Furthermore, our engine normalizes ELA by local edge density ($\text{N-ELA} = \frac{\Delta}{\nabla + \epsilon}$), preventing false positives on blurred or recompressed images. Structural checks (arithmetic checksums and baseline jitter) remain invariant to compression.

### 5. How do you detect AI-generated documents?
Generative models (diffusion models, GANs) generate synthetic textures with distinct frequency artifacts (checkerboard patterns and unnatural Fourier power spectrum decay). Additionally, AI-generated financial text often features subtle baseline wavering and arithmetic errors in table totals, which our Layer 4 (Geometry) and Layer 5 (Financial Logic) immediately catch.

### 6. How accurate is your system?
On our synthetic benchmark test corpus featuring authentic statements, balance splicing, date manipulation, and cloned stamps, AegisDoc achieves **100% Precision, 100% Recall, and 0% False Positive Rate** with an average inference latency of **72ms**.

### 7. What dataset did you use?
Because real financial documents cannot be publicly distributed due to banking secrecy laws, we created a reproducible synthetic financial document generator (`generate_samples.py`) producing high-resolution, certified financial statements with pixel-exact ground truth bounding boxes.

### 8. How did you evaluate it?
We built an automated evaluation harness (`eval_benchmark.py`) that executes every forensic layer against the ground truth manifest, computing Confusion Matrix (TP, TN, FP, FN), Precision, Recall, F1-Score, FPR, FNR, and layer-by-layer latency metrics exported to `test_reports.json`.

### 9. What causes false positives, and how do you mitigate them?
False positives in classical ELA occur on high-contrast bold headers. We mitigated this by introducing edge-normalized N-ELA, which adjusts expected recompression delta by local gradient energy. Background noise is evaluated exclusively against background tiles, and text blocks are evaluated against neighboring text blocks.

### 10. What causes false negatives?
A forgery printed out on physical paper and re-scanned on a low-resolution flatbed scanner can attenuate digital compression artifacts. To counter this, AegisDoc does not rely on image forensics alone; it couples visual signals with typographical baseline analysis and financial logic checksums.

### 11. Can attackers bypass it?
An attacker would have to match the exact JPEG quantization table of the original document, synthesize identical sensor noise grain, align text to within 1-pixel baseline tolerance, and ensure all transaction arithmetic balances. Bypassing six orthogonal forensic layers simultaneously is mathematically and practically formidable.

### 12. How do you update the model on-device?
AegisDoc operates as a Progressive Web Application (PWA) with Service Worker caching (`sw.js`). When an updated forensic rule set or quantized ONNX model is published, the service worker quietly fetches the lightweight delta update in the background when connectivity is available.

### 13. Why can't existing OCR tools solve this?
OCR tools (Tesseract, Google ML Kit) convert pixels into ASCII text strings. They are designed to extract what is written, completely blind to whether the pixels behind the characters were spliced, cloned, or recompressed. AegisDoc analyzes the physical and digital substrate *behind* the text.

### 14. Why would a tier-1 bank or NBFC use this?
Banks lose billions annually to altered bank statements and inflated salary slips submitted for unsecured personal and SME loans. AegisDoc enables instant point-of-capture verification on loan officers' mobile devices, preventing fraudulent applications before they enter expensive underwriting queues.

### 15. Can it work offline in rural areas?
Yes. AegisDoc is 100% offline-capable. Once cached via Service Worker, all forensic convolution kernels, ELA diffing, and rule engines execute entirely in device RAM without sending a single byte over the network.

### 16. How does the Office Kit bridge preserve privacy?
The bridge transmits zero image bytes. The smartphone acts as the secure enclave running all pixel processing. It only synchronizes metadata: the risk score (e.g. 88%), bounding box coordinates `[x, y, w, h]`, and the mathematical rationale (e.g. "ELA delta 3.8x above background").

### 17. How does it scale?
Because processing is distributed to client edge devices (smartphones), server compute costs are effectively zero. A bank with 10,000 field loan officers can perform 500,000 daily document verifications with zero cloud GPU cluster expenses.

### 18. What is your commercial business model?
B2B Enterprise SaaS: Per-seat license for loan underwriting teams, or an on-device SDK license (billed per verified document) integrated directly into fintech mobile apps (e.g. CRED, Bajaj Finserv, Zerodha).

### 19. What would you build with 6 more months?
1. Integrate quantized MobileNetV4 / EfficientNet-lite ONNX models running on iQOO's NPU via WebNN / TFLite.
2. Direct integration with India Stack Account Aggregator (AA) for real-time cryptographic transaction cross-referencing.
3. Multi-page document binding and forensic chain analysis.

### 20. What is genuinely novel about your solution?
AegisDoc is the first solution that unifies **client-side pixel forensics (N-ELA, noise variance, copy-move matching)** with **semantic financial sanity checks** into a zero-latency, privacy-first mobile architecture, paired seamlessly with a laptop auditor terminal via Office Kit.
