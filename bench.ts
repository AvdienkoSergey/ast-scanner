import { scanAndReport } from './src/scanner'
import { ScanOptions } from './src/types'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WARMUP_RUNS = 2
const MEASURED_RUNS = 7

const PROJECTS = [
  {
    name: 'Small project',
    path: '/Users/sergeya2501/Desktop/Project/Active/UI_GROUP/ob.transfers-v2.ui'
  },
  {
    name: 'Large project',
    path: '/Users/sergeya2501/Desktop/Project/Active/bos.ui'
  }
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchResult {
  label: string
  files: number
  functions: number
  refs: number
  medianMs: number
  minMs: number
  maxMs: number
  stddevMs: number
  peakRssMB: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureGC(): void {
  if (!global.gc) {
    console.error('ERROR: run with --expose-gc flag:  node --expose-gc --import tsx/esm bench.ts')
    process.exit(1)
  }
  global.gc()
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function stddev(values: number[], avg: number): number {
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function formatTime(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

// ---------------------------------------------------------------------------
// Single run
// ---------------------------------------------------------------------------

interface RunResult {
  files: number
  functions: number
  refs: number
  timeMs: number
  peakRssMB: number
}

async function singleRun(projectPath: string, precise: boolean): Promise<RunResult> {
  const opts: ScanOptions = {
    projectPath,
    dbPath: '',
    include: ['**/*.{ts,tsx,vue}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    exportedOnly: true,
    precise,
    quiet: true
  }

  ensureGC()

  let peakRss = process.memoryUsage().rss

  // Poll RSS during execution to capture peak
  const rssInterval = setInterval(() => {
    const current = process.memoryUsage().rss
    if (current > peakRss) peakRss = current
  }, 10)

  const start = performance.now()
  const result = await scanAndReport(opts)
  const elapsed = performance.now() - start

  clearInterval(rssInterval)

  // One final check after completion
  const finalRss = process.memoryUsage().rss
  if (finalRss > peakRss) peakRss = finalRss

  return {
    files: result.filesScanned,
    functions: result.functionsFound,
    refs: result.refsFound,
    timeMs: elapsed,
    peakRssMB: Math.round(peakRss / 1024 / 1024)
  }
}

// ---------------------------------------------------------------------------
// Benchmark one configuration
// ---------------------------------------------------------------------------

async function benchConfig(
  label: string,
  projectPath: string,
  precise: boolean
): Promise<BenchResult> {
  // Warmup - discard results
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await singleRun(projectPath, precise)
  }

  // Measured runs
  const times: number[] = []
  const peaks: number[] = []
  let lastRun: RunResult | undefined

  for (let i = 0; i < MEASURED_RUNS; i++) {
    const r = await singleRun(projectPath, precise)
    times.push(r.timeMs)
    peaks.push(r.peakRssMB)
    lastRun = r
  }

  times.sort((a, b) => a - b)
  peaks.sort((a, b) => a - b)

  const avg = times.reduce((s, v) => s + v, 0) / times.length
  const med = median(times)
  const sd = stddev(times, avg)

  console.log(
    `  ${label}: median ${formatTime(med)}, stddev ${formatTime(sd)}, ` +
      `range [${formatTime(times[0])}..${formatTime(times[times.length - 1])}], ` +
      `runs: ${times.map((t) => formatTime(t)).join(', ')}`
  )

  return {
    label,
    files: lastRun!.files,
    functions: lastRun!.functions,
    refs: lastRun!.refs,
    medianMs: Math.round(med),
    minMs: Math.round(times[0]),
    maxMs: Math.round(times[times.length - 1]),
    stddevMs: Math.round(sd),
    peakRssMB: Math.max(...peaks)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Benchmark: ${WARMUP_RUNS} warmup + ${MEASURED_RUNS} measured runs per config\n`)

  const results: BenchResult[] = []

  for (const proj of PROJECTS) {
    for (const precise of [false, true]) {
      const mode = precise ? 'precise' : 'manual'
      const label = `${proj.name} / ${mode}`
      const r = await benchConfig(label, proj.path, precise)
      results.push(r)
    }
  }

  // Markdown table
  console.log('\n## Results\n')
  console.log('| Project | Files | Functions | Refs | Median | Min | Max | Stddev | Peak RSS |')
  console.log('|---------|-------|-----------|------|--------|-----|-----|--------|----------|')
  for (const r of results) {
    console.log(
      `| ${r.label} | ${r.files} | ${r.functions} | ${r.refs} | ` +
        `${formatTime(r.medianMs)} | ${formatTime(r.minMs)} | ${formatTime(r.maxMs)} | ` +
        `${formatTime(r.stddevMs)} | ${r.peakRssMB}MB |`
    )
  }

  // JSON for automation
  console.log('\n```json')
  console.log(JSON.stringify(results, null, 2))
  console.log('```')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
