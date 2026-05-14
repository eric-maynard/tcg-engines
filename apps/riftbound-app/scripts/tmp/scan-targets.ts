import { getAllCards } from "@tcg/riftbound-cards";

const cards = getAllCards();
const byType: Record<string, string[]> = {};
const byLoc: Record<string, string[]> = {};

for (const c of cards) {
  const abilities = (c as any).abilities ?? [];
  for (const a of abilities) {
    const t = a.effect?.target;
    if (!t) {continue;}
    const key = `${t.type}${t.location ? `@${t.location}` : ""}`;
    if (!byType[key]) {byType[key] = [];}
    if (byType[key].length < 5) {byType[key].push(`${c.id} ${c.name}`);}
  }
}

const keys = Object.keys(byType).toSorted();
for (const k of keys) {
  console.log(`${k}: ${byType[k].length} examples — ${byType[k].slice(0, 3).join(", ")}`);
}
