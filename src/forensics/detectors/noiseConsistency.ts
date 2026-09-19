/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DETECTOR 2: NOISE CONSISTENCY & SENSOR NOISE
 * ============================================================================
 * 
 * Forensic inspection of sensor pattern noise (PRNU) and physical noise consistency
 * using Poisson-Gaussian heteroscedastic noise modeling.
 *
 * Implements:
 *  1. Practical Poisson-Gaussian parameter estimation: \sigma^2(y) = a * y + b (Foi et al., 2008).
 *  2. Tile-level studentized residual z-score evaluation for splicing detection.
 *  3. Wavelet PRNU sensor residual extraction and cross-quadrant correlation.
 *  4. Calibrated evidence mass generation for Dempster-Shafer fusion.
 *
 * @citation Foi, Trimeche, Katkovnik, Egiazarian (2008), "Practical Poisson-Gaussian Noise Parameter
 *           Estimation and Hexagonal Bilateral Filtering in Single Images", IEEE TIP.
 * @citation Lukas, Fridrich, Goljan (2006), "Digital Camera Identification From Sensor Pattern Noise", IEEE TIFS.
 * @citation Lyu, Pan, Farid (2014), "Exposing Image Splicing with Inconsistent Local Noise Levels", IEEE TIFS.
 *
 * @packageDocumentation
 * @module forensics/detectors/noiseConsistency
 */

import type {
  NoiseConsistencyResult,
  DetectorEvidenceMass,
  ChainOfCustodyArtifact,
  BaseForensicAnomaly,
  BoundingBox,
  PoissonGaussianNoiseModel,
  NoiseTileEvaluation,
} from '../core/types.ts';
import { ForensicFloatImage, computeRobustStats, IntegralImage2D } from '../core/image.ts';
import {
  extractPRNUNoiseResidual,
  computeNormalizedCrossCorrelation,
} from '../core/wavelet.ts';
import { createChainOfCustodyArtifact } from '../core/hash.ts';

/**
 * Executes the Noise Consistency & Sensor Pattern Noise forensic detector.
 */
export function analyzeNoiseConsistency(
  image: ForensicFloatImage,
  tileSizePx: number = 32
): NoiseConsistencyResult {
  const startTime = performance.now();
  const width = image.width;
  const height = image.height;
  const artifacts: ChainOfCustodyArtifact[] = [];
  const anomalies: BaseForensicAnomaly[] = [];

  // Build integral image for fast local patch mean and variance
  const integral = new IntegralImage2D(image);

  // 1. Gather homogeneous low-gradient patches to fit global Poisson-Gaussian model
  // \sigma^2(y) = a * y + b
  const patchMeans: number[] = [];
  const patchVariances: number[] = [];

  const step = Math.max(8, Math.floor(tileSizePx / 2));
  for (let y = 0; y <= height - tileSizePx; y += step) {
    for (let x = 0; x <= width - tileSizePx; x += step) {
      const stats = integral.queryMeanAndVariance({
        x,
        y,
        width: tileSizePx,
        height: tileSizePx,
      });

      // Filter out high-contrast text edges (we want background paper texture / noise)
      // Standard paper noise variance is typically < 250 in 8-bit scale
      if (stats.variance > 0.5 && stats.variance < 250.0 && stats.mean > 10 && stats.mean < 245) {
        patchMeans.push(stats.mean);
        patchVariances.push(stats.variance);
      }
    }
  }

  // 2. Linear Regression for Poisson-Gaussian parameters (a, b)
  let a = 0.05;
  let b = 1.0;
  let rSquared = 0.0;
  let se = 1.0;

  const nPatches = patchMeans.length;
  if (nPatches >= 8) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < nPatches; i++) {
      const x = patchMeans[i];
      const y = patchVariances[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const meanX = sumX / nPatches;
    const meanY = sumY / nPatches;
    const denom = sumXX - sumX * meanX;

    if (Math.abs(denom) > 1e-6) {
      const slope = (sumXY - sumX * meanY) / denom;
      // Slopes can be slightly positive or negative depending on gain and compression
      a = Math.max(-0.5, Math.min(2.0, slope));
      b = Math.max(0.1, meanY - a * meanX);

      // Compute R^2 and Standard Error
      let ssTot = 0;
      let ssRes = 0;
      for (let i = 0; i < nPatches; i++) {
        const yObs = patchVariances[i];
        const yPred = Math.max(0.1, a * patchMeans[i] + b);
        ssTot += (yObs - meanY) * (yObs - meanY);
        ssRes += (yObs - yPred) * (yObs - yPred);
      }
      rSquared = ssTot > 1e-6 ? Math.max(0, 1.0 - ssRes / ssTot) : 0;
      se = Math.sqrt(ssRes / Math.max(1, nPatches - 2));
    }
  }

  const globalModel: PoissonGaussianNoiseModel = {
    a,
    b,
    rSquared,
    standardError: se,
  };

  // 3. Tile-Level Residual Z-Score Evaluation
  const tileEvaluations: NoiseTileEvaluation[] = [];
  const tileVariances: number[] = [];
  const tilesX = Math.floor(width / tileSizePx);
  const tilesY = Math.floor(height / tileSizePx);
  const totalTiles = Math.max(1, tilesX * tilesY);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const bbox: BoundingBox = {
        x: tx * tileSizePx,
        y: ty * tileSizePx,
        width: tileSizePx,
        height: tileSizePx,
      };

      const { mean, variance } = integral.queryMeanAndVariance(bbox);
      tileVariances.push(variance);

      const expectedVar = Math.max(0.1, a * mean + b);
      const residual = variance - expectedVar;
      const residualZScore = se > 0 ? residual / se : 0;
      // Outlier if noise variance deviates by more than 3 standard errors
      const isOutlier = Math.abs(residualZScore) > 3.0 && variance < 500.0; // avoid pure text edge blocks

      tileEvaluations.push({
        bbox,
        meanLuminance: mean,
        observedVariance: variance,
        expectedVariance: expectedVar,
        residualZScore,
        isOutlier,
      });

      if (isOutlier) {
        anomalies.push({
          id: `noise-outlier-${tx}-${ty}`,
          bbox,
          significanceScore: Math.abs(residualZScore),
          severity: Math.abs(residualZScore) > 5.0 ? 'critical' : 'suspect',
          forensicRationale: `Local noise variance (${variance.toFixed(2)}) deviates significantly (z = ${residualZScore.toFixed(2)}) from Poisson-Gaussian model expectation (${expectedVar.toFixed(2)}), revealing spliced imagery from a camera/scanner with mismatched SNR.`,
        });
      }
    }
  }

  const noiseDistribution = computeRobustStats(tileVariances);
  const anomalousAreaFraction = (anomalies.length / totalTiles) * 100.0;

  // 4. Wavelet PRNU Sensor Noise Residual Extraction
  let prnuCorrelationCoefficient = 0.85;
  let prnuCoherent = true;

  if (width >= 128 && height >= 128) {
    const prnuResidual = extractPRNUNoiseResidual(image);

    // Compute cross-correlation between left and right halves
    const halfW = Math.floor(width / 2);
    const leftHalf = new Float32Array(halfW * height);
    const rightHalf = new Float32Array(halfW * height);

    for (let y = 0; y < height; y++) {
      const row = y * width;
      const halfRow = y * halfW;
      for (let x = 0; x < halfW; x++) {
        leftHalf[halfRow + x] = prnuResidual[row + x];
        rightHalf[halfRow + x] = prnuResidual[row + halfW + x];
      }
    }

    prnuCorrelationCoefficient = computeNormalizedCrossCorrelation(leftHalf, rightHalf);
    prnuCoherent = prnuCorrelationCoefficient >= 0.02 || (prnuCorrelationCoefficient >= -0.10 && anomalies.length === 0);

    artifacts.push(
      createChainOfCustodyArtifact(
        'prnu-residual-map',
        'residual_map',
        prnuResidual,
        'Full document wavelet PRNU sensor pattern noise residual field',
        { width, height, prnuCorrelation: prnuCorrelationCoefficient }
      )
    );
  }

  artifacts.push(
    createChainOfCustodyArtifact(
      'poisson-gaussian-model',
      'fusion_evidence_state',
      globalModel,
      'Poisson-Gaussian noise parameters and goodness-of-fit estimates',
      { patchesSampled: nPatches }
    )
  );

  // 5. Calibrated Dempster-Shafer Evidence Mass
  let massForged = 0.05;
  let massAuthentic = 0.70;
  let massUncertainty = 0.25;

  if (anomalousAreaFraction > 5.0 || !prnuCoherent) {
    if (anomalousAreaFraction > 15.0) {
      massForged = 0.88;
      massAuthentic = 0.04;
      massUncertainty = 0.08;
    } else {
      massForged = 0.60;
      massAuthentic = 0.15;
      massUncertainty = 0.25;
    }
  }

  const reliabilityWeight = Math.min(1.0, Math.max(0.2, rSquared));
  const logLikelihoodRatio = Math.log((massForged + 1e-4) / (massAuthentic + 1e-4));

  const evidenceMass: DetectorEvidenceMass = {
    detectorId: 'noise_consistency',
    massAuthentic,
    massForged,
    massUncertainty,
    reliabilityWeight,
    logLikelihoodRatio,
  };

  return {
    detectorId: 'noise_consistency',
    executionTimeMs: performance.now() - startTime,
    executedSuccessfully: true,
    evidenceMass,
    artifacts,
    anomalies,
    globalModel,
    noiseDistribution,
    tileEvaluations,
    anomalousAreaFraction,
    prnuCorrelationCoefficient,
    prnuCoherent,
  };
}
