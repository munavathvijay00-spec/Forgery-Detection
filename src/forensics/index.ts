/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — SCIENTIFIC DOCUMENT FORGERY DETECTION ENGINE
 * ============================================================================
 * 
 * Master top-level entry point orchestrating all 7 scientific forensic detectors,
 * Dempster-Shafer evidence fusion, isotonic probability calibration, and
 * verifiable chain-of-custody audit logging.
 *
 * Designed to execute in browser client runtimes (Canvas, WebAssembly, WebGL).
 * Adheres to Federal Rule of Evidence 702 (Daubert Standard) for forensic science.
 *
 * @packageDocumentation
 * @module forensics
 * @version 4.0.0-scientific
 */

// Core types and mathematical contracts
export * from './core/types.ts';

// Core processing modules
export * from './core/image.ts';
export * from './core/dct.ts';
export * from './core/wavelet.ts';
export * from './core/hash.ts';

// 7 Scientific Detectors
export * from './detectors/compressedHistory.ts';
export * from './detectors/noiseConsistency.ts';
export * from './detectors/cloneDetection.ts';
export * from './detectors/typography.ts';
export * from './detectors/codecProvenance.ts';
export * from './detectors/financialLogic.ts';
export * from './detectors/docStructure.ts';

// Fusion, Calibration & Confidence Engine
export * from './fusion/evidenceEngine.ts';
export * from './fusion/calibration.ts';
export * from './fusion/confidence.ts';

// Benchmarking & Validation
export * from './bench/detCurve.ts';

import type {
  ForensicReport,
  DocumentAcquisitionMetrics,
  SHA256Digest,
} from './core/types.ts';
import {
  rgbaToGrayscaleFloat,
  calculateLaplacianBlurVariance,
} from './core/image.ts';
import { sha256Sync } from './core/hash.ts';
import { analyzeCompressedHistory } from './detectors/compressedHistory.ts';
import { analyzeNoiseConsistency } from './detectors/noiseConsistency.ts';
import { analyzeCloneDetection } from './detectors/cloneDetection.ts';
import { analyzeTypography } from './detectors/typography.ts';
import { analyzeCodecProvenance } from './detectors/codecProvenance.ts';
import { analyzeFinancialLogic, type ExtractedTransactionItem } from './detectors/financialLogic.ts';
import { analyzeDocStructure } from './detectors/docStructure.ts';
import { fuseDetectorEvidence } from './fusion/evidenceEngine.ts';
import { assembleForensicReport } from './fusion/confidence.ts';

/**
 * Input arguments for complete forensic pipeline analysis.
 */
export interface ForensicPipelineInput {
  /** Raw RGBA pixel data (e.g. from Canvas 2D ctx.getImageData) */
  readonly rgbaData: Uint8ClampedArray;
  /** Image width in pixels */
  readonly width: number;
  /** Image height in pixels */
  readonly height: number;
  /** Optional raw file byte stream (for JPEG marker/EXIF/PDF trailer inspection) */
  readonly rawBytes?: Uint8Array;
  /** Optional tabular transactions extracted via document parser */
  readonly transactions?: readonly ExtractedTransactionItem[];
  /** Optional opening balance for financial reconciliation */
  readonly initialBalance?: number;
}

/**
 * Executes the complete AegisDoc scientific forensic pipeline across all 7 detectors.
 */
export function executeForensicPipeline(input: ForensicPipelineInput): ForensicReport {
  const { rgbaData, width, height, rawBytes, transactions = [], initialBalance } = input;

  // 1. Calculate Document Hash and Acquisition Metrics
  const rawBytesToHash = rawBytes ?? new Uint8Array(rgbaData.buffer, rgbaData.byteOffset, rgbaData.byteLength);
  const documentHash = sha256Sync(rawBytesToHash);

  // Convert to float grayscale image
  const grayImage = rgbaToGrayscaleFloat(rgbaData, width, height);
  const laplacianBlurVariance = calculateLaplacianBlurVariance(grayImage);

  const acquisition: DocumentAcquisitionMetrics = {
    widthPx: width,
    heightPx: height,
    estimatedDpi: Math.round((Math.max(width, height) / 11.0) * 10) / 10, // heuristic assuming ~11in standard A4
    colorDepthBits: 24,
    laplacianBlurVariance,
    estimatedCompressionGeneration: 1,
    documentHash,
  };

  // 2. Execute Detector 1: Compressed History & JPEG Ghosts
  const compressedHistory = analyzeCompressedHistory(grayImage, 90);

  // 3. Execute Detector 2: Poisson-Gaussian Noise Consistency & PRNU
  const noiseConsistency = analyzeNoiseConsistency(grayImage, 32);

  // 4. Execute Detector 3: Clone & Copy-Move Keypoint Detection
  const cloneDetection = analyzeCloneDetection(grayImage, 20.0, 500);

  // 5. Execute Detector 4: Typography & Micro-structure Analysis
  const typography = analyzeTypography(grayImage, 180.0);

  // 6. Execute Detector 5: Codec & Container Provenance
  const codecProvenance = analyzeCodecProvenance(rawBytesToHash);

  // 7. Execute Detector 6: Financial Logic & Benford's Law
  const financialLogic = analyzeFinancialLogic(transactions, initialBalance);

  // 8. Execute Detector 7: Document Structure & Layout Integrity
  const docStructure = analyzeDocStructure(grayImage, 180.0);

  // 9. Dempster-Shafer Evidence Fusion across all 7 detectors
  const detectorMasses = [
    compressedHistory.evidenceMass,
    noiseConsistency.evidenceMass,
    cloneDetection.evidenceMass,
    typography.evidenceMass,
    codecProvenance.evidenceMass,
    financialLogic.evidenceMass,
    docStructure.evidenceMass,
  ];

  const fusion = fuseDetectorEvidence(detectorMasses);

  // 10. Compile Master ForensicReport
  const reportId = `AD-REP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  return assembleForensicReport({
    reportId,
    acquisition,
    detectors: {
      compressedHistory,
      noiseConsistency,
      cloneDetection,
      typography,
      codecProvenance,
      financialLogic,
      docStructure,
    },
    fusion,
  });
}
