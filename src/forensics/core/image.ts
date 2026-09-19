/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — IMAGE PROCESSING & NUMERICAL TENSORS
 * ============================================================================
 * 
 * High-performance, court-defensible scientific image processing module for
 * browser environments (Canvas, WebAssembly, WebGL).
 *
 * Implements:
 *  1. Float32/Uint8ClampedArray pixel buffers and stride management.
 *  2. Color space transforms (ITU-R BT.601, BT.709, JPEG YCbCr, Linear sRGB).
 *  3. O(N) Quickselect for robust median and normal-consistent MAD estimation.
 *  4. Laplacian variance blur metric (Pech-Pacheco et al., 2000).
 *  5. Integral Images (Summed-Area Tables) for O(1) arbitrary window statistics.
 *  6. Sobel spatial gradients, edge orientations, and block extraction.
 *
 * @citation Pech-Pacheco et al. (2000), "Diatom autofocusing in brightfield microscopy:
 *           a comparative study", Proc. 15th ICPR.
 * @citation Crow (1984), "Summed-area tables for texture mapping", ACM SIGGRAPH.
 * @citation Viola & Jones (2001), "Rapid Object Detection using a Boosted Cascade", CVPR.
 *
 * @packageDocumentation
 * @module forensics/core/image
 */

import type {
  BoundingBox,
  Point2D,
  RobustDistributionStats,
} from './types.ts';
import { FORENSIC_CONSTANTS } from './types.ts';

// ============================================================================
// 1. IMAGE BUFFER DATA STRUCTURES
// ============================================================================

/**
 * Supported color channel layouts.
 */
export type ColorChannelLayout = 'RGBA' | 'RGB' | 'GRAYSCALE' | 'YCBCR';

/**
 * In-memory 2D raster image buffer with explicit dimensions, stride, and channel layout.
 */
export interface ImageBuffer2D {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly stride: number;
  readonly data: Float32Array | Uint8ClampedArray;
  readonly layout: ColorChannelLayout;
}

/**
 * Concrete implementation of a 2D forensic image buffer backed by Float32Array.
 * Optimized for numerical operations without 8-bit quantization loss.
 */
export class ForensicFloatImage implements ImageBuffer2D {
  public readonly width: number;
  public readonly height: number;
  public readonly channels: number;
  public readonly stride: number;
  public readonly data: Float32Array;
  public readonly layout: ColorChannelLayout;

  public constructor(
    width: number,
    height: number,
    channels: number,
    layout: ColorChannelLayout,
    data?: Float32Array
  ) {
    if (width <= 0 || height <= 0 || channels <= 0) {
      throw new Error(`Invalid dimensions for ForensicFloatImage: ${width}x${height}x${channels}`);
    }
    this.width = width;
    this.height = height;
    this.channels = channels;
    this.stride = width * channels;
    this.layout = layout;
    this.data = data ?? new Float32Array(width * height * channels);
  }

  /**
   * Retrieves pixel value at (x, y, channel).
   */
  public get(x: number, y: number, channel: number = 0): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || channel < 0 || channel >= this.channels) {
      return 0;
    }
    return this.data[y * this.stride + x * this.channels + channel];
  }

  /**
   * Sets pixel value at (x, y, channel).
   */
  public set(x: number, y: number, channel: number, value: number): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height && channel >= 0 && channel < this.channels) {
      this.data[y * this.stride + x * this.channels + channel] = value;
    }
  }

  /**
   * Clones this image buffer into a distinct memory allocation.
   */
  public clone(): ForensicFloatImage {
    const copy = new Float32Array(this.data);
    return new ForensicFloatImage(this.width, this.height, this.channels, this.layout, copy);
  }

  /**
   * Extracts a sub-region (Region of Interest) as a new buffer.
   */
  public extractRegion(roi: BoundingBox): ForensicFloatImage {
    const startX = Math.max(0, Math.floor(roi.x));
    const startY = Math.max(0, Math.floor(roi.y));
    const endX = Math.min(this.width, Math.ceil(roi.x + roi.width));
    const endY = Math.min(this.height, Math.ceil(roi.y + roi.height));
    const roiW = Math.max(1, endX - startX);
    const roiH = Math.max(1, endY - startY);

    const result = new ForensicFloatImage(roiW, roiH, this.channels, this.layout);
    for (let y = 0; y < roiH; y++) {
      const srcOffset = (startY + y) * this.stride + startX * this.channels;
      const dstOffset = y * result.stride;
      const length = roiW * this.channels;
      result.data.set(this.data.subarray(srcOffset, srcOffset + length), dstOffset);
    }
    return result;
  }
}

// ============================================================================
// 2. COLOR SPACE TRANSFORMATIONS
// ============================================================================

/**
 * Converts standard RGBA Uint8ClampedArray (e.g. from Canvas ImageData)
 * into a single-channel grayscale ForensicFloatImage using ITU-R BT.601 standard luminance:
 * Y = 0.299 * R + 0.587 * G + 0.114 * B
 */
export function rgbaToGrayscaleFloat(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number
): ForensicFloatImage {
  const pixelCount = width * height;
  if (rgbaData.length !== pixelCount * 4) {
    throw new Error(`Buffer size mismatch: expected ${pixelCount * 4} bytes, got ${rgbaData.length}`);
  }

  const gray = new ForensicFloatImage(width, height, 1, 'GRAYSCALE');
  const dst = gray.data;

  for (let i = 0, j = 0; i < rgbaData.length; i += 4, j++) {
    // BT.601 standard weights
    dst[j] = 0.299 * rgbaData[i] + 0.587 * rgbaData[i + 1] + 0.114 * rgbaData[i + 2];
  }

  return gray;
}

/**
 * Converts standard RGBA Uint8ClampedArray into 3-channel JPEG YCbCr float image.
 * Y  =  0.29900 * R + 0.58700 * G + 0.11400 * B
 * Cb = -0.16874 * R - 0.33126 * G + 0.50000 * B + 128
 * Cr =  0.50000 * R - 0.41869 * G - 0.08131 * B + 128
 *
 * @citation ITU-T Recommendation T.81 | ISO/IEC 10918-1:1994 (JPEG).
 */
export function rgbaToYCbCrFloat(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number
): ForensicFloatImage {
  const pixelCount = width * height;
  const ycbcr = new ForensicFloatImage(width, height, 3, 'YCBCR');
  const dst = ycbcr.data;

  for (let i = 0, j = 0; i < rgbaData.length; i += 4, j += 3) {
    const r = rgbaData[i];
    const g = rgbaData[i + 1];
    const b = rgbaData[i + 2];

    dst[j] = 0.299 * r + 0.587 * g + 0.114 * b; // Y
    dst[j + 1] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128.0; // Cb
    dst[j + 2] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128.0; // Cr
  }

  return ycbcr;
}

/**
 * Converts non-linear sRGB [0, 255] to linear luminance [0, 1].
 * Used for physically accurate photon flux and noise modeling.
 */
export function srgbToLinear(val255: number): number {
  const c = val255 / 255.0;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// ============================================================================
// 3. ROBUST STATISTICAL ESTIMATORS (O(N) QUICKSELECT & MAD)
// ============================================================================

/**
 * In-place Quickselect algorithm (Hoare's selection algorithm with median-of-three pivot).
 * Finds the k-th smallest element in an array in expected O(N) time and O(1) auxiliary space.
 */
export function quickselect(arr: Float32Array | number[], k: number, left: number = 0, right: number = arr.length - 1): number {
  if (left === right) {
    return arr[left];
  }

  while (left < right) {
    // Median-of-three pivot selection to prevent worst-case O(N^2) on sorted data
    const mid = (left + right) >> 1;
    if (arr[left] > arr[mid]) swap(arr, left, mid);
    if (arr[left] > arr[right]) swap(arr, left, right);
    if (arr[mid] > arr[right]) swap(arr, mid, right);

    const pivotValue = arr[mid];
    swap(arr, mid, right);

    let storeIndex = left;
    for (let i = left; i < right; i++) {
      if (arr[i] < pivotValue) {
        swap(arr, storeIndex, i);
        storeIndex++;
      }
    }
    swap(arr, storeIndex, right);

    if (k === storeIndex) {
      return arr[k];
    } else if (k < storeIndex) {
      right = storeIndex - 1;
    } else {
      left = storeIndex + 1;
    }
  }

  return arr[left];
}

function swap(arr: Float32Array | number[], i: number, j: number): void {
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}

/**
 * Computes robust distribution statistics over a numerical array in O(N) expected time.
 * Calculates Median, normal-consistent MAD (MAD * 1.4826), IQR, and percentiles.
 */
export function computeRobustStats(values: Float32Array | number[]): RobustDistributionStats {
  const n = values.length;
  if (n === 0) {
    return {
      median: 0,
      mad: 0,
      mean: 0,
      standardDeviation: 0,
      interquartileRange: 0,
      p25: 0,
      p75: 0,
      sampleCount: 0,
    };
  }

  // Work on a working copy to avoid mutating caller's array
  const work = new Float32Array(values);

  // Mean and standard deviation computation
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = work[i];
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const standardDeviation = Math.sqrt(variance);

  // Percentiles via quickselect
  const midIdx = Math.floor(n / 2);
  const p25Idx = Math.floor(n * 0.25);
  const p75Idx = Math.floor(n * 0.75);

  const median = quickselect(work, midIdx);
  const p25 = quickselect(work, p25Idx, 0, midIdx);
  const p75 = quickselect(work, p75Idx, midIdx, n - 1);
  const interquartileRange = p75 - p25;

  // Compute Median Absolute Deviation (MAD)
  const absDeviations = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    absDeviations[i] = Math.abs(values[i] - median);
  }
  const rawMad = quickselect(absDeviations, midIdx);
  const normalConsistentMad = rawMad * FORENSIC_CONSTANTS.NORMAL_CONSISTENT_MAD_SCALE;

  return {
    median,
    mad: normalConsistentMad,
    mean,
    standardDeviation,
    interquartileRange,
    p25,
    p75,
    sampleCount: n,
  };
}

// ============================================================================
// 4. LAPLACIAN OPERATOR & BLUR VARIANCE (FOCUS MEASURE)
// ============================================================================

/**
 * Computes the discrete Laplacian operator of a grayscale image using the 3x3 kernel:
 * [ 0,  1,  0 ]
 * [ 1, -4,  1 ]
 * [ 0,  1,  0 ]
 *
 * @citation Pech-Pacheco et al. (2000), Proc. 15th ICPR.
 */
export function computeLaplacian(image: ForensicFloatImage): ForensicFloatImage {
  if (image.channels !== 1) {
    throw new Error('computeLaplacian requires a single-channel grayscale image');
  }

  const { width, height, data } = image;
  const lap = new ForensicFloatImage(width, height, 1, 'GRAYSCALE');
  const dst = lap.data;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const upOffset = (y - 1) * width;
    const downOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = data[rowOffset + x];
      const val =
        data[upOffset + x] +
        data[downOffset + x] +
        data[rowOffset + x - 1] +
        data[rowOffset + x + 1] -
        4.0 * center;

      dst[rowOffset + x] = val;
    }
  }

  return lap;
}

/**
 * Calculates the Laplacian Variance Focus Measure (\sigma^2_{\Delta}).
 *
 * Used to evaluate document acquisition sharpness:
 *  - Variance > 100: Sharp, high-frequency text edges intact.
 *  - Variance 35-100: Moderate sharpness, acceptable for examination.
 *  - Variance < 35: Severe optical blur or motion degradation; unreliable high-frequency PRNU/ELA.
 */
export function calculateLaplacianBlurVariance(image: ForensicFloatImage): number {
  const lap = computeLaplacian(image);
  const data = lap.data;
  const total = data.length;

  let sum = 0;
  let sumSq = 0;
  let validCount = 0;

  // Exclude 1-pixel border where Laplacian is 0
  const width = image.width;
  const height = image.height;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const v = data[row + x];
      sum += v;
      sumSq += v * v;
      validCount++;
    }
  }

  if (validCount === 0) return 0;

  const mean = sum / validCount;
  const variance = Math.max(0, sumSq / validCount - mean * mean);
  return variance;
}

// ============================================================================
// 5. INTEGRAL IMAGE (SUMMED-AREA TABLE) FOR O(1) LOCAL STATISTICS
// ============================================================================

/**
 * Summed-Area Table (Integral Image) for fast O(1) rectangular region queries.
 * Holds both first-order sum and second-order (squared) sum in Float64Array
 * to prevent numerical overflow on large megapixel documents.
 *
 * @citation Crow (1984), "Summed-area tables for texture mapping", ACM SIGGRAPH.
 * @citation Viola & Jones (2001), "Rapid Object Detection using a Boosted Cascade", CVPR.
 */
export class IntegralImage2D {
  public readonly width: number;
  public readonly height: number;
  private readonly stride: number;
  private readonly sumTable: Float64Array;
  private readonly sumSqTable: Float64Array;

  public constructor(image: ForensicFloatImage) {
    if (image.channels !== 1) {
      throw new Error('IntegralImage2D requires single-channel grayscale input');
    }

    this.width = image.width;
    this.height = image.height;
    // Dimensions of integral image are (width + 1) x (height + 1)
    this.stride = this.width + 1;
    const tableSize = (this.width + 1) * (this.height + 1);
    this.sumTable = new Float64Array(tableSize);
    this.sumSqTable = new Float64Array(tableSize);

    this.build(image.data);
  }

  /**
   * Builds the integral image in a single O(W * H) pass.
   */
  private build(src: Float32Array): void {
    const w = this.width;
    const h = this.height;
    const stride = this.stride;
    const sum = this.sumTable;
    const sumSq = this.sumSqTable;

    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      let rowSumSq = 0;
      const srcRow = y * w;
      const iiRow = (y + 1) * stride;
      const iiPrevRow = y * stride;

      for (let x = 0; x < w; x++) {
        const val = src[srcRow + x];
        rowSum += val;
        rowSumSq += val * val;

        sum[iiRow + x + 1] = sum[iiPrevRow + x + 1] + rowSum;
        sumSq[iiRow + x + 1] = sumSq[iiPrevRow + x + 1] + rowSumSq;
      }
    }
  }

  /**
   * Queries sum of pixel values in arbitrary rectangular window [x, y, x + width, y + height] in O(1) time.
   */
  public querySum(box: BoundingBox): number {
    const x1 = Math.max(0, Math.floor(box.x));
    const y1 = Math.max(0, Math.floor(box.y));
    const x2 = Math.min(this.width, Math.floor(box.x + box.width));
    const y2 = Math.min(this.height, Math.floor(box.y + box.height));

    if (x2 <= x1 || y2 <= y1) return 0;

    const s = this.stride;
    const sum = this.sumTable;

    const A = sum[y1 * s + x1];
    const B = sum[y1 * s + x2];
    const C = sum[y2 * s + x1];
    const D = sum[y2 * s + x2];

    return D - B - C + A;
  }

  /**
   * Queries sum of squared pixel values in arbitrary rectangular window in O(1) time.
   */
  public querySumSq(box: BoundingBox): number {
    const x1 = Math.max(0, Math.floor(box.x));
    const y1 = Math.max(0, Math.floor(box.y));
    const x2 = Math.min(this.width, Math.floor(box.x + box.width));
    const y2 = Math.min(this.height, Math.floor(box.y + box.height));

    if (x2 <= x1 || y2 <= y1) return 0;

    const s = this.stride;
    const sumSq = this.sumSqTable;

    const A = sumSq[y1 * s + x1];
    const B = sumSq[y1 * s + x2];
    const C = sumSq[y2 * s + x1];
    const D = sumSq[y2 * s + x2];

    return D - B - C + A;
  }

  /**
   * Queries local mean and variance for a window in O(1) time.
   */
  public queryMeanAndVariance(box: BoundingBox): { readonly mean: number; readonly variance: number } {
    const x1 = Math.max(0, Math.floor(box.x));
    const y1 = Math.max(0, Math.floor(box.y));
    const x2 = Math.min(this.width, Math.floor(box.x + box.width));
    const y2 = Math.min(this.height, Math.floor(box.y + box.height));
    const count = (x2 - x1) * (y2 - y1);

    if (count <= 0) {
      return { mean: 0, variance: 0 };
    }

    const sumVal = this.querySum(box);
    const sumSqVal = this.querySumSq(box);

    const mean = sumVal / count;
    const variance = Math.max(0, sumSqVal / count - mean * mean);

    return { mean, variance };
  }
}

// ============================================================================
// 6. SPATIAL GRADIENTS (SOBEL KERNELS)
// ============================================================================

/**
 * Result of 2D spatial gradient analysis.
 */
export interface SpatialGradientResult {
  readonly magnitude: ForensicFloatImage;
  readonly angleRadians: ForensicFloatImage; // [-PI, PI]
  readonly meanGradient: number;
}

/**
 * Computes horizontal (Gx) and vertical (Gy) gradients using 3x3 Sobel convolution kernels:
 * Gx:
 * [ -1,  0,  1 ]
 * [ -2,  0,  2 ]
 * [ -1,  0,  1 ]
 * Gy:
 * [ -1, -2, -1 ]
 * [  0,  0,  0 ]
 * [  1,  2,  1 ]
 */
export function computeSobelGradients(image: ForensicFloatImage): SpatialGradientResult {
  if (image.channels !== 1) {
    throw new Error('computeSobelGradients requires single-channel grayscale image');
  }

  const { width, height, data } = image;
  const magnitude = new ForensicFloatImage(width, height, 1, 'GRAYSCALE');
  const angle = new ForensicFloatImage(width, height, 1, 'GRAYSCALE');

  const magDst = magnitude.data;
  const angDst = angle.data;

  let totalMag = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rUp = (y - 1) * width;
    const rMid = y * width;
    const rDown = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const p00 = data[rUp + x - 1];
      const p01 = data[rUp + x];
      const p02 = data[rUp + x + 1];

      const p10 = data[rMid + x - 1];
      const p12 = data[rMid + x + 1];

      const p20 = data[rDown + x - 1];
      const p21 = data[rDown + x];
      const p22 = data[rDown + x + 1];

      // Sobel Gx
      const gx = -p00 + p02 - 2.0 * p10 + 2.0 * p12 - p20 + p22;
      // Sobel Gy
      const gy = -p00 - 2.0 * p01 - p02 + p20 + 2.0 * p21 + p22;

      const mag = Math.sqrt(gx * gx + gy * gy);
      const theta = Math.atan2(gy, gx);

      const idx = rMid + x;
      magDst[idx] = mag;
      angDst[idx] = theta;

      totalMag += mag;
      count++;
    }
  }

  const meanGradient = count > 0 ? totalMag / count : 0;
  return { magnitude, angleRadians: angle, meanGradient };
}

// ============================================================================
// 7. BLOCK EXTRACTION & 8x8 DCT GRID TILING
// ============================================================================

/**
 * Extracts an 8x8 block from an image at block coordinates (blockX, blockY)
 * with optional offset (offsetX, offsetY) for DCT grid misalignment testing.
 */
export function extract8x8Block(
  image: ForensicFloatImage,
  blockX: number,
  blockY: number,
  offsetX: number = 0,
  offsetY: number = 0,
  outBlock?: Float32Array
): Float32Array {
  const block = outBlock ?? new Float32Array(64);
  const startX = blockX * 8 + offsetX;
  const startY = blockY * 8 + offsetY;
  const width = image.width;
  const height = image.height;
  const data = image.data;

  for (let y = 0; y < 8; y++) {
    const srcY = startY + y;
    const clampedY = Math.max(0, Math.min(height - 1, srcY));
    const rowOffset = clampedY * width;
    const blockRow = y * 8;

    for (let x = 0; x < 8; x++) {
      const srcX = startX + x;
      const clampedX = Math.max(0, Math.min(width - 1, srcX));
      block[blockRow + x] = data[rowOffset + clampedX];
    }
  }

  return block;
}
