import type { TransferMethod } from "./transfer.js";

/**
 * How far apart the two legs of one transfer may book, in whole days. A card
 * payment posted after a weekend, a transfer the receiving bank books the next
 * morning: three days covers the ordinary lag without reaching back so far that
 * unrelated movements of the same amount start to collide.
 */
export const MAX_GAP_DAYS = 3;

/** The part of a movement the pairing reads. A `Transaction` satisfies it. */
export interface TransferLeg {
  id: string;
  accountId: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
  counterpartyIban?: string;
}

export interface TransferPair {
  outgoing: TransferLeg;
  incoming: TransferLeg;
  method: TransferMethod;
  confidence: number;
  gapDays: number;
}

export interface TransferPairingOptions {
  /**
   * Every IBAN the user's own accounts are known by, keyed by account id. A
   * bank-linked account usually has one; an account entered by hand has none,
   * which is what sends a pair down to the weaker evidence.
   */
  ownIbansByAccount: ReadonlyMap<string, readonly string[]>;
  maxGapDays?: number;
}

/** Weights the matching maximises. The gap only breaks ties inside one tier. */
const METHOD_WEIGHT: Readonly<Record<TransferMethod, number>> = {
  iban: 3,
  counterparty: 2,
  amount: 1,
};

/**
 * Pairs the two legs of every internal transfer it can recognise.
 *
 * Candidates are equal-and-opposite amounts on two different accounts at most
 * `maxGapDays` apart. What corroborates a pair is the IBAN each bank printed on
 * its own leg: the two legs must each name the *other* account, and a leg naming
 * a known account of someone else refuses the pair. When an account carries no
 * IBAN to compare against, the pair falls back to counting who named a
 * counterparty at all, and to the amount and the date when nobody did. Every
 * pair records its method and its confidence, so a weak link is visible as one.
 *
 * Among ambiguous candidates the pairing is the exact maximum-weight bipartite
 * matching, not a greedy closest-date pick: the weight says how much evidence a
 * pair carries, so one locally best pair can never strand a better overall set.
 */
export function pairTransfers(
  legs: readonly TransferLeg[],
  options: TransferPairingOptions,
): TransferPair[] {
  const maxGapDays = options.maxGapDays ?? MAX_GAP_DAYS;
  const buckets = new Map<string, { outgoing: TransferLeg[]; incoming: TransferLeg[] }>();
  for (const leg of legs) {
    if (leg.amountMinor === 0) continue;
    const side = leg.amountMinor < 0 ? "outgoing" : "incoming";
    const key = `${leg.currency}|${Math.abs(leg.amountMinor)}`;
    const bucket = buckets.get(key) ?? { outgoing: [], incoming: [] };
    bucket[side].push(leg);
    buckets.set(key, bucket);
  }

  const pairs: TransferPair[] = [];
  for (const bucket of buckets.values()) {
    const outgoing = [...bucket.outgoing].sort(byBookingThenId);
    const incoming = [...bucket.incoming].sort(byBookingThenId);
    if (outgoing.length === 0 || incoming.length === 0) continue;
    for (const [left, right] of maximumWeightMatching(outgoing, incoming, (a, b) => {
      const score = evidenceOf(a, b, options.ownIbansByAccount, maxGapDays);
      return score ? score.confidence : 0;
    })) {
      const evidenceOfPair = evidenceOf(left, right, options.ownIbansByAccount, maxGapDays);
      if (!evidenceOfPair) continue;
      pairs.push({
        outgoing: left,
        incoming: right,
        method: evidenceOfPair.method,
        confidence: evidenceOfPair.confidence,
        gapDays: evidenceOfPair.gapDays,
      });
    }
  }
  return pairs.sort(
    (left, right) =>
      left.outgoing.id.localeCompare(right.outgoing.id) ||
      left.incoming.id.localeCompare(right.incoming.id),
  );
}

interface Evidence {
  method: TransferMethod;
  confidence: number;
  gapDays: number;
}

/**
 * How much a candidate pair is corroborated, or `undefined` when the pair is
 * impossible or refused. Refusal is positive evidence against: a leg naming an
 * account that is not the other leg's account cannot be the other side.
 */
function evidenceOf(
  outgoing: TransferLeg,
  incoming: TransferLeg,
  ownIbans: ReadonlyMap<string, readonly string[]>,
  maxGapDays: number,
): Evidence | undefined {
  if (outgoing.accountId === incoming.accountId) return undefined;
  if (outgoing.currency !== incoming.currency) return undefined;
  if (outgoing.amountMinor !== -incoming.amountMinor) return undefined;
  const gapDays = daysBetween(outgoing.bookingDate, incoming.bookingDate);
  if (gapDays > maxGapDays) return undefined;

  const outgoingOwn = ownIbans.get(outgoing.accountId) ?? [];
  const incomingOwn = ownIbans.get(incoming.accountId) ?? [];
  // A leg that names an account we know belongs to someone else is not the
  // other leg of this transfer, whatever the amount says.
  if (namesSomebodyElse(outgoing.counterpartyIban, incomingOwn)) return undefined;
  if (namesSomebodyElse(incoming.counterpartyIban, outgoingOwn)) return undefined;

  const outgoingNamesIncoming =
    outgoing.counterpartyIban !== undefined && incomingOwn.includes(outgoing.counterpartyIban);
  const incomingNamesOutgoing =
    incoming.counterpartyIban !== undefined && outgoingOwn.includes(incoming.counterpartyIban);

  const method: TransferMethod =
    outgoingNamesIncoming && incomingNamesOutgoing
      ? "iban"
      : outgoing.counterpartyIban !== undefined || incoming.counterpartyIban !== undefined
        ? "counterparty"
        : "amount";
  return {
    method,
    confidence: METHOD_WEIGHT[method] * 100 + (maxGapDays - gapDays),
    gapDays,
  };
}

function namesSomebodyElse(named: string | undefined, own: readonly string[]): boolean {
  return named !== undefined && own.length > 0 && !own.includes(named);
}

function byBookingThenId(left: TransferLeg, right: TransferLeg): number {
  return left.bookingDate.localeCompare(right.bookingDate) || left.id.localeCompare(right.id);
}

/** Whole days between two ISO calendar dates, independent of the time zone. */
export function daysBetween(from: string, to: string): number {
  const millis = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return Math.round(Math.abs(millis) / 86_400_000);
}

/** Shifts an ISO calendar date by whole days, independent of the time zone. */
export function shiftIsoDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Maximum-weight bipartite matching, exactly.
 *
 * The classic Hungarian algorithm with potentials, on the smaller side as rows
 * and the larger as columns: each bucket holds one currency and one exact
 * amount, so the graph is small even when the ledger is not. A zero weight is
 * "no pair", which lets the square assignment leave a leg unmatched instead of
 * inventing a link.
 */
function maximumWeightMatching<T>(
  left: readonly T[],
  right: readonly T[],
  weight: (a: T, b: T) => number,
): Array<[T, T]> {
  if (left.length === 0 || right.length === 0) return [];
  const swapped = left.length > right.length;
  const rows = swapped ? right : left;
  const columns = swapped ? left : right;
  const rowCount = rows.length;
  const columnCount = columns.length;

  // Costs are negated weights, so minimising the total maximises the evidence.
  const cost = rows.map((row) => columns.map((column) => -weight(row, column)));
  const rowPotential = new Array<number>(rowCount + 1).fill(0);
  const columnPotential = new Array<number>(columnCount + 1).fill(0);
  const matchedRow = new Array<number>(columnCount + 1).fill(0);
  const previous = new Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let column = 0;
    const minv = new Array<number>(columnCount + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(columnCount + 1).fill(false);
    do {
      used[column] = true;
      const currentRow = matchedRow[column]!;
      let delta = Number.POSITIVE_INFINITY;
      let next = 0;
      for (let candidate = 1; candidate <= columnCount; candidate += 1) {
        if (used[candidate]) continue;
        const reduced =
          cost[currentRow - 1]![candidate - 1]! -
          rowPotential[currentRow]! -
          columnPotential[candidate]!;
        if (reduced < minv[candidate]!) {
          minv[candidate] = reduced;
          previous[candidate] = column;
        }
        if (minv[candidate]! < delta) {
          delta = minv[candidate]!;
          next = candidate;
        }
      }
      for (let candidate = 0; candidate <= columnCount; candidate += 1) {
        if (used[candidate]) {
          const row = matchedRow[candidate] as number;
          rowPotential[row] = (rowPotential[row] as number) + delta;
          columnPotential[candidate] = (columnPotential[candidate] as number) - delta;
        } else {
          minv[candidate] = (minv[candidate] as number) - delta;
        }
      }
      column = next;
    } while (matchedRow[column] !== 0);
    do {
      const prior = previous[column]!;
      matchedRow[column] = matchedRow[prior]!;
      column = prior;
    } while (column !== 0);
  }

  const pairs: Array<[T, T]> = [];
  for (let column = 1; column <= columnCount; column += 1) {
    const row = matchedRow[column]!;
    if (row < 1 || row > rowCount) continue;
    const rowValue = rows[row - 1]!;
    const columnValue = columns[column - 1]!;
    if (weight(rowValue, columnValue) <= 0) continue;
    pairs.push(swapped ? [columnValue, rowValue] : [rowValue, columnValue]);
  }
  return pairs;
}
