import fs from "node:fs"
import path from "node:path"

function walk(dir: string): string[] {
  let out: string[] = []
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) out = out.concat(walk(p))
    else if (/\.(json|ts)$/.test(f)) out.push(p)
  }
  return out
}

const files: string[] = []
for (const base of ["content", "server/engine", "server/routes"]) {
  files.push(...walk(base))
}

const words = new Map<string, number>()
const esRe = /"es":\s*"((?:[^"\\]|\\.)*)"/g
for (const f of files) {
  const text = fs.readFileSync(f, "utf8")
  let m: RegExpExecArray | null
  while ((m = esRe.exec(text))) {
    for (const tok of m[1]
      .toLowerCase()
      .split(/[^a-záéíóúñü]+/)
      .filter(Boolean)) {
      if (tok.length > 2) words.set(tok, (words.get(tok) ?? 0) + 1)
    }
  }
}

console.log(
  [...words.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([w, c]) => `${w}\t${c}`)
    .join("\n"),
)
