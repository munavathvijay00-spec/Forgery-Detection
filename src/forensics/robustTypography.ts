/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — ROBUST TYPOGRAPHY & MICRO-STRUCTURE FORENSICS
 * ============================================================================
 *
 * Implements micro-typographical inspection replacing fixed global baseline drift
 * with per-row RANSAC line fitting, Stroke Width Transform (SWT) distributions,
 * and within-word Character Width Variance (CW-VAR) outlier analysis.
 *
 * Designed to detect character-level paste-ins, floating digits, altered font
 * weights, and spliced table cells in financial documents (e.g. altered bank amounts).
 *
 * @citation Epshtein, Ofek, Wexler (2010), "Detecting text in natural scenes with
 *           stroke width transform", IEEE Conference on Computer Vision and Pattern
 *           Recognition (CVPR), pp. 2963-2970.
 * @citation Fischler & Bolles (1981), "Random Sample Consensus: A Paradigm for Model
 *           Fitting with Applications to Image Analysis and Automated Cartography",
 *           Communications of the ACM, Vol. 24, No. 6, pp. 381-395.
 * @citation Kullback & Leibler (1951), "On Information and Sufficiency",
 *           Annals of Mathematical Statistics, Vol. 22, No. 1, pp. 79-86.
 *
 * @packageDocumentation
 * @module forensics/robustTypography
 */

import type { BoundingBox } from "./core/types.ts";

export interface TextLineResult {
  readonly bbox: BoundingBox;
  readonly baseline: { readonly slope: number; readonly intercept: number };
  readonly residualMAD: number;
  readonly outliers: readonly BoundingBox[];
}

export interface RobustTypographyResult {
  readonly textLines: readonly TextLineResult[];
  readonly strokeWidthAnomalies: readonly BoundingBox[];
  readonly cwvarAnomalies: readonly BoundingBox[];
  readonly confidence: number;
}

/**
 * Quickselect algorithm to calculate median of a Float32Array in O(N).
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

    if (partitionIdx === target) return arr[partitionIdx];
    else if (partitionIdx < target) left = partitionIdx + 1;
    else right = partitionIdx - 1;
  }

  return arr[left];
}

/**
 * Computes Median Absolute Deviation (MAD).
 */
function computeMAD(arr: Float32Array, length: number, medianVal: number): number {
  if (length <= 1) return 0.5;
  const dev = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    dev[i] = Math.abs(arr[i] - medianVal);
  }
  return quickselectMedian(dev, length);
}

/**
 * Performs per-row RANSAC line fitting on bottom edge points of character glyphs.
 * Model: y = slope * x + intercept
 */
function ransacLineFit(
  points: readonly { x: number; y: number }[],
  iterations: number = 60,
  inlierThreshold: number = 2.0
): { slope: number; intercept: number; inlierMask: boolean[]; residualMAD: number } {
  const n = points.length;
  if (n < 2) {
    const y0 = n === 1 ? points[0].y : 0;
    return { slope: 0, intercept: y0, inlierMask: [true], residualMAD: 0.5 };
  }

  let bestInliers: boolean[] = new Array(n).fill(false);
  let maxInlierCount = 0;
  let bestSlope = 0;
  let bestIntercept = points[0].y;

  for (let iter = 0; iter < iterations; iter++) {
    const i1 = Math.floor(Math.random() * n);
    let i2 = Math.floor(Math.random() * n);
    if (i1 === i2) i2 = (i1 + 1) % n;

    const p1 = points[i1];
    const p2 = points[i2];
    const dx = p2.x - p1.x;
    if (Math.abs(dx) < 2) continue;

    const slope = (p2.y - p1.y) / dx;
    // Discard unrealistically steep baselines for horizontal document text
    if (Math.abs(slope) > 0.35) continue;

    const intercept = p1.y - slope * p1.x;

    let inliers = 0;
    const mask = new Array(n);
    for (let i = 0; i < n; i++) {
      const predY = slope * points[i].x + intercept;
      const res = Math.abs(points[i].y - predY);
      if (res <= inlierThreshold) {
        mask[i] = true;
        inliers++;
      } else {
        mask[i] = false;
      }
    }

    if (inliers > maxInlierCount) {
      maxInlierCount = inliers;
      bestInliers = mask;
      bestSlope = slope;
      bestIntercept = intercept;
    }
  }

  // Refine slope and intercept using least squares on inliers
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (bestInliers[i]) {
      sumX += points[i].x;
      sumY += points[i].y;
      sumXY += points[i].x * points[i].y;
      sumXX += points[i].x * points[i].x;
      count++;
    }
  }

  if (count >= 2) {
    const meanX = sumX / count;
    const meanY = sumY / count;
    const denom = sumXX - sumX * meanX;
    if (Math.abs(denom) > 1e-4) {
      bestSlope = (sumXY - sumX * meanY) / denom;
      bestIntercept = meanY - bestSlope * meanX;
    }
  }

  // Calculate residuals and robust MAD
  const residuals = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const predY = bestSlope * points[i].x + bestIntercept;
    residuals[i] = Math.abs(points[i].y - predY);
  }

  const copyRes = new Float32Array(residuals);
  const medianRes = quickselectMedian(copyRes, n);
  const resMAD = computeMAD(residuals, n, medianRes);

  return {
    slope: Number(bestSlope.toFixed(5)),
    intercept: Number(bestIntercept.toFixed(2)),
    inlierMask: bestInliers,
    residualMAD: Number(Math.max(0.2, resMAD).toFixed(3))
  };
}

/**
 * Computes Stroke Width Transform (SWT) ray lengths along image gradient directions.
 */
function computeStrokeWidthMap(
  gray: Float32Array,
  width: number,
  height: number,
  darkThreshold: number
): Float32Array {
  const swt = new Float32Array(width * height).fill(0);
  const maxStroke = 35; // Maximum plausible font stroke width in px

  // Sobel 3x3 gradient
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    const rPrev = (y - 1) * width;
    const rCurr = y * width;
    const rNext = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      gx[rCurr + x] =
        -gray[rPrev + x - 1] + gray[rPrev + x + 1]
        - 2 * gray[rCurr + x - 1] + 2 * gray[rCurr + x + 1]
        - gray[rNext + x - 1] + gray[rNext + x + 1];

      gy[rCurr + x] =
        -gray[rPrev + x - 1] - 2 * gray[rPrev + x] - gray[rPrev + x + 1]
        + gray[rNext + x - 1] + 2 * gray[rNext + x] + gray[rNext + x + 1];
    }
  }

  // Cast rays along gradient
  for (let y = 2; y < height - 2; y++) {
    const row = y * width;
    for (let x = 2; x < width - 2; x++) {
      if (gray[row + x] >= darkThreshold) continue;

      const gX = gx[row + x];
      const gY = gy[row + x];
      const mag = Math.hypot(gX, gY);
      if (mag < 25.0) continue;

      const ndx = gX / mag;
      const ndy = gY / mag;

      // Trace along direction ndx, ndy until hitting another edge
      let rayLen = 0;
      let hit = false;
      for (let s = 1; s <= maxStroke; s++) {
        const cx = Math.round(x + ndx * s);
        const cy = Math.round(y + ndy * s);
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) break;

        const val = gray[cy * width + cx];
        if (val >= darkThreshold) {
          // Exited stroke into background
          rayLen = s;
          hit = true;
          break;
        }
      }

      if (hit && rayLen >= 1) {
        swt[row + x] = rayLen;
      }
    }
  }

  return swt;
}

/**
 * Analyzes document typography using per-row RANSAC, Stroke Width Transform, and CW-VAR.
 *
 * @param pixels - Grayscale floating point pixels [0..255]
 * @param width - Image width
 * @param height - Image height
 * @param darkThreshold - Threshold separating dark text from light substrate (default: 180.0)
 */
export function analyzeRobustTypography(
  pixels: Float32Array,
  width: number,
  height: number,
  darkThreshold: number = 180.0
): RobustTypographyResult {
  // 1. Horizontal Projection Profile (Text Row Segmentation)
  const rowDarkCounts = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[rowOffset + x] < darkThreshold) count++;
    }
    rowDarkCounts[y] = count;
  }

  const rowSpans: [number, number][] = [];
  let inRow = false;
  let startY = 0;
  const minRowH = 8;
  const minDark = Math.max(8, Math.floor(width * 0.015));

  for (let y = 0; y < height; y++) {
    if (rowDarkCounts[y] >= minDark) {
      if (!inRow) {
        inRow = true;
        startY = y;
      }
    } else {
      if (inRow) {
        inRow = false;
        if (y - startY >= minRowH) {
          rowSpans.push([startY, y]);
        }
      }
    }
  }

  const textLines: TextLineResult[] = [];
  const cwvarAnomalies: BoundingBox[] = [];
  const strokeWidthAnomalies: BoundingBox[] = [];

  // Compute SWT map for stroke width anomaly inspection
  const swtMap = computeStrokeWidthMap(pixels, width, height, darkThreshold);

  // 2. Process each text line
  for (let r = 0; r < rowSpans.length; r++) {
    const [y0, y1] = rowSpans[r];
    const rowH = y1 - y0;

    // Vertical projection profile within this line to extract character bounding boxes
    const colDarkCounts = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = y0; y < y1; y++) {
        if (pixels[y * width + x] < darkThreshold) count++;
      }
      colDarkCounts[x] = count;
    }

    const charBBoxes: BoundingBox[] = [];
    const basePoints: { x: number; y: number }[] = [];
    let inChar = false;
    let startX = 0;

    for (let x = 0; x < width; x++) {
      if (colDarkCounts[x] >= 2) {
        if (!inChar) {
          inChar = true;
          startX = x;
        }
      } else {
        if (inChar) {
          inChar = false;
          const charW = x - startX;
          if (charW >= 3 && charW <= 80) {
            // Find bottom-most dark pixel for baseline
            let lowestY = y0;
            for (let y = y1 - 1; y >= y0; y--) {
              let hasDark = false;
              for (let cx = startX; cx < x; cx++) {
                if (pixels[y * width + cx] < darkThreshold) {
                  hasDark = true;
                  break;
                }
              }
              if (hasDark) {
                lowestY = y;
                break;
              }
            }

            charBBoxes.push({
              x: startX,
              y: y0,
              width: charW,
              height: rowH
            });
            basePoints.push({ x: startX + charW / 2, y: lowestY });
          }
        }
      }
    }

    if (basePoints.length < 3) continue;

    // 3. Per-row RANSAC baseline fitting
    const ransac = ransacLineFit(basePoints, 80, 2.0);
    const lineOutliers: BoundingBox[] = [];

    // Flag character outliers: |residual| > 3.0 * MAD
    const residualThreshold = Math.max(3.0, 3.0 * ransac.residualMAD);
    for (let i = 0; i < basePoints.length; i++) {
      const pt = basePoints[i];
      const predY = ransac.slope * pt.x + ransac.intercept;
      const res = Math.abs(pt.y - predY);
      if (res > residualThreshold) {
        lineOutliers.push(charBBoxes[i]);
      }
    }

    textLines.push({
      bbox: {
        x: charBBoxes[0].x,
        y: y0,
        width: charBBoxes[charBBoxes.length - 1].x + charBBoxes[charBBoxes.length - 1].width - charBBoxes[0].x,
        height: rowH
      },
      baseline: { slope: ransac.slope, intercept: ransac.intercept },
      residualMAD: ransac.residualMAD,
      outliers: lineOutliers
    });

    // 4. Character Width Variance (CW-VAR) within line
    if (charBBoxes.length >= 6) {
      const widths = new Float32Array(charBBoxes.length);
      for (let i = 0; i < charBBoxes.length; i++) {
        widths[i] = charBBoxes[i].width;
      }
      const copyW = new Float32Array(widths);
      const medianW = quickselectMedian(copyW, charBBoxes.length);
      const madW = computeMAD(widths, charBBoxes.length, medianW);
      const widthThresh = Math.max(4.0, 3.2 * (1.4826 * madW));

      for (let i = 0; i < charBBoxes.length; i++) {
        if (Math.abs(widths[i] - medianW) > widthThresh) {
          cwvarAnomalies.push(charBBoxes[i]);
        }
      }
    }

    // 5. Stroke Width Transform consistency per line
    const swtSamples: number[] = [];
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        const sw = swtMap[y * width + x];
        if (sw > 0) swtSamples.push(sw);
      }
    }

    if (swtSamples.length >= 20) {
      const swtArr = new Float32Array(swtSamples);
      const copySwt = new Float32Array(swtArr);
      const medianSW = quickselectMedian(copySwt, swtSamples.length);
      const madSW = computeMAD(swtArr, swtSamples.length, medianSW);
      const swtThresh = Math.max(2.5, 3.5 * (1.4826 * madSW));

      // Scan character boxes for stroke width anomalies
      for (const box of charBBoxes) {
        let boxSwtSum = 0;
        let boxSwtCount = 0;
        for (let by = box.y; by < box.y + box.height; by++) {
          for (let bx = box.x; bx < box.x + box.width; bx++) {
            const sw = swtMap[by * width + bx];
            if (sw > 0) {
              boxSwtSum += sw;
              boxSwtCount++;
            }
          }
        }
        if (boxSwtCount >= 6) {
          const charAvgSwt = boxSwtSum / boxSwtCount;
          if (Math.abs(charAvgSwt - medianSW) > swtThresh) {
            strokeWidthAnomalies.push(box);
          }
        }
      }
    }
  }

  // Calculate overall confidence score
  let anomalyCount = cwvarAnomalies.length + strokeWidthAnomalies.length;
  for (const line of textLines) {
    anomalyCount += line.outliers.length;
  }

  let confidence = 0.88;
  if (anomalyCount > 0) {
    confidence = Math.min(0.97, 0.72 + anomalyCount * 0.05);
  }

  return {
    textLines,
    strokeWidthAnomalies,
    cwvarAnomalies,
    confidence: Number(confidence.toFixed(3))
  };
}
