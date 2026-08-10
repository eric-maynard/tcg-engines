/**
 * Interaction: Thwonk! (sfd-040-221) · Spell · Calm · 2 · [Action] [Repeat][2] "Stun an attacking unit.
 *     (It doesn't deal combat damage this turn.)"
 *   × Xin Zhao, Vigilant (sfd-176-221) · Champion Unit · Order · 3 · 4 Might
 *     "[Tank] (I must be assigned combat damage first.) I enter ready if you have two or more other
 *      units in your base."
 *   × Petty Officer (ogn-215-298) · Unit · Order · 5 · 5 Might "[Assault] (+1 [Might] while I'm an attacker.)"
 *   Defenders (P2 at bf1): Vanguard Sergeant (ogn-219-298, vanilla 4) + Shipyard Skulker (ogn-175-298, vanilla 3).
 *
 * Question: does Tank bind the DEFENDER's assignment against ATTACKERS, and what does stunning that
 * Tank change? P1 attacks P2's bf1 with Xin Zhao (4, Tank) + Petty Officer (5 → 6 with Assault). After
 * P1 passes Focus, P2 plays Thwonk! on (a) Xin Zhao / (b) Petty Officer; (c) no Thwonk.
 *
 * Rules: 815.1.b / 815.1.c.1 (Tank: "I must be assigned lethal damage before any other unit with the
 * same controller" — controller-relative, no attacker/defender restriction; full lethal before moving
 * on), 465.2.a / 465.2.b (sum attacking / defending Might), 465.2.c.3 (lethal in full before the next
 * unit), 465.2.c.4 (no more than lethal unless nobody is left), 465.2.c.6 (assignment restrictions are
 * mandatory), 423.1.b (a stunned unit contributes 0 to its side's sum), 423.1.c (a stunned unit still
 * needs its FULL Might in damage to die), 807.1.c / 807.1.d.1 (Assault: +1 while it holds the Attacker
 * designation — a stun does not remove the designation), 466.1.a.2 (attackers are recalled if a
 * defender survives), 466.3 / 466.5 (sole survivor side wins → conquer).
 *
 * Expected:
 *   (a) Xin stunned: attackers 0 + 6 = 6, defenders 4 + 3 = 7. P1 splits 6 freely between two plain
 *       defenders: {Sgt 4, Sk 2} or {Sk 3, Sgt 3} (never {Sgt 5, Sk 1} / {Sgt 6}). P2's 7 is FORCED:
 *       Tank first at full lethal 4 (423.1.c), remainder 3 to Petty Officer (< 6) — the engine never
 *       even asks P2. Marks {Xin 4, PO 3}: Xin dies, PO survives; a defender survives → PO recalled to
 *       base healed; P2 keeps bf1, no points.
 *   (b) PO stunned: PO contributes 0 but is still an Attacker → still 6 Might, lethal threshold 6.
 *       Attackers 4, defenders 7. P1: {Sgt 4} or {Sk 3, Sgt 1}. P2 forced {Xin 4, PO 3} → Xin dies, PO
 *       (3 < 6) survives, recalled; P2 holds.
 *   (c) No stun: attackers 10 → both defenders die; defenders 7 → {Xin 4, PO 3} → Xin dies, PO survives
 *       and conquers bf1 (P1 +1).
 *   Contrast: replace Xin with a VANILLA 4 — now P2's 7 is a real choice ({V 4, PO 3} or {PO 6, V 1}),
 *   proving it is Tank that forces the Xin-first line.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THWONK = "sfd-040-221";
const XIN_ZHAO = "sfd-176-221";
const PETTY_OFFICER = "ogn-215-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/** P2 controls bf1 with Sergeant (4) + Skulker (3), holds Thwonk with exactly 2 energy. P1: Xin Zhao + Petty Officer ready in base. */
function board(opts: { tank?: "xin" | "vanilla" } = {}) {
  const b = scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", PETTY_OFFICER, "po")
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sgt")
    .unit(P2, "bf1", SHIPYARD_SKULKER, "sk")
    .hand(P2, THWONK, "thwonk");
  return opts.tank === "vanilla" ? b.unit(P1, "base", { might: 4, name: "Vanilla Four" }, "xin") : b.unit(P1, "base", XIN_ZHAO, "xin");
}

/** Combat damage dealt to `target` (public damage log). */
function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/** P1 attacks bf1 with both units, passes Focus; P2 Thwonks `victim` (or nothing); the spell resolves. */
async function attack(victim?: "xin" | "po", opts: { tank?: "xin" | "vanilla" } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move(["xin", "po"], "bf1");
  if (victim) {
    await game.p1.passFocus();
    await game.p2.cast("thwonk", { targets: victim });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "thwonk", controller: P2, targets: [victim] })]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state(victim).isStunned).toBe(true);
  }
  return game;
}

/** Pass Focus for whoever holds it until a non-pass decision (distribute / main phase) appears; returns every decision seen. */
async function closeShowdownWatching(game: Game): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind !== "action" || d.context === "main" || !d.passKey) {
      break;
    }
    await game.acting().pass();
  }
  return seen;
}

describe("setup — sums going in", () => {
  test("as attackers Petty Officer is 6 (Assault) and Xin Zhao 4; defenders Sergeant 4 + Skulker 3; P2 may Thwonk either ATTACKING unit once it has Focus, for its 2 energy", async () => {
    const game = await board().build();
    expect(game.state("po").might).toBe(5); // in base, not yet an attacker
    await game.p1.move(["xin", "po"], "bf1");
    expect(game.state("po")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(game.state("xin")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("xin").keywords).toContain("Tank");
    expect(game.state("sgt")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("sk")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.p2.can("cast", "thwonk")).toBe(false); // P1 holds Focus first
    await game.p1.passFocus();
    expect(game.p2.can("cast", "thwonk")).toBe(true);
    const field = game.p2.option("cast", "thwonk")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["po", "xin"]); // "an attacking unit" — defenders are not offered
    await game.p2.cast("thwonk", { targets: "xin" });
    expect(game.p2.energy()).toBe(0);
  });
});

describe("(a) Thwonk! on Xin Zhao — the stunned Tank still soaks the defenders' damage first", () => {
  test("Xin is stunned but keeps 4 Might; P1 is asked to assign only 6 (0 + 6, 423.1.b) among the two plain defenders (lethal 4 / 3)", async () => {
    const game = await attack("xin");
    expect(game.state("xin")).toMatchObject({ isStunned: true, might: 4 });
    const seen = await closeShowdownWatching(game);
    const p1Assign = seen.find((d) => d.kind === "distribute" && d.seat === P1);
    expect(p1Assign).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    expect(p1Assign?.kind === "distribute" ? p1Assign.buckets.map((b) => [b.card ?? b.key, b.lethal]) : []).toEqual([
      ["sgt", 4],
      ["sk", 3],
    ]);
  });

  test("P1's legal lines: {Sgt 4, Sk 2} and {Sk 3, Sgt 3} are accepted; {Sgt 6}, {Sgt 5, Sk 1} and {2, 2} are rejected (465.2.c.3 / 465.2.c.4)", async () => {
    const game = await attack("xin");
    await closeShowdownWatching(game);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    expect((await game.p1.try((p) => p.distribute({ sgt: 6 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ sgt: 5, sk: 1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ sgt: 2, sk: 2 }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 }); // still asking
    await game.p1.distribute({ sgt: 3, sk: 3 });
    await game.settle();
    expect(combatDamageTo(game, "sgt")).toBe(3);
    expect(combatDamageTo(game, "sk")).toBe(3);

    const other = await attack("xin");
    await closeShowdownWatching(other);
    await other.p1.distribute({ sgt: 4, sk: 2 });
    await other.settle();
    expect(combatDamageTo(other, "sgt")).toBe(4);
    expect(combatDamageTo(other, "sk")).toBe(2);
  });

  test("P2's 7 is FORCED by Tank (815.1.b is controller-relative): P2 is never offered a PO-first line — if asked at all only {Xin 4 (full Might, 423.1.c), PO 3}; the marks dealt are exactly Xin 4 / PO 3", async () => {
    const game = await attack("xin");
    const seen = await closeShowdownWatching(game);
    await game.p1.distribute({ sgt: 4, sk: 2 });
    const more = await closeShowdownWatching(game);
    const p2Assign = [...seen, ...more].find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect(p2Assign.total).toBe(7);
      expect(p2Assign.buckets[0]).toMatchObject({ card: "xin", lethal: 4 });
      expect((await game.p2.try((p) => p.distribute({ po: 6, xin: 1 }))).ok).toBe(false);
      expect((await game.p2.try((p) => p.distribute({ po: 7 }))).ok).toBe(false);
      await game.p2.distribute({ po: 3, xin: 4 });
    }
    await game.settle();
    expect(combatDamageTo(game, "xin")).toBe(4);
    expect(combatDamageTo(game, "po")).toBe(3);
  });

  test("result with {Sgt 4, Sk 2}: Xin (4 ≥ 4) and Sergeant die; PO (3 < 6) and Skulker survive → attackers recalled: PO in base healed and back to 5 (Assault off), P2 keeps bf1, nobody scores", async () => {
    const game = await attack("xin");
    await closeShowdownWatching(game);
    await game.p1.distribute({ sgt: 4, sk: 2 });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("xin")).toBe("trash");
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.state("po")).toMatchObject({ combatRole: null, damage: 0, isStunned: false, might: 5, zone: "base" });
    expect(game.state("sk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("result with {Sk 3, Sgt 3}: Skulker dies instead, Sergeant survives (healed) — still a surviving defender → recall, P2 holds", async () => {
    const game = await attack("xin");
    await closeShowdownWatching(game);
    await game.p1.distribute({ sgt: 3, sk: 3 });
    await game.settle();
    expect(game.zoneOf("xin")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("trash");
    expect(game.state("sgt")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("po")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});

describe("(b) Thwonk! on Petty Officer — stunned but still an Attacker: 6 Might, lethal threshold 6", () => {
  test("stunned PO keeps the Attacker designation and Assault: it reads 6, not 5 (807.1.d.1); attackers now sum 4 → P1 assigns 4: {Sgt 4} or {Sk 3, Sgt 1}, not {2, 2}", async () => {
    const game = await attack("po");
    expect(game.state("po")).toMatchObject({ combatRole: "attacker", isStunned: true, might: 6 });
    const seen = await closeShowdownWatching(game);
    const p1Assign = seen.find((d) => d.kind === "distribute" && d.seat === P1);
    expect(p1Assign).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect((await game.p1.try((p) => p.distribute({ sgt: 2, sk: 2 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ sk: 4 }))).ok).toBe(false); // Sk lethal at 3, the 4th must go to Sgt
    await game.p1.distribute({ sgt: 1, sk: 3 });
    await game.settle();
    expect(combatDamageTo(game, "sk")).toBe(3);
    expect(combatDamageTo(game, "sgt")).toBe(1);
  });

  test("P2's 7 is again forced {Xin 4, PO 3}: PO's lethal is its FULL 6 (423.1.c), so 3 is not lethal — if P2 is asked, PO shows lethal 6 and PO-first is rejected", async () => {
    const game = await attack("po");
    const seen = await closeShowdownWatching(game);
    await game.p1.distribute({ sgt: 4 });
    const more = await closeShowdownWatching(game);
    const p2Assign = [...seen, ...more].find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect(p2Assign.buckets.find((b) => b.card === "po")?.lethal).toBe(6);
      expect((await game.p2.try((p) => p.distribute({ po: 6, xin: 1 }))).ok).toBe(false);
      await game.p2.distribute({ po: 3, xin: 4 });
    }
    await game.settle();
    expect(combatDamageTo(game, "xin")).toBe(4);
    expect(combatDamageTo(game, "po")).toBe(3);
  });

  test("result with {Sgt 4}: Sergeant and Xin die; PO (3/6) survives, Skulker untouched → PO recalled to base (healed, still stunned this turn), P2 keeps bf1, no points", async () => {
    const game = await attack("po");
    await closeShowdownWatching(game);
    await game.p1.distribute({ sgt: 4 });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("xin")).toBe("trash");
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.state("sk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("po")).toMatchObject({ combatRole: null, damage: 0, isStunned: true, might: 5, zone: "base" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) baseline — no Thwonk: 10 vs 7", () => {
  test("attackers 10 kill both defenders; defenders' 7 forced {Xin 4, PO 3} → Xin dies, PO survives and CONQUERS bf1 (P1 +1); Thwonk still in P2's hand", async () => {
    const game = await attack(undefined);
    const seen = await closeShowdownWatching(game);
    // P1's 10 kills everything whichever order; if the engine asks anyway, take Sergeant first.
    if (seen.at(-1)?.kind === "distribute" && seen.at(-1)?.seat === P1) {
      await game.p1.distribute({ sgt: 4, sk: 6 });
    }
    const more = await closeShowdownWatching(game);
    const p2Assign = [...seen, ...more].find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect((await game.p2.try((p) => p.distribute({ po: 6, xin: 1 }))).ok).toBe(false);
      await game.p2.distribute({ po: 3, xin: 4 });
    }
    await game.settle();
    expect(combatDamageTo(game, "xin")).toBe(4);
    expect(combatDamageTo(game, "po")).toBe(3);
    expect(combatDamageTo(game, "sgt") + combatDamageTo(game, "sk")).toBe(10);
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("trash");
    expect(game.zoneOf("xin")).toBe("trash");
    expect(game.state("po")).toMatchObject({ combatRole: null, damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("thwonk")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});

describe("contrast — without Tank the defender's assignment IS a choice", () => {
  test("a VANILLA 4 in Xin's slot: P2 is now handed a 7-damage decision with both lines legal — {V 4, PO 3} and {PO 6, V 1} — so it was Tank that forced Xin-first above", async () => {
    const game = await attack(undefined, { tank: "vanilla" });
    const seen = await closeShowdownWatching(game);
    if (seen.at(-1)?.kind === "distribute" && seen.at(-1)?.seat === P1) {
      await game.p1.distribute({ sgt: 4, sk: 6 });
    }
    const more = await closeShowdownWatching(game);
    const p2Assign = [...seen, ...more].find((d) => d.kind === "distribute" && d.seat === P2);
    expect(p2Assign).toMatchObject({ kind: "distribute", seat: P2, total: 7 });
    expect(p2Assign?.kind === "distribute" ? p2Assign.buckets.map((b) => [b.card ?? b.key, b.lethal]).sort() : []).toEqual([
      ["po", 6],
      ["xin", 4],
    ]);
    expect((await game.p2.try((p) => p.distribute({ po: 5, xin: 2 }))).ok).toBe(false); // neither lethal first
    await game.p2.distribute({ po: 6, xin: 1 }); // legal here: PO first at 6, remainder to the vanilla
    await game.settle();
    expect(combatDamageTo(game, "po")).toBe(6);
    expect(combatDamageTo(game, "xin")).toBe(1);
    expect(game.zoneOf("po")).toBe("trash");
    expect(game.state("xin")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // the vanilla survives and conquers
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
