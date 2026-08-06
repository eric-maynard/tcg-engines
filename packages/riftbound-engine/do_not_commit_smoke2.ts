import { BrowserBackend, attachBrowserGame } from "./src/harness/browser";
import type { ActionDecision, PickDecision } from "./src/harness";

const backend = await BrowserBackend.launch({ mode: "test", actMode: "visual" });
const game = attachBrowserGame(backend);
const p1 = game.p1;
console.log("turn", game.turnNumber(), game.turnPlayer(), game.phase(), "energy", p1.energy());
let r = await p1.tapRune();
r = await p1.tapRune();
console.log("energy after 2 visual taps", p1.energy(), backend.visualLog.map(v => [v.gesture, v.dispatched, v.visualFallback, !!v.mismatch]));
const units = p1.hand().filter((c) => game.state(c).cardType === "unit" && game.state(c).energyCost <= p1.energy() && (game.state(c).powerCost?.length??0)===0).sort((a, b) => game.state(a).energyCost - game.state(b).energyCost);
console.log("units affordable", units.map(u => [u, game.state(u).name, game.state(u).energyCost]), "legal plays", p1.legal().filter(o=>o.moveId==="playUnit").map(o=>o.key));
const opt = p1.legal().find(o => o.moveId === "playUnit");
if (opt) {
  r = await p1.play(opt.card!);
  console.log("visual play", JSON.stringify(r.executed[0]), "zone", game.zoneOf(opt.card!), backend.visualLog.at(-1));
}
// tutor cleave
backend.actMode = "semantic";
const { cardId: cleave } = await backend.tutor("ogn-004-298");
console.log("tutored", cleave, "hand has", p1.hand().includes(cleave), "energy", p1.energy(), "cast option", p1.option("cast", cleave));
const ally = p1.units("base")[0];
console.log("ally", ally);
if (ally) {
  backend.actMode = "visual";
  r = await p1.cast(cleave, { targets: ally });
  console.log("cast", JSON.stringify(r.executed), "chain", game.chain().map(c => c.name), "decision", game.decision()?.kind, (game.decision() as any)?.context, backend.visualLog.at(-1));
  const s = await game.settle();
  console.log("settle", s.reason, s.steps, "cleave zone", game.zoneOf(cleave), "ally granted", game.state(ally).grantedKeywords, backend.visualLog.at(-1));
}
// stacked deck
backend.actMode = "semantic";
const { cardId: sd } = await backend.tutor("ogn-183-298");
console.log("tutored sd", sd, p1.energy(), p1.option("cast", sd)?.key);
r = await p1.cast(sd);
console.log("cast sd", JSON.stringify(r.executed.map(e=>e.moveId)), "decision", game.decision()?.kind, game.decision()?.seat);
let s = await game.settle();
console.log("settle", s.reason, "decision", JSON.stringify({kind: s.decision?.kind, seat: s.decision?.seat, prompt: s.decision?.prompt, sem: (s.decision as PickDecision)?.semantics, options: (s.decision as PickDecision)?.options}));
if (s.decision?.kind === "pick") {
  backend.actMode = "visual";
  const pick = (s.decision as PickDecision).options[1] ?? (s.decision as PickDecision).options[0];
  const handBefore = p1.hand().length;
  r = await p1.pick(pick!.key);
  console.log("picked", pick!.key, JSON.stringify(r.executed.map(e=>e.moveId)), "in hand", p1.hand().includes(pick!.card!), handBefore, "->", p1.hand().length, backend.visualLog.at(-1));
  s = await game.settle();
  console.log("after", s.reason, game.zoneOf(sd), game.decision()?.kind, (game.decision() as ActionDecision)?.context);
}
// visual pass via Space: cast something to open chain then pass
await backend.screenshot("/tmp/claude-999/-root-src-anthropic/d48e3a2d-1aa8-4d74-b4c6-a677aa8236c2/scratchpad/smoke2.png");
await backend.close();
