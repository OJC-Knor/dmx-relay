import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  return ((...args: Parameters<T>) => {
    lastArgs = args;
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else if (!pending) {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        if (lastArgs) fn(...lastArgs);
      }, ms - (now - last));
    }
  }) as T;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.replace("#", ""), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((c) => Math.max(0, Math.min(255, c | 0)).toString(16).padStart(2, "0")).join("")
  );
}
