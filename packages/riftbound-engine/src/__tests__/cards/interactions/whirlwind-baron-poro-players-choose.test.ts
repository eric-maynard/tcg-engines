/**
 * Interaction: Whirlwind (ogn-187-298) · Spell · Chaos · 3 + [chaos]
 *     "Starting with the next player, each player may return a unit to its owner's hand."
 *   × Baron Nashor (unl-147-219) · Unit · Chaos · 10 · 12 Might — at the Baron Pit (unl-t01)
 *     "…I can't be chosen by enemy spells and abilities. Other friendly units have +2 [Might]."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might · [Deflect]
 *     "(Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *
 * Question: P1's turn. P2 controls Baron Nashor at the Baron Pit and Pouty Poro in base; P1 controls one
 * vanilla unit. P1 plays Whirlwind with no spare power. (a) Does P1 pick anything, or pay Deflect, when
 * putting Whirlwind on the chain? (b) On resolution, who chooses first, and may P1 name P2's Baron Nashor or
 * Pouty Poro? (c) May either player decline?
 *
 * Rules: 355.7 / 355.10.e (a set of objects chosen in whole or in part by other players is NOT targeting —
 * every player, including the caster, chooses as the spell resolves), 355.17, 757 / 758 ("can't be chosen by
 * enemy spells/abilities" restricts what a SPELL OR ABILITY may choose), 809.1.c (Deflect is an additional
 * COST owed when a spell/ability chooses the unit — costs are paid at finalization, never mid-resolution).
 *
 * Expected: (a) Nothing is chosen and no Deflect is owed: the cast option has no target field, the cost is
 * exactly 3 + [chaos], and P2 gets priority over a target-less Whirlwind. (b) P2 (the next player) chooses
 * first from every unit on the board (+ decline); then P1 chooses from every unit still on the board
 * INCLUDING Baron Nashor and Pouty Poro — the player is choosing, not the spell, and no cost can be levied
 * mid-resolution; naming Baron returns him to P2's hand and the Baron Pit stays. (c) Each player may
 * decline; if both do, Whirlwind resolves with no effect, goes to trash and still counts as played.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";
const BARON_NASHOR = "unl-147-219";
const POUTY_PORO = "ogn-013-298";
const BARON_PIT = "unl-t01";

/** P1's turn with EXACTLY Whirlwind's cost (3 + one chaos). P2: Baron at the (live) Baron Pit, Pouty Poro in base. P1: one vanilla 3 in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("pit", { controller: P2, def: BARON_PIT, inert: false })
    .battlefield("bf1", { controller: null })
    .unit(P2, "pit", BARON_NASHOR, "baron")
    .unit(P2, "base", POUTY_PORO, "poro")
    .unit(P1, "base", { might: 3, name: "Vanilla" }, "vanilla")
    .hand(P1, WHIRLWIND, "ww");
}

/** Whirlwind cast and both players pass → it starts resolving; returns the game at the first resolution prompt. */
async function resolving(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ww");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

function pickOptions(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

describe("Whirlwind × Baron Nashor / Pouty Poro — the players choose at resolution, not the spell", () => {
  test("setup sanity: Baron carries his 'can't be chosen by enemy spells and abilities' restriction and the Poro has Deflect", async () => {
    const game = await board().build();
    expect(game.state("baron")).toMatchObject({ controller: P2, location: "pit", might: 12 });
    expect(game.state("baron").keywords).toContain("Untargetable");
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.state("poro").might).toBe(4); // "Other friendly units have +2" — Baron's aura reaches base
  });

  // ---- (a) finalization: nothing chosen, no Deflect ----------------------------------------------------------

  test("(a) Whirlwind has NO targets (355.10.e): the cast option asks for nothing — no unit field, no mode, no Deflect opt-in — and is affordable with exactly 3 + [chaos]", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "ww")).toBe(true);
    const opt = game.p1.option("cast", "ww");
    expect(opt?.fields ?? []).toEqual([]);
    expect(opt?.variantCount).toBe(1);
  });

  test("(a) casting it pays exactly 3 energy + 1 chaos (no Deflect pip for the Poro, 809.1.c) and puts a target-less Whirlwind on the chain; nobody is asked anything; after P1 passes, P2 simply gets priority", async () => {
    const game = await board().build();
    await game.p1.cast("ww");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "ww", controller: P1, triggered: false, type: "spell" });
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("baron")).toBe("battlefield-pit");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("vanilla")).toBe("base");
  });

  // ---- (b) resolution: turn order, and what each player may name ---------------------------------------------

  test("(b) as it resolves the NEXT player — P2 — chooses first: an optional pick (RES timing) over EVERY unit on the board: P1's vanilla, P2's own Baron and P2's own Poro", async () => {
    const game = await resolving();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P2, timing: "RES" });
    expect(pickOptions(game)).toEqual(["baron", "poro", "vanilla"]);
    expect(game.chain()).toEqual([]); // no longer a chain item anyone could respond to
  });

  test("(b) then P1 chooses; P1 may name P2's Pouty Poro with ZERO power — Deflect is a cost on a spell's choice, and no cost can be levied mid-resolution: the Poro returns to P2's hand, P1's pool untouched", async () => {
    const game = await resolving();
    await game.p2.decline();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(pickOptions(game)).toContain("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.pick("poro");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("ww")).toBe("trash");
  });

  // Expected: Baron's "can't be chosen by ENEMY SPELLS AND ABILITIES" (757/758) restricts what a spell or
  // ability chooses; here the PLAYER chooses at resolution (355.10.e), so Baron must be on P1's list too.
  // Actual: P1's prompt filters Baron out (it applies the Untargetable restriction to a player choice) — P1
  // is offered only the vanilla and the Poro.
  test("(b) P1's list also includes P2's Baron Nashor — untargetability is irrelevant when the player, not the spell, is choosing (355.10.e vs 757/758)", async () => {
    const game = await resolving();
    await game.p2.decline();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(game)).toEqual(["baron", "poro", "vanilla"]);
  });

  // Same bug, seen from the outcome: naming Baron must be a legal answer and send him to P2's hand while the
  // Baron Pit token battlefield stays on the board. Actual: "baron" is rejected as not among the legal picks.
  test("(b) P1 names Baron Nashor → Baron returns to his OWNER's (P2's) hand; the Baron Pit token stays on the board; Whirlwind → trash", async () => {
    const game = await resolving();
    await game.p2.decline();
    await game.p1.pick("baron");
    await game.settle();
    expect(game.zoneOf("baron")).toBe("hand");
    expect(game.p2.hand()).toContain("baron");
    expect(game.p1.hand()).not.toContain("baron");
    expect(game.battlefields()).toContain("pit");
    expect(game.zoneOf("ww")).toBe("trash");
  });

  test("(b) P2 may name its OWN Baron (the restriction only binds enemies, 757): Baron → P2's hand, the Pit stays; P1 then still gets a choice over what is left", async () => {
    const game = await resolving();
    await game.p2.pick("baron");
    expect(game.zoneOf("baron")).toBe("hand");
    expect(game.p2.hand()).toContain("baron");
    expect(game.battlefields()).toContain("pit");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(pickOptions(game)).toEqual(["poro", "vanilla"]); // every unit STILL on the board
    expect(game.state("poro").might).toBe(2); // aura gone with Baron
  });

  test("(b) P2 may name P1's vanilla unit — it goes to its OWNER's (P1's) hand, not P2's", async () => {
    const game = await resolving();
    await game.p2.pick("vanilla");
    expect(game.zoneOf("vanilla")).toBe("hand");
    expect(game.p1.hand()).toContain("vanilla");
    expect(game.p2.hand()).not.toContain("vanilla");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(game)).not.toContain("vanilla");
  });

  // ---- (c) "may" ----------------------------------------------------------------------------------------------

  test("(c) 'may': both players decline → Whirlwind resolves with no effect, goes to P1's trash, and still counts as a card P1 played this turn; the board is unchanged and P1's main phase resumes", async () => {
    const game = await resolving();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P2 });
    await game.p2.decline();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.trash()).toEqual(["ww"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.zoneOf("baron")).toBe("battlefield-pit");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("vanilla")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
