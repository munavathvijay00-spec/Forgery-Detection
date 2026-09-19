/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DISCRETE COSINE TRANSFORM (DCT) & JPEG FORENSICS
 * ============================================================================
 * 
 * High-performance 2D DCT-II and IDCT-III engine, quantization table scaling,
 * zig-zag ordering, recompression error simulation, and JPEG ghost analysis.
 *
 * Implements:
 *  1. Fast 8x8 2D DCT-II and IDCT-III using orthogonal row-column factorizations.
 *  2. ISO/IEC 10918-1 Annex K baseline quantization tables (Luminance & Chrominance).
 *  3. Dynamic Q-table scaling for arbitrary quality factor Q in [1, 100].
 *  4. Standard 64-element JPEG zig-zag scan serialization.
 *  5. JPEG Ghost error energy curve computation (Farid, 2009).
 *  6. Periodic coefficient histogram estimation for double compression (Luo et al., 2010).
 *
 * @citation ITU-T Recommendation T.81 | ISO/IEC 10918-1:1994 (JPEG specification).
 * @citation Farid (2009), "Exposing Digital Forgeries from JPEG Ghosts", IEEE TIFS.
 * @citation Luo, Qu, Pan, Huang (2010), "A robust detection algorithm for primary quantization table
 *           estimation in double compressed JPEG images", IEEE ICASSP.
 * @citation Arai, Agui, Nakajima (1988), "A fast DCT-SQ scheme for images", IEICE Trans.
 *
 * @packageDocumentation
 * @module forensics/core/dct
 */

import type { JPEGQualityGhostPoint } from './types.ts';

// ============================================================================
// 1. STANDARD BASELINE QUANTIZATION TABLES (ISO/IEC 10918-1 ANNEX K)
// ============================================================================

/**
 * Standard 8x8 JPEG Luminance Quantization Table at Quality 50 (Row-major order).
 */
export const JPEG_STD_LUMINANCE_QUANT_TABLE_50: readonly number[] = [
  16, 11, 10, 16,  24,  40,  51,  61,
  12, 12, 14, 19,  26,  58,  60,  55,
  14, 13, 16, 24,  40,  57,  69,  56,
  14, 17, 22, 29,  51,  87,  80,  62,
  18, 22, 37, 56,  68, 109, 103,  77,
  24, 35, 55, 64,  81, 104, 113,  92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103,  99,
] as const;

/**
 * Standard 8x8 JPEG Chrominance Quantization Table at Quality 50 (Row-major order).
 */
export const JPEG_STD_CHROMINANCE_QUANT_TABLE_50: readonly number[] = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
] as const;

/**
 * Standard 64-element JPEG zig-zag scanning sequence permutation.
 * Maps 1D serial index [0..63] to 2D row-major index (row * 8 + col).
 */
export const JPEG_ZIGZAG_ORDER: readonly number[] = [
   0,  1,  8, 16,  9,  2,  3, 10,
  17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
] as const;

// ============================================================================
// 2. QUANTIZATION TABLE SCALING
// ============================================================================

/**
 * Scales standard quality 50 baseline quantization table to an arbitrary quality factor Q in [1, 100].
 * Implements IJG (Independent JPEG Group) standard quality scaling formula.
 *
 * S = { 5000 / Q         if Q < 50
 *     { 200 - 2 * Q      if Q >= 50
 *
 * Q_scaled = clamp( floor( (Q_50 * S + 50) / 100 ), 1, 255 )
 */
export function scaleQuantizationTable(
  baseTable: readonly number[],
  quality: number,
  outTable?: Uint16Array
): Uint16Array {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const table = outTable ?? new Uint16Array(64);

  let scale: number;
  if (q < 50) {
    scale = Math.floor(5000 / q);
  } else {
    scale = 200 - 2 * q;
  }

  for (let i = 0; i < 64; i++) {
    const val = Math.floor((baseTable[i] * scale + 50) / 100);
    // Clamp to valid 8-bit / 16-bit range [1, 255]
    table[i] = Math.max(1, Math.min(255, val));
  }

  return table;
}

// Precomputed cosine basis matrix for 1D 8-point DCT
// C(u, x) = c(u) * cos( (2x + 1) * u * PI / 16 )
// where c(0) = 1 / sqrt(2), c(u) = 1 for u > 0
const COS_TABLE: Float32Array = (() => {
  const table = new Float32Array(64);
  const invSqrt2 = 1.0 / Math.SQRT2;

  for (let u = 0; u < 8; u++) {
    const alpha = u === 0 ? invSqrt2 : 1.0;
    for (let x = 0; x < 8; x++) {
      table[u * 8 + x] = alpha * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16.0);
    }
  }
  return table;
})();

// ============================================================================
// 3. 2D 8x8 DISCRETE COSINE TRANSFORM (DCT-II & IDCT-III)
// ============================================================================

/**
 * Computes forward 2D 8x8 DCT-II on spatial pixel block (level-shifted by -128).
 * Inputs: spatialBlock (64 elements, values around 0 after level shift).
 * Outputs: dctCoeffs (64 frequency coefficients in row-major order: DC at (0,0)).
 */
export function forwardDCT8x8(
  spatialBlock: Float32Array,
  dctCoeffs?: Float32Array
): Float32Array {
  const out = dctCoeffs ?? new Float32Array(64);
  const temp = new Float32Array(64);

  // 1. Row-wise 1D DCT
  for (let row = 0; row < 8; row++) {
    const rowOffset = row * 8;
    for (let u = 0; u < 8; u++) {
      let sum = 0.0;
      const cosOffset = u * 8;
      for (let x = 0; x < 8; x++) {
        sum += spatialBlock[rowOffset + x] * COS_TABLE[cosOffset + x];
      }
      temp[rowOffset + u] = sum;
    }
  }

  // 2. Column-wise 1D DCT on temp
  for (let col = 0; col < 8; col++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0.0;
      const cosOffset = v * 8;
      for (let y = 0; y < 8; y++) {
        sum += temp[y * 8 + col] * COS_TABLE[cosOffset + y];
      }
      out[v * 8 + col] = sum;
    }
  }

  return out;
}

/**
 * Computes inverse 2D 8x8 DCT (IDCT-III) from frequency coefficients to spatial domain.
 */
export function inverseDCT8x8(
  dctCoeffs: Float32Array,
  spatialBlock?: Float32Array
): Float32Array {
  const out = spatialBlock ?? new Float32Array(64);
  const temp = new Float32Array(64);

  // 1. Column-wise 1D IDCT
  for (let col = 0; col < 8; col++) {
    for (let y = 0; y < 8; y++) {
      let sum = 0.0;
      for (let v = 0; v < 8; v++) {
        sum += dctCoeffs[v * 8 + col] * COS_TABLE[v * 8 + y];
      }
      temp[y * 8 + col] = sum;
    }
  }

  // 2. Row-wise 1D IDCT
  for (let row = 0; row < 8; row++) {
    const rowOffset = row * 8;
    for (let x = 0; x < 8; x++) {
      let sum = 0.0;
      for (let u = 0; u < 8; u++) {
        sum += temp[rowOffset + u] * COS_TABLE[u * 8 + x];
      }
      out[rowOffset + x] = sum;
    }
  }

  return out;
}

// ============================================================================
// 4. QUANTIZATION & DE-QUANTIZATION
// ============================================================================

/**
 * Quantizes 64 DCT coefficients by dividing by Q-table elements and rounding to integer.
 */
export function quantizeDCT8x8(
  dctCoeffs: Float32Array,
  quantTable: Uint16Array | readonly number[],
  outQuantized?: Int16Array
): Int16Array {
  const out = outQuantized ?? new Int16Array(64);
  for (let i = 0; i < 64; i++) {
    const q = quantTable[i];
    out[i] = Math.round(dctCoeffs[i] / q);
  }
  return out;
}

/**
 * De-quantizes 64 integer quantized DCT coefficients by multiplying by Q-table elements.
 */
export function dequantizeDCT8x8(
  quantizedCoeffs: Int16Array,
  quantTable: Uint16Array | readonly number[],
  outDequantized?: Float32Array
): Float32Array {
  const out = outDequantized ?? new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = quantizedCoeffs[i] * quantTable[i];
  }
  return out;
}

// ============================================================================
// 5. RECOMPRESSION SIMULATION & ERROR LEVEL RESIDUALS
// ============================================================================

/**
 * Simulates complete JPEG compression and decompression on a single 8x8 pixel block
 * at target quality factor Q in [1, 100].
 *
 * Sequence:
 *   Level shift (-128) -> Forward DCT -> Quantize(Q) -> Dequantize(Q) -> IDCT -> Level shift (+128) -> Clamp[0, 255]
 */
export function simulateJPEGBlockRecompression(
  originalBlock: Float32Array,
  quality: number,
  baseTable: readonly number[] = JPEG_STD_LUMINANCE_QUANT_TABLE_50,
  outReconstructed?: Float32Array
): Float32Array {
  const reconstructed = outReconstructed ?? new Float32Array(64);
  const qTable = scaleQuantizationTable(baseTable, quality);

  // 1. Level shift [-128]
  const shifted = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    shifted[i] = originalBlock[i] - 128.0;
  }

  // 2. Forward DCT
  const dct = forwardDCT8x8(shifted);

  // 3. Quantize
  const quantized = quantizeDCT8x8(dct, qTable);

  // 4. Dequantize
  const dequantized = dequantizeDCT8x8(quantized, qTable);

  // 5. Inverse DCT
  const spatial = inverseDCT8x8(dequantized);

  // 6. Level shift back [+128] & clamp
  for (let i = 0; i < 64; i++) {
    reconstructed[i] = Math.max(0, Math.min(255, Math.round(spatial[i] + 128.0)));
  }

  return reconstructed;
}

/**
 * Computes Root Mean Square Error (RMSE) difference energy between original and reconstructed block:
 * E = sqrt( (1 / 64) * sum_{i=0..63} (orig_i - recon_i)^2 )
 */
export function computeBlockDifferenceEnergy(
  originalBlock: Float32Array,
  reconstructedBlock: Float32Array
): number {
  let sumSq = 0.0;
  for (let i = 0; i < 64; i++) {
    const diff = originalBlock[i] - reconstructedBlock[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / 64.0);
}

// ============================================================================
// 6. JPEG GHOST CURVE COMPUTATION (FARID, 2009)
// ============================================================================

/**
 * Computes the JPEG Ghost error energy curve for a set of representative blocks
 * across candidate qualities Q in [1, 100].
 *
 * Theory (Farid, 2009):
 * If an image was originally compressed at quality Q_1 and later re-saved at Q_2,
 * recompressing test blocks at candidate quality Q produces a pronounced local minimum
 * in difference energy precisely at Q = Q_1. Spliced regions from a different source
 * will display minimum energy at an inconsistent Q_1*.
 *
 * @citation Farid (2009), "Exposing Digital Forgeries from JPEG Ghosts", IEEE TIFS.
 */
export function computeJPEGQualityGhostCurve(
  blocks: readonly Float32Array[],
  qualities: readonly number[] = Array.from({ length: 99 }, (_, i) => i + 2) // Q in [2..100]
): readonly JPEGQualityGhostPoint[] {
  const points: JPEGQualityGhostPoint[] = [];
  const count = blocks.length;

  if (count === 0) return points;

  const scratchRecon = new Float32Array(64);

  // Compute average difference energy for each candidate quality
  for (const q of qualities) {
    let totalEnergy = 0.0;
    for (let b = 0; b < count; b++) {
      simulateJPEGBlockRecompression(blocks[b], q, JPEG_STD_LUMINANCE_QUANT_TABLE_50, scratchRecon);
      totalEnergy += computeBlockDifferenceEnergy(blocks[b], scratchRecon);
    }
    const avgEnergy = totalEnergy / count;
    points.push({
      quality: q,
      differenceEnergy: avgEnergy,
      isLocalMinimum: false,
    });
  }

  // Detect local minima (valley detection with window of 3)
  const result: JPEGQualityGhostPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prev = i > 0 ? points[i - 1].differenceEnergy : Infinity;
    const next = i < points.length - 1 ? points[i + 1].differenceEnergy : Infinity;

    const isLocalMin = cur.differenceEnergy < prev && cur.differenceEnergy < next;
    result.push({
      quality: cur.quality,
      differenceEnergy: cur.differenceEnergy,
      isLocalMinimum: isLocalMin,
    });
  }

  return result;
}

// ============================================================================
// 7. DOUBLE JPEG COMPRESSION HISTOGRAM PERIODICITY (LUO ET AL., 2010)
// ============================================================================

/**
 * Evaluates periodicity in DCT AC coefficient histogram to detect double JPEG compression.
 *
 * Theory:
 * Successive quantization by step q_1 then q_2 creates periodic gaps/spikes in the
 * coefficient distribution with period p = q_2 / q_1.
 *
 * @citation Luo, Qu, Pan, Huang (2010), IEEE ICASSP.
 */
export function detectDoubleCompressionPeriodicity(
  acCoefficients: Float32Array | number[],
  maxBin: number = 32
): { readonly isPeriodic: boolean; readonly estimatedPeriod: number; readonly periodicityScore: number } {
  const histSize = 2 * maxBin + 1;
  const hist = new Float32Array(histSize);
  const center = maxBin;

  for (let i = 0; i < acCoefficients.length; i++) {
    const val = Math.round(acCoefficients[i]);
    if (val >= -maxBin && val <= maxBin) {
      hist[val + center]++;
    }
  }

  // Compute power spectrum (autocorrelation) of histogram for periods T in [2..8]
  let bestPeriod = 1;
  let maxAutocorr = 0.0;

  for (let T = 2; T <= 8; T++) {
    let corr = 0.0;
    let norm1 = 0.0;
    let norm2 = 0.0;

    for (let i = 0; i < histSize - T; i++) {
      const v1 = hist[i];
      const v2 = hist[i + T];
      corr += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    const denom = Math.sqrt(norm1 * norm2);
    const score = denom > 0 ? corr / denom : 0;

    if (score > maxAutocorr) {
      maxAutocorr = score;
      bestPeriod = T;
    }
  }

  // Periodic spikes typically yield autocorrelation score > 0.65
  const isPeriodic = maxAutocorr > 0.65 && bestPeriod >= 2;

  return {
    isPeriodic,
    estimatedPeriod: bestPeriod,
    periodicityScore: maxAutocorr,
  };
}
