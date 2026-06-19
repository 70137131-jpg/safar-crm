/**
 * Money helpers. Every monetary value in the system is integer paisa
 * stored as `BigInt`. `1 PKR = 100 paisa`.
 *
 * Rules:
 *   - Never use `number` / float for money.
 *   - Never JSON.stringify a BigInt directly (use `serialize`).
 *   - All arithmetic goes through this module.
 */

export type Paisa = bigint;

export const ZERO: Paisa = 0n;

export function add(a: Paisa, b: Paisa): Paisa {
  return a + b;
}

export function sub(a: Paisa, b: Paisa): Paisa {
  return a - b;
}

/**
 * Multiply paisa by a decimal factor (e.g., a tax rate of 0.15).
 * Internally scales to micros to avoid float drift, then truncates.
 */
export function mul(amount: Paisa, factor: number): Paisa {
  if (!Number.isFinite(factor)) throw new RangeError("factor must be finite");
  const SCALE = 1_000_000n;
  const scaled = BigInt(Math.round(factor * Number(SCALE)));
  return (amount * scaled) / SCALE;
}

/** Multiply by basis points (e.g., 1500 bps = 15%). */
export function mulBps(amount: Paisa, bps: number): Paisa {
  if (!Number.isInteger(bps)) throw new RangeError("bps must be an integer");
  return (amount * BigInt(bps)) / 10_000n;
}

/** Parse a PKR amount (string or number) into paisa. Two decimals max. */
export function fromPKR(pkr: number | string): Paisa {
  const s = String(pkr).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
    throw new RangeError(`invalid PKR amount: ${pkr}`);
  }
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1) : s;
  const [wholeRaw, fracRaw = ""] = abs.split(".");
  const whole = BigInt(wholeRaw ?? "0") * 100n;
  const frac = BigInt((fracRaw + "00").slice(0, 2));
  const total = whole + frac;
  return negative ? -total : total;
}

/** Convert paisa to PKR decimal string ("1234.56"). */
export function toPKR(paisa: Paisa): string {
  const negative = paisa < 0n;
  const abs = negative ? -paisa : paisa;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

/** Display: "Rs 1,234.56" with Western grouping. */
export function formatPKR(paisa: Paisa): string {
  const pkr = toPKR(paisa);
  const [whole, frac] = pkr.split(".");
  const negative = whole!.startsWith("-");
  const wholeAbs = negative ? whole!.slice(1) : whole!;
  const grouped = wholeAbs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}Rs ${grouped}.${frac}`;
}

/** JSON-safe serialisation for paisa (BigInt cannot be JSON.stringified). */
export function serialize(paisa: Paisa): string {
  return paisa.toString();
}

export function deserialize(s: string): Paisa {
  return BigInt(s);
}
