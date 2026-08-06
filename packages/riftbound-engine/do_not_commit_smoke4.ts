import { BrowserBackend, attachBrowserGame } from "./src/harness/browser";
import type { PickDecision } from "./src/harness";
const backend = await BrowserBackend.launch({ mode: "test", actMode: "visual" });
const game = attachBrowserGame(backend);
const p1 = game.p1;
const t = () => new Date().toISOString().slice(14, 23);
console.log(t(), "launched");
const { cardId: sd } = await backend.tutor("ogn-183-298");
console.log(t(), "tutored");
await p1.cast(sd);
console.log(t(), "cast", backend.visualLog.at(-1));
const s = await game.settle();
console.log(t(), "settled", s.reason);
const d = s.decision as PickDecision;
await p1.pick(d.options[0]!.key);
console.log(t(), "picked", backend.visualLog.at(-1));
const s2 = await game.settle();
console.log(t(), "settled2", s2.reason, game.decision()?.kind, game.decision()?.seat);
const rune = p1.runes()[0]!;
console.log(t(), "recycling", rune, p1.legal().filter(o => o.moveId === "recycleRune").map(o => [o.key, o.variantCount, o.fields.map(f => [f.name, f.options])]));
try {
  const r = await p1.recycleRune(rune);
  console.log(t(), "recycled", r.executed, backend.visualLog.at(-1), game.zoneOf(rune));
} catch (e) { console.log(t(), "recycle failed", String(e)); }
await backend.close();
