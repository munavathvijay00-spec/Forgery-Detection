/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — CORE TYPE DEFINITIONS & MATHEMATICAL CONTRACTS
 * ============================================================================
 * 
 * Production TypeScript definitions for a court-defensible scientific document
 * forensic system operating in browser client runtimes (WebAssembly/Canvas/WebGL).
 *
 * Design Principles:
 *  1. Non-heuristic & Empirical: All thresholds are derived from adaptive statistical
 *     estimators (MAD, box-whisker IQR, or empirical quantile calibration).
 *  2. No Monolithic "Accuracy" Scalars: Evaluation models emit Detection Error
 *     Tradeoff (DET) vectors, Brier scores, and Expected Calibration Error (ECE).
 *  3. Verifiable Chain of Custody: Every intermediate representation (residual tensors,
 *     Q-tables, RANSAC matrices) is tracked with SHA-256 digests and tamper logs.
 *  4. Epistemic Uncertainty & Conflict: Evidence fusion implements Dempster-Shafer
 *     Dempster's Rule of Combination over frame of discernment \Omega = {Auth, Forged}.
 *  5. ISO/IEC 17025 & Daubert Standard Compliance: Outputs adhere to forensic
 *     admissibility requirements (Federal Rule of Evidence 702).
 *
 * @packageDocumentation
 * @module forensics/core/types
 * @version 4.0.0-scientific
 */

// ============================================================================
// 1. PRIMITIVES, GEOMETRY & LINEAR ALGEBRA
// ============================================================================

/**
 * Branded nominal type for hex-encoded SHA-256 cryptographic digests (64 hex characters).
 * Guarantees compile-time type safety for cryptographic chain-of-custody verification.
 */
export type SHA256Digest = string & { readonly __brand: unique symbol };

/**
 * 2D Euclidean coordinate point in pixel space relative to the top-left image origin (0, 0).
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Axis-aligned bounding box defining a 2D spatial region within a document image.
 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Arbitrary convex or non-convex polygon in pixel space, defined by an ordered list of vertices.
 */
export interface Polygon {
  readonly vertices: readonly Point2D[];
}

/**
 * Homography projection matrix H in 2D projective space P^2.
 * Represented as a flat, row-major 3x3 transformation matrix:
 * [ h00, h01, h02,
 *   h10, h11, h12,
 *   h20, h21, h22 ]
 * where [x', y', 1]^T ~ H * [x, y, 1]^T.
 * 
 * @citation Hartley & Zisserman (2004), "Multiple View Geometry in Computer Vision", Cambridge Univ Press.
 */
export type HomographyMatrix = readonly [
  number, number, number,
  number, number, number,
  number, number, number
];

/**
 * 2D Affine transformation matrix in Euclidean space.
 * Represented as row-major [a, b, tx, c, d, ty] such that:
 * x' = a*x + b*y + tx
 * y' = c*x + d*y + ty
 */
export type AffineMatrix2D = readonly [
  number, number, number,
  number, number, number
];

/**
 * Statistical confidence interval with coverage probability level 1 - \alpha.
 * Computed via Wilson score interval, Student's t-distribution, or empirical bootstrap.
 */
export interface ConfidenceInterval {
  /** Lower boundary of the confidence interval */
  readonly lower: number;
  /** Upper boundary of the confidence interval */
  readonly upper: number;
  /** Confidence level (e.g. 0.95 for 95% confidence interval) */
  readonly confidenceLevel: number;
  /** Method of estimation: 'wilson' | 'bootstrap' | 'asymptotic' */
  readonly method: 'wilson' | 'bootstrap' | 'asymptotic';
}

/**
 * Statistical summary containing location, scale, and dispersion parameters.
 * Uses robust estimators resistant to extreme outlier contamination.
 */
export interface RobustDistributionStats {
  readonly median: number;
  /** Median Absolute Deviation (MAD), scaled for normal consistency: MAD * 1.4826 */
  readonly mad: number;
  readonly mean: number;
  readonly standardDeviation: number;
  readonly interquartileRange: number;
  readonly p25: number;
  readonly p75: number;
  readonly sampleCount: number;
}

// ============================================================================
// 2. CHAIN OF CUSTODY & AUDIT LEDGER ARTIFACTS
// ============================================================================

/**
 * Category of intermediate forensic evidence artifacts.
 */
export type ArtifactType =
  | 'raw_metadata'
  | 'dqt_table'
  | 'residual_map'
  | 'zscore_tensor'
  | 'ghost_energy_curve'
  | 'ransac_model'
  | 'stroke_histogram'
  | 'benford_distribution'
  | 'projection_profile'
  | 'fusion_evidence_state';

/**
 * Verifiable intermediate mathematical artifact emitted during forensic computation.
 * Required for courtroom defense, peer review, and reproducibility under Daubert standards.
 */
export interface ChainOfCustodyArtifact {
  /** Unique identifier for the artifact within the pipeline run */
  readonly id: string;
  /** Functional category */
  readonly type: ArtifactType;
  /** Cryptographic SHA-256 hash of the artifact raw byte representation */
  readonly sha256: SHA256Digest;
  /** Data format: 'application/octet-stream' | 'application/json' | 'image/x-raw-float32' */
  readonly mimeType: string;
  /** Size in bytes of the serialized artifact */
  readonly byteLength: number;
  /** Human-readable forensic description of the artifact */
  readonly description: string;
  /** Timestamp of artifact generation (ISO 8601 with millisecond precision) */
  readonly generatedAt: string;
  /** Optional metadata dictionary for dimensions, shapes, or coordinate ranges */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Immutable audit entry documenting an individual forensic inspection step.
 */
export interface EvidenceLedgerEntry {
  readonly stepIndex: number;
  readonly detectorId: DetectorIdentifier;
  readonly timestamp: string;
  readonly executionTimeMs: number;
  readonly inputArtifactHashes: readonly SHA256Digest[];
  readonly outputArtifactHashes: readonly SHA256Digest[];
  readonly anomaliesFound: number;
  readonly logLikelihoodRatio: number;
}

// ============================================================================
// 3. DETECTOR IDENTIFIERS & BASE PROTOCOLS
// ============================================================================

/**
 * Enumeration of all 7 scientific forensic detectors in the AegisDoc engine.
 */
export type DetectorIdentifier =
  | 'compressed_history'
  | 'noise_consistency'
  | 'clone_detection'
  | 'typography_analysis'
  | 'codec_provenance'
  | 'financial_logic'
  | 'doc_structure';

/**
 * Anomaly severity classification based on statistical significance.
 */
export type AnomalySeverity = 'benign' | 'suspect' | 'critical';

/**
 * Base anomaly object associated with a spatial region and statistical confidence.
 */
export interface BaseForensicAnomaly {
  /** Unique identifier for this anomaly instance */
  readonly id: string;
  /** Spatial bounding box in pixel coordinates */
  readonly bbox: BoundingBox;
  /** Statistical significance metric (e.g. z-score, p-value, or distance) */
  readonly significanceScore: number;
  /** Anomaly classification */
  readonly severity: AnomalySeverity;
  /** Daubert-standard scientific explanation of why this region violates physical expectation */
  readonly forensicRationale: string;
}

/**
 * Base contract for every detector's execution result.
 */
export interface BaseDetectorResult {
  /** Identifier of the executing detector */
  readonly detectorId: DetectorIdentifier;
  /** Execution elapsed time in milliseconds */
  readonly executionTimeMs: number;
  /** Whether the detector executed without catastrophic numerical or IO failure */
  readonly executedSuccessfully: boolean;
  /** Failure diagnostic reason if execution failed */
  readonly failureReason?: string;
  /** Calibrated evidence mass for Dempster-Shafer fusion */
  readonly evidenceMass: DetectorEvidenceMass;
  /** Intermediate chain-of-custody artifacts */
  readonly artifacts: readonly ChainOfCustodyArtifact[];
  /** Anomalies identified by this detector */
  readonly anomalies: readonly BaseForensicAnomaly[];
}

// ============================================================================
// 4. DETECTOR 1: COMPRESSED HISTORY & JPEG GHOSTS
// ============================================================================

/**
 * Single data point on a JPEG Ghost error-energy curve over candidate quality factors Q.
 *
 * @citation Farid (2009), "Exposing Digital Forgeries from JPEG Ghosts", IEEE TIFS.
 */
export interface JPEGQualityGhostPoint {
  /** Candidate primary compression quality factor Q \in [1, 100] */
  readonly quality: number;
  /** Root Mean Square (RMS) difference or MAD error between candidate recompressed block and test image */
  readonly differenceEnergy: number;
  /** Whether this quality point is a confirmed local minimum of the ghost curve */
  readonly isLocalMinimum: boolean;
}

/**
 * Spatial normalized error level analysis (N-ELA) map metadata.
 *
 * @citation Krawetz (2007), "A Picture's Worth: Digital Image Analysis and Error Level Analysis".
 */
export interface NELAMapMetadata {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 3;
  readonly globalStats: RobustDistributionStats;
  /** Recompression quality factor used for baseline comparison (typically 90 or 95) */
  readonly baseQualityFactor: number;
}

/**
 * Output of the Compressed History and JPEG Ghosting detector.
 *
 * Detects multiple compression cycles, recompression ghosts, and anomalous
 * compression artifacts across 8x8 DCT grid boundaries.
 *
 * @citation Luo, Qu, Pan, Huang (2010), "A robust detection algorithm for primary quantization table
 *           estimation in double compressed JPEG images", IEEE ICASSP.
 * @citation Farid (2009), "Exposing Digital Forgeries from JPEG Ghosts", IEEE TIFS.
 */
export interface CompressedHistoryResult extends BaseDetectorResult {
  readonly detectorId: 'compressed_history';

  /** Estimated primary compression quality factor Q_1 \in [1, 100], or null if uncompressed/lossless */
  readonly primaryQuality: number | null;
  /** Current (secondary) compression quality factor Q_2 \in [1, 100] */
  readonly secondaryQuality: number | null;
  /** Confidence in primary quality estimation [0, 1] */
  readonly primaryQualityConfidence: number;

  /** Whether periodic histogram artifacts indicate double JPEG compression */
  readonly isDoubleCompressed: boolean;
  /** Double-compression detection statistic (p-value under single-compression null hypothesis) */
  readonly doubleCompressionPValue: number;

  /** Discrete JPEG Ghost energy curve across Q \in [1..100] */
  readonly ghostCurve: readonly JPEGQualityGhostPoint[];
  /** Candidate prior compression quality factors detected as deep local minima */
  readonly detectedGhostMinima: readonly number[];

  /** Metadata for the N-ELA floating point residual map */
  readonly nelaMetadata: NELAMapMetadata;

  /**
   * Detected local DCT grid misalignment or block discontinuity anomalies.
   * Occurs when pasted content does not align to original 8x8 block boundaries.
   */
  readonly gridMisalignmentDetected: boolean;
  /** Spatial offset of the spliced grid (0..7, 0..7) relative to root image origin */
  readonly gridOffset: Point2D;
}

// ============================================================================
// 5. DETECTOR 2: NOISE CONSISTENCY & PRNU SENSOR RESIDUALS
// ============================================================================

/**
 * Poisson-Gaussian noise model parameters:
 * \sigma^2(y) = a * y + b
 * where 'a' represents photon shot noise scaling and 'b' represents read noise variance.
 *
 * @citation Foi, Trimeche, Katkovnik, Egiazarian (2008), "Practical Poisson-Gaussian Noise Parameter
 *           Estimation and Hexagonal Bilateral Filtering in Single Images", IEEE TIP.
 */
export interface PoissonGaussianNoiseModel {
  /** Shot noise slope parameter 'a' >= 0 */
  readonly a: number;
  /** Thermal/readout noise variance parameter 'b' >= 0 */
  readonly b: number;
  /** Goodness-of-fit coefficient of determination R^2 \in [0, 1] */
  readonly rSquared: number;
  /** Standard error of the estimated parameters */
  readonly standardError: number;
}

/**
 * Local noise variance evaluation tile.
 */
export interface NoiseTileEvaluation {
  readonly bbox: BoundingBox;
  readonly meanLuminance: number;
  readonly observedVariance: number;
  readonly expectedVariance: number;
  /** Standardized studentized residual: (observed - expected) / SE */
  readonly residualZScore: number;
  /** Whether the tile's noise profile deviates significantly (p < 0.01) from the global model */
  readonly isOutlier: boolean;
}

/**
 * Output of the Noise Consistency and Sensor Pattern Noise detector.
 *
 * @citation Foi et al. (2008), IEEE TIP.
 * @citation Lukas, Fridrich, Goljan (2006), "Digital Camera Identification From Sensor Pattern Noise", IEEE TIFS.
 * @citation Lyu, Pan, Farid (2014), "Exposing Image Splicing with Inconsistent Local Noise Levels", IEEE TIFS.
 */
export interface NoiseConsistencyResult extends BaseDetectorResult {
  readonly detectorId: 'noise_consistency';

  /** Global estimated Poisson-Gaussian noise model across homogeneous document regions */
  readonly globalModel: PoissonGaussianNoiseModel;

  /** Robust distribution of local noise standard deviations */
  readonly noiseDistribution: RobustDistributionStats;

  /** Spatial grid of local noise tile estimates */
  readonly tileEvaluations: readonly NoiseTileEvaluation[];

  /** Percentage of document area exhibiting inconsistent noise statistics (0..100%) */
  readonly anomalousAreaFraction: number;

  /**
   * Photo-Response Non-Uniformity (PRNU) wavelet high-frequency residual cross-correlation.
   * Measures whether all regions share a single sensor physical substrate.
   */
  readonly prnuCorrelationCoefficient: number;
  /** Whether the PRNU residual is coherent across document quadrants */
  readonly prnuCoherent: boolean;
}

// ============================================================================
// 6. DETECTOR 3: CLONE & COPY-MOVE DETECTION
// ============================================================================

/**
 * Matched pair of interest keypoints indicating potential duplicate/cloned imagery.
 */
export interface KeypointMatchPair {
  readonly sourcePoint: Point2D;
  readonly targetPoint: Point2D;
  /** Euclidean distance in feature descriptor space (e.g. Hamming distance for ORB) */
  readonly descriptorDistance: number;
  /** Spatial Euclidean distance in image plane (must exceed minimum distance threshold) */
  readonly spatialDistance: number;
}

/**
 * Spatial cluster of verified keypoint matches sharing a consistent geometric transformation.
 *
 * @citation Rublee, Rabaud, Konolige, Bradski (2011), "ORB: An efficient alternative to SIFT or SURF", ICCV.
 * @citation Fischler & Bolles (1981), "RANSAC: A Paradigm for Model Fitting", CACM.
 */
export interface CloneCluster {
  readonly clusterId: string;
  readonly matches: readonly KeypointMatchPair[];
  readonly sourceRegion: Polygon;
  readonly targetRegion: Polygon;
  /** Affine or homography matrix relating source region to target region */
  readonly transformationMatrix: AffineMatrix2D | HomographyMatrix;
  /** RANSAC consensus inlier count */
  readonly inlierCount: number;
  /** Geometric fitting residual error (Root Mean Square Error in pixels) */
  readonly rmse: number;
}

/**
 * Zernike complex moment descriptor of order n and repetition m.
 * Used for scale/rotation invariant seal, stamp, and signature verification.
 *
 * @citation Khotanzad & Hong (1990), "Invariant image recognition by Zernike moments", IEEE TPAMI.
 */
export interface ZernikeMomentCoefficient {
  /** Order n (0 <= n <= 8) */
  readonly n: number;
  /** Repetition m (-n <= m <= n, n - |m| is even) */
  readonly m: number;
  /** Real component of moment */
  readonly real: number;
  /** Imaginary component of moment */
  readonly imag: number;
  /** Invariant magnitude: sqrt(real^2 + imag^2) */
  readonly magnitude: number;
}

/**
 * Output of the Clone and Copy-Move detector.
 */
export interface CloneDetectionResult extends BaseDetectorResult {
  readonly detectorId: 'clone_detection';

  /** Total number of extracted feature keypoints */
  readonly totalKeypointsExtracted: number;
  /** Total raw pairwise descriptor matches found */
  readonly candidateMatchCount: number;

  /** Clusters confirmed through RANSAC spatial consensus */
  readonly verifiedClusters: readonly CloneCluster[];

  /**
   * Zernike moment invariant analysis for circular stamps, embossed seals, and bank logos.
   * If identical seals exist with non-physical zero-variance moments, indicates digital copy-paste.
   */
  readonly circularSealsAnalyzed: number;
  readonly sealDuplicationDetected: boolean;
}

// ============================================================================
// 7. DETECTOR 4: TYPOGRAPHY, STROKE WIDTH & RENDER PROVENANCE
// ============================================================================

/**
 * Linear regression parameters for a single detected text line baseline.
 * Baseline equation: y = slope * x + intercept
 */
export interface TextLineBaseline {
  readonly lineIndex: number;
  readonly boundingBox: BoundingBox;
  readonly slope: number;
  readonly intercept: number;
  /** Goodness-of-fit R^2 of text baseline regression */
  readonly rSquared: number;
  /** Maximum baseline vertical deviation across characters (in pixels) */
  readonly maxVerticalDeviationPx: number;
  /** Character glyph count on this line */
  readonly glyphCount: number;
  /** Indices of glyphs flagged as vertical outliers (floating or misaligned characters) */
  readonly outlierGlyphIndices: readonly number[];
}

/**
 * Stroke Width Transform (SWT) statistical distribution for a text block.
 *
 * @citation Epshtein, Ofek, Wexler (2010), "Detecting text in natural scenes with stroke width transform", CVPR.
 */
export interface StrokeWidthDistribution {
  readonly medianStrokeWidth: number;
  readonly strokeWidthVariance: number;
  readonly histogramBins: readonly number[];
  /** Kullback-Leibler (KL) divergence compared to the document modal stroke distribution */
  readonly klDivergenceFromModal: number;
}

/**
 * Font rendering antialiasing mode.
 */
export type AntialiasingType =
  | 'subpixel_rgb'     // ClearType / LCD horizontal RGB subpixel rendering
  | 'subpixel_bgr'     // Inverted BGR subpixel rendering
  | 'grayscale'        // Standard gray antialiasing (Quartz / FreeType default)
  | 'bilevel_bitmap'   // 1-bit monochrome (aliased, no smoothing)
  | 'inconsistent';    // Mixed rendering within a single sentence or numerical field

/**
 * Output of the Typography & Micro-structure detector.
 */
export interface TypographyResult extends BaseDetectorResult {
  readonly detectorId: 'typography_analysis';

  /** Extracted line baselines with RANSAC robust regression */
  readonly baselines: readonly TextLineBaseline[];

  /** Number of text lines exhibiting anomalous angle/slope deviations relative to document dominant angle */
  readonly anomalousLineCount: number;

  /** Dominant document font rendering engine profile */
  readonly dominantAntialiasing: AntialiasingType;

  /**
   * Glyph-level stroke width and kerning evaluations.
   * Flagged if spliced text uses different font weights or kerning tracking.
   */
  readonly strokeWidthDistributions: readonly StrokeWidthDistribution[];
  readonly kerningAnomaliesFound: number;

  /**
   * Detected anomalous glyphs (e.g. altered digits in bank balances or dates).
   */
  readonly alteredGlyphCandidates: readonly BaseForensicAnomaly[];
}

// ============================================================================
// 8. DETECTOR 5: CODEC & CONTAINER PROVENANCE
// ============================================================================

/**
 * Known encoder quantization signature match.
 */
export interface QuantizationTableMatch {
  readonly identifiedSoftware: string;
  readonly confidence: number;
  readonly estimatedQuality: number;
  readonly lumaTable: readonly number[]; // 64 DCT coefficients
  readonly chromaTable: readonly number[]; // 64 DCT coefficients
}

/**
 * PDF structural trailer and incremental update record.
 *
 * @citation ISO 32000-2:2020 Document Management — Portable Document Format — Part 2.
 */
export interface PDFIncrementalUpdate {
  readonly updateIndex: number;
  readonly byteOffset: number;
  readonly trailerDictionaryHash: SHA256Digest;
  readonly modifiedObjectIds: readonly number[];
  readonly isLinearized: boolean;
  readonly timestamp?: string;
}

/**
 * Output of Codec & Container Provenance detector.
 *
 * Inspects low-level binary headers, JFIF/EXIF/XMP streams, PDF trailers,
 * and quantization table (DQT) signatures.
 */
export interface CodecProvenanceResult extends BaseDetectorResult {
  readonly detectorId: 'codec_provenance';

  readonly containerMimeType: 'image/jpeg' | 'image/png' | 'image/tiff' | 'application/pdf' | 'image/webp' | 'unknown';

  /** Quantization table identification against database of known encoders (Photoshop, iOS, Android, Canon, etc.) */
  readonly quantizationMatch: QuantizationTableMatch | null;

  /** Software signature identified in metadata tags (e.g. "Adobe Photoshop 24.1", "Canva", "Preview") */
  readonly reportedSoftwareSignature: string | null;

  /** Whether EXIF and XMP metadata show conflicting creation or modification timestamps */
  readonly temporalDiscrepancyFound: boolean;
  readonly temporalDeltaSeconds: number | null;

  /** For PDF documents: incremental revision and trailer analysis */
  readonly pdfUpdates: readonly PDFIncrementalUpdate[];
  /** True if PDF contains multiple body updates overwriting original form text or balance streams */
  readonly pdfHasSuspiciousOverwrites: boolean;

  /**
   * Embedded thumbnail mismatch detection.
   * Spliced documents often have full-size image modified while embedded EXIF thumbnail retains original unaltered view.
   */
  readonly thumbnailAnalyzed: boolean;
  readonly thumbnailDiscrepancyDetected: boolean;
  readonly thumbnailSSIM: number | null; // Structural Similarity Index Measure [0, 1]
}

// ============================================================================
// 9. DETECTOR 6: FINANCIAL & LOGICAL CONSISTENCY
// ============================================================================

/**
 * Financial line-item transaction reconciliation record.
 */
export interface TransactionReconciliation {
  readonly transactionIndex: number;
  readonly date: string;
  readonly description: string;
  readonly creditAmount: number | null;
  readonly debitAmount: number | null;
  readonly statedBalance: number;
  readonly computedBalance: number;
  readonly discrepancy: number;
  readonly isValid: boolean;
}

/**
 * Benford's Law first-digit goodness-of-fit distribution test.
 *
 * @citation Benford (1938), "The Law of Anomalous Numbers", Proc. Amer. Phil. Soc.
 * @citation Nigrini (2012), "Benford's Law: Applications for Forensic Accounting", Wiley.
 */
export interface BenfordAnalysisResult {
  /** Observed frequencies for digits 1 through 9 */
  readonly observedFrequencies: readonly [number, number, number, number, number, number, number, number, number];
  /** Theoretical Benford frequencies: log10(1 + 1/d) */
  readonly theoreticalFrequencies: readonly [number, number, number, number, number, number, number, number, number];
  /** Pearson Chi-Square test statistic \chi^2 */
  readonly chiSquareStatistic: number;
  /** Degrees of freedom (always 8 for first digit) */
  readonly degreesOfFreedom: 8;
  /** p-value: probability of observing such deviation under Benford null hypothesis */
  readonly pValue: number;
  /** Sample size (number of numerical amounts evaluated) */
  readonly sampleCount: number;
  /** Whether digits violate natural distribution at \alpha = 0.01 */
  readonly violatesBenfordLaw: boolean;
}

/**
 * Output of Financial Logic & Transactional Consistency detector.
 */
export interface FinancialLogicResult extends BaseDetectorResult {
  readonly detectorId: 'financial_logic';

  /** Monotonic balance progression test: Balance(t) = Balance(t-1) + Credit(t) - Debit(t) */
  readonly runningBalanceValid: boolean;
  readonly reconciliations: readonly TransactionReconciliation[];
  readonly totalDiscrepancyAmount: number;

  /** Transaction chronology and calendar validation */
  readonly dateMonotonicityValid: boolean;
  readonly dateAnomalies: readonly string[];

  /** Benford's Law digit distribution statistical test */
  readonly benfordTest: BenfordAnalysisResult;

  /**
   * Round number anomaly detection.
   * Human fraudsters generate unnatural proportions of round numbers (ending in .00 or 000).
   */
  readonly roundNumberRatio: number;
  readonly roundNumberAnomalyZScore: number;

  /** Duplicate transaction or reference code detection */
  readonly duplicateTransactionIdentifiers: readonly string[];
}

// ============================================================================
// 10. DETECTOR 7: DOCUMENT STRUCTURE & LAYOUT INTEGRITY
// ============================================================================

/**
 * Column and table alignment projection profile.
 *
 * @citation O'Gorman (1993), "The Document Spectrum (Docstrum) for Structural Page Analysis", IEEE TPAMI.
 */
export interface StructuralProjectionProfile {
  readonly orientation: 'horizontal' | 'vertical';
  readonly projectionHistogram: readonly number[];
  readonly dominantIntervalPx: number;
  readonly periodicGridConfidence: number;
}

/**
 * Output of Document Structure & Layout Alignment detector.
 */
export interface DocStructureResult extends BaseDetectorResult {
  readonly detectorId: 'doc_structure';

  /** Vertical and horizontal projection profiles */
  readonly verticalProfile: StructuralProjectionProfile;
  readonly horizontalProfile: StructuralProjectionProfile;

  /** Gutter whitespace consistency across tabular columns */
  readonly gutterSpacingUniformity: number; // [0, 1]

  /**
   * Table border continuity and pixel rasterization alignment.
   * Detects interrupted vector lines or pasted text boxes that occlude borders.
   */
  readonly borderContinuityScore: number; // [0, 1]
  readonly brokenBorderLocations: readonly BoundingBox[];

  /** Known institutional template matching (if bank or utility provider layout matches known ground truth) */
  readonly recognizedTemplateId: string | null;
  readonly templateAlignmentDistance: number | null;

  /** Layout structural anomalies */
  readonly layoutViolations: readonly BaseForensicAnomaly[];
}

// ============================================================================
// 11. DEMPSTER-SHAFER EVIDENCE FUSION & EPISTEMIC UNCERTAINTY
// ============================================================================

/**
 * Frame of Discernment \Omega for document forensic classification:
 * \Omega = { AUTHENTIC, FORGED }
 *
 * Power set 2^\Omega has 4 hypotheses:
 *  - \emptyset: Empty set (impossibility)
 *  - {AUTHENTIC}: Evidence strictly supporting authentic origin
 *  - {FORGED}: Evidence strictly supporting forgery/tampering
 *  - {AUTHENTIC, FORGED} (\Theta): Total epistemic ignorance / uncommitted belief
 *
 * @citation Dempster (1967), "Upper and lower probabilities induced by a multivalued mapping", Ann. Math. Statist.
 * @citation Shafer (1976), "A Mathematical Theory of Evidence", Princeton Univ Press.
 */
export interface DempsterShaferMassFunction {
  /** Mass assigned to authentic hypothesis m({A}) \in [0, 1] */
  readonly massAuthentic: number;
  /** Mass assigned to forged/altered hypothesis m({F}) \in [0, 1] */
  readonly massForged: number;
  /** Mass assigned to epistemic uncertainty / ignorance m({A, F}) \in [0, 1] */
  readonly massUncertainty: number;
}

/**
 * Calibrated evidence mass emitted by an individual detector.
 * Accounts for detector-specific false positive rates and input document degradation.
 */
export interface DetectorEvidenceMass extends DempsterShaferMassFunction {
  readonly detectorId: DetectorIdentifier;
  /** Dynamic reliability weight \alpha \in [0, 1] based on image quality/resolution */
  readonly reliabilityWeight: number;
  /** Log-likelihood ratio: ln( P(evidence | Forged) / P(evidence | Authentic) ) */
  readonly logLikelihoodRatio: number;
}

/**
 * Fused belief and plausibility intervals for a forensic hypothesis.
 * In Dempster-Shafer theory:
 *  Belief Bel(A) = \sum_{B \subseteq A} m(B) (lower bound of probability)
 *  Plausibility Pl(A) = \sum_{B \cap A \neq \emptyset} m(B) (upper bound of probability)
 *  Bel(A) <= P(A) <= Pl(A)
 */
export interface BeliefPlausibilityInterval {
  readonly belief: number;
  readonly plausibility: number;
  readonly intervalWidth: number; // Pl - Bel (represents state of uncommitted knowledge)
}

/**
 * Complete state of the Dempster-Shafer evidence fusion engine after combining all detectors.
 */
export interface FusionEvidenceState {
  /** Fused basic probability assignment (BPA) */
  readonly combinedMass: DempsterShaferMassFunction;

  /** Conflict metric K \in [0, 1] between conflicting detector evidence sources */
  readonly conflictMassK: number;

  /**
   * Whether conflict K exceeds the critical coherence threshold (K >= 0.7).
   * High conflict indicates contradictory evidence (e.g. one detector claims 99% authentic, another 99% forged).
   */
  readonly isHighConflict: boolean;

  /** Belief and plausibility intervals for each hypothesis */
  readonly authenticInterval: BeliefPlausibilityInterval;
  readonly forgedInterval: BeliefPlausibilityInterval;

  /**
   * Pignistic probability transformation BetP(Forged) for risk-minimizing decision making:
   * BetP(F) = m(F) + m({A, F}) / 2
   */
  readonly pignisticProbabilityForged: number;

  /** Individual detector masses contributing to this combination */
  readonly inputMasses: readonly DetectorEvidenceMass[];
}

// ============================================================================
// 12. PROBABILITY CALIBRATION & METRICS
// ============================================================================

/**
 * Platt scaling parameters for parametric sigmoid probability calibration:
 * P(Forged | s) = 1 / (1 + exp(A * s + B))
 *
 * @citation Platt (1999), "Probabilistic Outputs for Support Vector Machines".
 */
export interface PlattCalibrationParameters {
  readonly slopeA: number;
  readonly interceptB: number;
}

/**
 * Isotonic regression non-parametric calibration bin.
 *
 * @citation Zadrozny & Elkan (2002), "Transforming classifier scores into accurate multiclass probability estimates", KDD.
 */
export interface IsotonicCalibrationBin {
  readonly scoreLower: number;
  readonly scoreUpper: number;
  readonly calibratedProbability: number;
  readonly sampleCount: number;
}

/**
 * Calibration evaluation metrics for validation reporting.
 *
 * @citation Guo, Pleiss, Sun, Weinberger (2017), "On Calibration of Modern Neural Networks", ICML.
 */
export interface CalibrationEvaluationMetrics {
  /** Expected Calibration Error (ECE) across 10-15 probability bins */
  readonly expectedCalibrationError: number;
  /** Maximum Calibration Error (MCE) - worst-case bin divergence */
  readonly maximumCalibrationError: number;
  /** Brier score: mean squared error of probabilistic predictions (0 is perfect) */
  readonly brierScore: number;
  /** Cross-entropy / negative log-likelihood (NLL) */
  readonly negativeLogLikelihood: number;
}

/**
 * Detection Error Tradeoff (DET) operating point.
 *
 * @citation Martin et al. (1997), "The DET Curve in Assessment of Detection Task Performance", Eurospeech.
 */
export interface DETOperatingPoint {
  /** Decision threshold on posterior score */
  readonly threshold: number;
  /** False Positive Rate: FPR = FP / (FP + TN) */
  readonly falsePositiveRate: number;
  /** False Negative Rate (Miss Rate): FNR = FN / (FN + TP) */
  readonly falseNegativeRate: number;
}

// ============================================================================
// 13. FORENSIC REPORT & VERDICT
// ============================================================================

/**
 * Definitive forensic determination adhering to legal standards of evidence.
 */
export type ForensicVerdict =
  | 'AUTHENTIC'                     // Bel(Auth) high, Bel(Forged) near zero, K low
  | 'ALTERED_TAMPERED'              // Bel(Forged) high, statistically significant physical anomalies
  | 'INCONCLUSIVE_INSUFFICIENT_EVIDENCE' // High uncertainty m({A,F}) or unresolvable conflict K >= 0.70
  | 'DEGRADED_UNSUITABLE_FOR_EXAM'; // Quality indicators preclude reliable forensic examination

/**
 * Document physical and technical acquisition metrics.
 */
export interface DocumentAcquisitionMetrics {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly estimatedDpi: number;
  readonly colorDepthBits: number;
  /** Laplacian variance blur index (> 100 indicates sharp document, < 30 indicates severe blur) */
  readonly laplacianBlurVariance: number;
  /** Compression generation count (1 = first gen, 2+ = multi-generation copy) */
  readonly estimatedCompressionGeneration: number;
  /** Cryptographic SHA-256 of the raw document file input */
  readonly documentHash: SHA256Digest;
}

/**
 * Complete, court-defensible forensic analysis report for a document.
 */
export interface ForensicReport {
  /** Unique report identification UUID */
  readonly reportId: string;
  /** ISO 8601 generation timestamp */
  readonly timestamp: string;
  /** Engine version */
  readonly engineVersion: string;

  /** Document acquisition and image quality metrics */
  readonly acquisition: DocumentAcquisitionMetrics;

  /** Execution results from all 7 detectors */
  readonly detectors: {
    readonly compressedHistory: CompressedHistoryResult;
    readonly noiseConsistency: NoiseConsistencyResult;
    readonly cloneDetection: CloneDetectionResult;
    readonly typography: TypographyResult;
    readonly codecProvenance: CodecProvenanceResult;
    readonly financialLogic: FinancialLogicResult;
    readonly docStructure: DocStructureResult;
  };

  /** Dempster-Shafer evidence fusion state */
  readonly fusion: FusionEvidenceState;

  /** Calibrated posterior probability of forgery P(Forged | E) with 95% confidence interval */
  readonly calibratedForgeryProbability: number;
  readonly confidenceInterval95: ConfidenceInterval;

  /** Final forensic verdict */
  readonly verdict: ForensicVerdict;

  /** Complete cryptographic chain-of-custody artifacts manifest */
  readonly chainOfCustodyManifest: readonly ChainOfCustodyArtifact[];

  /** Immutable step-by-step evidence ledger */
  readonly evidenceLedger: readonly EvidenceLedgerEntry[];

  /** Digital cryptographic signature over the report payload (hex-encoded) */
  readonly reportSignature: string;
}

// ============================================================================
// 14. EXPORTED CONSTANTS & THRESHOLD PROTOCOLS
// ============================================================================

/**
 * Default statistical parameters.
 * Note: These are baseline reference priors; detectors dynamically adapt using MAD/quantiles.
 */
export const FORENSIC_CONSTANTS = {
  /** Scale factor to convert MAD to standard deviation for normal distributions: 1 / \Phi^-1(3/4) */
  NORMAL_CONSISTENT_MAD_SCALE: 1.482602218505602,

  /** Conflict mass K threshold above which Dempster's combination rule becomes unstable */
  CRITICAL_CONFLICT_THRESHOLD_K: 0.70,

  /** Minimum Laplacian blur variance required for reliable high-frequency analysis */
  MIN_LAPLACIAN_VARIANCE_FOR_EXAM: 35.0,

  /** Minimum image dimension (pixels) required for reliable 8x8 DCT grid analysis */
  MIN_DIMENSION_PX_FOR_DCT: 256,

  /** Theoretical first-digit probabilities under Benford's Law (indices 0..8 correspond to digits 1..9) */
  BENFORD_THEORETICAL_PROBABILITIES: [
    0.30103, // 1
    0.17609, // 2
    0.12494, // 3
    0.09691, // 4
    0.07918, // 5
    0.06695, // 6
    0.05799, // 7
    0.05115, // 8
    0.04576, // 9
  ] as const,
} as const;
