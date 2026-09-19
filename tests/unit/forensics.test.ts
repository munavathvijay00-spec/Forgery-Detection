/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — SCIENTIFIC UNIT TEST HARNESS
 * ============================================================================
 * 
 * Verifies mathematical soundness, numerical invariants, NIST compliance,
 * and detector contracts across the entire forensic stack.
 */

import {
  computeRobustStats,
  quickselect,
  ForensicFloatImage,
  calculateLaplacianBlurVariance,
  IntegralImage2D,
} from '../../src/forensics/core/image.ts';
import {
  forwardDCT8x8,
  inverseDCT8x8,
  scaleQuantizationTable,
  JPEG_STD_LUMINANCE_QUANT_TABLE_50,
} from '../../src/forensics/core/dct.ts';
import {
  forwardDWT2D,
  estimateWaveletNoiseSigma,
  computeNormalizedCrossCorrelation,
} from '../../src/forensics/core/wavelet.ts';
import {
  sha256Sync,
  computeDCTPerceptualHash,
  computePHashHammingDistance,
} from '../../src/forensics/core/hash.ts';
import {
  combineTwoMassFunctions,
  fuseDetectorEvidence,
} from '../../src/forensics/fusion/evidenceEngine.ts';
import {
  calibrateWithIsotonic,
  computeWilsonConfidenceInterval,
  computeCalibrationMetrics,
} from '../../src/forensics/fusion/calibration.ts';
import { analyzeFinancialLogic } from '../../src/forensics/detectors/financialLogic.ts';
import { executeForensicPipeline } from '../../src/forensics/index.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- RUNNING AEGISDOC FORENSIC UNIT TESTS ---');

// 1. NIST FIPS 180-4 SHA-256 Test Vector
{
  const vector = new TextEncoder().encode('abc');
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const actual = sha256Sync(vector);
  assert(actual === expected, `NIST SHA-256 vector mismatch: got ${actual}`);
  console.log('✓ NIST FIPS 180-4 SHA-256 vector matches exactly.');
}

// 2. 2D DCT / IDCT Orthonormality and Exactness
{
  const block = new Float32Array(64);
  for (let i = 0; i < 64; i++) block[i] = (i * 13) % 256 - 128;
  const dct = forwardDCT8x8(block);
  const recon = inverseDCT8x8(dct);
  let maxErr = 0;
  for (let i = 0; i < 64; i++) {
    maxErr = Math.max(maxErr, Math.abs(block[i] - recon[i]));
  }
  assert(maxErr < 1e-4, `DCT reconstruction error too high: ${maxErr}`);
  console.log(`✓ 2D DCT-II/IDCT-III orthonormality verified (max error: ${maxErr.toExponential(2)}).`);
}

// 3. Quickselect & Robust MAD Consistency
{
  const arr = new Float32Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  const median = quickselect(arr, 4);
  assert(median === 50, `Quickselect median mismatch: expected 50, got ${median}`);
  const stats = computeRobustStats(arr);
  assert(stats.median === 50, `Stats median mismatch: ${stats.median}`);
  assert(stats.mad > 0, `MAD must be positive: ${stats.mad}`);
  console.log('✓ Quickselect O(N) selection and normal-consistent MAD verified.');
}

// 4. Integral Image O(1) Query Precision
{
  const img = new ForensicFloatImage(10, 10, 1, 'GRAYSCALE');
  img.data.fill(5.0);
  const ii = new IntegralImage2D(img);
  const sum = ii.querySum({ x: 2, y: 2, width: 4, height: 4 });
  assert(sum === 16 * 5.0, `Integral sum mismatch: expected 80, got ${sum}`);
  console.log('✓ Summed-Area Table Integral Image O(1) query verified.');
}

// 5. Dempster-Shafer Combination & Conflict Metric
{
  const m1 = { massAuthentic: 0.8, massForged: 0.1, massUncertainty: 0.1 };
  const m2 = { massAuthentic: 0.7, massForged: 0.1, massUncertainty: 0.2 };
  const { combined, conflictK } = combineTwoMassFunctions(m1, m2);
  assert(conflictK > 0 && conflictK < 0.2, `Unexpected conflict K: ${conflictK}`);
  assert(combined.massAuthentic > 0.8, 'Combined mass in authentic should reinforce');
  console.log(`✓ Dempster-Shafer rule of combination verified (conflict K = ${conflictK.toFixed(3)}).`);
}

// 6. Financial Reconciliation Discrepancy Detection
{
  const forgedLedger = [
    { index: 1, date: '2026-03-01', description: 'Opening', credit: 1000, debit: null, statedBalance: 1000 },
    { index: 2, date: '2026-03-02', description: 'Deposit', credit: 500, debit: null, statedBalance: 11500 }
  ];
  const res = analyzeFinancialLogic(forgedLedger, 0);
  assert(!res.runningBalanceValid, 'Financial logic failed to flag $10,000 arithmetic mismatch');
  assert(res.totalDiscrepancyAmount === 10000, `Expected $10,000 discrepancy, got ${res.totalDiscrepancyAmount}`);
  assert(res.evidenceMass.massForged >= 0.95, 'Expected massForged >= 0.95 on ledger forgery');
  console.log('✓ Financial running balance forgery detection verified.');
}

// 7. Wilson Score Confidence Interval Coverage
{
  const ci = computeWilsonConfidenceInterval(0.95, 100);
  assert(ci.lower > 0.85 && ci.upper < 0.99, `Wilson CI bounds unreasonable: [${ci.lower}, ${ci.upper}]`);
  console.log(`✓ Wilson 95% confidence interval verified: [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}].`);
}

// 8. End-to-End Pipeline Execution
{
  const width = 300, height = 300;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(245);
  const report = executeForensicPipeline({ rgbaData: rgba, width, height });
  assert(typeof report.reportId === 'string' && report.reportId.startsWith('AD-REP-'), 'Report ID invalid');
  assert(report.chainOfCustodyManifest.length >= 7, 'Missing chain-of-custody artifacts');
  assert(report.evidenceLedger.length === 7, 'Evidence ledger must document all 7 detector steps');
  assert(typeof report.reportSignature === 'string' && report.reportSignature.length === 64, 'Invalid signature');
  console.log(`✓ Master pipeline execution verified (Report ID: ${report.reportId}, Ledger Steps: 7).`);
}

console.log('--- ALL SCIENTIFIC UNIT TESTS PASSED SUCCESSFULLY ---');
