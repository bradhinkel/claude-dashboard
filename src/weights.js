// Standard approximation weights, expressed relative to one "input" token.
// These are RELATIVE billing weights, not dollars. They collapse the raw-total
// inflation that cache reads cause (cache reads are ~0.1x the price of input).
//
// Rationale (Claude Opus-class pricing, roughly):
//   input        1x   (baseline)
//   output       5x   (output ~5x input price)
//   cacheWrite5m 1.25x (5-minute ephemeral cache write)
//   cacheWrite1h 2x    (1-hour ephemeral cache write, billed higher)
//   cacheRead    0.1x  (cache hits are cheap)
//
// Edit these if you want different ratios; nothing else needs to change.
export const WEIGHTS = {
  input: 1,
  output: 5,
  cacheWrite5m: 1.25,
  cacheWrite1h: 2,
  cacheRead: 0.1,
};

// Weighted "effective input-equivalent" tokens for one normalized record.
export function weightedTotal(r) {
  return (
    r.input * WEIGHTS.input +
    r.output * WEIGHTS.output +
    r.cacheWrite5m * WEIGHTS.cacheWrite5m +
    r.cacheWrite1h * WEIGHTS.cacheWrite1h +
    r.cacheRead * WEIGHTS.cacheRead
  );
}

// Raw total = every token counted equally (dominated by cache reads).
export function rawTotal(r) {
  return r.input + r.output + r.cacheWrite + r.cacheRead;
}
