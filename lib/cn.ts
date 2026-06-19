import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class merger used by every component. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
