/**
 * Interaction: Showstopper (ogn-270-298) · Spell · Body/Order · 1 + [rainbow]
 *     "Buff a friendly unit in your base, then move it to a battlefield."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — one EXHAUSTED in base, one in hand
 *   × Shipyard Skulker (ogn-175-298) · Unit · 3 · 3 Might (vanilla) — P2's defender at bfB
 *
 * Rules: 144.2 / 420.3.a (the Standard Move's COST is exhausting the unit), 414.1.b (an exhausted object can't be
 * exhausted), 420.2 / 449 / 449.1 (effect moves: only the source restricts the destination — no exhaust, no
 * ready-state requirement), 355.4 / 355.4.a (a spell that Moves a unit chooses its Move Destination at finalization:
 * any location other than the current one where the unit may be), 355.2.a (PLAY locations = your base or a
 * battlefield you CONTROL), 450 / 190.3.a.1 (arriving where you don't control ⇒ the mover's controller applies
 * Contested), 453 (Cleanup after a Move), 323.8 / 323.9 / 323.13 (that Cleanup stages Showdown + Combat, begun once
 * the state is Neutral Open), 464.2.c.1 / 345 (Attacker = who applied Contested, and gains Focus), 426.1.b (Buff =
 * +1 Might counter).
 *
 * Question: P1's turn, Neutral Open. P1: EXHAUSTED Vanguard Sergeant (4) in base; hand = Showstopper + a second
 * Sergeant; resources for either. bfA: P1's (a P1 token-like Holder there). bfB: P2's with Shipyard Skulker (3).
 *   (a) Is a Standard Move listed for the exhausted Sergeant? Is Showstopper playable on that same Sergeant?
 *   (b) Showstopper's destination Decision: which locations — is enemy-held bfB offered, is a base / "stay" offered —
 *       and is it taken at FINALIZATION, before P2 gets priority?
 *   (c) Contrast: playing the second Sergeant from hand — which locations; is bfB offered?
 *   (d) Resolve with destination bfB: buff, move, exhausted on arrival, who contested, what the Cleanup stages,
 *       Attacker/Focus, combat result.
 *   (e) Resolve with destination bfA: any Contested / showdown?
 *
 * Expected: (a) no Standard Move for the exhausted Sergeant; Showstopper IS castable on it. (b) {bfA, bfB} exactly —
 * no base, no "stay"; timing FIN, bound to the chain item, P2's priority comes after. (c) {base, bfA}; bfB NOT
 * offered. (d) Sergeant buffed → 5, at bfB, still EXHAUSTED; bfB contested by P1; combat showdown at bfB with P1
 * Attacker holding Focus; pass/pass → Skulker dies, Sergeant survives (3 < 5, healed), P1 conquers bfB, +1 point.
 * (e) buff + move to bfA, nothing contested, no showdown, straight back to P1's open main phase.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn 2, Neutral Open. P1: 4 energy + 1 rainbow (Showstopper 1+[rainbow] OR the 4-cost Sergeant); exhausted
 * Sergeant "sarge" in base; Showstopper + a second Sergeant in hand; a 1-Might Holder at bfA (durable control).
 * P2: Shipyard Skulker at bfB (P2 controls it).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge", { exhausted: true })
    .hand(P1, SHOWSTOPPER, "show")
    .hand(P1, VANGUARD_SERGEANT, "sarge2");
}

function fieldOptions(game: Game, verbOrMove: string, card: string, name: string): unknown[] {
  const opt = game.p1.option(verbOrMove, card);
  const field = opt?.fields.find((f) => f.name === name || f.arg === name);
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v])))];
}

/** Cast Showstopper on the exhausted Sergeant and answer the FIN destination prompt with `dest`. Chain: [show], P1 priority. */
async function castShowstopper(dest: "bfA" | "bfB"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("show", { targets: "sarge" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  await game.p1.pick(`battlefield-${dest}`);
  return game;
}

describe("Showstopper × exhausted Vanguard Sergeant × enemy-held battlefield — effect move vs Standard Move vs Play", () => {
  // ── (a) discretionary move vs effect move ─────────────────────────────────────────────────────────

  test("(a) no Standard Move is listed for the EXHAUSTED Sergeant — exhausting it is the cost (144.2 / 420.3.a) and it can't be exhausted again (414.1.b); the only mover offered is the ready Holder", async () => {
    const game = await board().build();
    const moveOptions = game.p1.legal().filter((o) => o.verb === "move");
    const movers = moveOptions.flatMap((o) => (o.fields.find((f) => f.arg === "units")?.options ?? []).flat() as string[]);
    expect(movers).not.toContain("sarge");
    expect(movers).toContain("holder");
    expect(game.p1.can("standardMove:to:bfB")).toBe(false); // nobody ready can go there (Holder is AT bfA → only base)
    const r = await game.p1.try((p) => p.move("sarge", "bfB"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("sarge")).toBe("base");
    expect(game.state("sarge").isExhausted).toBe(true);
  });

  test("(a) Showstopper IS castable choosing that same exhausted Sergeant — an effect move has no exhaust cost and ignores ready state (420.2 / 449); it is the only 'friendly unit in your base'", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "show")).toBe(true);
    expect(fieldOptions(game, "cast", "show", "targets")).toEqual(["sarge"]); // Holder is at bfA, not in base
    await game.p1.cast("show", { targets: "sarge" });
    expect(game.zoneOf("show")).toBe("chain");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
  });

  // ── (b) the destination Decision ─────────────────────────────────────────────────────────────────

  test("(b) the Move Destination is asked at FINALIZATION (355.4): a P1 pick bound to Showstopper's chain item, offering exactly {bfA, bfB} — enemy-held bfB IS valid (449.1 / 450), no base, no 'stay in base' (355.4.a)", async () => {
    const game = await board().build();
    await game.p1.cast("show", { targets: "sarge" });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, semantics: "destination", timing: "FIN" });
    expect(d.source?.cardId).toBe("sarge"); // the mover
    expect(d.source?.chainItemId).toBe(game.chain()[0]?.id);
    expect(d.options.map((o) => o.zone ?? o.key).sort()).toEqual(["battlefield-bfA", "battlefield-bfB"]);
    expect(d.options.map((o) => o.zone ?? o.key)).not.toContain("base");
    await expect(game.p1.pick("base")).rejects.toThrow();
  });

  test("(b) the destination is recorded on the chain item BEFORE anyone gets priority: after the pick P1 holds chain priority, then P2 — who reacts seeing Showstopper → Sergeant already routed to bfB", async () => {
    const game = await castShowstopper("bfB");
    // P1 (caster) gets priority first, only now.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "show", controller: P1, targets: ["sarge"], triggered: false })]);
    // The bound destination rides on the finalized item (raw state — the public chain view exposes targets only).
    expect(JSON.stringify(game.gameState.interaction?.chain?.items?.[0] ?? {})).toContain('"_dest":"battlefield-bfB"');
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "show", targets: ["sarge"] })]);
    // Nothing has moved yet — the move happens on resolution.
    expect(game.locationOf("sarge")).toBe("base");
    expect(game.state("sarge").isBuffed).toBe(false);
  });

  // ── (c) PLAY locations are a different rule ──────────────────────────────────────────────────────

  test("(c) contrast: PLAYING the second Sergeant from hand offers {base, bfA} only — a battlefield you CONTROL (355.2.a); enemy-held bfB is NOT a play location and is rejected", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "sarge2")).toBe(true);
    expect((fieldOptions(game, "playUnit", "sarge2", "to") as string[]).sort()).toEqual(["base", "battlefield-bfA"]);
    const r = await game.p1.try((p) => p.play("sarge2", { to: "bfB" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sarge2")).toBe("hand");
    // …while the very same bfB IS a legal Showstopper destination for a unit already on the board (see (b)).
    await game.p1.play("sarge2", { to: "bfA" });
    await game.settle();
    expect(game.locationOf("sarge2")).toBe("bfA");
    expect(game.state("sarge2").isExhausted).toBe(true); // 143.4
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  // ── (d) resolve → bfB ────────────────────────────────────────────────────────────────────────────

  test("(d) resolution with destination bfB: Sergeant gets a Buff counter (4 → 5, 426.1.b), moves base → bfB and is STILL EXHAUSTED there (nothing readied it); Showstopper → trash", async () => {
    const game = await castShowstopper("bfB");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Showstopper resolves
    expect(game.zoneOf("show")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("sarge")).toMatchObject({ baseMight: 4, damage: 0, isBuffed: true, isExhausted: true, isReady: false, location: "bfB", might: 5 });
    expect(game.p1.units("bfB")).toEqual(["sarge"]);
    expect(game.p2.units("bfB")).toEqual(["skulker"]);
  });

  test("(d) P1's unit arrived where P1 doesn't control → P1 applied Contested (190.3.a.1 / 450); the post-move Cleanup staged Showdown + Combat at bfB and, the chain being empty (Neutral Open), it BEGAN: combat showdown at bfB, P1 Attacker with Focus, P2 Defender (453, 323.13, 464.2.c.1, 345)", async () => {
    const game = await castShowstopper("bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const bfB = game.gameState.battlefields.bfB;
    expect(bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.actingSeat()).toBe(P1);
    // bfA / Holder untouched
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
  });

  test("(d) pass/pass → combat: the EXHAUSTED 5-Might attacker deals full damage — Skulker (3) dies; 3 into the Sergeant (5) is not lethal, healed to 0; P1 conquers bfB and scores +1; Sergeant stays at bfB, buffed, exhausted", async () => {
    const game = await castShowstopper("bfB");
    expect(game.p1.points()).toBe(0);
    await game.settle(); // resolves Showstopper, both pass Focus, combat resolves
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash()).toContain("skulker");
    expect(game.state("sarge")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, location: "bfB", might: 5 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("show")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (e) resolve → bfA ────────────────────────────────────────────────────────────────────────────

  test("(e) resolution with destination bfA (P1-controlled): buffed to 5, moved beside the Holder, still exhausted — NO Contested (190.3.a.1), no showdown staged, straight back to P1's open main phase; bfB untouched", async () => {
    const game = await castShowstopper("bfA");
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    expect(game.zoneOf("show")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ isBuffed: true, isExhausted: true, location: "bfA", might: 5 });
    expect(game.p1.units("bfA").sort()).toEqual(["holder", "sarge"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("sarge").combatRole).toBeFalsy();
    expect(game.zoneOf("skulker")).toBe("battlefield-bfB");
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
