import { detectPlatform, extractPostId, getPlatformInfo } from './platformParser'

type Case = [string, string, string | null]
const cases: Case[] = [
  // --- NEW: short links ---
  ['vt short link',               'https://vt.tiktok.com/ZS8abc123/', 'ZS8abc123'],
  ['vm short link',               'https://vm.tiktok.com/ZMabc123/', 'ZMabc123'],
  ['vt no trailing slash',        'https://vt.tiktok.com/ZS8abc123', 'ZS8abc123'],
  ['vt with tracking query',      'https://vt.tiktok.com/ZS8abc123/?_r=1&u_code=xyz', 'ZS8abc123'],
  ['vt no protocol',              'vt.tiktok.com/ZS8abc123/', 'ZS8abc123'],
  ['vt leading/trailing spaces',  '  https://vt.tiktok.com/ZS8abc123/  ', 'ZS8abc123'],
  ['case preserved (mixed case)', 'https://vt.tiktok.com/ZsAbC9xYz/', 'ZsAbC9xYz'],
  // --- NEW: photo posts ---
  ['photo post',                  'https://www.tiktok.com/@user/photo/7301234567890123456', '7301234567890123456'],
  ['photo post + query',          'https://www.tiktok.com/@user/photo/7301234567890123456?is_from_webapp=1', '7301234567890123456'],
  // --- EXISTING: must be unchanged ---
  ['full video URL',              'https://www.tiktok.com/@user/video/7301234567890123456', '7301234567890123456'],
  ['full video + query',          'https://www.tiktok.com/@user/video/7301234567890123456?lang=en&utm_source=x', '7301234567890123456'],
  ['video URL no www',            'https://tiktok.com/@user.name/video/7301234567890123456', '7301234567890123456'],
  ['/t/ short link',              'https://www.tiktok.com/t/ZT8abc123/', 'ZT8abc123'],
  ['/t/ short + query',           'https://www.tiktok.com/t/ZT8abc123/?_r=1', 'ZT8abc123'],
  // --- NEGATIVE: must still fail ---
  ['bare tiktok homepage',        'https://www.tiktok.com/', null],
  ['profile only',                'https://www.tiktok.com/@user', null],
  ['vt host, no code',            'https://vt.tiktok.com/', null],
  ['www host as short (anchored)','https://www.tiktok.com/ZS8abc123/', null],
  ['non-numeric photo id',        'https://www.tiktok.com/@user/photo/abc', null],
]

let fail = 0
for (const [name, url, expected] of cases) {
  const got = extractPostId(url, 'tiktok')
  const ok = got === expected
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} -> ${JSON.stringify(got)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`)
}

// detectPlatform still routes short-link hosts to tiktok
for (const u of ['https://vt.tiktok.com/ZS8abc123/', 'https://vm.tiktok.com/ZMabc123/']) {
  const ok = detectPlatform(u) === 'tiktok'; if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  detectPlatform ${u}`)
}

// getPlatformInfo end-to-end (what the UI actually calls)
;(async () => {
  const info = await getPlatformInfo('https://vt.tiktok.com/ZS8abc123/', 'tiktok')
  const ok = info?.platform === 'tiktok' && info.platform_post_id === 'ZS8abc123'
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  getPlatformInfo(vt) ->`, JSON.stringify(info))
  const bad = await getPlatformInfo('https://www.tiktok.com/@user', 'tiktok')
  const ok2 = bad === null; if (!ok2) fail++
  console.log(`${ok2 ? 'PASS' : 'FAIL'}  getPlatformInfo(invalid) -> null`)
  console.log(fail === 0 ? '\nALL PASSED' : `\n${fail} FAILED`)
  process.exit(fail ? 1 : 0)
})()
