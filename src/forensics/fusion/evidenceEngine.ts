/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DEMPSTER-SHAFER EVIDENCE FUSION ENGINE
 * ============================================================================
 * 
 * Epistemic evidence fusion combining orthogonal detector outputs over frame
 * of discernment \Omega = { AUTHENTIC, FORGED } with explicit conflict quantification.
 *
 * Implements:
 *  1. Dempster's Rule of Combination for basic probability assignments.
 *  2. Conflict metric K tracking and critical instability detection (K >= 0.70).
 *  3. Lower and upper probability bounds: Belief Bel(A) and Plausibility Pl(A).
 *  4. Smets' Transferable Belief Model Pignistic Probability Transformation BetP(F).
 *  5. Dynamic detector discount weighting based on image quality/resolution.
 *
 * @citation Dempster (1967), "Upper and lower probabilities induced by a multivalued mapping", Ann. Math. Statist.
 * @citation Shafer (1976), "A Mathematical Theory of Evidence", Princeton Univ Press.
 * @citation Smets & Kennes (1994), "The transferable belief model", Artificial Intelligence.
 *
 * @packageDocumentation
 * @module forensics/fusion/evidenceEngine
 */

import type {
  DempsterShaferMassFunction,
  DetectorEvidenceMass,
  FusionEvidenceState,
  BeliefPlausibilityInterval,
} from '../core/types.ts';
import { FORENSIC_CONSTANTS } from '../core/types.ts';

/**
 * Combines two independent mass functions m1 and m2 under Dempster's Rule of Combination.
 *
 * Power Set Hypotheses:
 *   - {A}: Authentic
 *   - {F}: Forged
 *   - {A, F} (\Theta): Total ignorance / epistemic uncertainty
 */
export function combineTwoMassFunctions(
  m1: DempsterShaferMassFunction,
  m2: DempsterShaferMassFunction
): { readonly combined: DempsterShaferMassFunction; readonly conflictK: number } {
  // Conflict mass K = m1({A}) * m2({F}) + m1({F}) * m2({A})
  const K = m1.massAuthentic * m2.massForged + m1.massForged * m2.massAuthentic;

  // If conflict is absolute (K >= 1.0 - 1e-7), combination is degenerate
  if (K >= 0.999999) {
    return {
      combined: {
        massAuthentic: 0.0,
        massForged: 0.0,
        massUncertainty: 1.0,
      },
      conflictK: 1.0,
    };
  }

  const denom = 1.0 - K;

  // m({A}) = [ m1({A})*m2({A}) + m1({A})*m2(\Theta) + m1(\Theta)*m2({A}) ] / (1 - K)
  const numA =
    m1.massAuthentic * m2.massAuthentic +
    m1.massAuthentic * m2.massUncertainty +
    m1.massUncertainty * m2.massAuthentic;

  // m({F}) = [ m1({F})*m2({F}) + m1({F})*m2(\Theta) + m1(\Theta)*m2({F}) ] / (1 - K)
  const numF =
    m1.massForged * m2.massForged +
    m1.massForged * m2.massUncertainty +
    m1.massUncertainty * m2.massForged;

  // m(\Theta) = [ m1(\Theta)*m2(\Theta) ] / (1 - K)
  const numTheta = m1.massUncertainty * m2.massUncertainty;

  const rawA = numA / denom;
  const rawF = numF / denom;
  const rawTheta = numTheta / denom;

  // Ensure strict sum to 1.0 with numerical normalization
  const sum = rawA + rawF + rawTheta;
  const normA = sum > 0 ? rawA / sum : 0;
  const normF = sum > 0 ? rawF / sum : 0;
  const normTheta = sum > 0 ? rawTheta / sum : 1;

  return {
    combined: {
      massAuthentic: Math.max(0, Math.min(1, normA)),
      massForged: Math.max(0, Math.min(1, normF)),
      massUncertainty: Math.max(0, Math.min(1, normTheta)),
    },
    conflictK: K,
  };
}

/**
 * Applies Shafer's reliability discounting to a detector's raw evidence mass:
 *   m_discounted(A) = \alpha * m(A)
 *   m_discounted(F) = \alpha * m(F)
 *   m_discounted(\Theta) = 1 - \alpha * (1 - m(\Theta))
 * where \alpha in [0, 1] is the reliability weight.
 */
export function discountMassFunction(
  mass: DetectorEvidenceMass
): DempsterShaferMassFunction {
  const alpha = Math.max(0.0, Math.min(1.0, mass.reliabilityWeight));

  const massAuthentic = alpha * mass.massAuthentic;
  const massForged = alpha * mass.massForged;
  const massUncertainty = 1.0 - alpha + alpha * mass.massUncertainty;

  return {
    massAuthentic,
    massForged,
    massUncertainty,
  };
}

/**
 * Executes Dempster-Shafer evidence fusion across all active detector masses.
 */
export function fuseDetectorEvidence(
  detectorMasses: readonly DetectorEvidenceMass[]
): FusionEvidenceState {
  if (detectorMasses.length === 0) {
    const vacuum: DempsterShaferMassFunction = {
      massAuthentic: 0.0,
      massForged: 0.0,
      massUncertainty: 1.0,
    };
    const vacuumInterval: BeliefPlausibilityInterval = {
      belief: 0.0,
      plausibility: 1.0,
      intervalWidth: 1.0,
    };
    return {
      combinedMass: vacuum,
      conflictMassK: 0.0,
      isHighConflict: false,
      authenticInterval: vacuumInterval,
      forgedInterval: vacuumInterval,
      pignisticProbabilityForged: 0.5,
      inputMasses: [],
    };
  }

  // 1. Discount each detector mass by its quality/reliability weight
  const discounted = detectorMasses.map(m => discountMassFunction(m));

  // 2. Sequential fusion across detectors
  let accumulated = discounted[0];
  let maxConflictK = 0.0;

  for (let i = 1; i < discounted.length; i++) {
    const { combined, conflictK } = combineTwoMassFunctions(accumulated, discounted[i]);
    accumulated = combined;
    if (conflictK > maxConflictK) {
      maxConflictK = conflictK;
    }
  }

  const isHighConflict = maxConflictK >= FORENSIC_CONSTANTS.CRITICAL_CONFLICT_THRESHOLD_K;

  // 3. Compute Belief and Plausibility Intervals
  // Bel(A) = m(A)
  // Pl(A) = m(A) + m(\Theta) = 1 - m(F)
  const belAuth = accumulated.massAuthentic;
  const plAuth = accumulated.massAuthentic + accumulated.massUncertainty;

  const belForged = accumulated.massForged;
  const plForged = accumulated.massForged + accumulated.massUncertainty;

  const authenticInterval: BeliefPlausibilityInterval = {
    belief: belAuth,
    plausibility: plAuth,
    intervalWidth: plAuth - belAuth,
  };

  const forgedInterval: BeliefPlausibilityInterval = {
    belief: belForged,
    plausibility: plForged,
    intervalWidth: plForged - belForged,
  };

  // 4. Smets' Pignistic Probability Transformation BetP
  // BetP(F) = m(F) + m(\Theta) / 2
  const pignisticProbabilityForged = Math.max(
    0.0,
    Math.min(1.0, accumulated.massForged + accumulated.massUncertainty / 2.0)
  );

  return {
    combinedMass: accumulated,
    conflictMassK: maxConflictK,
    isHighConflict,
    authenticInterval,
    forgedInterval,
    pignisticProbabilityForged,
    inputMasses: detectorMasses,
  };
}
