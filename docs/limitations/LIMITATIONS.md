# Physical Forensic Limitations & Boundary Conditions

A court-defensible forensic instrument must transparently state the physical and mathematical operating boundaries beyond which its confidence degrades or becomes inconclusive (Federal Rule of Evidence 702).

---

### 1. Optical Blur & Defocus
- **Boundary Threshold**: Laplacian variance focus measure $\sigma^2_\Delta < 35.0$.
- **Failure Mode**: Optical defocus acts as a spatial low-pass filter, attenuating high-frequency DCT coefficients and sensor PRNU residuals. Spliced text inserted before blurring may appear indistinguishable from background paper.
- **Engine Protocol**: Triggers `DEGRADED_UNSUITABLE_FOR_EXAM`.

### 2. Extreme Downsampling & Resolution Loss
- **Boundary Threshold**: Image dimension $< 256 \times 256$ pixels.
- **Failure Mode**: Discrete 8x8 DCT grid alignment analysis requires a minimum of $32 \times 32 = 1,024$ blocks to achieve statistical power. Below this threshold, periodic histogram spikes cannot be distinguished from random sample variance.
- **Engine Protocol**: Triggers `DEGRADED_UNSUITABLE_FOR_EXAM`.

### 3. Multi-Generation Aggressive Recompression
- **Boundary Threshold**: JPEG Quality factor $Q < 40$ with multiple re-encoding passes.
- **Failure Mode**: Severe quantization zeroes out high-frequency AC coefficients ($F(u,v) = 0$), flattening N-ELA residuals and erasing subtle camera PRNU sensor fingerprints.
- **Engine Protocol**: Dempster-Shafer reliability discounting automatically reduces detector weights $\alpha \to 0.20$, widening uncertainty intervals $[\text{Bel}, \text{Pl}]$.

### 4. Vector PDF Direct Text Alterations without Rasterization
- **Boundary Condition**: Native vector PDF where numerical glyphs are altered via font replacement rather than bitmap splicing.
- **Countermeasure**: Handled by **Detector 5 (Codec Provenance)** via incremental update trailer parsing and **Detector 6 (Financial Logic)** via double-entry balance continuity checks.
