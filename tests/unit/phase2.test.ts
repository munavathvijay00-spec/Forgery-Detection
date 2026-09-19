/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — PHASE 2 SCIENTIFIC UNIT TESTS
 * ============================================================================
 *
 * Verifies all 8 production Phase 2 scientific modules against synthetic
 * calibration matrices and controlled perturbation test vectors.
 *
 * Designed to execute cleanly in native Node.js runtime:
 *   node --experimental-strip-types tests/unit/phase2.test.ts
 */

import assert from "node:assert/strict";

// Module A: Quality Estimation
import { estimateOriginalJPEGQuality } from "../../src/forensics/qualityEstimation.ts";

// Module B: Adaptive ELA
import { computeAdaptiveELA } from "../../src/forensics/adaptiveELA.ts";

// Module C: Adaptive Noise Analysis
import { analyzeAdaptiveNoise } from "../../src/forensics/adaptiveNoiseAnalysis.ts";

// Module D: Keypoint Clone Detection
import { detectKeypointClones } from "../../src/forensics/keypointCloneDetection.ts";

// Module E: Robust Typography
import { analyzeRobustTypography } from "../../src/forensics/robustTypography.ts";

// Module F: Codec Provenance
import { analyzeCodecProvenance } from "../../src/forensics/codecProvenance.ts";

// Module G: Enriched Financial Logic
import { analyzeEnrichedFinancialLogic } from "../../src/forensics/enrichedFinancialLogic.ts";

// Module H: Dempster-Shafer Fusion
import {
  combinePairwiseDempster,
  fuseDempsterShafer
} from "../../src/forensics/dempsterShaferFusion.ts";

console.log("======================================================================");
console.log("       STARTING AEGISDOC PHASE 2 SCIENTIFIC UNIT TESTS                ");
console.log("======================================================================");

// ----------------------------------------------------------------------------
// TEST 1: Module A — Quality Estimation
// ----------------------------------------------------------------------------
console.log("\n[Test 1] Module A: qualityEstimation.ts");
{
  const width = 64;
  const height = 64;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Generate synthetic structured document patch with known frequency content
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = Math.round(128 + 60 * Math.sin(x * 0.25) * Math.cos(y * 0.25));
      pixels[idx] = v;
      pixels[idx + 1] = v;
      pixels[idx + 2] = v;
      pixels[idx + 3] = 255;
    }
  }

  const result = estimateOriginalJPEGQuality(pixels, width, height, 4);
  console.log(`  Estimated Q: ${result.estimatedQ}, 95% CI: [${result.ci[0]}, ${result.ci[1]}], Confidence: ${result.confidence}`);

  assert.ok(result.estimatedQ >= 50 && result.estimatedQ <= 98, "Estimated Q must be within [50..98]");
  assert.ok(result.ci[0] <= result.ci[1], "CI lower bound must be <= upper bound");
  assert.ok(result.confidence >= 0.0 && result.confidence <= 1.0, "Confidence must be normalized [0..1]");
  console.log("  ✓ Module A Quality Estimation passed.");
}

// ----------------------------------------------------------------------------
// TEST 2: Module B — Adaptive ELA
// ----------------------------------------------------------------------------
console.log("\n[Test 2] Module B: adaptiveELA.ts");
{
  const width = 64;
  const height = 64;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Background smooth substrate
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    pixels[idx] = 240;
    pixels[idx + 1] = 240;
    pixels[idx + 2] = 240;
    pixels[idx + 3] = 255;
  }

  // Inject a high-frequency spliced square in the center [20..44, 20..44]
  for (let y = 20; y < 44; y++) {
    for (let x = 20; x < 44; x++) {
      const idx = (y * width + x) * 4;
      const checker = ((x + y) % 2 === 0) ? 20 : 220;
      pixels[idx] = checker;
      pixels[idx + 1] = checker;
      pixels[idx + 2] = checker;
    }
  }

  const result = computeAdaptiveELA(pixels, width, height, 85, 4);
  console.log(`  Max Z-Score: ${result.maxZScore}, Anomaly Regions: ${result.anomalyRegions.length}, Confidence: ${result.confidence}`);

  assert.ok(result.zMap.length === width * height, "zMap must cover all pixels");
  assert.ok(result.maxZScore > 3.0, "Spliced region must produce Z-score > 3.0");
  assert.ok(result.anomalyRegions.length >= 1, "Spliced region must be extracted into at least 1 bounding box");
  console.log("  ✓ Module B Adaptive ELA passed.");
}

// ----------------------------------------------------------------------------
// TEST 3: Module C — Adaptive Noise Analysis
// ----------------------------------------------------------------------------
console.log("\n[Test 3] Module C: adaptiveNoiseAnalysis.ts");
{
  const width = 64;
  const height = 64;
  const luma = new Float32Array(width * height);

  // Background uniform paper
  luma.fill(245.0);

  // Inject localized noise artifact in [16..40, 16..40]
  for (let y = 16; y < 40; y++) {
    for (let x = 16; x < 40; x++) {
      luma[y * width + x] += (Math.random() - 0.5) * 45.0;
    }
  }

  const result = analyzeAdaptiveNoise(luma, width, height);
  console.log(`  Global Sigma: ${result.globalSigma}, Wavelet Levels: ${result.nlf.sigma.length}, Anomalies: ${result.anomalyRegions.length}`);

  assert.ok(result.laplacianMap.length === width * height, "Laplacian map size match");
  assert.ok(result.nlf.sigma.length > 0, "Wavelet subbands estimated");
  assert.ok(result.globalSigma >= 0, "Global sigma must be non-negative");
  assert.ok(result.anomalyRegions.length >= 1, "Injected noise cluster must be localized");
  console.log("  ✓ Module C Adaptive Noise Analysis passed.");
}

// ----------------------------------------------------------------------------
// TEST 4: Module D — Keypoint Clone Detection
// ----------------------------------------------------------------------------
console.log("\n[Test 4] Module D: keypointCloneDetection.ts");
{
  const width = 120;
  const height = 80;
  const gray = new Float32Array(width * height).fill(240);

  // Draw two identical patterned star/cross shapes at (20, 20) and (75, 20)
  const drawPattern = (ox: number, oy: number) => {
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (Math.abs(dx) === Math.abs(dy) || dx === 0 || dy === 0) {
          const cy = oy + dy;
          const cx = ox + dx;
          if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
            gray[cy * width + cx] = 20;
          }
        }
      }
    }
  };

  drawPattern(25, 30);
  drawPattern(85, 30);

  const result = detectKeypointClones(gray, width, height);
  console.log(`  Detected Keypoints: ${result.keypointCount}, Matches: ${result.matchCount}, Clusters: ${result.clusters.length}`);

  assert.ok(result.keypointCount > 0, "FAST keypoints should be extracted from patterned features");
  assert.ok(typeof result.confidence === "number", "Confidence metric reported");
  console.log("  ✓ Module D Keypoint Clone Detection passed.");
}

// ----------------------------------------------------------------------------
// TEST 5: Module E — Robust Typography
// ----------------------------------------------------------------------------
console.log("\n[Test 5] Module E: robustTypography.ts");
{
  const width = 120;
  const height = 80;
  const gray = new Float32Array(width * height).fill(250);

  // Render 3 synthetic rows of text characters
  const rowY = [15, 35, 55];
  for (let r = 0; r < rowY.length; r++) {
    const y0 = rowY[r];
    for (let c = 0; c < 6; c++) {
      const x0 = 15 + c * 16;
      // Draw letter glyph
      for (let dy = 0; dy < 10; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          if (dx === 0 || dx === 7 || dy === 0 || dy === 5) {
            // Spliced character in row 1 (index 1), char 4: shift down by 6px
            const shiftY = (r === 1 && c === 4) ? 6 : 0;
            const py = y0 + dy + shiftY;
            const px = x0 + dx;
            if (px < width && py < height) {
              gray[py * width + px] = 20;
            }
          }
        }
      }
    }
  }

  const result = analyzeRobustTypography(gray, width, height, 180.0);
  console.log(`  Segmented Lines: ${result.textLines.length}, CW-VAR Anomalies: ${result.cwvarAnomalies.length}`);

  assert.ok(result.textLines.length >= 2, "Should segment at least 2 text lines");
  assert.ok(typeof result.confidence === "number", "Confidence must be defined");
  console.log("  ✓ Module E Robust Typography passed.");
}

// ----------------------------------------------------------------------------
// TEST 6: Module F — Codec Provenance
// ----------------------------------------------------------------------------
console.log("\n[Test 6] Module F: codecProvenance.ts");
{
  // Construct synthetic JPEG stream with DQT marker (0xFFDB) and Photoshop APP1 tag
  const rawBytes = new Uint8Array(256);
  rawBytes[0] = 0xff;
  rawBytes[1] = 0xd8; // SOI

  // DQT marker: 0xFFDB
  rawBytes[2] = 0xff;
  rawBytes[3] = 0xdb;
  rawBytes[4] = 0x00;
  rawBytes[5] = 0x43; // length 67 (2 + 1 + 64)
  rawBytes[6] = 0x00; // table ID 0
  // Photoshop Q80 prefix: [3, 2, 2, 3, 5, 8, 10, 12]
  const psPrefix = [3, 2, 2, 3, 5, 8, 10, 12];
  for (let i = 0; i < 8; i++) {
    rawBytes[7 + i] = psPrefix[i];
  }

  // APP1 marker: 0xFFE1 containing "Photoshop" and XMP history
  rawBytes[71] = 0xff;
  rawBytes[72] = 0xe1;
  rawBytes[73] = 0x00;
  rawBytes[74] = 0x50; // length
  const app1Str = "Exif..Software: Adobe Photoshop CC..stEvt:action=\"saved\"..";
  for (let i = 0; i < app1Str.length; i++) {
    rawBytes[75 + i] = app1Str.charCodeAt(i);
  }

  const result = analyzeCodecProvenance(rawBytes);
  console.log(`  Identified Editor: "${result.editorFingerprint.editor}", Distance: ${result.editorFingerprint.distance}`);
  console.log(`  Double Compression: ${result.doubleCompression.detected}, Confidence: ${result.confidence}`);

  assert.ok(result.editorFingerprint.editor.includes("Photoshop"), "Must identify Adobe Photoshop from DQT signature");
  assert.strictEqual(result.editorFingerprint.distance, 0, "Distance to Photoshop Q80 must be exactly 0");
  assert.ok(result.confidence > 0.85, "Confidence should be elevated due to editor presence");
  console.log("  ✓ Module F Codec Provenance passed.");
}

// ----------------------------------------------------------------------------
// TEST 7: Module G — Enriched Financial Logic
// ----------------------------------------------------------------------------
console.log("\n[Test 7] Module G: enrichedFinancialLogic.ts");
{
  // Test case A: Legitimate balanced ledger
  const legitimateTx = [
    { index: 0, date: "2026-03-01", description: "Opening Balance", credit: null, debit: null, statedBalance: 5000.00 },
    { index: 1, date: "2026-03-02", description: "Client Wire", credit: 1420.50, debit: null, statedBalance: 6420.50 },
    { index: 2, date: "2026-03-04", description: "Cloud Hosting", credit: null, debit: 120.30, statedBalance: 6300.20 },
    { index: 3, date: "2026-03-05", description: "Consulting Fee", credit: 2850.00, debit: null, statedBalance: 9150.20 }
  ];

  const legitResult = analyzeEnrichedFinancialLogic(legitimateTx, 5000.00);
  assert.strictEqual(legitResult.ledgerBalanced, true, "Legitimate ledger must be balanced");
  assert.strictEqual(legitResult.rowAnomalies.length, 0, "Zero anomalies expected on legitimate ledger");

  // Test case B: Forged altered balance
  const forgedTx = [
    { index: 0, date: "2026-03-01", description: "Opening Balance", credit: null, debit: null, statedBalance: 5000.00 },
    { index: 1, date: "2026-03-02", description: "Client Wire", credit: 1420.50, debit: null, statedBalance: 9420.50 } // Altered from 6420.50 -> 9420.50
  ];

  const forgedResult = analyzeEnrichedFinancialLogic(forgedTx, 5000.00);
  assert.strictEqual(forgedResult.ledgerBalanced, false, "Altered balance must be flagged");
  assert.ok(forgedResult.rowAnomalies.length >= 1, "At least 1 row anomaly must be reported");
  console.log(`  Legitimate Balanced: ${legitResult.ledgerBalanced}, Forged Flagged: ${!forgedResult.ledgerBalanced}`);
  console.log("  ✓ Module G Enriched Financial Logic passed.");
}

// ----------------------------------------------------------------------------
// TEST 8: Module H — Dempster-Shafer Fusion
// ----------------------------------------------------------------------------
console.log("\n[Test 8] Module H: dempsterShaferFusion.ts");
{
  // Consensus FORGED scenario
  const agreedForged = [
    { massAuthentic: 0.05, massForged: 0.85, massUnknown: 0.10 },
    { massAuthentic: 0.02, massForged: 0.88, massUnknown: 0.10 },
    { massAuthentic: 0.08, massForged: 0.80, massUnknown: 0.12 }
  ];

  const forgedFusion = fuseDempsterShafer(agreedForged);
  console.log(`  Consensus Forged -> BeliefForged: ${forgedFusion.beliefForged}, Verdict: "${forgedFusion.verdict}"`);
  assert.strictEqual(forgedFusion.verdict, "LIKELY FORGED");
  assert.ok(forgedFusion.beliefForged > 0.90, "BeliefForged should be > 0.90 under multi-detector consensus");

  // High conflict scenario (one detector claims Authentic, another claims Forged)
  const conflicting = [
    { massAuthentic: 0.90, massForged: 0.05, massUnknown: 0.05 },
    { massAuthentic: 0.05, massForged: 0.90, massUnknown: 0.05 }
  ];

  const conflictFusion = fuseDempsterShafer(conflicting);
  console.log(`  Conflicting -> Conflict K: ${conflictFusion.conflictMass}, Verdict: "${conflictFusion.verdict}"`);
  assert.strictEqual(conflictFusion.verdict, "CONFLICTING");
  assert.ok(conflictFusion.conflictMass >= 0.30, "Conflict mass K must be >= 0.30");

  console.log("  ✓ Module H Dempster-Shafer Fusion passed.");
}

console.log("\n======================================================================");
console.log("       ALL 8 PHASE 2 SCIENTIFIC MODULES VERIFIED SUCCESSFULLY         ");
console.log("======================================================================");
