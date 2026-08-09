/** فرق نصي بسيط بين نسختين من ملف (LCS على الأسطر) — يعمل في المتصفح والخادم. */
export type DiffLine = {
  kind: "same" | "add" | "del";
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export function diffLines(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // جدول LCS (محدود الحجم لتفادي الاستهلاك المفرط)
  if (n * m > 4_000_000) {
    return [
      { kind: "del", text: `— ${n} سطر (النسخة السابقة)`, oldNo: 1, newNo: null },
      { kind: "add", text: `+ ${m} سطر (النسخة الجديدة)`, oldNo: null, newNo: 1 },
    ];
  }

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const full: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      full.push({ kind: "same", text: a[i]!, oldNo: i + 1, newNo: j + 1 });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      full.push({ kind: "del", text: a[i]!, oldNo: i + 1, newNo: null });
      i += 1;
    } else {
      full.push({ kind: "add", text: b[j]!, oldNo: null, newNo: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    full.push({ kind: "del", text: a[i]!, oldNo: i + 1, newNo: null });
    i += 1;
  }
  while (j < m) {
    full.push({ kind: "add", text: b[j]!, oldNo: null, newNo: j + 1 });
    j += 1;
  }

  // نُبقي فقط الأسطر المتغيّرة مع سياق حولها
  const keep = new Set<number>();
  full.forEach((line, index) => {
    if (line.kind === "same") return;
    for (let k = index - context; k <= index + context; k += 1) {
      if (k >= 0 && k < full.length) keep.add(k);
    }
  });
  if (keep.size === 0) return [];

  const out: DiffLine[] = [];
  let lastKept = -1;
  full.forEach((line, index) => {
    if (!keep.has(index)) return;
    if (lastKept >= 0 && index - lastKept > 1) {
      out.push({ kind: "same", text: "⋯", oldNo: null, newNo: null });
    }
    out.push(line);
    lastKept = index;
  });
  return out;
}

export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
