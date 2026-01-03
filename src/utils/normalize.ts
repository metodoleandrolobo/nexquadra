// src/utils/normalize.ts
export function normalizeCpf(cpfRaw: string): string {
  return (cpfRaw || "").replace(/\D/g, ""); // só dígitos
}

export function normalizeEmail(emailRaw: string): string {
  return (emailRaw || "").trim().toLowerCase();
}
