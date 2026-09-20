#!/usr/bin/env node
/**
 * Bakes holidays.json into plugin.js.
 *
 * WHY A BUILD STEP: Hermes loads a desktop plugin as ONE self-contained ESM
 * file — `<hermes home>/desktop-plugins/<id>/plugin.js`, evaluated from a blob
 * URL — and only that entry file is read, so a relative `import './holidays.js'`
 * can never resolve. The data therefore has to be inlined before the app reads
 * the file: holidays.json stays the source of record (easy to extend), this
 * script owns the generated block inside plugin.js.
 *
 * Usage (from the repo root or from desktop-plugin/):
 *   node desktop-plugin/build.mjs           # regenerate the block in plugin.js
 *   node desktop-plugin/build.mjs --check   # exit 1 when plugin.js is stale
 *
 * The app fs-watches the plugin folder, so saving plugin.js reloads the chip;
 * a syntax check on the result keeps a bad build from reaching it.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const jsonPath = join(dir, 'holidays.json')
const pluginPath = join(dir, 'plugin.js')
const START_MARK = '/* holiday-data:start'
const END_MARK = '/* holiday-data:end */'
const CHECK = process.argv.includes('--check')
const MAX_LINE = 78

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** ISO date → UTC day number, rejecting anything that is not a real date. */
function dayNumber(iso, where) {
  if (!ISO_DATE.test(iso)) fail(`${where}: "${iso}" is not a YYYY-MM-DD date`)
  const ms = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) {
    fail(`${where}: "${iso}" is not a valid calendar date`)
  }
  return Math.round(ms / 86400000)
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
if (!Array.isArray(data.years) || data.years.length === 0) {
  fail('holidays.json: "years" must be a non-empty array')
}

const groups = []
const seenDates = new Map()
let total = 0

for (const entry of data.years) {
  const year = entry?.year
  if (!Number.isInteger(year)) fail(`holidays.json: year entry "${entry?.year}" is not an integer`)
  if (!Array.isArray(entry.holidays) || entry.holidays.length === 0) {
    fail(`holidays.json: ${year} has no holidays`)
  }

  for (const holiday of entry.holidays) {
    const where = `${year} ${holiday?.name}`
    if (typeof holiday?.name !== 'string' || holiday.name === '') fail(`${where}: missing "name"`)
    const first = holiday.from
    const last = holiday.to ?? holiday.from
    const start = dayNumber(first, where)
    const end = dayNumber(last, where)
    if (end < start) fail(`${where}: "to" (${last}) is before "from" (${first})`)
    if (!first.startsWith(String(year))) {
      console.warn(`⚠ ${where}: starts in ${first.slice(0, 4)}, not in the entry's year`)
    }

    const span = []
    for (let day = start; day <= end; day++) {
      const iso = new Date(day * 86400000).toISOString().slice(0, 10)
      const owner = seenDates.get(iso)
      if (owner) fail(`holidays.json: ${iso} is listed twice (${owner} and ${where})`)
      seenDates.set(iso, where)
      span.push(iso)
      total++
    }
    const [sm, sd] = first.slice(5).split('-')
    const [em, ed] = last.slice(5).split('-')
    const range = `${Number(sm)}/${Number(sd)}–${Number(em)}/${Number(ed)}`
    groups.push({ label: `${year} ${holiday.name} ${range}`, dates: span })
  }
}

/** Wrap '"a", "b", ...' date lists to MAX_LINE columns, keeping item order. */
function dateLines(dates) {
  const lines = []
  let line = ''
  for (const date of dates) {
    const item = `'${date}',`
    const candidate = line ? `${line} ${item}` : item
    if (line && candidate.length > MAX_LINE) {
      lines.push(line)
      line = item
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

const eol = readFileSync(pluginPath, 'utf8').includes('\r\n') ? '\r\n' : '\n'
const block = [
  'const HOLIDAYS = new Set([',
  ...groups.flatMap(group => [`  // ${group.label}`, ...dateLines(group.dates).map(line => `  ${line}`)]),
  '])',
]
  .join(eol)
  .concat(eol)

const source = readFileSync(pluginPath, 'utf8')
const startAt = source.indexOf(START_MARK)
const endAt = source.indexOf(END_MARK)
if (startAt === -1 || endAt === -1 || endAt < startAt) {
  fail(`plugin.js: missing the "${START_MARK}" / "${END_MARK}" markers`)
}
const blockStart = source.indexOf('\n', startAt) + 1
const current = source.slice(blockStart, endAt)
const next = source.slice(0, blockStart) + block + source.slice(endAt)

const summary = `${data.years.length} 年 / ${total} 天 / ${groups.length} 个假期`

if (current === block) {
  console.log(`✔ plugin.js 已是最新(${summary})`)
  process.exit(0)
}

if (CHECK) {
  fail(`plugin.js 与 holidays.json 不一致(${summary})——运行 node desktop-plugin/build.mjs 重新生成`)
}

writeFileSync(pluginPath, next, 'utf8')

// A build that breaks the plugin would be reloaded by the app immediately:
// parse the result as ESM (as a .mjs copy, since plugin.js uses imports).
const temp = join(dir, '.plugin.build-check.mjs')
writeFileSync(temp, next, 'utf8')
try {
  execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' })
} catch (error) {
  writeFileSync(pluginPath, source, 'utf8')
  fail(`生成的 plugin.js 语法不通过,已回滚:\n${error.stderr?.toString() ?? error.message}`)
} finally {
  unlinkSync(temp)
}

console.log(`✔ plugin.js 已更新(${summary})`)
