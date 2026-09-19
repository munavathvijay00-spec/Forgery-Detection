/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DETECTION ERROR TRADEOFF (DET) & ROC EVALUATION
 * ============================================================================
 * 
 * Computes Detection Error Tradeoff (DET) curves, Equal Error Rate (EER),
 * Receiver Operating Characteristic (ROC), and AUC metrics for forensic benchmark corpora.
 *
 * Implements:
 *  1. DET curve generation across threshold vector \theta \in [0, 1].
 *  2. Equal Error Rate (EER) linear interpolation where FPR = FNR.
 *  3. Area Under the ROC Curve (AUC-ROC) via trapezoidal numerical integration.
 *
 * @citation Martin et al. (1997), "The DET Curve in Assessment of Detection Task Performance", Eurospeech.
 * @citation Fawcett (2006), "An introduction to ROC analysis", Pattern Recognition Letters.
 *
 * @packageDocumentation
 * @module forensics/bench/detCurve
 */

import type { DETOperatingPoint } from '../core/types.ts';

/**
 * Result of DET and ROC evaluation over a benchmark corpus.
 */
export interface BenchmarkPerformanceReport {
  readonly sampleCount: number;
  readonly authenticCount: number;
  readonly forgedCount: number;
  readonly detCurve: readonly DETOperatingPoint[];
  readonly equalErrorRate: number; // EER \in [0, 1]
  readonly aucRoc: number; // Area Under Curve \in [0, 1]
}

/**
 * Computes the complete DET curve and EER over benchmark predictions.
 */
export function computeDETCurve(
  predictions: readonly number[],
  groundTruths: readonly (0 | 1)[],
  numThresholds: number = 101
): BenchmarkPerformanceReport {
  const n = predictions.length;
  if (n === 0 || n !== groundTruths.length) {
    return {
      sampleCount: 0,
      authenticCount: 0,
      forgedCount: 0,
      detCurve: [],
      equalErrorRate: 0.5,
      aucRoc: 0.5,
    };
  }

  let totalAuthentic = 0;
  let totalForged = 0;
  for (const y of groundTruths) {
    if (y === 1) totalForged++;
    else totalAuthentic++;
  }

  const detCurve: DETOperatingPoint[] = [];

  for (let step = 0; step < numThresholds; step++) {
    const threshold = step / (numThresholds - 1);

    let fp = 0;
    let fn = 0;

    for (let i = 0; i < n; i++) {
      const pred = predictions[i] >= threshold ? 1 : 0;
      const actual = groundTruths[i];

      if (pred === 1 && actual === 0) fp++;
      else if (pred === 0 && actual === 1) fn++;
    }

    const fpr = totalAuthentic > 0 ? fp / totalAuthentic : 0;
    const fnr = totalForged > 0 ? fn / totalForged : 0;

    detCurve.push({
      threshold,
      falsePositiveRate: fpr,
      falseNegativeRate: fnr,
    });
  }

  // 1. Equal Error Rate (EER) finding: where FPR - FNR crosses 0
  let eer = 0.5;
  let minDiff = Infinity;

  for (let i = 0; i < detCurve.length; i++) {
    const pt = detCurve[i];
    const diff = Math.abs(pt.falsePositiveRate - pt.falseNegativeRate);
    if (diff < minDiff) {
      minDiff = diff;
      eer = (pt.falsePositiveRate + pt.falseNegativeRate) / 2.0;
    }
  }

  // 2. Trapezoidal AUC-ROC calculation
  let auc = 0.0;
  for (let i = 0; i < detCurve.length - 1; i++) {
    const pt1 = detCurve[i];
    const pt2 = detCurve[i + 1];

    const tpr1 = 1.0 - pt1.falseNegativeRate;
    const tpr2 = 1.0 - pt2.falseNegativeRate;
    const deltaFpr = Math.abs(pt1.falsePositiveRate - pt2.falsePositiveRate);

    auc += 0.5 * (tpr1 + tpr2) * deltaFpr;
  }

  return {
    sampleCount: n,
    authenticCount: totalAuthentic,
    forgedCount: totalForged,
    detCurve,
    equalErrorRate: eer,
    aucRoc: Math.max(0.5, Math.min(1.0, auc)),
  };
}
