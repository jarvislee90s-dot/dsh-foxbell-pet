// build.mjs — sync src/ → lib/ (plain JS, no transpile).
// lib/ is the shipped entry (package.json main + ./client), so it must be
// committed; run this after editing src/.
import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
for (const f of ['index.js', 'client.js']) {
  cpSync(new URL('src/' + f, root), new URL('lib/' + f, root))
  console.log(`lib/${f}  <-  src/${f}`)
}
console.log('done: src → lib synced')
