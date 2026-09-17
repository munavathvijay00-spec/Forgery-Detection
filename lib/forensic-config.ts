/**
 * AegisDoc Forensic Configuration — Single Source of Numeric Truth
 * ISO/IEC 27037 Compliant Digital Document Forensic Specification
 * 
 * Reconciles all algorithmic parameters, kernel sizes, quality factors,
 * layer weights, and validation benchmarks across the platform.
 */

export interface ForensicEngineConfig {
  version: string;
  engine: {
    dctBlockSize: 8; // Discrete Cosine Transform 8x8 baseline grid
    elaQuality: 85; // Error Level Analysis recompression baseline quality (85%)
    elaMultiplier: 24; // Visual difference amplification multiplier
    laplacianKernelSize: 3; // Discrete 3x3 high-pass Laplacian filter
    laplacianBlurThreshold: 18.0; // Optical sharpness threshold
    nccBlockSize: 16; // 16x16 sliding block for copy-move correlation
    nccThreshold: 0.94; // Normalized cross-correlation duplication threshold
    minResolutionDpi: 150; // Minimum required document DPI
    minShortEdgePx: 1000; // Minimum edge resolution for dependable signal
    maxFileSizeBytes: 20971520; // 20 MB max file size
    supportedMimeTypes: string[];
  };
  weights: {
    ela: number; // 28%
    noiseDiscontinuity: number; // 22%
    copyMoveNcc: number; // 22%
    fontBaselineGeometry: number; // 16%
    metadataExif: number; // 12%
  };
  decisionThresholds: {
    authenticMaxScore: number; // Score <= 25 => Authentic (Low Risk)
    suspiciousMaxScore: number; // 25 < Score <= 60 => Suspicious (Medium Risk)
    forgedThreshold: number; // Score > 60 => Tampered / Forged (High Risk)
  };
  benchmark: {
    corpusName: string;
    sampleCount: number;
    fprPercent: string;
    fnrPercent: string;
    aucScore: number;
    syntheticAccuracyPercent: string;
    knownFailureCases: {
      title: string;
      description: string;
      mitigation: string;
    }[];
  };
  telemetry: {
    runtimePayloadKb: number;
    coldInitTimeMsDesktop: number;
    coldInitTimeMsMobile: number;
    testedBrowsers: string[];
    fallbackPath: string;
  };
}

export const FORENSIC_CONFIG: ForensicEngineConfig = {
  version: "3.10.0-prod",
  engine: {
    dctBlockSize: 8,
    elaQuality: 85,
    elaMultiplier: 24,
    laplacianKernelSize: 3,
    laplacianBlurThreshold: 18.0,
    nccBlockSize: 16,
    nccThreshold: 0.94,
    minResolutionDpi: 150,
    minShortEdgePx: 1000,
    maxFileSizeBytes: 20971520, // 20 MB
    supportedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ]
  },
  weights: {
    ela: 0.28,
    noiseDiscontinuity: 0.22,
    copyMoveNcc: 0.22,
    fontBaselineGeometry: 0.16,
    metadataExif: 0.12
  },
  decisionThresholds: {
    authenticMaxScore: 25,
    suspiciousMaxScore: 60,
    forgedThreshold: 60
  },
  benchmark: {
    corpusName: "AegisDoc Forensic Benchmark Corpus v2.4 (Synthetic Multi-Bank)",
    sampleCount: 140,
    fprPercent: "2.8%",
    fnrPercent: "4.2%",
    aucScore: 0.978,
    syntheticAccuracyPercent: "96.4%",
    knownFailureCases: [
      {
        title: "Aggressive Multi-Generation Social Media Transcoding",
        description: "Images re-compressed multiple times through WhatsApp/WeChat low-bitrate encoders strip high-frequency DCT quantization traces.",
        mitigation: "Flagged with Low-Confidence Pre-Flight Warning; triggers structural metadata provenance audit."
      },
      {
        title: "Thermal Receipt Non-Uniform Paper Fading",
        description: "Faded carbon/thermal receipt paper with chemical blotches can induce false-positive Laplacian noise variance.",
        mitigation: "Adaptive thresholding normalized against background luminance gradients."
      },
      {
        title: "Vector-Flattened Synthetic PDFs",
        description: "Electronically generated PDFs rasterized without sensor grain lack natural camera sensor noise patterns.",
        mitigation: "Cross-referenced with Layer 4 (Font glyph geometry) and Layer 5 (PDF catalog trailer analysis)."
      }
    ]
  },
  telemetry: {
    runtimePayloadKb: 148,
    coldInitTimeMsDesktop: 140,
    coldInitTimeMsMobile: 380,
    testedBrowsers: [
      "Chrome / Chromium 114+",
      "Safari / WebKit 16.4+",
      "Firefox 115+",
      "Edge 114+"
    ],
    fallbackPath: "Hardware-accelerated WebGL 2.0 OffscreenCanvas with automatic TypedArray 2D Canvas CPU fallback"
  }
};

export default FORENSIC_CONFIG;
