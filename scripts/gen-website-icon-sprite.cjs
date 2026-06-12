const fs = require('fs')

const SRC = '/Users/eva/mbt-gym/src/components/icons/FitnessIcons.tsx'
const OUT_SPRITE = '/Users/eva/Website/mbt-forest/assets/mbt-icons.svg'
const OUT_DEMO = '/Users/eva/Website/mbt-forest/assets/mbt-icons-demo.html'

const text = fs.readFileSync(SRC, 'utf8')

const COLORS = { D: '#4a5568', M: '#5a6577', L: '#7B8889' }

function kebab(name) {
  return name
    .replace(/^Icon/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

function jsxToSvg(inner) {
  return inner
    // strip JSX comments {/* ... */}
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // color tokens (JSX attr form: fill={D} -> fill="#4a5568")
    .replace(/=\{D\}/g, `="${COLORS.D}"`)
    .replace(/=\{M\}/g, `="${COLORS.M}"`)
    .replace(/=\{L\}/g, `="${COLORS.L}"`)
    .replace(/\{D\}/g, COLORS.D)
    .replace(/\{M\}/g, COLORS.M)
    .replace(/\{L\}/g, COLORS.L)
    // camelCase SVG attrs -> kebab
    .replace(/strokeWidth=/g, 'stroke-width=')
    .replace(/strokeLinecap=/g, 'stroke-linecap=')
    .replace(/strokeLinejoin=/g, 'stroke-linejoin=')
    .replace(/strokeDasharray=/g, 'stroke-dasharray=')
    .replace(/strokeMiterlimit=/g, 'stroke-miterlimit=')
    .replace(/clipPath=/g, 'clip-path=')
    .replace(/fillOpacity=/g, 'fill-opacity=')
    .replace(/fillRule=/g, 'fill-rule=')
    .trim()
}

// 1) Component functions: export function IconX(...) { return ( <svg ...>INNER</svg> ) }
const symbols = {}
const fnRe = /export function (Icon[A-Za-z0-9]+)\s*\([^)]*\)\s*\{[\s\S]*?<svg[^>]*>([\s\S]*?)<\/svg>/g
let m
while ((m = fnRe.exec(text)) !== null) {
  const name = m[1]
  const inner = jsxToSvg(m[2])
  symbols[name] = inner
}

// 2) Aliases: export const IconMoon = IconSleep
const aliasRe = /export const (Icon[A-Za-z0-9]+)\s*=\s*(Icon[A-Za-z0-9]+)/g
while ((m = aliasRe.exec(text)) !== null) {
  if (symbols[m[2]]) symbols[m[1]] = symbols[m[2]]
}

const names = Object.keys(symbols).sort()

const symbolMarkup = names
  .map((n) => `  <symbol id="mbt-${kebab(n)}" viewBox="0 0 24 24">\n    ${symbols[n].replace(/\n\s*/g, '\n    ')}\n  </symbol>`)
  .join('\n')

const sprite = `<?xml version="1.0" encoding="UTF-8"?>
<!-- MBT icon-set — gegenereerd uit mbt-gym/src/components/icons/FitnessIcons.tsx.
     Niet handmatig bewerken; pas de bron aan en draai het genereer-script opnieuw.
     Gebruik: <svg class="mbt-icon" width="24" height="24"><use href="assets/mbt-icons.svg#mbt-strength"/></svg> -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
${symbolMarkup}
</svg>
`

fs.writeFileSync(OUT_SPRITE, sprite)

// Demo / overzicht
const demoCells = names
  .map(
    (n) =>
      `    <figure><svg width="32" height="32" class="mbt-icon"><use href="mbt-icons.svg#mbt-${kebab(n)}"/></svg><figcaption>mbt-${kebab(n)}</figcaption></figure>`
  )
  .join('\n')

const demo = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MBT icon-set</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1f2933; margin: 2rem; }
  h1 { font-size: 1.4rem; }
  p code { background:#eef1f2; padding:.1rem .3rem; border-radius:4px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:1rem; margin-top:1.5rem; }
  figure { margin:0; text-align:center; padding:1rem .5rem; border:1px solid #e2e6e7; border-radius:10px; }
  figcaption { font-size:.7rem; color:#5a6577; margin-top:.5rem; word-break:break-all; }
  .mbt-icon { display:block; margin:0 auto; }
</style>
</head>
<body>
<h1>MBT icon-set (${names.length} iconen)</h1>
<p>Gebruik: <code>&lt;svg class="mbt-icon" width="24" height="24"&gt;&lt;use href="assets/mbt-icons.svg#mbt-strength"/&gt;&lt;/svg&gt;</code></p>
<div class="grid">
${demoCells}
</div>
</body>
</html>
`

fs.writeFileSync(OUT_DEMO, demo)

console.log(`Sprite: ${names.length} symbols -> ${OUT_SPRITE}`)
console.log(`Demo   -> ${OUT_DEMO}`)
console.log('Namen:', names.map(kebab).join(', '))
