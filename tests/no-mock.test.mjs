/**
 * 真实性静态检查：运行时代码不得内置「模拟回复」，必须走真实适配器。
 * 这里只检查 Host 运行链路；tests/ 里的 mock 仅用于离线单测。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(join(root, file), 'utf8')

let failed = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`)
  else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? `：${detail}` : ''}`)
  }
}

const engine = read('lib/engine.js')
const runner = read('lib/runner.js')
const judge = read('lib/judge.js')
const index = read('index.js')

console.log('1) 运行时只有两种真实调用路径')
check('Harness 路由调用 llm.stream', engine.includes('llm.stream({'))
check('OpenAI 兼容端点调用 fetch', engine.includes('fetch(url,'))
check('运行器对每条用例调用 adapter.chat', runner.includes('adapter.chat({'))

console.log('2) 运行时代码不含内置回复 / 模拟数据')
for (const [name, source] of [['index.js', index], ['lib/engine.js', engine], ['lib/runner.js', runner], ['lib/judge.js', judge]]) {
  check(`${name} 不含 mock 标记`, !/\bmock\b/i.test(source))
  check(`${name} 不含固定回复文案`, !source.includes('这是模拟回复') && !source.includes('canned reply'))
}

console.log('3) 判定只读取真实响应')
check('单项判定使用 response.text', judge.includes('response.text'))
check('多轮判定使用 round.text', judge.includes('round.text'))
check('运行结果记录 provider', judge.includes('provider: response.provider'))
check('运行结果记录 model', judge.includes('model: response.model'))
check('运行结果记录适配器', judge.includes('adapter: response.source'))

console.log('4) 真实结果会落盘')
check('运行完成后保存历史', runner.includes('store.saveRun(run)'))
check('报告导出读取历史/运行记录', index.includes('export?id') || index.includes('handleExport'))

if (failed > 0) {
  console.error(`\n真实性检查有 ${failed} 项未通过。`)
  process.exit(1)
}
console.log('\n真实性静态检查全部通过。')
