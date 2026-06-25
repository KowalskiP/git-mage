/**
 * Lightweight subsequence fuzzy matcher for the command palette.
 *
 * `fuzzyScore(query, text)` returns a score (higher = better) when every char
 * of `query` appears in `text` in order, or `null` when it doesn't match.
 * Bonuses favour matches at word starts and contiguous runs, so "fp" ranks
 * "Fetch / Pull" style targets sensibly. An empty query matches everything.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  let qi = 0;
  let score = 0;
  let run = 0; // current contiguous-match streak
  let prev = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      run = 0;
      continue;
    }
    let pts = 1;
    if (ti === prev + 1) {
      run += 1;
      pts += run * 2; // reward contiguous runs
    } else {
      run = 1;
    }
    const before = ti === 0 ? "" : t[ti - 1];
    if (ti === 0 || before === " " || before === "/" || before === "-" || before === ":") {
      pts += 3; // word-start bonus
    }
    score += pts;
    prev = ti;
    qi += 1;
  }

  if (qi < q.length) return null; // not all query chars consumed
  // Prefer shorter targets when scores are otherwise close.
  return score - text.length * 0.01;
}
