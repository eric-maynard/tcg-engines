/**
 * Interaction: Against the Odds (sfd-001-221) · Spell · Fury · 2 · [Reaction]
 *     "Give a friendly unit at a battlefield +2 [Might] this turn for each enemy unit there."
 *   × Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow]×2 · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *
 * Rules: 811.6 (a facedown Hidden card has [Reaction]), 811.1.b (played from facedown for 0), 811.1.d.2
 * (targets restricted to THAT battlefield), 359.3.e.2 / 359.3.e.4 (a target that no longer meets the
 * requirement — e.g. no longer friendly/enemy — is illegal at resolution), 359.3.e.5 (illegal target is
 * unaffected), 359.3.e.10 (spell still counts as played), 359.3.f.4 (friendly/enemy is relative to the
 * spell's controller, checked on execution), 355.15 (choices are not re-made), 323.2.b (a unit with the
 * opposite designation of its controller flips at the next cleanup), 465.1 (damage step needs both
 * attackers and defenders), 323.7 / 107.3.d (facedown card at a battlefield you no longer control is
 * trashed at cleanup).
 *
 * Question: P2 controls bf2 with D (4) and has Hostile Takeover facedown there. P1's turn: F (4) moves
 * alone into bf2 → combat showdown. P1 plays Against the Odds on F; P2 responds by flipping Hostile
 * Takeover (0) on F.
 *   (a) Is the flip legal at Reaction speed / is F a legal target from facedown?
 *   (b) Resolve LIFO: after P2 takes F, does Against the Odds still pump F?
 *   (c) What happens to the combat, and to F at end of turn?
 *   (d) Contrast: P2 does not respond.
 *
 * Expected: (a) yes / yes (F is the enemy unit at the battlefield HT was hidden at). (b) HT resolves
 * first: P2 controls F, F readied. Against the Odds then re-checks its target relative to P1: F is no
 * longer friendly → illegal → unaffected (+0, stays 4 Might); the spell still resolves to trash and its
 * cost stays paid. (c) F flips to Defender; P1 has no attackers → no damage step; P2 keeps bf2 with D and
 * F, no points; at end of turn F reverts to P1 and is recalled to P1's base. (d) one enemy (D) → F is 6;
 * 6 vs 4 → D dies, F survives; P1 conquers bf2 (+1) and P2's still-facedown HT goes to P2's trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AGAINST_THE_ODDS = "sfd-001-221";
const HOSTILE_TAKEOVER = "sfd-202-221";

/** P1's turn 2. bf1: P1's with bystander G. bf2: P2's with D(4) and a facedown Hostile Takeover. F(4) in P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 0 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Bystander G" }, "G")
    .unit(P2, "bf2", { might: 4, name: "Defender D" }, "D")
    .unit(P1, "base", { might: 4, name: "Fighter F" }, "F")
    .facedown(P2, "bf2", HOSTILE_TAKEOVER, "ht")
    .hand(P1, AGAINST_THE_ODDS, "ato");
}

/** F attacks bf2; P1 casts Against the Odds on F and passes; P2 now holds priority with the flip available. */
async function atP2Response(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("F", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus
  await game.p1.cast("ato", { targets: "F" });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

/** …P2 flips Hostile Takeover onto F (the only enemy unit at bf2 → target locked without a prompt). */
async function flipped(): Promise<Game> {
  const game = await atP2Response();
  await game.p2.reveal("ht");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("F");
  }
  return game;
}

describe("Against the Odds × facedown Hostile Takeover — 'friendly' is re-checked at resolution, relative to the caster", () => {
  // ---- (a) the flip -----------------------------------------------------------------------------------

  test("(a) with Against the Odds on the chain mid-showdown, P2 may flip the facedown Hostile Takeover at Reaction speed for 0 (811.6, 811.1.b)", async () => {
    const game = await atP2Response();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ato", controller: P1, targets: ["F"] })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.can("reveal", "ht")).toBe(true);
    await game.p2.reveal("ht");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // paid nothing
    expect(game.zoneOf("ht")).not.toBe("facedown-bf2");
  });

  test("(a) F — the enemy unit AT bf2 — is the one legal target from facedown (811.1.d.2): neither D (friendly to P2) nor G (at bf1) is offered; HT lands on the chain above Against the Odds", async () => {
    const game = await atP2Response();
    await game.p2.reveal("ht");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P2);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["F"]);
      await game.p2.pick("F");
    }
    const chain = game.chain();
    expect(chain.map((c) => c.cardId)).toEqual(["ato", "ht"]); // ht on top (last in, first out)
    expect(chain[1]).toMatchObject({ controller: P2, triggered: false });
  });

  // ---- (b) resolve LIFO -------------------------------------------------------------------------------

  test("(b) Hostile Takeover resolves first: P2 gains control of F (owner still P1) and readies it; Against the Odds is still waiting underneath", async () => {
    const game = await flipped();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ato"]);
    const f = game.state("F");
    expect(f.controller).toBe(P2);
    expect(f.owner).toBe(P1);
    expect(f.isReady).toBe(true);
    expect(f.zone).toBe("battlefield-bf2");
    expect(f.might).toBe(4);
    expect(game.zoneOf("ht")).toBe("trash");
  });

  // 359.3.e.2/.4/.5, 359.3.f.4: when Against the Odds resolves its target is re-checked relative to its
  // controller P1 — F is now P2's, so it is not "a friendly unit" → illegal → F is unaffected and stays
  // at 4 Might (it must not be pumped, let alone by +2 × {D, F} counting F itself as an enemy "there").
  test("(b) Against the Odds then resolves against a unit that is no longer friendly to P1 → F is unaffected, stays 4 Might (359.3.e.2, 359.3.e.5, 359.3.f.4)", async () => {
    const game = await flipped();
    await game.p2.passPriority();
    await game.p1.passPriority(); // HT resolves
    await game.acting().passPriority();
    if (game.chain().length > 0) {
      await game.acting().passPriority(); // ATO resolves
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ato")).toBe("trash");
    expect(game.state("F").might).toBe(4);
    expect(game.state("F").mightModifier).toBe(0);
  });

  test("(b) the spell does not jump to another friendly unit (355.15) and still counts as played (359.3.e.10): Against the Odds → trash, 2 energy spent, G untouched", async () => {
    const game = await flipped();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.acting().passPriority();
    if (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ato")).toBe("trash");
    expect(game.p1.trash()).toContain("ato");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("G").might).toBe(2);
    expect(game.state("D").might).toBe(4);
  });

  // ---- (c) the combat and end of turn -----------------------------------------------------------------

  test("(c) F swaps to P2's side (323.2.b); with no attacking units left there is no damage step (465.1): nobody is damaged or dies, P2 keeps bf2 holding D and F, no points either way", async () => {
    const game = await flipped();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.actingSeat()).toBe(P1); // back to P1's open main phase
    expect(game.zoneOf("D")).toBe("battlefield-bf2");
    expect(game.zoneOf("F")).toBe("battlefield-bf2");
    expect(game.state("D").damage).toBe(0);
    expect(game.state("F").damage).toBe(0);
    expect(game.state("F").controller).toBe(P2);
    expect(game.p2.units("bf2").sort()).toEqual(["D", "F"]);
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(c) at end of turn P2 loses control of F and it is recalled to its owner P1's base (Hostile Takeover's rider; recall is not a move); D still holds bf2 for P2", async () => {
    const game = await flipped();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const f = game.state("F");
    expect(f.controller).toBe(P1);
    expect(f.owner).toBe(P1);
    expect(f.zone).toBe("base");
    expect(game.p1.units("base")).toContain("F");
    expect(game.p2.units()).not.toContain("F");
    expect(f.might).toBe(4); // any "this turn" pump is gone too
    expect(game.zoneOf("D")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  // ---- (d) contrast: no response --------------------------------------------------------------------

  test("(d) P2 passes instead: one enemy unit (D) at bf2 → F gets +2 → 6 Might this turn", async () => {
    const game = await atP2Response();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ato")).toBe("trash");
    expect(game.state("F").might).toBe(6);
    expect(game.state("F").controller).toBe(P1);
    expect(game.zoneOf("ht")).toBe("facedown-bf2"); // still hidden for now
  });

  test("(d) combat 6 vs 4: D dies, F survives; P1 conquers bf2 (+1) and P2's still-facedown Hostile Takeover is put in P2's trash at cleanup (323.7 / 107.3.d)", async () => {
    const game = await atP2Response();
    await game.p2.passPriority();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.p2.trash()).toContain("D");
    expect(game.zoneOf("F")).toBe("battlefield-bf2");
    expect(game.state("F").controller).toBe(P1);
    expect(game.state("F").damage).toBe(0); // 4 marked in combat, healed at combat cleanup (466.1.a)
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("ht")).toBe("trash");
    expect(game.p2.trash()).toContain("ht");
    expect(game.p2.facedown("bf2")).toEqual([]);
  });
});
