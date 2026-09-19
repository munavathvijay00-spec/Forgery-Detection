/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — ADAPTIVE ERROR LEVEL ANALYSIS (N-ELA)
 * ============================================================================
 *
 * Implements quality-agnostic Error Level Analysis with localized Median Absolute
 * Deviation (MAD) robust Z-score normalization and connected component extraction.
 *
 * Replaces fixed-Q ELA by dynamically conditioning on the estimated original
 * JPEG quality factor Q_est and evaluating residual compression distributions.
 *
 * @citation Luo, Huang, Qiu (2010), "JPEG Error Analysis and Its Applications
 *           to Digital Image Forensics", IEEE TIFS, Vol. 5, No. 3.
 * @citation Krawetz (2007), "A Picture's Worth... Digital Image Analysis and Forensics",
 *           Hacker Factor Solutions.
 *
 * @packageDocumentation
 * @module forensics/adaptiveELA
 */

import type { BoundingBox } from './core/types.ts';
import {
  forwardDCT8x8,
  quantizeDCT8x8,
  dequantizeDCT8x8,
  inverseDCT8x8,
  scaleQuantizationTable,
  JPEG_STD_LUMINANCE_QUANT_TABLE_50
} from './core/dct.ts';

export interface AdaptiveELAResult {
  /** Map of localized Z-score anomalies per pixel (width * height) */
  readonly zMap: Float32Array;
  /** Raw recompression absolute delta map |I - Q_est(I)| */
  readonly deltaMap: Float32Array;
  /** Extracted spatial bounding boxes of statistically significant anomaly clusters */
  readonly anomalyRegions: readonly BoundingBox[];
  /** Overall forensic confidence score in [0.0, 1.0] */
  readonly confidence: number;
  /** Peak Z-score observed across the entire document */
  readonly maxZScore: number;
  /** Operating quality factor used for recompression baseline */
  readonly baselineQ: number;
}

/**
 * Computes median of a float array using Quickselect O(N).
 */
function quickselectMedian(arr: Float32Array, length: number): number {
  if (length === 0) return 0;
  if (length === 1) return arr[0];

  const target = Math.floor(length / 2);
  let left = 0;
  let right = length - 1;

  while (left < right) {
    const pivotVal = arr[right];
    let partitionIdx = left;
    for (let i = left; i < right; i++) {
      if (arr[i] < pivotVal) {
        const tmp = arr[i];
        arr[i] = arr[partitionIdx];
        arr[partitionIdx] = tmp;
        partitionIdx++;
      }
    }
    const tmp = arr[right];
    arr[right] = arr[partitionIdx];
    arr[partitionIdx] = tmp;

    if (partitionIdx === target) {
      return arr[partitionIdx];
    } else if (partitionIdx < target) {
      left = partitionIdx + 1;
    } else {
      right = partitionIdx - 1;
    }
  }

  return arr[left];
}

/**
 * Fast 2-pass Connected Component Labeling to group flagged pixels into BoundingBoxes.
 */
function extractAnomalyClusters(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number = 24
): BoundingBox[] {
  const visited = new Uint8Array(width * height);
  const boxes: BoundingBox[] = [];

  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0 || visited[idx] === 1) continue;

      // Start BFS component flood fill
      let qHead = 0;
      let qTail = 0;
      queueX[qTail] = x;
      queueY[qTail] = y;
      qTail++;
      visited[idx] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;

      while (qHead < qTail) {
        const cx = queueX[qHead];
        const cy = queueY[qHead];
        qHead++;
        pixelCount++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 8-neighborhood expansion
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (mask[nIdx] === 1 && visited[nIdx] === 0) {
                visited[nIdx] = 1;
                queueX[qTail] = nx;
                queueY[qTail] = ny;
                qTail++;
              }
            }
          }
        }
      }

      if (pixelCount >= minArea) {
        boxes.push({
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX + 1),
          height: Math.max(1, maxY - minY + 1)
        });
      }
    }
  }

  // Merge nearby / overlapping boxes
  return mergeBoundingBoxes(boxes, 12);
}

function mergeBoundingBoxes(boxes: BoundingBox[], padding: number): BoundingBox[] {
  if (boxes.length <= 1) return boxes;

  const merged: BoundingBox[] = [];
  const used = new Uint8Array(boxes.length);

  for (let i = 0; i < boxes.length; i++) {
    if (used[i] === 1) continue;
    let b = boxes[i];
    let changed = true;

    while (changed) {
      changed = false;
      for (let j = 0; j < boxes.length; j++) {
        if (i !== j && used[j] === 0) {
          const candidate = boxes[j];
          // Check overlap with padding
          if (
            b.x - padding <= candidate.x + candidate.width &&
            b.x + b.width + padding >= candidate.x &&
            b.y - padding <= candidate.y + candidate.height &&
            b.y + b.height + padding >= candidate.y
          ) {
            used[j] = 1;
            const newX = Math.min(b.x, candidate.x);
            const newY = Math.min(b.y, candidate.y);
            const newMaxX = Math.max(b.x + b.width, candidate.x + candidate.width);
            const newMaxY = Math.max(b.y + b.height, candidate.y + candidate.height);
            b = {
              x: newX,
              y: newY,
              width: newMaxX - newX,
              height: newMaxY - newY
            };
            changed = true;
          }
        }
      }
    }
    used[i] = 1;
    merged.push(b);
  }

  return merged;
}

/**
 * Computes Adaptive Error Level Analysis with localized MAD Z-score normalization.
 *
 * 1. Simulates JPEG recompression at quality Q_est.
 * 2. Computes per-pixel absolute error delta: Delta(x, y) = |I(x,y) - Q_est(I)(x,y)|.
 * 3. Partitions image into 32x32 sliding windows to estimate local median and MAD.
 * 4. Normalizes error to robust Z-score: Z(x, y) = (Delta - median) / (1.4826 * MAD + eps).
 * 5. Flags pixels where |Z(x, y)| > 3.5 and extracts contiguous spatial anomaly regions.
 *
 * @param pixels - Grayscale or RGBA pixel buffer
 * @param width - Image width
 * @param height - Image height
 * @param estimatedQ - Primary JPEG quality estimate from Module A (default: 85)
 * @param channels - 1 for grayscale/luma, 4 for RGBA (default: 4)
 */
export function computeAdaptiveELA(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  estimatedQ: number = 85,
  channels: number = 4
): AdaptiveELAResult {
  const totalPixels = width * height;
  const luma = new Float32Array(totalPixels);

  // Extract luminance channel
  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * channels;
    if (channels >= 3) {
      luma[i] = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
    } else {
      luma[i] = pixels[pIdx];
    }
  }

  // 1. Recompress in 8x8 blocks at estimatedQ
  const qTable = scaleQuantizationTable(JPEG_STD_LUMINANCE_QUANT_TABLE_50, estimatedQ);
  const blocksX = Math.floor(width / 8);
  const blocksY = Math.floor(height / 8);

  const deltaMap = new Float32Array(totalPixels);
  const blockIn = new Float32Array(64);
  const blockDct = new Float32Array(64);
  const blockQuant = new Int32Array(64);
  const blockDequant = new Float32Array(64);
  const blockSpatial = new Float32Array(64);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const startX = bx * 8;
      const startY = by * 8;

      // Load block & level shift
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          blockIn[r * 8 + c] = luma[(startY + r) * width + (startX + c)] - 128.0;
        }
      }

      // Forward DCT -> Quantize -> Dequantize -> IDCT
      forwardDCT8x8(blockIn, blockDct);
      quantizeDCT8x8(blockDct, qTable, blockQuant);
      dequantizeDCT8x8(blockQuant, qTable, blockDequant);
      inverseDCT8x8(blockDequant, blockSpatial);

      // Compute absolute error delta
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const recon = Math.max(0, Math.min(255, Math.round(blockSpatial[r * 8 + c] + 128.0)));
          const orig = luma[(startY + r) * width + (startX + c)];
          deltaMap[(startY + r) * width + (startX + c)] = Math.abs(orig - recon);
        }
      }
    }
  }

  // 2. Localized 32x32 window Median & MAD robust Z-score calculation
  const zMap = new Float32Array(totalPixels);
  const anomalyMask = new Uint8Array(totalPixels);
  const winSize = 32;
  const halfWin = winSize / 2;

  const windowBuffer = new Float32Array(winSize * winSize);
  const devBuffer = new Float32Array(winSize * winSize);

  let maxZ = 0.0;
  let anomalyCount = 0;

  // Grid step: evaluate 32x32 tiles with 16px stride for smooth normalization
  const step = 16;
  for (let wy = 0; wy < height; wy += step) {
    for (let wx = 0; wx < width; wx += step) {
      let count = 0;
      for (let dy = 0; dy < winSize; dy++) {
        const y = wy - halfWin + dy;
        if (y < 0 || y >= height) continue;
        for (let dx = 0; dx < winSize; dx++) {
          const x = wx - halfWin + dx;
          if (x < 0 || x >= width) continue;
          windowBuffer[count++] = deltaMap[y * width + x];
        }
      }

      if (count < 16) continue;

      // Copy to preserve windowBuffer order for quickselect
      const sampleCopy = new Float32Array(count);
      sampleCopy.set(windowBuffer.subarray(0, count));
      const medianDelta = quickselectMedian(sampleCopy, count);

      // Compute MAD: median(|X - median|)
      for (let i = 0; i < count; i++) {
        devBuffer[i] = Math.abs(windowBuffer[i] - medianDelta);
      }
      const mad = quickselectMedian(devBuffer, count);
      // Normal-consistent standard deviation estimate: sigma = 1.4826 * MAD
      const sigma = 1.4826 * mad + 0.15;

      // Assign Z-scores to tile center
      for (let dy = 0; dy < step; dy++) {
        const y = wy + dy;
        if (y >= height) break;
        for (let dx = 0; dx < step; dx++) {
          const x = wx + dx;
          if (x >= width) break;
          const idx = y * width + x;
          const z = (deltaMap[idx] - medianDelta) / sigma;
          zMap[idx] = z;

          if (Math.abs(z) > maxZ) {
            maxZ = Math.abs(z);
          }

          // Statistically significant anomaly at |Z| > 3.5
          if (z > 3.5) {
            anomalyMask[idx] = 1;
            anomalyCount++;
          }
        }
      }
    }
  }

  // 3. Group flagged pixels into bounding box regions
  const anomalyRegions = extractAnomalyClusters(anomalyMask, width, height, 20);

  // Confidence computation: depends on peak Z-score and spatial coherence
  let confidence = 0.5;
  if (maxZ > 5.0 && anomalyRegions.length > 0) {
    confidence = Math.min(0.96, 0.65 + (maxZ - 5.0) * 0.05);
  } else if (maxZ <= 2.5 && anomalyRegions.length === 0) {
    confidence = 0.90; // High confidence in authenticity
  }

  return {
    zMap,
    deltaMap,
    anomalyRegions,
    confidence: Number(confidence.toFixed(3)),
    maxZScore: Number(maxZ.toFixed(2)),
    baselineQ: estimatedQ
  };
}
