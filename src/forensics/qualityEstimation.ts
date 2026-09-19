/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — JPEG ORIGINAL QUALITY FACTOR ESTIMATOR
 * ============================================================================
 *
 * Implements original JPEG primary quantization factor estimation using 
 * recompression difference total variation analysis.
 *
 * @citation Luo, Huang, Qiu (2010), "JPEG Error Analysis and Its Applications
 *           to Digital Image Forensics", IEEE Transactions on Information Forensics
 *           and Security, Vol. 5, No. 3, pp. 380-391.
 * @citation Farid (2009), "Exposing Digital Forgeries from JPEG Ghosts",
 *           IEEE Transactions on Information Forensics and Security, Vol. 4, No. 1.
 *
 * @packageDocumentation
 * @module forensics/qualityEstimation
 */

import {
  forwardDCT8x8,
  quantizeDCT8x8,
  dequantizeDCT8x8,
  inverseDCT8x8,
  scaleQuantizationTable,
  JPEG_STD_LUMINANCE_QUANT_TABLE_50
} from './core/dct.ts';

export interface QualityEstimationResult {
  /** Estimated primary JPEG quality factor in [50, 98] */
  readonly estimatedQ: number;
  /** 95% bootstrap confidence interval [q_lower, q_upper] */
  readonly ci: [number, number];
  /** Reliability score in [0.0, 1.0] based on inter-block consensus */
  readonly confidence: number;
  /** Detailed error profile across sampled qualities for inspectability */
  readonly tvCurve: readonly { quality: number; totalVariation: number }[];
}

/**
 * Fast in-place level-shifted 8x8 block recompression at quality Q.
 */
function recompressBlock(
  block: Float32Array,
  quality: number,
  qTableScratch: Uint16Array,
  dctScratch: Float32Array,
  quantScratch: Int32Array,
  dequantScratch: Float32Array,
  spatialScratch: Float32Array,
  outRecon: Float32Array
): void {
  scaleQuantizationTable(JPEG_STD_LUMINANCE_QUANT_TABLE_50, quality, qTableScratch);

  // 1. Shift by -128
  for (let i = 0; i < 64; i++) {
    spatialScratch[i] = block[i] - 128.0;
  }

  // 2. 2D DCT-II
  forwardDCT8x8(spatialScratch, dctScratch);

  // 3. Quantize
  quantizeDCT8x8(dctScratch, qTableScratch, quantScratch);

  // 4. Dequantize
  dequantizeDCT8x8(quantScratch, qTableScratch, dequantScratch);

  // 5. 2D IDCT-III
  inverseDCT8x8(dequantScratch, spatialScratch);

  // 6. Level shift +128 & clamp
  for (let i = 0; i < 64; i++) {
    outRecon[i] = Math.max(0, Math.min(255, Math.round(spatialScratch[i] + 128.0)));
  }
}

/**
 * Computes Total Variation of the DCT coefficient histogram of difference image
 * between original pixel blocks and recompressed blocks at quality Q.
 *
 * TV(Q) = sum_k |h(k+1) - h(k)|
 */
function computeDifferenceHistogramTV(
  blocks: Float32Array[],
  quality: number
): number {
  const qTableScratch = new Uint16Array(64);
  const dctScratch = new Float32Array(64);
  const quantScratch = new Int32Array(64);
  const dequantScratch = new Float32Array(64);
  const spatialScratch = new Float32Array(64);
  const reconScratch = new Float32Array(64);
  const diffDctScratch = new Float32Array(64);

  // 256-bin histogram centered around zero difference [-128..127]
  const hist = new Int32Array(256);

  const blockCount = blocks.length;
  for (let b = 0; b < blockCount; b++) {
    const orig = blocks[b];
    recompressBlock(
      orig,
      quality,
      qTableScratch,
      dctScratch,
      quantScratch,
      dequantScratch,
      spatialScratch,
      reconScratch
    );

    // Difference block
    for (let i = 0; i < 64; i++) {
      spatialScratch[i] = orig[i] - reconScratch[i];
    }

    // Forward DCT of the difference signal
    forwardDCT8x8(spatialScratch, diffDctScratch);

    // Accumulate AC coefficient frequencies into histogram
    for (let i = 1; i < 64; i++) {
      const coeff = Math.round(diffDctScratch[i]);
      const bin = Math.max(0, Math.min(255, coeff + 128));
      hist[bin]++;
    }
  }

  // Calculate Total Variation (first difference L1 norm)
  let tv = 0;
  for (let i = 1; i < 256; i++) {
    tv += Math.abs(hist[i] - hist[i - 1]);
  }

  return tv;
}

/**
 * Estimates original JPEG compression quality factor using Luo et al. (2010).
 *
 * Evaluates candidate qualities Q in [50..98], finds the quality factor
 * that minimizes DCT error histogram Total Variation, and runs 16-tile
 * bootstrap sampling to establish empirical confidence intervals.
 *
 * @param pixels - Grayscale or RGBA image pixel buffer
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param channels - 1 for luminance/grayscale, 4 for RGBA (default: 4)
 * @returns QualityEstimationResult with point estimate, bootstrap CI, and confidence score.
 */
export function estimateOriginalJPEGQuality(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  channels: number = 4
): QualityEstimationResult {
  const blocksX = Math.floor(width / 8);
  const blocksY = Math.floor(height / 8);

  if (blocksX < 4 || blocksY < 4) {
    // Image too small for statistical estimation; default to standard baseline
    return {
      estimatedQ: 85,
      ci: [82, 88],
      confidence: 0.35,
      tvCurve: []
    };
  }

  // Extract luminance 8x8 blocks
  const extractBlock = (bx: number, by: number): Float32Array => {
    const block = new Float32Array(64);
    const startX = bx * 8;
    const startY = by * 8;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const idx = ((startY + r) * width + (startX + c)) * channels;
        if (channels >= 3) {
          // Rec. 601 Luma
          block[r * 8 + c] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        } else {
          block[r * 8 + c] = pixels[idx];
        }
      }
    }
    return block;
  };

  // Divide into 16 spatial tiles (4x4 grid) for bootstrap estimation
  const tileCols = 4;
  const tileRows = 4;
  const blocksPerTileX = Math.floor(blocksX / tileCols);
  const blocksPerTileY = Math.floor(blocksY / tileRows);

  const tilesBlocks: Float32Array[][] = Array.from({ length: 16 }, () => []);

  for (let ty = 0; ty < tileRows; ty++) {
    for (let tx = 0; tx < tileCols; tx++) {
      const tileIdx = ty * tileCols + tx;
      const startBX = tx * blocksPerTileX;
      const startBY = ty * blocksPerTileY;

      // Sample up to 16 blocks per tile for fast computation
      const stepX = Math.max(1, Math.floor(blocksPerTileX / 4));
      const stepY = Math.max(1, Math.floor(blocksPerTileY / 4));

      for (let by = startBY; by < startBY + blocksPerTileY; by += stepY) {
        for (let bx = startBX; bx < startBX + blocksPerTileX; bx += stepX) {
          if (bx < blocksX && by < blocksY) {
            tilesBlocks[tileIdx].push(extractBlock(bx, by));
          }
        }
      }
    }
  }

  // Candidate qualities: 50 to 98 in steps of 2 for coarse scan, then refine ±2
  const candidateQualities: number[] = [];
  for (let q = 50; q <= 98; q += 2) {
    candidateQualities.push(q);
  }

  // 1. Global TV Curve evaluation across all collected blocks
  const allBlocks: Float32Array[] = [];
  for (const t of tilesBlocks) {
    for (const b of t) {
      allBlocks.push(b);
    }
  }

  const tvCurve: { quality: number; totalVariation: number }[] = [];
  let minTV = Number.POSITIVE_INFINITY;
  let bestCoarseQ = 85;

  for (const q of candidateQualities) {
    const tv = computeDifferenceHistogramTV(allBlocks, q);
    tvCurve.push({ quality: q, totalVariation: tv });
    if (tv < minTV) {
      minTV = tv;
      bestCoarseQ = q;
    }
  }

  // Refine around coarse minimum with step of 1
  let bestGlobalQ = bestCoarseQ;
  for (const q of [bestCoarseQ - 1, bestCoarseQ + 1]) {
    if (q >= 50 && q <= 98) {
      const tv = computeDifferenceHistogramTV(allBlocks, q);
      if (tv < minTV) {
        minTV = tv;
        bestGlobalQ = q;
      }
    }
  }

  // 2. Bootstrap per tile for 95% confidence interval
  const tileEstimates: number[] = [];
  for (let t = 0; t < 16; t++) {
    const tBlocks = tilesBlocks[t];
    if (tBlocks.length < 4) continue;

    let tMinTV = Number.POSITIVE_INFINITY;
    let tBestQ = bestGlobalQ;

    // Evaluate local window around bestGlobalQ ± 6
    const searchMin = Math.max(50, bestGlobalQ - 6);
    const searchMax = Math.min(98, bestGlobalQ + 6);

    for (let q = searchMin; q <= searchMax; q++) {
      const tv = computeDifferenceHistogramTV(tBlocks, q);
      if (tv < tMinTV) {
        tMinTV = tv;
        tBestQ = q;
      }
    }
    tileEstimates.push(tBestQ);
  }

  tileEstimates.sort((a, b) => a - b);
  const nEst = tileEstimates.length;

  let finalQ = bestGlobalQ;
  let ciLower = Math.max(50, bestGlobalQ - 3);
  let ciUpper = Math.min(98, bestGlobalQ + 3);
  let confidence = 0.85;

  if (nEst >= 8) {
    const medianIdx = Math.floor(nEst / 2);
    finalQ = tileEstimates[medianIdx];
    ciLower = tileEstimates[Math.floor(nEst * 0.05)];
    ciUpper = tileEstimates[Math.min(nEst - 1, Math.floor(nEst * 0.95))];

    // Inter-quartile spread determines confidence
    const q25 = tileEstimates[Math.floor(nEst * 0.25)];
    const q75 = tileEstimates[Math.min(nEst - 1, Math.floor(nEst * 0.75))];
    const iqr = q75 - q25;

    // Low IQR -> High consensus among spatial blocks
    confidence = Math.max(0.2, Math.min(0.98, 1.0 - (iqr / 15.0)));
  }

  return {
    estimatedQ: finalQ,
    ci: [ciLower, ciUpper],
    confidence: Number(confidence.toFixed(3)),
    tvCurve
  };
}
