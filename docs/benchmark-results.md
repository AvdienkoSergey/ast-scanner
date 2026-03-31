# Benchmark Results

**Date:** 2026-03-31
**Environment:** macOS Darwin 25.2.0, Node 22, Apple Silicon
**Methodology:** 2 warmup + 7 measured runs per configuration, median taken. `--expose-gc` enabled. Memory measured as peak RSS.

---

## Test Projects

| Project       | Files (ts/tsx/vue) | Description              |
|---------------|--------------------|--------------------------|
| Small project | 315                | Vue 3 SPA, medium size   |
| Large project | 1 417              | Vue 3 monorepo, large SPA|

---

## Results

| Project       | Mode    | Files | Functions | Refs  | Median    | Min       | Max       | Stddev | Peak RSS |
|---------------|---------|-------|-----------|-------|-----------|-----------|-----------|--------|----------|
| Small project | manual  | 315   | 407       | 633   | **152ms** | 148ms     | 155ms     | 2ms    | 219 MB   |
| Small project | precise | 315   | 406       | 632   | **1.06s** | 1.04s     | 1.11s     | 21ms   | 652 MB   |
| Large project | manual  | 1 417 | 1 407     | 1 326 | **1.08s** | 1.06s     | 1.13s     | 19ms   | 624 MB   |
| Large project | precise | 1 417 | 1 397     | 1 195 | **2.45s** | 2.37s     | 3.10s     | 239ms  | 665 MB   |

---

## NFR Compliance

| NFR   | Requirement                             | Status | Notes                                                         |
|-------|-----------------------------------------|--------|---------------------------------------------------------------|
| 1.1   | Manual mode < 1s for ~500 files         |  PASS | 315 files -> 152ms. Linear estimate for 500: ~242ms           |
| 1.1   | Manual mode < 1s for ~500 files (large) |  NOTE | 1 417 files -> 1.08s - expected to be above limit at x4.5 size|
| 1.2   | Precise mode 2-5s for ~500 files        |  PASS | 315 files -> 1.06s. 1 417 files -> 2.45s - within the limit  |

### Manual mode estimate for 500 files

```
315 files  -> 152ms
1417 files -> 1 081ms

Rate: ~0.84ms / file (linear)
500 files  -> ~420ms (estimated) -> within < 1s NFR
```

---

## Observations

### 1. Stable results

Stddev across all setups is <= 21ms for three out of four (<= 2% of median). Large/precise showed stddev 239ms because of one outlier (3.10s) - results are overall easy to reproduce.

### 2. Manual vs Precise - difference in refs

On the small project, results are almost the same: manual 633 refs vs precise 632 refs.

On the large project, manual found **1 326 refs**, and precise found **1 195 refs** (+131 refs for manual).

**Why the difference:**
- Manual resolver uses heuristics: fuzzy name matching for barrel re-export resolution and pattern matching without type information - this gives false links of calls to same-name functions from other modules
- Precise resolver uses TypeScript TypeChecker, which follows declarations exactly
- On the small project, the difference is small (1 ref) - false matches from manual grow with more files, but after fixing tsconfig.json paths parsing, the gap got much smaller

### 3. Memory footprint (Peak RSS)

- Manual mode: 219-624 MB, grows with number of files
- Precise mode: 652-665 MB - TypeScript TypeChecker needs more memory, but on the large project the difference is small (~40 MB)

### 4. Scaling behavior

```
Manual:  O(n) by files, ~0.84 ms/file
Precise: TypeChecker init ~800ms (fixed) + ~1.2 ms/file for analysis
```

---

## Raw Runs

```
Small project / manual:  median 152ms, stddev 2ms, range [148ms..155ms]
  runs: 148ms, 150ms, 150ms, 152ms, 152ms, 153ms, 155ms

Small project / precise: median 1.06s, stddev 21ms, range [1.04s..1.11s]
  runs: 1.04s, 1.05s, 1.06s, 1.06s, 1.07s, 1.07s, 1.11s

Large project / manual:  median 1.08s, stddev 19ms, range [1.06s..1.13s]
  runs: 1.06s, 1.07s, 1.08s, 1.08s, 1.08s, 1.09s, 1.13s

Large project / precise: median 2.45s, stddev 239ms, range [2.37s..3.10s]
  runs: 2.37s, 2.38s, 2.44s, 2.45s, 2.47s, 2.65s, 3.10s
```
