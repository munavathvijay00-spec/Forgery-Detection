/**
 * ============================================================================
 * AEGISDOC FORENSIC SUITE — ENRICHED FINANCIAL LOGIC FORENSICS
 * ============================================================================
 *
 * Implements forensic accounting and mathematical verification across transaction ledgers:
 *  1. Double-entry running balance continuity and monotonicity.
 *  2. Date chronology sequence integrity (out-of-order and future date detection).
 *  3. Benford's Law first-digit Pearson Chi-Square goodness-of-fit test.
 *  4. Round-number clustering anomaly rate (evaluating statistical naturalness).
 *  5. Duplicate transaction identifier detection.
 *  6. Digit bias and last-digit uniformity analysis.
 *
 * @citation Benford (1938), "The Law of Anomalous Numbers", Proc. Amer. Phil. Soc., Vol. 78, No. 4.
 * @citation Nigrini (2012), "Benford's Law: Applications for Forensic Accounting, Auditing,
 *           and Fraud Detection", John Wiley & Sons.
 *
 * @packageDocumentation
 * @module forensics/enrichedFinancialLogic
 */

import type { BoundingBox } from "./core/types.ts";

export interface TransactionLineItem {
  readonly id?: string;
  readonly index: number;
  readonly date: string;
  readonly description: string;
  readonly credit: number | null;
  readonly debit: number | null;
  readonly statedBalance: number;
  readonly bbox?: BoundingBox;
}

export interface EnrichedFinancialResult {
  readonly ledgerBalanced: boolean;
  readonly rowAnomalies: readonly { readonly rowIndex: number; readonly issue: string }[];
  readonly dateAnomalies: readonly { readonly rowIndex: number; readonly issue: string }[];
  readonly benford: {
    readonly chiSquare: number;
    readonly pValue: number;
    readonly suspicious: boolean;
  };
  readonly roundNumberRate: {
    readonly observed: number;
    readonly expected: number;
    readonly suspicious: boolean;
  };
  readonly duplicateIds: readonly string[];
  readonly digitBias: readonly {
    readonly position: number;
    readonly observed: readonly number[];
    readonly expected: readonly number[];
  }[];
  readonly confidence: number;
}

/**
 * Standard Benford's Law probability distribution for leading digits 1..9:
 * P(d) = log10(1 + 1/d)
 */
const BENFORD_EXPECTED_FIRST_DIGIT: readonly number[] = [
  0.30103, // 1
  0.17609, // 2
  0.12494, // 3
  0.09691, // 4
  0.07918, // 5
  0.06695, // 6
  0.05799, // 7
  0.05115, // 8
  0.04576  // 9
];

/**
 * Chi-Square cumulative distribution function approximation for degrees of freedom df = 8.
 */
function chiSquarePValue8DF(chiSq: number): number {
  if (chiSq <= 0) return 1.0;
  const z = chiSq / 2.0;
  const poly = 1.0 + z + (z * z) / 2.0 + (z * z * z) / 6.0;
  const pVal = Math.exp(-z) * poly;
  return Math.max(0.0, Math.min(1.0, pVal));
}

/**
 * Executes comprehensive financial ledger consistency and statistical fraud detection.
 *
 * @param transactions - List of parsed financial transactions from bank statement or invoice
 * @param initialBalance - Optional stated starting balance prior to first transaction
 */
export function analyzeEnrichedFinancialLogic(
  transactions: readonly TransactionLineItem[],
  initialBalance?: number
): EnrichedFinancialResult {
  const rowAnomalies: { rowIndex: number; issue: string }[] = [];
  const dateAnomalies: { rowIndex: number; issue: string }[] = [];
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  let ledgerBalanced = true;
  let runningBal = initialBalance ?? (transactions.length > 0 ? transactions[0].statedBalance : 0);

  // 1. Running Balance Reconciliation & Duplicate ID check
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    // Check duplicate IDs
    if (tx.id) {
      if (seenIds.has(tx.id)) {
        duplicateIds.push(tx.id);
        rowAnomalies.push({
          rowIndex: i,
          issue: `Duplicate transaction identifier "${tx.id}" encountered in ledger.`
        });
      } else {
        seenIds.add(tx.id);
      }
    }

    const credit = tx.credit ?? 0;
    const debit = tx.debit ?? 0;

    let computed: number;
    if (i === 0 && initialBalance === undefined) {
      computed = tx.statedBalance;
    } else {
      computed = Math.round((runningBal + credit - debit) * 100) / 100;
    }

    const discrepancy = Math.abs(Math.round((tx.statedBalance - computed) * 100) / 100);
    if (discrepancy >= 0.01) {
      ledgerBalanced = false;
      rowAnomalies.push({
        rowIndex: i,
        issue: `Balance reconciliation violation: Stated $${tx.statedBalance.toFixed(2)} does not match computed $${computed.toFixed(2)} (Previous: $${runningBal.toFixed(2)} + Credit: $${credit.toFixed(2)} - Debit: $${debit.toFixed(2)}). Discrepancy: $${discrepancy.toFixed(2)}.`
      });
    }

    runningBal = tx.statedBalance;
  }

  // 2. Date Sequence & Calendar Chronology Validation
  let prevTimestamp = 0;
  const now = Date.now();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const ts = Date.parse(tx.date);

    if (!isNaN(ts)) {
      // Future date check
      if (ts > now + 86400000 * 2) {
        dateAnomalies.push({
          rowIndex: i,
          issue: `Future transaction date "${tx.date}" recorded.`
        });
      }

      // Chronological sequence monotonicity
      if (prevTimestamp > 0 && ts < prevTimestamp) {
        dateAnomalies.push({
          rowIndex: i,
          issue: `Out-of-order date "${tx.date}" chronologically predates earlier transaction.`
        });
      }
      prevTimestamp = ts;
    }
  }

  // 3. Benford's Law First-Digit Analysis
  const firstDigitCounts = new Array(9).fill(0);
  let totalBenfordSamples = 0;
  let roundNumberCount = 0;
  let totalAmountCount = 0;

  // Last digit frequency table (0..9)
  const lastDigitCounts = new Array(10).fill(0);

  for (const tx of transactions) {
    const values = [tx.credit, tx.debit, Math.abs(tx.statedBalance)].filter((v): v is number => v !== null && v > 0);

    for (const val of values) {
      totalAmountCount++;

      // Round number check (ends in 00 or integer multiple of 100)
      if (val >= 10 && val % 100 === 0) {
        roundNumberCount++;
      }

      // First digit extraction
      const strVal = val.toFixed(2).replace(/[^1-9]/, "");
      if (strVal.length > 0) {
        const firstDigit = parseInt(strVal[0], 10);
        if (firstDigit >= 1 && firstDigit <= 9) {
          firstDigitCounts[firstDigit - 1]++;
          totalBenfordSamples++;
        }
      }

      // Last digit (cents or units digit)
      const centsStr = val.toFixed(2).replace(/\./, "");
      const lastDigit = parseInt(centsStr[centsStr.length - 1], 10);
      if (!isNaN(lastDigit) && lastDigit >= 0 && lastDigit <= 9) {
        lastDigitCounts[lastDigit]++;
      }
    }
  }

  let chiSquare = 0;
  let pValue = 1.0;
  let benfordSuspicious = false;

  if (totalBenfordSamples >= 20) {
    for (let d = 0; d < 9; d++) {
      const observed = firstDigitCounts[d];
      const expected = totalBenfordSamples * BENFORD_EXPECTED_FIRST_DIGIT[d];
      const diff = observed - expected;
      chiSquare += (diff * diff) / expected;
    }

    pValue = chiSquarePValue8DF(chiSquare);
    // Standard statistical significance alpha = 0.01 for rejection
    if (pValue < 0.01) {
      benfordSuspicious = true;
    }
  }

  // 4. Round Number Rate Anomaly (Expected ~10-15% in authentic banking, anomalous if > 40%)
  const observedRoundRate = totalAmountCount > 0 ? roundNumberCount / totalAmountCount : 0.1;
  const expectedRoundRate = 0.10;
  const roundSuspicious = totalAmountCount >= 10 && observedRoundRate > 0.40;

  // 5. Digit Bias & Last-Digit Uniformity (Expected 10% each for uniform decimals)
  const observedLastDigitProportions = lastDigitCounts.map(c => totalAmountCount > 0 ? c / totalAmountCount : 0.1);
  const expectedLastDigitProportions = new Array(10).fill(0.10);

  const digitBias = [
    {
      position: 1, // First digit
      observed: firstDigitCounts.map(c => totalBenfordSamples > 0 ? c / totalBenfordSamples : 1 / 9),
      expected: [...BENFORD_EXPECTED_FIRST_DIGIT]
    },
    {
      position: -1, // Last digit
      observed: observedLastDigitProportions,
      expected: expectedLastDigitProportions
    }
  ];

  // 6. Overall Confidence Estimation
  let confidence = 0.90;
  if (!ledgerBalanced || dateAnomalies.length > 0) {
    confidence = 0.98; // Arithmetic ledger violations are deterministic proof of forgery
  } else if (benfordSuspicious || roundSuspicious) {
    confidence = 0.85;
  }

  return {
    ledgerBalanced,
    rowAnomalies,
    dateAnomalies,
    benford: {
      chiSquare: Number(chiSquare.toFixed(3)),
      pValue: Number(pValue.toFixed(4)),
      suspicious: benfordSuspicious
    },
    roundNumberRate: {
      observed: Number(observedRoundRate.toFixed(3)),
      expected: expectedRoundRate,
      suspicious: roundSuspicious
    },
    duplicateIds,
    digitBias,
    confidence: Number(confidence.toFixed(3))
  };
}
