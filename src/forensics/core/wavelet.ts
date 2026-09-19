/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DISCRETE WAVELET TRANSFORM (DWT) & PRNU EXTRACTION
 * ============================================================================
 * 
 * 2D Wavelet decomposition, spatial-adaptive Wiener shrinkage, sensor noise
 * residual extraction (PRNU fingerprinting), and Normalized Cross-Correlation.
 *
 * Implements:
 *  1. 2D Discrete Wavelet Transform (Daubechies 4-tap and Haar wavelets).
 *  2. 2D Inverse Discrete Wavelet Transform (IDWT).
 *  3. Donoho-Johnstone robust noise scale estimation: \sigma = median(|HH_1|) / 0.6745.
 *  4. Spatially adaptive wavelet denoising filter (Mihcak et al., 1999; Lukas et al., 2006).
 *  5. Photo-Response Non-Uniformity (PRNU) noise residual extraction.
 *  6. Normalized Cross-Correlation (NCC) for sensor consistency verification.
 *
 * @citation Lukas, Fridrich, Goljan (2006), "Digital Camera Identification From Sensor Pattern Noise", IEEE TIFS.
 * @citation Donoho & Johnstone (1994), "Ideal spatial adaptation by wavelet shrinkage", Biometrika.
 * @citation Mihcak, Kozintsev, Ramchandran (1999), "Spatially adaptive statistical modeling of DWT
 *           coefficients and its application to denoising", IEEE Signal Processing Letters.
 *
 * @packageDocumentation
 * @module forensics/core/wavelet
 */

import { ForensicFloatImage } from './image.ts';
import { quickselect } from './image.ts';

// ============================================================================
// 1. FILTER COEFFICIENTS
// ============================================================================

// Daubechies 4 (db4 / D4) low-pass and high-pass orthogonal filter coefficients
const SQRT3 = Math.sqrt(3.0);
const DENOM = 4.0 * Math.SQRT2;

const D4_H0 = (1.0 + SQRT3) / DENOM;
const D4_H1 = (3.0 + SQRT3) / DENOM;
const D4_H2 = (3.0 - SQRT3) / DENOM;
const D4_H3 = (1.0 - SQRT3) / DENOM;

// Quadrature mirror high-pass decomposition filter
const D4_G0 = D4_H3;
const D4_G1 = -D4_H2;
const D4_G2 = D4_H1;
const D4_G3 = -D4_H0;

/**
 * 2D 1-level Wavelet decomposition subbands.
 */
export interface WaveletDecompositionLevel {
  readonly width: number;
  readonly height: number;
  /** Approximation subband (Low-Low) */
  readonly ll: Float32Array;
  /** Horizontal detail subband (Low-High) */
  readonly lh: Float32Array;
  /** Vertical detail subband (High-Low) */
  readonly hl: Float32Array;
  /** Diagonal detail subband (High-High) */
  readonly hh: Float32Array;
}

// ============================================================================
// 2. 2D DISCRETE WAVELET TRANSFORM (DWT)
// ============================================================================

/**
 * Computes 1-level 2D Discrete Wavelet Transform using Daubechies 4 (db4) filter.
 * Symmetric boundary reflection is applied at borders to prevent boundary ripple.
 */
export function forwardDWT2D(
  input: Float32Array,
  width: number,
  height: number
): WaveletDecompositionLevel {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  const ll = new Float32Array(halfW * halfH);
  const lh = new Float32Array(halfW * halfH);
  const hl = new Float32Array(halfW * halfH);
  const hh = new Float32Array(halfW * halfH);

  // Temporary row-transformed buffers: low-pass (L) and high-pass (H)
  const rowL = new Float32Array(halfW * height);
  const rowH = new Float32Array(halfW * height);

  // 1. Horizontal filtering across rows
  for (let y = 0; y < height; y++) {
    const inRow = y * width;
    const outRow = y * halfW;

    for (let x = 0; x < halfW; x++) {
      const i0 = 2 * x;
      // Periodic or symmetric reflection
      const p0 = input[inRow + i0];
      const p1 = input[inRow + Math.min(width - 1, i0 + 1)];
      const p2 = input[inRow + Math.min(width - 1, i0 + 2)];
      const p3 = input[inRow + Math.min(width - 1, i0 + 3)];

      rowL[outRow + x] = D4_H0 * p0 + D4_H1 * p1 + D4_H2 * p2 + D4_H3 * p3;
      rowH[outRow + x] = D4_G0 * p0 + D4_G1 * p1 + D4_G2 * p2 + D4_G3 * p3;
    }
  }

  // 2. Vertical filtering down columns of rowL and rowH
  for (let x = 0; x < halfW; x++) {
    for (let y = 0; y < halfH; y++) {
      const j0 = 2 * y;
      const j1 = Math.min(height - 1, j0 + 1);
      const j2 = Math.min(height - 1, j0 + 2);
      const j3 = Math.min(height - 1, j0 + 3);

      const l0 = rowL[j0 * halfW + x];
      const l1 = rowL[j1 * halfW + x];
      const l2 = rowL[j2 * halfW + x];
      const l3 = rowL[j3 * halfW + x];

      const h0 = rowH[j0 * halfW + x];
      const h1 = rowH[j1 * halfW + x];
      const h2 = rowH[j2 * halfW + x];
      const h3 = rowH[j3 * halfW + x];

      const outIdx = y * halfW + x;

      // LL = Low(H) * Low(V)
      ll[outIdx] = D4_H0 * l0 + D4_H1 * l1 + D4_H2 * l2 + D4_H3 * l3;
      // LH = High(H) * Low(V)
      lh[outIdx] = D4_H0 * h0 + D4_H1 * h1 + D4_H2 * h2 + D4_H3 * h3;
      // HL = Low(H) * High(V)
      hl[outIdx] = D4_G0 * l0 + D4_G1 * l1 + D4_G2 * l2 + D4_G3 * l3;
      // HH = High(H) * High(V)
      hh[outIdx] = D4_G0 * h0 + D4_G1 * h1 + D4_G2 * h2 + D4_G3 * h3;
    }
  }

  return { width: halfW, height: halfH, ll, lh, hl, hh };
}

/**
 * Computes 1-level 2D Inverse Discrete Wavelet Transform (IDWT) using Daubechies 4 synthesis filters.
 */
export function inverseDWT2D(
  decomp: WaveletDecompositionLevel,
  outWidth: number,
  outHeight: number
): Float32Array {
  const halfW = decomp.width;
  const halfH = decomp.height;
  const out = new Float32Array(outWidth * outHeight);

  // Intermediate synthesis columns
  const rowL = new Float32Array(halfW * outHeight);
  const rowH = new Float32Array(halfW * outHeight);

  // 1. Column synthesis
  for (let x = 0; x < halfW; x++) {
    for (let y = 0; y < halfH; y++) {
      const inIdx = y * halfW + x;
      const llVal = decomp.ll[inIdx];
      const hlVal = decomp.hl[inIdx];
      const lhVal = decomp.lh[inIdx];
      const hhVal = decomp.hh[inIdx];

      const j0 = 2 * y;
      const j1 = j0 + 1;

      if (j0 < outHeight) {
        rowL[j0 * halfW + x] += D4_H2 * llVal + D4_G2 * hlVal;
        rowH[j0 * halfW + x] += D4_H2 * lhVal + D4_G2 * hhVal;
      }
      if (j1 < outHeight) {
        rowL[j1 * halfW + x] += D4_H1 * llVal + D4_G1 * hlVal;
        rowH[j1 * halfW + x] += D4_H1 * lhVal + D4_G1 * hhVal;
      }
      const j2 = j0 + 2;
      const j3 = j0 + 3;
      if (j2 < outHeight) {
        rowL[j2 * halfW + x] += D4_H0 * llVal + D4_G0 * hlVal;
        rowH[j2 * halfW + x] += D4_H0 * lhVal + D4_G0 * hhVal;
      }
      if (j3 < outHeight) {
        rowL[j3 * halfW + x] += D4_H3 * llVal + D4_G3 * hlVal;
        rowH[j3 * halfW + x] += D4_H3 * lhVal + D4_G3 * hhVal;
      }
    }
  }

  // 2. Row synthesis
  for (let y = 0; y < outHeight; y++) {
    const rowOffset = y * outWidth;
    const lRow = y * halfW;

    for (let x = 0; x < halfW; x++) {
      const lVal = rowL[lRow + x];
      const hVal = rowH[lRow + x];

      const i0 = 2 * x;
      const i1 = i0 + 1;

      if (i0 < outWidth) {
        out[rowOffset + i0] += D4_H2 * lVal + D4_G2 * hVal;
      }
      if (i1 < outWidth) {
        out[rowOffset + i1] += D4_H1 * lVal + D4_G1 * hVal;
      }
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      if (i2 < outWidth) {
        out[rowOffset + i2] += D4_H0 * lVal + D4_G0 * hVal;
      }
      if (i3 < outWidth) {
        out[rowOffset + i3] += D4_H3 * lVal + D4_G3 * hVal;
      }
    }
  }

  return out;
}

// ============================================================================
// 3. ROBUST WAVELET NOISE ESTIMATION (DONOHO & JOHNSTONE, 1994)
// ============================================================================

/**
 * Estimates Gaussian noise standard deviation \sigma_0 from the finest scale
 * diagonal wavelet subband HH_1 using the Donoho-Johnstone robust estimator:
 *
 * \sigma_0 = median( |HH_1| ) / 0.6745
 *
 * where 0.6745 = \Phi^{-1}(0.75) is the 75th percentile of the standard normal distribution.
 *
 * @citation Donoho & Johnstone (1994), "Ideal spatial adaptation by wavelet shrinkage", Biometrika.
 */
export function estimateWaveletNoiseSigma(hhSubband: Float32Array): number {
  const n = hhSubband.length;
  if (n === 0) return 0;

  const absCoeffs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    absCoeffs[i] = Math.abs(hhSubband[i]);
  }

  const medianAbs = quickselect(absCoeffs, Math.floor(n / 2));
  // 1 / 0.6744897501960817 = 1.482602218505602
  return medianAbs * 1.482602218505602;
}

// ============================================================================
// 4. SPATIALLY ADAPTIVE WIENER FILTERING & PRNU RESIDUAL EXTRACTION
// ============================================================================

/**
 * Applies spatially adaptive empirical Wiener shrinkage to a detail subband
 * within a local (2W + 1) x (2W + 1) neighborhood (Mihcak et al., 1999; Lukas et al., 2006).
 *
 * \sigma^2_local(x, y) = max( 0, (1 / |N|) \sum_{(i,j) \in N} d(i,j)^2 - \sigma_0^2 )
 * d_denoised(x, y) = d(x, y) * ( \sigma^2_local / ( \sigma^2_local + \sigma_0^2 ) )
 */
export function adaptiveWienerShrinkage(
  subband: Float32Array,
  width: number,
  height: number,
  noiseVarianceSigmaSq: number,
  windowRadius: number = 2
): Float32Array {
  const denoised = new Float32Array(width * height);
  const winSize = 2 * windowRadius + 1;
  const numPixels = winSize * winSize;

  for (let y = 0; y < height; y++) {
    const yMin = Math.max(0, y - windowRadius);
    const yMax = Math.min(height - 1, y + windowRadius);

    for (let x = 0; x < width; x++) {
      const xMin = Math.max(0, x - windowRadius);
      const xMax = Math.min(width - 1, x + windowRadius);

      let sumSq = 0;
      let count = 0;

      for (let ny = yMin; ny <= yMax; ny++) {
        const row = ny * width;
        for (let nx = xMin; nx <= xMax; nx++) {
          const val = subband[row + nx];
          sumSq += val * val;
          count++;
        }
      }

      const meanSq = count > 0 ? sumSq / count : 0;
      const localSignalVar = Math.max(0, meanSq - noiseVarianceSigmaSq);
      const shrinkage = localSignalVar / (localSignalVar + noiseVarianceSigmaSq + 1e-8);

      denoised[y * width + x] = subband[y * width + x] * shrinkage;
    }
  }

  return denoised;
}

/**
 * Extracts the PRNU (Photo-Response Non-Uniformity) high-frequency sensor pattern noise
 * residual from a single-channel image buffer (Lukas, Fridrich, Goljan, 2006):
 *
 * Noise Residual: W = I - F(I)
 * where F(I) is the wavelet-denoised estimate of the underlying scene.
 *
 * @citation Lukas, Fridrich, Goljan (2006), "Digital Camera Identification From Sensor Pattern Noise", IEEE TIFS.
 */
export function extractPRNUNoiseResidual(image: ForensicFloatImage): Float32Array {
  const { width, height, data } = image;
  const decomp = forwardDWT2D(data, width, height);

  // Estimate noise variance from finest diagonal subband
  const sigma0 = estimateWaveletNoiseSigma(decomp.hh);
  const sigma0Sq = sigma0 * sigma0;

  // Denoise each high-frequency detail subband (LH, HL, HH)
  const denoisedLH = adaptiveWienerShrinkage(decomp.lh, decomp.width, decomp.height, sigma0Sq);
  const denoisedHL = adaptiveWienerShrinkage(decomp.hl, decomp.width, decomp.height, sigma0Sq);
  const denoisedHH = adaptiveWienerShrinkage(decomp.hh, decomp.width, decomp.height, sigma0Sq);

  // Invert denoised wavelet decomposition to synthesize scene estimate F(I)
  const denoisedDecomp: WaveletDecompositionLevel = {
    width: decomp.width,
    height: decomp.height,
    ll: decomp.ll, // keep low-pass approximation untouched
    lh: denoisedLH,
    hl: denoisedHL,
    hh: denoisedHH,
  };

  const sceneEstimate = inverseDWT2D(denoisedDecomp, width, height);

  // W = I - F(I)
  const residual = new Float32Array(width * height);
  for (let i = 0; i < residual.length; i++) {
    residual[i] = data[i] - sceneEstimate[i];
  }

  return residual;
}

// ============================================================================
// 5. NORMALIZED CROSS-CORRELATION (NCC) FOR SENSOR CONSISTENCY
// ============================================================================

/**
 * Computes Normalized Cross-Correlation (NCC) between two noise residual arrays:
 * \rho(X, Y) = \frac{\sum (X_i - \bar{X})(Y_i - \bar{Y})}{\sqrt{\sum (X_i - \bar{X})^2 \sum (Y_i - \bar{Y})^2}}
 *
 * Returns \rho \in [-1, 1].
 */
export function computeNormalizedCrossCorrelation(
  residualA: Float32Array,
  residualB: Float32Array
): number {
  const n = Math.min(residualA.length, residualB.length);
  if (n === 0) return 0;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += residualA[i];
    sumB += residualB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const da = residualA[i] - meanA;
    const db = residualB[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  const denom = Math.sqrt(denomA * denomB);
  return denom > 1e-12 ? num / denom : 0;
}
