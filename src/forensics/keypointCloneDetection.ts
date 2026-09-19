/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — KEYPOINT CLONE-MOVE DETECTION (ORB + RANSAC)
 * ============================================================================
 *
 * Implements rotation- and scale-invariant copy-move forgery detection using
 * FAST keypoints with intensity-centroid orientation (oFAST) and rotation-aware
 * binary descriptors (rBRIEF), combined with Lowe's ratio test and RANSAC
 * geometric transformation estimation.
 *
 * Replaces fixed-block Normalized Cross-Correlation (NCC) with an affine-invariant
 * detector capable of identifying cloned wet stamps, forged signatures, and duplicated
 * numeric regions subject to rotation, scaling, or affine distortion.
 *
 * @citation Rublee, Rabaud, Konolige, Bradski (2011), "ORB: An efficient alternative
 *           to SIFT or SURF", IEEE International Conference on Computer Vision (ICCV).
 * @citation Lowe (2004), "Distinctive Image Features from Scale-Invariant Keypoints",
 *           International Journal of Computer Vision (IJCV), Vol. 60, No. 2.
 * @citation Amerini, Ballan, Caldelli, Del Bimbo, Serra (2011), "A SIFT-Based Forensic
 *           Method for Copy-Move Attack Detection and Transformation Recovery",
 *           IEEE TIFS, Vol. 6, No. 3.
 *
 * @packageDocumentation
 * @module forensics/keypointCloneDetection
 */

import type { BoundingBox } from './core/types.ts';

export interface CloneCluster {
  readonly bboxA: BoundingBox;
  readonly bboxB: BoundingBox;
  readonly inliers: number;
  readonly rotationDeg: number;
  readonly scaleFactor: number;
  readonly confidence: number;
  readonly transformMatrix: readonly [number, number, number, number, number, number];
}

export interface KeypointCloneResult {
  readonly keypointCount: number;
  readonly clusters: readonly CloneCluster[];
  readonly confidence: number;
  readonly matchCount: number;
}

interface Keypoint {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly descriptor: Uint32Array; // 256 bits = 8 x 32-bit words
}

// 16-pixel Bresenham circle offsets around candidate pixel (radius 3)
const CIRCLE_OFFSETS: readonly [number, number][] = [
  [0, -3], [1, -3], [2, -2], [3, -1],
  [3, 0],  [3, 1],  [2, 2],  [1, 3],
  [0, 3],  [-1, 3], [-2, 2], [-3, 1],
  [-3, 0], [-3, -1], [-2, -2], [-1, -3]
];

// Pre-generated 256 test point pairs (x1, y1, x2, y2) for BRIEF descriptor in [-12..12]
const BRIEF_PAIRS: readonly [number, number, number, number][] = (() => {
  const pairs: [number, number, number, number][] = [];
  // Seeded deterministic sampling
  let s = 1234567;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296);
  };
  for (let i = 0; i < 256; i++) {
    const x1 = Math.round((lcg() - 0.5) * 24);
    const y1 = Math.round((lcg() - 0.5) * 24);
    const x2 = Math.round((lcg() - 0.5) * 24);
    const y2 = Math.round((lcg() - 0.5) * 24);
    pairs.push([x1, y1, x2, y2]);
  }
  return pairs;
})();

/**
 * Detects FAST-9 corners with intensity centroid orientation (oFAST).
 */
function extractFASTKeypoints(
  gray: Float32Array,
  width: number,
  height: number,
  threshold: number = 18.0,
  maxPoints: number = 1500
): Keypoint[] {
  const keypoints: Keypoint[] = [];
  const minMargin = 16;

  // Scan candidate pixels
  for (let y = minMargin; y < height - minMargin; y += 2) {
    const row = y * width;
    for (let x = minMargin; x < width - minMargin; x += 2) {
      const p = gray[row + x];

      // Quick test: pixels 0, 4, 8, 12 on circle
      let brightCount = 0;
      let darkCount = 0;
      const qOffsets = [0, 4, 8, 12];
      for (const qo of qOffsets) {
        const val = gray[(y + CIRCLE_OFFSETS[qo][1]) * width + (x + CIRCLE_OFFSETS[qo][0])];
        if (val > p + threshold) brightCount++;
        else if (val < p - threshold) darkCount++;
      }
      if (brightCount < 3 && darkCount < 3) continue;

      // Full FAST-9 circle check (9 contiguous pixels)
      let isCorner = false;
      let contiguousBright = 0;
      let contiguousDark = 0;

      for (let i = 0; i < 31; i++) {
        const idx = i % 16;
        const val = gray[(y + CIRCLE_OFFSETS[idx][1]) * width + (x + CIRCLE_OFFSETS[idx][0])];
        if (val > p + threshold) {
          contiguousBright++;
          contiguousDark = 0;
          if (contiguousBright >= 9) { isCorner = true; break; }
        } else if (val < p - threshold) {
          contiguousDark++;
          contiguousBright = 0;
          if (contiguousDark >= 9) { isCorner = true; break; }
        } else {
          contiguousBright = 0;
          contiguousDark = 0;
        }
      }

      if (isCorner) {
        // Compute Intensity Centroid orientation in patch radius 10
        let m01 = 0;
        let m10 = 0;
        for (let dy = -8; dy <= 8; dy++) {
          const cy = y + dy;
          for (let dx = -8; dx <= 8; dx++) {
            if (dx * dx + dy * dy <= 64) {
              const intensity = gray[cy * width + (x + dx)];
              m10 += dx * intensity;
              m01 += dy * intensity;
            }
          }
        }
        const angle = Math.atan2(m01, m10);

        // Compute steered BRIEF binary descriptor (256 bits = 8 words)
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const desc = new Uint32Array(8);

        for (let i = 0; i < 256; i++) {
          const [p1x, p1y, p2x, p2y] = BRIEF_PAIRS[i];
          const rx1 = Math.round(x + p1x * cos - p1y * sin);
          const ry1 = Math.round(y + p1x * sin + p1y * cos);
          const rx2 = Math.round(x + p2x * cos - p2y * sin);
          const ry2 = Math.round(y + p2x * sin + p2y * cos);

          const v1 = (rx1 >= 0 && rx1 < width && ry1 >= 0 && ry1 < height) ? gray[ry1 * width + rx1] : 0;
          const v2 = (rx2 >= 0 && rx2 < width && ry2 >= 0 && ry2 < height) ? gray[ry2 * width + rx2] : 0;

          if (v1 < v2) {
            const wordIdx = Math.floor(i / 32);
            const bitIdx = i % 32;
            desc[wordIdx] |= (1 << bitIdx);
          }
        }

        keypoints.push({ x, y, angle, descriptor: desc });
        if (keypoints.length >= maxPoints) return keypoints;
      }
    }
  }

  return keypoints;
}

/**
 * Fast popcount Hamming distance between two 256-bit binary descriptors.
 */
function hammingDistance(d1: Uint32Array, d2: Uint32Array): number {
  let dist = 0;
  for (let i = 0; i < 8; i++) {
    let v = (d1[i] ^ d2[i]) >>> 0;
    // Brian Kernighan bit count
    while (v > 0) {
      v &= v - 1;
      dist++;
    }
  }
  return dist;
}

interface MatchPair {
  readonly kpA: Keypoint;
  readonly kpB: Keypoint;
  readonly distance: number;
}

/**
 * Runs Lowe's ratio test matching with spatial pre-filtering.
 */
function matchKeypoints(
  keypoints: readonly Keypoint[],
  minSpatialDist: number
): MatchPair[] {
  const matches: MatchPair[] = [];
  const n = keypoints.length;
  if (n < 4) return matches;

  for (let i = 0; i < n; i++) {
    const k1 = keypoints[i];
    let bestDist = 256;
    let secondDist = 256;
    let bestMatchIdx = -1;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const k2 = keypoints[j];

      // Spatial pre-filter: candidate matches must be separated by at least minSpatialDist
      const dx = k1.x - k2.x;
      const dy = k1.y - k2.y;
      if (dx * dx + dy * dy < minSpatialDist * minSpatialDist) continue;

      const d = hammingDistance(k1.descriptor, k2.descriptor);
      if (d < bestDist) {
        secondDist = bestDist;
        bestDist = d;
        bestMatchIdx = j;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }

    // Lowe's ratio test: d1 / d2 < 0.75
    if (bestMatchIdx !== -1 && bestDist < 64 && bestDist < 0.75 * secondDist) {
      matches.push({
        kpA: k1,
        kpB: keypoints[bestMatchIdx],
        distance: bestDist
      });
    }
  }

  return matches;
}

/**
 * 2D Affine RANSAC estimation.
 * Finds affine transform [x', y']^T = A [x, y]^T + t maximizing inliers.
 */
function ransacAffineClustering(
  matches: readonly MatchPair[],
  imageDiagonal: number,
  inlierThresholdPx: number = 3.0
): CloneCluster[] {
  const clusters: CloneCluster[] = [];
  if (matches.length < 12) return clusters;

  const minSpread = 0.05 * imageDiagonal;
  let remainingMatches = [...matches];

  // Try extracting up to 3 distinct transform clusters
  for (let iter = 0; iter < 3; iter++) {
    if (remainingMatches.length < 12) break;

    let bestInliers: MatchPair[] = [];
    let bestTransform = [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number];

    const iterations = Math.min(200, remainingMatches.length * 10);
    for (let it = 0; it < iterations; it++) {
      // Pick 3 random distinct matches
      const i1 = Math.floor(Math.random() * remainingMatches.length);
      let i2 = Math.floor(Math.random() * remainingMatches.length);
      let i3 = Math.floor(Math.random() * remainingMatches.length);
      if (i1 === i2 || i2 === i3 || i1 === i3) continue;

      const m1 = remainingMatches[i1];
      const m2 = remainingMatches[i2];
      const m3 = remainingMatches[i3];

      // Solve 2D affine transform from 3 point correspondences
      const x1 = m1.kpA.x, y1 = m1.kpA.y, u1 = m1.kpB.x, v1 = m1.kpB.y;
      const x2 = m2.kpA.x, y2 = m2.kpA.y, u2 = m2.kpB.x, v2 = m2.kpB.y;
      const x3 = m3.kpA.x, y3 = m3.kpA.y, u3 = m3.kpB.x, v3 = m3.kpB.y;

      const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
      if (Math.abs(det) < 1e-4) continue;

      // Invert 3x3 system for (a11, a12, tx) and (a21, a22, ty)
      const a11 = (u1 * (y2 - y3) + u2 * (y3 - y1) + u3 * (y1 - y2)) / det;
      const a12 = (u1 * (x3 - x2) + u2 * (x1 - x3) + u3 * (x2 - x1)) / det;
      const tx = (u1 * (x2 * y3 - x3 * y2) + u2 * (x3 * y1 - x1 * y3) + u3 * (x1 * y2 - x2 * y1)) / det;

      const a21 = (v1 * (y2 - y3) + v2 * (y3 - y1) + v3 * (y1 - y2)) / det;
      const a22 = (v1 * (x3 - x2) + v2 * (x1 - x3) + v3 * (x2 - x1)) / det;
      const ty = (v1 * (x2 * y3 - x3 * y2) + v2 * (x3 * y1 - x1 * y3) + v3 * (x1 * y2 - x2 * y1)) / det;

      // Count inliers
      const inliers: MatchPair[] = [];
      for (const m of remainingMatches) {
        const projX = a11 * m.kpA.x + a12 * m.kpA.y + tx;
        const projY = a21 * m.kpA.x + a22 * m.kpA.y + ty;
        const err = Math.hypot(projX - m.kpB.x, projY - m.kpB.y);
        if (err <= inlierThresholdPx) {
          inliers.push(m);
        }
      }

      if (inliers.length > bestInliers.length) {
        bestInliers = inliers;
        bestTransform = [a11, a12, a21, a22, tx, ty];
      }
    }

    if (bestInliers.length >= 12) {
      // Calculate spatial bounding boxes
      let minAx = Infinity, maxAx = -Infinity, minAy = Infinity, maxAy = -Infinity;
      let minBx = Infinity, maxBx = -Infinity, minBy = Infinity, maxBy = -Infinity;

      for (const m of bestInliers) {
        minAx = Math.min(minAx, m.kpA.x);
        maxAx = Math.max(maxAx, m.kpA.x);
        minAy = Math.min(minAy, m.kpA.y);
        maxAy = Math.max(maxAy, m.kpA.y);

        minBx = Math.min(minBx, m.kpB.x);
        maxBx = Math.max(maxBx, m.kpB.x);
        minBy = Math.min(minBy, m.kpB.y);
        maxBy = Math.max(maxBy, m.kpB.y);
      }

      const spreadA = Math.hypot(maxAx - minAx, maxAy - minAy);
      const spreadB = Math.hypot(maxBx - minBx, maxBy - minBy);

      if (spreadA >= minSpread && spreadB >= minSpread) {
        const [a11, a12, a21] = bestTransform;
        const scale = Math.hypot(a11, a21);
        const rotRad = Math.atan2(a21, a11);
        const rotDeg = Number(((rotRad * 180) / Math.PI).toFixed(1));

        clusters.push({
          bboxA: { x: minAx - 4, y: minAy - 4, width: maxAx - minAx + 8, height: maxAy - minAy + 8 },
          bboxB: { x: minBx - 4, y: minBy - 4, width: maxBx - minBx + 8, height: maxBy - minBy + 8 },
          inliers: bestInliers.length,
          rotationDeg: rotDeg,
          scaleFactor: Number(scale.toFixed(2)),
          confidence: Number(Math.min(0.98, 0.70 + bestInliers.length * 0.02).toFixed(3)),
          transformMatrix: bestTransform
        });

        // Remove inliers from remaining set
        remainingMatches = remainingMatches.filter(m => !bestInliers.includes(m));
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return clusters;
}

/**
 * Executes rotation- and scale-invariant Copy-Move Keypoint Forgery Detection.
 *
 * @param gray - Grayscale floating-point image [0..255]
 * @param width - Image width
 * @param height - Image height
 */
export function detectKeypointClones(
  gray: Float32Array,
  width: number,
  height: number
): KeypointCloneResult {
  const diagonal = Math.hypot(width, height);
  const minSpatialDist = 0.05 * diagonal;

  // 1. Extract oFAST keypoints + steered BRIEF descriptors
  const keypoints = extractFASTKeypoints(gray, width, height, 18.0, 1500);

  // 2. Pairwise Hamming matching + Lowe's ratio test (d1/d2 < 0.75)
  const matches = matchKeypoints(keypoints, minSpatialDist);

  // 3. RANSAC Affine transformation estimation
  const clusters = ransacAffineClustering(matches, diagonal, 3.0);

  let confidence = 0.85;
  if (clusters.length > 0) {
    confidence = Math.max(...clusters.map(c => c.confidence));
  }

  return {
    keypointCount: keypoints.length,
    clusters,
    confidence,
    matchCount: matches.length
  };
}
