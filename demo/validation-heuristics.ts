/**
 * Secondary signals only: substring / pattern hints for agents and reporting.
 * Defect detection (pass/fail) is driven by behavioral tests in test-runner.ts.
 */

export function collectHeuristicHints(source: string): string[] {
  const hints: string[] = [];

  if (source.includes("const maxValue = 0;")) {
    hints.push(
      "Heuristic: maxValue literal is 0 — likely division-by-zero risk in normalization."
    );
  }

  if (source.includes("const discount = -10;")) {
    hints.push(
      "Heuristic: discount constant is negative — order total may be invalid."
    );
  }

  if (source.includes("// const subtotal")) {
    hints.push(
      "Heuristic: subtotal line appears commented — possible NaN / undefined subtotal."
    );
  }

  if (source.includes("if (activityPoints > 0)")) {
    hints.push(
      "Heuristic: validation uses activityPoints > 0 — may reject valid positive inputs if inverted."
    );
  }

  if (source.includes("return activityPoints / multiplier;")) {
    hints.push(
      "Heuristic: score uses division — may be wrong operator vs multiplication."
    );
  }

  if (source.includes("item.stock > item.minimum")) {
    hints.push(
      "Heuristic: low-stock filter uses > — may be inverted vs stock < minimum."
    );
  }

  return hints;
}
