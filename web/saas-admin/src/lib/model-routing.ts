export function splitModelList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      out.push(item);
    });
  return out;
}

export function joinModelList(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

