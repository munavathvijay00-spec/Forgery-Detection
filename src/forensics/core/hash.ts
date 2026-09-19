/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — CRYPTOGRAPHIC CHAIN-OF-CUSTODY & PERCEPTUAL HASH
 * ============================================================================
 * 
 * FIPS 180-4 SHA-256 cryptographic hashing, chain-of-custody artifact creation,
 * tamper-evident ledger chaining, and DCT perceptual hashing (pHash).
 *
 * Implements:
 *  1. Dual-mode SHA-256 (Web Cryptography API crypto.subtle with pure TS fallback).
 *  2. Branded SHA256Digest construction and validation.
 *  3. Verifiable ChainOfCustodyArtifact generator for intermediate tensors.
 *  4. Sequential Merkle-chain audit ledger hash linking.
 *  5. 64-bit DCT Perceptual Hash (pHash) for thumbnail mismatch analysis.
 *
 * @citation FIPS PUB 180-4 (2015), "Secure Hash Standard (SHS)", NIST.
 * @citation Zauner (2010), "Implementation and benchmarking of perceptual image hash functions",
 *           Graz University of Technology.
 *
 * @packageDocumentation
 * @module forensics/core/hash
 */

import type {
  SHA256Digest,
  ArtifactType,
  ChainOfCustodyArtifact,
  EvidenceLedgerEntry,
} from './types.ts';

// ============================================================================
// 1. PURE TYPESCRIPT FIPS 180-4 SHA-256 IMPLEMENTATION (ZERO-DEPENDENCY FALLBACK)
// ============================================================================

const K256: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function ch(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z);
}

function maj(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma0(x: number): number {
  return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
}

function sigma1(x: number): number {
  return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
}

function gamma0(x: number): number {
  return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
}

function gamma1(x: number): number {
  return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);
}

/**
 * Pure TypeScript synchronous SHA-256 computation over an arbitrary Uint8Array.
 */
export function sha256Sync(bytes: Uint8Array): SHA256Digest {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const len = bytes.length;
  // Length in bits as 64-bit integer
  const bitLenHi = Math.floor(len / 0x20000000);
  const bitLenLo = (len * 8) >>> 0;

  // Total padded length: multiple of 64 bytes
  const paddedLen = ((len + 8) >>> 6 << 6) + 64;
  const buffer = new Uint8Array(paddedLen);
  buffer.set(bytes);
  buffer[len] = 0x80;

  // Append length in bits (big-endian 64-bit)
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  const w = new Int32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getInt32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = gamma0(w[i - 15]);
      const s1 = gamma1(w[i - 2]);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = sigma1(e);
      const chVal = ch(e, f, g);
      const temp1 = (h + s1 + chVal + K256[i] + w[i]) | 0;
      const s0 = sigma0(a);
      const majVal = maj(a, b, c);
      const temp2 = (s0 + majVal) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const hexDigits = [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(val => (val >>> 0).toString(16).padStart(8, '0'))
    .join('');

  return hexDigits as SHA256Digest;
}

/**
 * Computes SHA-256 digest asynchronously, leveraging Web Crypto API if available,
 * with automatic fallback to pure TypeScript FIPS 180-4.
 */
export async function computeSHA256(data: Uint8Array | string): Promise<SHA256Digest> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    try {
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hex as SHA256Digest;
    } catch {
      // Fallback to sync implementation on subtle crypto error
    }
  }

  return sha256Sync(bytes);
}

// ============================================================================
// 2. CHAIN OF CUSTODY ARTIFACT GENERATOR
// ============================================================================

/**
 * Creates an immutable, cryptographically hashed forensic artifact.
 */
export function createChainOfCustodyArtifact(
  id: string,
  type: ArtifactType,
  payload: Uint8Array | Float32Array | object | string,
  description: string,
  metadata?: Record<string, string | number | boolean>
): ChainOfCustodyArtifact {
  let rawBytes: Uint8Array;
  let mimeType: string;

  if (payload instanceof Uint8Array) {
    rawBytes = payload;
    mimeType = 'application/octet-stream';
  } else if (payload instanceof Float32Array) {
    rawBytes = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    mimeType = 'image/x-raw-float32';
  } else if (typeof payload === 'string') {
    rawBytes = new TextEncoder().encode(payload);
    mimeType = 'text/plain';
  } else {
    const jsonStr = JSON.stringify(payload);
    rawBytes = new TextEncoder().encode(jsonStr);
    mimeType = 'application/json';
  }

  const sha256 = sha256Sync(rawBytes);

  return {
    id,
    type,
    sha256,
    mimeType,
    byteLength: rawBytes.byteLength,
    description,
    generatedAt: new Date().toISOString(),
    metadata,
  };
}

/**
 * Computes chained Merkle hash for evidence ledger audit entries.
 */
export function computeChainedLedgerHash(
  previousHash: SHA256Digest | null,
  entry: Omit<EvidenceLedgerEntry, 'logLikelihoodRatio'>
): SHA256Digest {
  const payload = JSON.stringify({
    prev: previousHash ?? '0000000000000000000000000000000000000000000000000000000000000000',
    step: entry.stepIndex,
    det: entry.detectorId,
    ts: entry.timestamp,
    inputs: entry.inputArtifactHashes,
    outputs: entry.outputArtifactHashes,
    anomalies: entry.anomaliesFound,
  });

  return sha256Sync(new TextEncoder().encode(payload));
}

// ============================================================================
// 3. DCT PERCEPTUAL HASH (pHash) & HAMMING DISTANCE
// ============================================================================

/**
 * Computes a 64-bit DCT-based perceptual hash (pHash) from a 32x32 luminance thumbnail.
 *
 * Algorithm (Zauner, 2010):
 *  1. Accepts 32x32 floating-point luminance matrix.
 *  2. Computes top 8x8 low-frequency 2D DCT coefficients (excluding DC at (0,0)).
 *  3. Computes median of the 63 AC coefficients.
 *  4. Generates 64-bit boolean bitstring: bit_i = 1 if coeff_i > median else 0.
 *
 * @citation Zauner (2010), Graz University of Technology.
 */
export function computeDCTPerceptualHash(thumbnail32x32: Float32Array): string {
  if (thumbnail32x32.length !== 1024) {
    throw new Error(`pHash requires 32x32 (1024 samples) input, got ${thumbnail32x32.length}`);
  }

  // 1. Compute 8x8 low-frequency 2D DCT coefficients from 32x32 spatial grid
  const dctCoeffs = new Float32Array(64);
  const invSqrt2 = 1.0 / Math.SQRT2;

  for (let u = 0; u < 8; u++) {
    const alphaU = u === 0 ? invSqrt2 : 1.0;
    for (let v = 0; v < 8; v++) {
      const alphaV = v === 0 ? invSqrt2 : 1.0;
      let sum = 0.0;

      for (let y = 0; y < 32; y++) {
        const cosV = Math.cos(((2 * y + 1) * v * Math.PI) / 64.0);
        const row = y * 32;
        for (let x = 0; x < 32; x++) {
          const cosU = Math.cos(((2 * x + 1) * u * Math.PI) / 64.0);
          sum += thumbnail32x32[row + x] * cosU * cosV;
        }
      }

      dctCoeffs[v * 8 + u] = 0.25 * alphaU * alphaV * sum;
    }
  }

  // 2. Compute median of AC coefficients (indices 1..63)
  const acCoeffs = new Float32Array(63);
  for (let i = 1; i < 64; i++) {
    acCoeffs[i - 1] = dctCoeffs[i];
  }
  acCoeffs.sort();
  const medianAC = acCoeffs[31];

  // 3. Construct 64-bit hex hash (16 hex chars)
  let hexResult = '';
  for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
    let byteVal = 0;
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const coeffIdx = byteIdx * 8 + bitIdx;
      if (coeffIdx === 0) {
        // DC bit
        if (dctCoeffs[0] > 0) byteVal |= (1 << (7 - bitIdx));
      } else {
        if (dctCoeffs[coeffIdx] > medianAC) byteVal |= (1 << (7 - bitIdx));
      }
    }
    hexResult += byteVal.toString(16).padStart(2, '0');
  }

  return hexResult;
}

/**
 * Computes Hamming distance between two 64-bit perceptual hash hex strings.
 * Normalized to [0, 64]. A distance <= 10 indicates high visual correspondence.
 */
export function computePHashHammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== 16 || hashB.length !== 16) {
    throw new Error('pHash strings must be 16 hex characters (64 bits)');
  }

  let distance = 0;
  for (let i = 0; i < 16; i += 2) {
    const bA = parseInt(hashA.slice(i, i + 2), 16);
    const bB = parseInt(hashB.slice(i, i + 2), 16);
    let xor = bA ^ bB;

    // Count set bits (Kernighan's algorithm)
    while (xor > 0) {
      xor &= xor - 1;
      distance++;
    }
  }

  return distance;
}
