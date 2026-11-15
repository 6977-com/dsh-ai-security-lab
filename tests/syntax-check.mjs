/** 语法与 JSON 校验：CI 与本地 `npm run check` 共用，不需要安装依赖。 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = ['index.js', 'client.js']
for (const name of readdirSync(join(root, 'lib'))) {
  if (name.endsWith('.js')) files.push(join('lib', name))
}

let failed = 0
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' })
  if (result.status === 0) {
    console.log(`ok  ${file}`)
  } else {
    failed += 1
    console.error(`FAIL ${file}\n${result.stderr || result.stdout}`)
  }
}

for (const file of ['package.json', 'locale/zh.json', 'locale/en.json']) {
  try {
    JSON.parse(readFileSync(join(root, file), 'utf8'))
    console.log(`ok  ${file}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${file}: ${error.message}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} 项检查未通过。`)
  process.exit(1)
}
console.log('\n语法与 JSON 校验全部通过。')
