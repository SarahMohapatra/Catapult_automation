/**
 * Lightweight line-oriented mutations for hackathon demos.
 * Deterministic when a numeric seed is passed; otherwise uses Date.now().
 */

export interface MutationResult {
  source: string;
  operatorId: string;
  description: string;
  applied: boolean;
}

type MutationOp = {
  id: string;
  description: string;
  /** Return null if this operator cannot apply cleanly. */
  apply: (source: string) => string | null;
};

/** xorshift32 — deterministic PRNG from integer seed */
function xorshift32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const OPERATORS: MutationOp[] = [
  {
    id: "arith_mul_to_div",
    description: "Replaced * with / in score return",
    apply: (src) => {
      const t = "return activityPoints * multiplier;";
      if (!src.includes(t)) return null;
      return src.replace(t, "return activityPoints / multiplier;");
    },
  },
  {
    id: "cmp_lt_to_gt_guard",
    description: "Flipped activityPoints guard (< to >)",
    apply: (src) => {
      const t = "if (activityPoints < 0) {";
      if (!src.includes(t)) return null;
      return src.replace(t, "if (activityPoints > 0) {");
    },
  },
  {
    id: "filter_lt_to_gt",
    description: "Inverted low-stock filter comparison",
    apply: (src) => {
      const t = "item.stock < item.minimum";
      if (!src.includes(t)) return null;
      return src.replace(t, "item.stock > item.minimum");
    },
  },
  {
    id: "const_maxvalue_to_zero",
    description: "Set demo maxValue constant to 0",
    apply: (src) => {
      const t = "  const maxValue = 100;";
      if (!src.includes(t)) return null;
      return src.replace(t, "  const maxValue = 0;");
    },
  },
  {
    id: "const_discount_negate",
    description: "Flipped discount constant sign",
    apply: (src) => {
      const t = "  const discount = 10;";
      if (!src.includes(t)) return null;
      return src.replace(t, "  const discount = -10;");
    },
  },
  {
    id: "comment_subtotal",
    description: "Commented subtotal line in order total",
    apply: (src) => {
      const t = "  const subtotal = orders.reduce((sum, price) => sum + price, 0);";
      if (!src.includes(t)) return null;
      return src.replace(
        t,
        "  // const subtotal = orders.reduce((sum, price) => sum + price, 0);"
      );
    },
  },
];

/**
 * Apply one random applicable mutation. Uses all operators that still match the source.
 */
export function applyRandomMutation(
  source: string,
  seed?: number | string
): MutationResult {
  const numericSeed =
    typeof seed === "string"
      ? hashSeed(seed)
      : seed ?? (Date.now() & 0xffffffff);
  const rnd = xorshift32(numericSeed);

  const applicable = OPERATORS.filter((op) => op.apply(source) !== null);
  if (applicable.length === 0) {
    return {
      source,
      operatorId: "none",
      description: "No mutation operators matched the current file",
      applied: false,
    };
  }

  const idx = Math.floor(rnd() * applicable.length);
  const op = applicable[idx];
  const next = op.apply(source)!;

  return {
    source: next,
    operatorId: op.id,
    description: op.description,
    applied: true,
  };
}

export function listMutationOperators(): string[] {
  return OPERATORS.map((o) => o.id);
}
