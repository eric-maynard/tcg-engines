import { BrowserBackend, attachBrowserGame } from "./src/harness/browser";
import type { ActionDecision } from "./src/harness";

const t0 = Date.now();
const backend = await BrowserBackend.launch({ mode: "test" });
console.log("launched in", Date.now() - t0, "ms; game", backend.gameId, "seat", backend.viewingPlayer, "sandbox", backend.sandbox, "seq", backend.seq());
const game = attachBrowserGame(backend);
const p1 = game.p1;
console.log("turn", game.turnNumber(), game.turnPlayer(), game.phase());
const d = game.decision() as ActionDecision;
console.log("decision", d?.kind, d?.context, d?.seat, d?.options.map((o) => o.key));
console.log("hand", p1.hand().map((c) => `${c}:${game.state(c).name}:${game.state(c).energyCost}`));
console.log("runes", p1.runes(), "energy", p1.energy());
let r = await p1.tapRune();
console.log("tap1", r.executed, "energy", p1.energy(), "seq", game.seq);
r = await p1.tapRune();
console.log("tap2", r.executed, "energy", p1.energy());
const units = p1.hand().filter((c) => game.state(c).cardType === "unit").sort((a, b) => game.state(a).energyCost - game.state(b).energyCost);
const unit = units[0]!;
console.log("playing", unit, game.state(unit).name, game.state(unit).energyCost, p1.legal().filter(o=>o.moveId==="playUnit").map(o=>[o.key,o.variantCount, o.fields]));
try {
  r = await p1.play(unit);
  console.log("play", JSON.stringify(r.executed), "energy", p1.energy());
} catch (e) { console.log("play failed", String(e)); }
await game.settle({policy:"first"});
console.log("zone", game.zoneOf(unit), "exhausted", game.state(unit).isExhausted, "decision", game.decision()?.kind, (game.decision() as any)?.context, game.decision()?.seat);
r = await p1.endTurn();
console.log("endTurn", JSON.stringify(r.executed), "turn", game.turnNumber(), game.turnPlayer(), game.phase(), "decision", game.decision()?.seat, (game.decision() as any)?.context);
await game.settle();
console.log("after settle turn", game.turnNumber(), game.turnPlayer(), game.phase(), "runes", p1.runes().length, "visualLog", backend.visualLog);
await backend.close();
