/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DEMPSTER-SHAFER EVIDENCE FUSION
 * ============================================================================
 *
 * Implements mathematical evidence aggregation over frame of discernment
 * \Omega = { AUTHENTIC, FORGED, UNKNOWN } using Dempster's Rule of Combination.
 *
 * Replaces naive additive heuristic scoring (e.g. 22 + 25 + 18 + 15) with
 * rigorous epistemic uncertainty handling, tracking belief Bel(A), plausibility Pl(A),
 * and conflict mass K.
 *
 * @citation Dempster (1967), "Upper and lower probabilities induced by a multivalued mapping",
 *           Annals of Mathematical Statistics, Vol. 38, No. 2, pp. 325-339.
 * @citation Shafer (1976), "A Mathematical Theory of Evidence", Princeton University Press.
 * @citation Smets & Kennes (1994), "The transferable belief model", Artificial Intelligence, Vol. 66.
 *
 * @packageDocumentation
 * @module forensics/dempsterShaferFusion
 */

export interface DetectorMassAssignment {
  readonly massAuthentic: number;
  readonly massForged: number;
  readonly massUnknown: number;
}

export interface DempsterShaferFusionResult {
  readonly beliefAuthentic: number;
  readonly plausibilityAuthentic: number;
  readonly beliefForged: number;
  readonly plausibilityForged: number;
  readonly conflictMass: number;
  readonly verdict: "LIKELY FORGED" | "LIKELY AUTHENTIC" | "INCONCLUSIVE" | "CONFLICTING";
  readonly confidence: number;
}

/**
 * Combines two independent mass functions m1 and m2 under Dempster's Rule of Combination:
 * m_12(X) = \sum_{A \cap B = X} m_1(A) * m_2(B) / (1 - K)
 * where K = \sum_{A \cap B = \emptyset} m_1(A) * m_2(B)
 */
export function combinePairwiseDempster(
  m1: DetectorMassAssignment,
  m2: DetectorMassAssignment
): { readonly combined: DetectorMassAssignment; readonly conflictK: number } {
  // Normalize inputs to ensure sum == 1.0
  const s1 = m1.massAuthentic + m1.massForged + m1.massUnknown;
  const a1 = s1 > 0 ? m1.massAuthentic / s1 : 0;
  const f1 = s1 > 0 ? m1.massForged / s1 : 0;
  const u1 = s1 > 0 ? m1.massUnknown / s1 : 1;

  const s2 = m2.massAuthentic + m2.massForged + m2.massUnknown;
  const a2 = s2 > 0 ? m2.massAuthentic / s2 : 0;
  const f2 = s2 > 0 ? m2.massForged / s2 : 0;
  const u2 = s2 > 0 ? m2.massUnknown / s2 : 1;

  // Conflict mass: {A} \cap {F} = \emptyset
  const K = a1 * f2 + f1 * a2;

  // Complete contradictory evidence
  if (K >= 0.9999) {
    return {
      combined: { massAuthentic: 0, massForged: 0, massUnknown: 1 },
      conflictK: 1.0
    };
  }

  const denom = 1.0 - K;

  // {A} \cap {A} = {A}, {A} \cap {U} = {A}, {U} \cap {A} = {A}
  const rawA = (a1 * a2 + a1 * u2 + u1 * a2) / denom;

  // {F} \cap {F} = {F}, {F} \cap {U} = {F}, {U} \cap {F} = {F}
  const rawF = (f1 * f2 + f1 * u2 + u1 * f2) / denom;

  // {U} \cap {U} = {U}
  const rawU = (u1 * u2) / denom;

  const sum = rawA + rawF + rawU;
  return {
    combined: {
      massAuthentic: sum > 0 ? rawA / sum : 0,
      massForged: sum > 0 ? rawF / sum : 0,
      massUnknown: sum > 0 ? rawU / sum : 1
    },
    conflictK: K
  };
}

/**
 * Fuses an arbitrary array of detector evidence masses using iterative Dempster-Shafer combination.
 *
 * Verdict Decision Rules:
 *  - BeliefForged > 0.60 AND K < 0.30 -> "LIKELY FORGED"
 *  - BeliefAuthentic > 0.60 AND K < 0.30 -> "LIKELY AUTHENTIC"
 *  - K >= 0.30 -> "CONFLICTING" (requires human forensic examiner intervention)
 *  - Otherwise -> "INCONCLUSIVE"
 *
 * @param detectorMasses - Array of mass functions from active forensic detectors
 */
export function fuseDempsterShafer(
  detectorMasses: readonly DetectorMassAssignment[]
): DempsterShaferFusionResult {
  if (detectorMasses.length === 0) {
    return {
      beliefAuthentic: 0,
      plausibilityAuthentic: 1,
      beliefForged: 0,
      plausibilityForged: 1,
      conflictMass: 0,
      verdict: "INCONCLUSIVE",
      confidence: 0.50
    };
  }

  let accumulated = detectorMasses[0];
  let maxConflictK = 0.0;

  for (let i = 1; i < detectorMasses.length; i++) {
    const res = combinePairwiseDempster(accumulated, detectorMasses[i]);
    accumulated = res.combined;
    if (res.conflictK > maxConflictK) {
      maxConflictK = res.conflictK;
    }
  }

  // Calculate Belief and Plausibility
  // Bel(A) = m(A), Pl(A) = m(A) + m(U)
  const beliefAuthentic = accumulated.massAuthentic;
  const plausibilityAuthentic = accumulated.massAuthentic + accumulated.massUnknown;

  const beliefForged = accumulated.massForged;
  const plausibilityForged = accumulated.massForged + accumulated.massUnknown;

  // Verdict Resolution
  let verdict: "LIKELY FORGED" | "LIKELY AUTHENTIC" | "INCONCLUSIVE" | "CONFLICTING";

  if (maxConflictK >= 0.30) {
    verdict = "CONFLICTING";
  } else if (beliefForged > 0.60) {
    verdict = "LIKELY FORGED";
  } else if (beliefAuthentic > 0.60) {
    verdict = "LIKELY AUTHENTIC";
  } else {
    verdict = "INCONCLUSIVE";
  }

  // Overall confidence metric
  let confidence = 0.70;
  if (verdict === "LIKELY FORGED") {
    confidence = Number(Math.min(0.99, 0.75 + beliefForged * 0.24 - maxConflictK * 0.3).toFixed(3));
  } else if (verdict === "LIKELY AUTHENTIC") {
    confidence = Number(Math.min(0.98, 0.70 + beliefAuthentic * 0.25 - maxConflictK * 0.3).toFixed(3));
  } else if (verdict === "CONFLICTING") {
    confidence = Number(Math.max(0.3, 1.0 - maxConflictK).toFixed(3));
  } else {
    confidence = 0.50;
  }

  return {
    beliefAuthentic: Number(beliefAuthentic.toFixed(4)),
    plausibilityAuthentic: Number(plausibilityAuthentic.toFixed(4)),
    beliefForged: Number(beliefForged.toFixed(4)),
    plausibilityForged: Number(plausibilityForged.toFixed(4)),
    conflictMass: Number(maxConflictK.toFixed(4)),
    verdict,
    confidence
  };
}
