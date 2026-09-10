/**
 * deepseek-tide — Hermes desktop status bar plugin
 *
 * Shows the DeepSeek peak/off-peak pricing tide in the status bar:
 *   ⛰️ peak / 🌙 off-peak + countdown to the next switch + current per-1M-token prices
 * Click the chip to toggle between Flash and Pro prices (choice persisted).
 *
 * Peak hours (Beijing time, Mon–Fri only): 09:00–12:00 and 14:00–18:00.
 * Weekends are off-peak all day; off-peak = half price.
 * Prices in CNY per 1M tokens.
 *   Tiered billing since 2026-08-17; flash re-priced 2026-09-10 12:00.
 *   Full price schedule: PRICE-HISTORY.md in the repo.
 *
 * Pure local clock math — no API key, no network, no polling.
 * Strings ship in this file (zh + en) via ctx.i18n; the app's active locale
 * picks the bundle, falling back to `en`.
 *
 * Install:
 *   1. Copy this folder to ~/.hermes/desktop-plugins/deepseek-tide/
 *   2. Status bar shows e.g. "F⛰️ 高峰 9:00-12:00 剩余1:32:30 · 缓存¥0.04 输入¥2 输出¥8"
 */

import { cn, haptic, host, STATUSBAR_AREAS, Tip, usePluginI18n } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

const ID = 'deepseek-tide'
/** ctx.storage key holding the Flash/Pro choice (namespaced by the host). */
const TIER_KEY = 'tier'

/* ── Constants ──────────────────────────────────────────────────────── */

// Beijing = UTC+8, no DST — compute directly on UTC fields.
const BJ_OFFSET_MS = 8 * 3600 * 1000
const TICK_MS = 1_000
const DAY_SECS = 24 * 3600

// Peak windows in minutes-of-day (Beijing time), [start, end) — workdays only.
const PEAK_WINDOWS = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
]

// Tier prices, CNY per 1M tokens.
//   flash — re-priced 2026-09-10 12:00 (Beijing): off-peak ¥0.02 / ¥1 / ¥4,
//           peak = 2× off-peak. Model name unchanged (deepseek-v4-flash).
//   pro   — unchanged since 2026-08-17. Routed to V4.1 Flash (Flash pricing)
//           from 2026-09-14 12:00 while V4 Pro is retired.
const PRICES = {
  flash: {
    peak:    { hit: 0.04, miss: 2, out: 8 },
    offpeak: { hit: 0.02, miss: 1, out: 4 },
  },
  pro: {
    peak:    { hit: 0.30, miss: 9.0, out: 27.0 },
    offpeak: { hit: 0.15, miss: 4.5, out: 13.5 },
  },
}

/* ── Messages (plugin-scoped i18n; `en` is the fallback bundle) ──────── */

const MESSAGES = {
  en: {
    peak: 'peak',
    offpeak: 'off-peak',
    peakHours: 'peak hours',
    offpeakHours: 'off-peak hours',
    countdown: s => `${s} left`,
    tomorrow: win => `tomorrow ${win}`,
    weekdayWindow: (i, win) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]} ${win}`,
    priceLine: (hit, miss, out) => `cache ${hit} in ${miss} out ${out}`,
    tip: 'Click to toggle Flash / Pro pricing',
    detailHeader: 'DeepSeek peak/off-peak pricing · Beijing time',
    detailNow: state => `Now: ${state}`,
    detailNext: s => `Next switch in ${s}`,
    detailPeakWindow: 'Peak windows: Mon–Fri 9:00-12:00, 14:00-18:00',
    detailWeekend: 'Weekends & holidays: off-peak all day (half price)',
    detailPriceTitle: m => `${m} price (CNY / 1M tokens)`,
    detailPriceRow: (hit, miss, out) => `  cache hit ${hit} · cache miss ${miss} · output ${out}`,
    detailProNote: 'Note: V4 Pro routes to V4.1 Flash (Flash pricing) from 2026-09-14 12:00',
    detailSwitchTo: m => `Click to switch: ${m}`,
    switched: (m, state, hit, miss, out) =>
      `Switched to ${m} pricing · ${state} cache ${hit} in ${miss} out ${out}`,
  },
  zh: {
    peak: '高峰',
    offpeak: '空闲',
    peakHours: '高峰时段',
    offpeakHours: '空闲时段',
    countdown: s => `剩余${s}`,
    tomorrow: win => `明日${win}`,
    weekdayWindow: (i, win) => `周${'日一二三四五六'[i]}${win}`,
    priceLine: (hit, miss, out) => `缓存${hit} 输入${miss} 输出${out}`,
    tip: '点击切换 Flash / Pro 价格显示',
    detailHeader: 'DeepSeek 峰谷计价 · 北京时间',
    detailNow: state => `当前：${state}`,
    detailNext: s => `距下次切换：${s}`,
    detailPeakWindow: '高峰窗口：周一至周五 9:00-12:00、14:00-18:00',
    detailWeekend: '周末及节假日：全天空闲（半价）',
    detailPriceTitle: m => `${m} 价格（元 / 百万 tokens）`,
    detailPriceRow: (hit, miss, out) => `  缓存命中输入 ${hit} · 未命中输入 ${miss} · 输出 ${out}`,
    detailProNote: '注：2026-09-14 12:00 起 V4 Pro 路由至 V4.1 Flash，按 Flash 价计费',
    detailSwitchTo: m => `点击切换：${m}`,
    switched: (m, state, hit, miss, out) =>
      `已切换到 ${m} 价格 · ${state} 缓存${hit} 输入${miss} 输出${out}`,
  },
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

// Beijing time as { day (0=Sun..6), secs (seconds into the day) }.
function beijingClock(now) {
  const bj = new Date(now.getTime() + BJ_OFFSET_MS)
  return {
    day: bj.getUTCDay(),
    secs: bj.getUTCHours() * 3600 + bj.getUTCMinutes() * 60 + bj.getUTCSeconds(),
  }
}

// Days (>= n) until the next workday after weekday `day` (0=Sun..6).
function workdayOffset(day, n) {
  for (let d = n; d <= 7; d++) {
    const wd = (day + d) % 7
    if (wd >= 1 && wd <= 5) return d
  }
  return 7
}

// Returns { peak, nextIn, nextWindow, dayOffset, day }: nextIn (seconds) until
// the next tier switch; nextWindow is the window the countdown points at (the
// current peak window while peak, the upcoming one while off-peak);
// dayOffset is 0=window today, 1=tomorrow, N=in N days.
function tideAt(now) {
  const { day, secs } = beijingClock(now)
  const isWorkday = day >= 1 && day <= 5

  // Inside a peak window? (peak hours exist on workdays only)
  const cur = isWorkday
    ? PEAK_WINDOWS.find(([s, e]) => secs >= s * 60 && secs < e * 60)
    : undefined
  const peak = Boolean(cur)

  let nextStart // seconds since midnight of "today" (may exceed DAY_SECS)
  let nextWindow
  let dayOffset

  if (peak) {
    // End of whichever peak window we're inside (still today).
    nextStart = cur[1] * 60
    nextWindow = cur
    dayOffset = 0
  } else if (isWorkday && secs < PEAK_WINDOWS[0][0] * 60) {
    // Workday before 09:00 → today's morning window.
    nextStart = PEAK_WINDOWS[0][0] * 60
    nextWindow = PEAK_WINDOWS[0]
    dayOffset = 0
  } else if (isWorkday && secs < PEAK_WINDOWS[1][0] * 60) {
    // Workday lunch gap (12:00–14:00) → today's afternoon window.
    nextStart = PEAK_WINDOWS[1][0] * 60
    nextWindow = PEAK_WINDOWS[1]
    dayOffset = 0
  } else {
    // After 18:00 on a workday, or any time on a weekend → next workday 09:00.
    const off = workdayOffset(day, 1)
    nextStart = DAY_SECS * off + PEAK_WINDOWS[0][0] * 60
    nextWindow = PEAK_WINDOWS[0]
    dayOffset = off
  }

  return { peak, nextIn: nextStart - secs, nextWindow, dayOffset, day }
}

function fmtCountdown(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function fmtWindow([s, e]) {
  const hh = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  return `${hh(s)}-${hh(e)}`
}

function fmtYuan(n) {
  if (Number.isInteger(n)) return `¥${n}`
  return `¥${n.toFixed(2).replace(/\.?0+$/, '')}`
}

/* ── Status Bar Chip ─────────────────────────────────────────────────── */

/** The host hands `ctx` to `register` only; keep it so handlers can reach
 *  `ctx.storage` outside render (the VS Code globalState analog). */
let pluginCtx = null

function TideChip() {
  const t = usePluginI18n(ID)
  const [now, setNow] = useState(() => new Date())
  // Restored from plugin storage so the choice survives reloads/restarts.
  const [tierModel, setTierModel] = useState(() =>
    pluginCtx?.storage.get(TIER_KEY, 'flash') === 'pro' ? 'pro' : 'flash'
  )

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const { peak, nextIn, nextWindow, dayOffset, day } = tideAt(now)
  const tier = PRICES[tierModel][peak ? 'peak' : 'offpeak']
  const icon = peak ? '⛰️' : '🌙'
  const stateText = peak ? t('peak') : t('offpeak')
  const win = fmtWindow(nextWindow)
  const windowLabel =
    dayOffset === 0
      ? win
      : dayOffset === 1
        ? t('tomorrow', win)
        : t('weekdayWindow', (day + dayOffset) % 7, win)
  const tierMark = tierModel === 'flash' ? 'F' : 'P'
  const label = `${tierMark}${icon} ${stateText} ${windowLabel} ${t('countdown', fmtCountdown(nextIn))} · ${t('priceLine', fmtYuan(tier.hit), fmtYuan(tier.miss), fmtYuan(tier.out))}`

  const labelColor = peak ? 'text-(--ui-orange)' : 'text-(--ui-green)'

  const detail = [
    t('detailHeader'),
    `${icon} ${t('detailNow', peak ? t('peakHours') : t('offpeakHours'))}`,
    t('detailNext', fmtCountdown(nextIn)),
    '',
    t('detailPeakWindow'),
    t('detailWeekend'),
    '',
    t('detailPriceTitle', tierModel === 'flash' ? 'Flash' : 'Pro'),
    t('detailPriceRow', fmtYuan(tier.hit), fmtYuan(tier.miss), fmtYuan(tier.out)),
    ...(tierModel === 'pro' ? [t('detailProNote')] : []),
    t('detailSwitchTo', tierModel === 'flash' ? 'Pro' : 'Flash'),
  ].join('\n')

  return jsx(Tip, {
    label: detail,
    children: jsx('button', {
      className: cn(
        'inline-flex h-full cursor-pointer items-center px-0.5 text-[0.6875rem] transition-colors',
        labelColor,
        'hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      type: 'button',
      title: t('tip'),
      onClick: () => {
        haptic('tap')
        const next = tierModel === 'flash' ? 'pro' : 'flash'
        setTierModel(next)
        pluginCtx?.storage.set(TIER_KEY, next)
        const nt = PRICES[next][peak ? 'peak' : 'offpeak']
        host.notify({
          kind: 'info',
          message: t(
            'switched',
            next === 'flash' ? 'Flash' : 'Pro',
            stateText,
            fmtYuan(nt.hit),
            fmtYuan(nt.miss),
            fmtYuan(nt.out)
          ),
        })
      },
      children: label,
    }),
  })
}

/* ── Plugin Registration ─────────────────────────────────────────────── */

export default {
  id: ID, // must match the folder name
  name: 'DeepSeek Peak/Off-peak Tide',
  description:
    'Status bar tide for DeepSeek peak/off-peak pricing: current window, countdown to the next switch, and per-1M-token prices (Flash / Pro).',
  register(ctx) {
    pluginCtx = ctx
    ctx.i18n.register(MESSAGES)
    ctx.register({
      id: 'chip',
      area: STATUSBAR_AREAS.right,
      order: 110,
      render: () => jsx(TideChip, {}),
    })
  },
}
