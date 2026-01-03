// Converte qualquer valor em string "buscável"
function toSearchable(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.toLowerCase();
  if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase();
  if (Array.isArray(v)) return v.map(toSearchable).join(" ");
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>)
      .map(toSearchable)
      .join(" ");
  }
  return "";
}

export type SearchOptions<T> = {
  allowKeys?: (keyof T | string)[];
  denyKeys?: (keyof T | string)[];
  augment?: (item: T) => Record<string, unknown>;
};

// Busca genérica em qualquer objeto/array
export function matchByTerm<T extends Record<string, any>>(
  item: T,
  term: string,
  opts?: SearchOptions<T>
) {
  if (!term) return true;
  const t = term.toLowerCase();

  const augmented = opts?.augment ? { ...item, ...opts.augment(item) } : item;

  let entries = Object.entries(augmented);

  if (opts?.allowKeys?.length) {
    const allow = new Set(opts.allowKeys.map(String));
    entries = entries.filter(([k]) => allow.has(k));
  }
  if (opts?.denyKeys?.length) {
    const deny = new Set(opts.denyKeys.map(String));
    entries = entries.filter(([k]) => !deny.has(k));
  }

  return entries.some(([, v]) => toSearchable(v).includes(t));
}
