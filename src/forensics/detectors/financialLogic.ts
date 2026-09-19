/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — DETECTOR 6: FINANCIAL & LOGICAL CONSISTENCY
 * ============================================================================
 * 
 * Forensic accounting and transactional consistency inspection: running balance
 * reconciliation, Benford's Law Pearson Chi-Square test, date sequence
 * monotonicity, and round-number clustering anomalies.
 *
 * Implements:
 *  1. Double-entry / running balance continuity: Balance(t) = Balance(t-1) + Credit - Debit.
 *  2. Benford's Law first-digit goodness-of-fit (Benford, 1938; Nigrini, 2012).
 *  3. Transaction chronology and calendar validation.
 *  4. Round-number clustering anomaly detection.
 *  5. Calibrated evidence mass generation for Dempster-Shafer fusion.
 *
 * @citation Benford (1938), "The Law of Anomalous Numbers", Proc. Amer. Phil. Soc.
 * @citation Nigrini (2012), "Benford's Law: Applications for Forensic Accounting", Wiley.
 *
 * @packageDocumentation
 * @module forensics/detectors/financialLogic
 */

import type {
  FinancialLogicResult,
  TransactionReconciliation,
  BenfordAnalysisResult,
  DetectorEvidenceMass,
  ChainOfCustodyArtifact,
  BaseForensicAnomaly,
  BoundingBox,
} from '../core/types.ts';
import { FORENSIC_CONSTANTS } from '../core/types.ts';
import { createChainOfCustodyArtifact } from '../core/hash.ts';

/**
 * Raw transactional line item extracted from document table.
 */
export interface ExtractedTransactionItem {
  readonly index: number;
  readonly date: string;
  readonly description: string;
  readonly credit: number | null;
  readonly debit: number | null;
  readonly statedBalance: number;
  readonly bbox?: BoundingBox;
}

/**
 * Chi-Square cumulative distribution function approximation for df = 8.
 */
function chiSquarePValue8DF(x: number): number {
  if (x <= 0) return 1.0;
  // For df = 8, CDF is 1 - e^(-x/2) * (1 + x/2 + (x/2)^2 / 2 + (x/2)^3 / 6)
  const z = x / 2.0;
  const poly = 1.0 + z + (z * z) / 2.0 + (z * z * z) / 6.0;
  const pVal = Math.exp(-z) * poly;
  return Math.max(0.0, Math.min(1.0, pVal));
}

/**
 * Executes the Financial Logic & Transactional Consistency forensic detector.
 */
export function analyzeFinancialLogic(
  transactions: readonly ExtractedTransactionItem[],
  initialBalance?: number
): FinancialLogicResult {
  const startTime = performance.now();
  const artifacts: ChainOfCustodyArtifact[] = [];
  const anomalies: BaseForensicAnomaly[] = [];

  const reconciliations: TransactionReconciliation[] = [];
  let runningBalanceValid = true;
  let totalDiscrepancyAmount = 0.0;

  // 1. Running Balance Reconciliation
  let currentBalance = initialBalance ?? (transactions.length > 0 ? transactions[0].statedBalance : 0);

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const credit = tx.credit ?? 0;
    const debit = tx.debit ?? 0;

    let computed: number;
    if (i === 0 && initialBalance === undefined) {
      computed = tx.statedBalance;
    } else {
      computed = Math.round((currentBalance + credit - debit) * 100) / 100;
    }

    const discrepancy = Math.abs(Math.round((tx.statedBalance - computed) * 100) / 100);
    const isValid = discrepancy < 0.01;

    if (!isValid) {
      runningBalanceValid = false;
      totalDiscrepancyAmount += discrepancy;

      const bbox: BoundingBox = tx.bbox ?? { x: 400, y: 150 + i * 20, width: 120, height: 18 };
      anomalies.push({
        id: `fin-balance-mismatch-tx-${i}`,
        bbox,
        significanceScore: discrepancy,
        severity: 'critical',
        forensicRationale: `Mathematical balance violation at line ${i + 1}: Stated balance ($${tx.statedBalance.toFixed(2)}) fails to reconcile with previous balance ($${currentBalance.toFixed(2)}) + credit ($${credit.toFixed(2)}) - debit ($${debit.toFixed(2)}). Discrepancy = $${discrepancy.toFixed(2)}. Legitimate banking core ledger systems cannot emit arithmetic balance errors.`,
      });
    }

    reconciliations.push({
      transactionIndex: tx.index,
      date: tx.date,
      description: tx.description,
      credit: tx.credit,
      debit: tx.debit,
      statedBalance: tx.statedBalance,
      computedBalance: computed,
      discrepancy,
      isValid,
    });

    currentBalance = tx.statedBalance;
  }

  // 2. Date Monotonicity & Chronology Validation
  let dateMonotonicityValid = true;
  const dateAnomalies: string[] = [];
  let previousDateTs = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const parsedTs = Date.parse(tx.date);
    if (!isNaN(parsedTs)) {
      if (previousDateTs > 0 && parsedTs < previousDateTs) {
        dateMonotonicityValid = false;
        const msg = `Chronology violation: Transaction ${i + 1} (${tx.date}) predates prior transaction.`;
        dateAnomalies.push(msg);
        anomalies.push({
          id: `fin-date-anomaly-${i}`,
          bbox: tx.bbox ?? { x: 50, y: 150 + i * 20, width: 80, height: 18 },
          significanceScore: (previousDateTs - parsedTs) / 86400000,
          severity: 'critical',
          forensicRationale: msg,
        });
      }
      previousDateTs = parsedTs;
    }
  }

  // 3. Benford's Law First-Digit Analysis
  const observedCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let benfordSampleCount = 0;

  for (const tx of transactions) {
    const amounts = [tx.credit, tx.debit, Math.abs(tx.statedBalance)];
    for (const amt of amounts) {
      if (amt !== null && amt >= 1.0) {
        const firstChar = amt.toString().replace(/[^1-9]/, '')[0];
        const digit = parseInt(firstChar, 10);
        if (digit >= 1 && digit <= 9) {
          observedCounts[digit - 1]++;
          benfordSampleCount++;
        }
      }
    }
  }

  const theoreticalProbabilities = FORENSIC_CONSTANTS.BENFORD_THEORETICAL_PROBABILITIES;
  const observedFreqs: [number, number, number, number, number, number, number, number, number] = [0,0,0,0,0,0,0,0,0];
  const theoreticalFreqs: [number, number, number, number, number, number, number, number, number] = [0,0,0,0,0,0,0,0,0];

  let chiSquare = 0.0;
  for (let d = 0; d < 9; d++) {
    const expCount = benfordSampleCount * theoreticalProbabilities[d];
    theoreticalFreqs[d] = expCount;
    observedFreqs[d] = observedCounts[d];

    if (expCount > 0) {
      const diff = observedCounts[d] - expCount;
      chiSquare += (diff * diff) / expCount;
    }
  }

  const pValue = chiSquarePValue8DF(chiSquare);
  // Critical chi-square for df=8 at alpha=0.01 is 20.09
  const violatesBenfordLaw = benfordSampleCount >= 25 && chiSquare > 20.09;

  if (violatesBenfordLaw) {
    anomalies.push({
      id: 'benford-law-violation',
      bbox: { x: 200, y: 100, width: 300, height: 200 },
      significanceScore: chiSquare,
      severity: 'suspect',
      forensicRationale: `Numerical values violate Benford's Law (Chi-Square = ${chiSquare.toFixed(2)}, p = ${pValue.toExponential(2)}, df = 8). Artificial or forged balance ledgers frequently exhibit abnormal first-digit distributions diverging from natural log10(1 + 1/d) scaling.`,
    });
  }

  const benfordTest: BenfordAnalysisResult = {
    observedFrequencies: observedFreqs,
    theoreticalFrequencies: theoreticalFreqs,
    chiSquareStatistic: chiSquare,
    degreesOfFreedom: 8,
    pValue,
    sampleCount: benfordSampleCount,
    violatesBenfordLaw,
  };

  // 4. Round Number Anomaly Detection
  let roundCount = 0;
  let totalAmounts = 0;

  for (const tx of transactions) {
    for (const amt of [tx.credit, tx.debit]) {
      if (amt !== null && amt > 0) {
        totalAmounts++;
        if (amt % 100 === 0) roundCount++;
      }
    }
  }

  const roundNumberRatio = totalAmounts > 0 ? roundCount / totalAmounts : 0;
  // Natural transactional accounts have < 15% round hundreds
  const roundNumberAnomalyZScore = totalAmounts > 5 ? (roundNumberRatio - 0.12) / 0.08 : 0;

  // 5. Chain-of-Custody Artifacts
  artifacts.push(
    createChainOfCustodyArtifact(
      'financial-reconciliation-ledger',
      'benford_distribution',
      {
        reconciliationsCount: reconciliations.length,
        runningBalanceValid,
        totalDiscrepancyAmount,
        chiSquare,
        pValue,
      },
      'Financial running balance reconciliation and Benford first-digit frequency bins'
    )
  );

  // 6. Dempster-Shafer Calibrated Evidence Mass
  let massForged = 0.02;
  let massAuthentic = 0.85;
  let massUncertainty = 0.13;

  if (!runningBalanceValid) {
    // Arithmetic mismatch in bank balance is virtually 100% conclusive proof of tampering
    massForged = 0.98;
    massAuthentic = 0.01;
    massUncertainty = 0.01;
  } else if (!dateMonotonicityValid || violatesBenfordLaw) {
    massForged = 0.70;
    massAuthentic = 0.10;
    massUncertainty = 0.20;
  }

  const reliabilityWeight = transactions.length >= 3 ? 0.95 : 0.40;
  const logLikelihoodRatio = Math.log((massForged + 1e-4) / (massAuthentic + 1e-4));

  const evidenceMass: DetectorEvidenceMass = {
    detectorId: 'financial_logic',
    massAuthentic,
    massForged,
    massUncertainty,
    reliabilityWeight,
    logLikelihoodRatio,
  };

  return {
    detectorId: 'financial_logic',
    executionTimeMs: performance.now() - startTime,
    executedSuccessfully: true,
    evidenceMass,
    artifacts,
    anomalies,
    runningBalanceValid,
    reconciliations,
    totalDiscrepancyAmount,
    dateMonotonicityValid,
    dateAnomalies,
    benfordTest,
    roundNumberRatio,
    roundNumberAnomalyZScore,
    duplicateTransactionIdentifiers: [],
  };
}
