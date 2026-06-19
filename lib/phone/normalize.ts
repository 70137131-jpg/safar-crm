import { ValidationError } from "@/lib/errors";

/**
 * Normalise a Pakistani phone number to E.164.
 *
 *   "0300-1234567"   → "+923001234567"
 *   "03001234567"    → "+923001234567"
 *   "923001234567"   → "+923001234567"
 *   "+923001234567"  → "+923001234567"
 *
 * Throws ValidationError on unrecognised inputs.
 */
export function normalizePakistaniPhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, "");

  let digits: string;
  if (cleaned.startsWith("+92")) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith("0092")) {
    digits = cleaned.slice(4);
  } else if (cleaned.startsWith("92") && cleaned.length === 12) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    digits = cleaned.slice(1);
  } else if (cleaned.length === 10) {
    digits = cleaned;
  } else {
    throw new ValidationError(`Invalid phone number: ${input}`, "phone");
  }

  if (!/^3\d{9}$/.test(digits)) {
    throw new ValidationError(`Invalid Pakistani mobile number: ${input}`, "phone");
  }
  return `+92${digits}`;
}

/** Build a wa.me click-to-chat URL from an E.164 number. */
export function toWhatsAppLink(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}
