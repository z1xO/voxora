// Turns raw editor changes into short, meaningful summaries the interviewer can react to,
// so the model sees "added a nested loop" rather than every keystroke.

function significantLines(code: string): string[] {
  return code
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trimEnd())
    .filter((l) => l.trim().length > 0);
}

function loopInfo(code: string) {
  const lines = significantLines(code);
  const loopIndents: number[] = [];
  let loops = 0;
  let maxDepth = 0;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    while (loopIndents.length && indent <= loopIndents[loopIndents.length - 1]) loopIndents.pop();
    if (/^\s*(for|while)\b/.test(line)) {
      loops++;
      loopIndents.push(indent);
      maxDepth = Math.max(maxDepth, loopIndents.length);
    }
  }
  return { loops, maxDepth };
}

/** Structural features of the code, described in plain words. */
export function detectFeatures(code: string, functionName?: string): string[] {
  const body = significantLines(code).join("\n");
  const f: string[] = [];
  const { loops, maxDepth } = loopInfo(code);
  if (maxDepth >= 2) f.push("nested loops");
  else if (loops >= 1) f.push(loops > 1 ? `${loops} separate loops` : "a single loop");
  if (/\{\s*\}|\bdict\(|defaultdict|Counter\(|\{[^}]*:[^}]*\}/.test(body)) f.push("a dictionary");
  if (/\bset\(|\{\s*\w+\s*\}/.test(body)) f.push("a set");
  if (/\.sort\(|\bsorted\(/.test(body)) f.push("sorting");
  if (/\.append\(/.test(body) && /\.pop\(\s*\)/.test(body)) f.push("a stack (append/pop)");
  if (/\b(left|lo|start|l)\b\s*[+-]?=/.test(body) && /\b(right|hi|end|r)\b\s*[+-]?=/.test(body)) f.push("two indices / pointers");
  if (/\bmid\b\s*=/.test(body)) f.push("a midpoint (binary search)");
  if (/\b(prefix|suffix|left_prod|right_prod|running)\w*/i.test(body)) f.push("running/prefix values");
  if (/\bif\s+not\s+\w+\s*:|\bif\s+len\(\w+\)\s*(==|<=|<)\s*[012]\b|==\s*(\[\]|""|'')/.test(body)) f.push("an empty-input guard");
  if (functionName) {
    const def = new RegExp(`def\\s+${functionName}\\b[\\s\\S]*`).exec(body)?.[0] ?? "";
    if (def && new RegExp(`\\b${functionName}\\s*\\(`).test(def.replace(new RegExp(`def\\s+${functionName}`), ""))) f.push("recursion");
  }
  if (/\bprint\(/.test(body)) f.push("print statements");
  if (/^\s*pass\s*$/m.test(code) && significantLines(code).length <= 3) f.push("an empty function body");
  return f;
}

function lineDiff(prev: string, next: string) {
  const count = (lines: string[]) => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.trim(), (m.get(l.trim()) ?? 0) + 1);
    return m;
  };
  const a = count(significantLines(prev));
  const b = count(significantLines(next));
  let added = 0;
  let removed = 0;
  for (const [l, n] of b) added += Math.max(0, n - (a.get(l) ?? 0));
  for (const [l, n] of a) removed += Math.max(0, n - (b.get(l) ?? 0));
  return { added, removed };
}

export interface CodeChange {
  meaningful: boolean;
  summary: string;
  added: number;
  removed: number;
  features: string[];
}

export function summarizeChange(prev: string, next: string, functionName?: string): CodeChange {
  const { added, removed } = lineDiff(prev, next);
  const before = detectFeatures(prev, functionName);
  const after = detectFeatures(next, functionName);
  const gained = after.filter((x) => !before.includes(x));
  const lost = before.filter((x) => !after.includes(x));
  const meaningful = added + removed >= 3 || gained.length > 0 || lost.length > 0;

  const parts: string[] = [];
  if (gained.length) parts.push(`introduced ${gained.join(", ")}`);
  if (lost.length) parts.push(`removed ${lost.join(", ")}`);
  if (!parts.length) parts.push("edited existing logic");
  const now = after.length ? ` Code now uses: ${after.join(", ")}.` : "";
  const summary = `${parts.join("; ")} (+${added}/-${removed} lines).${now}`;
  return { meaningful, summary: summary.charAt(0).toUpperCase() + summary.slice(1), added, removed, features: after };
}
