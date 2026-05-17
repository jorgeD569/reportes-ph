import fs from 'fs'

const file = process.argv[2]
if (!file) throw new Error('usage: node fix-tags.mjs <path>')

const wrong = ['m', 'o', 't', 'i', 'o', 'n'].join('')
const right = ['d', 'i', 'v'].join('')

let text = fs.readFileSync(file, 'utf8')
text = text.replaceAll(`</${wrong}>`, `</${right}>`)
text = text.replaceAll(`<${wrong} `, `<${right} `)
text = text.replaceAll(`<${wrong}>`, `<${right}>`)
fs.writeFileSync(file, text)
console.log('fixed', file)
