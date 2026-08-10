/**
 * Interaction: Siphon Power (ogn-266-298) · Spell · Mind/Order · 2 + [rainbow] · [Reaction]
 *     "Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there
 *      -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × The Dreaming Tree (ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Deadbloom Predator (ogn-161-298) · Unit · Body · 8 · 8 Might · [Deflect]
 *   (+ Ride the Wind ogn-173-298 "[Action] Move a friendly unit and ready it." and En Garde ogn-046-298
 *    "[Reaction] Give a friendly unit +1 [Might] this turn, then an additional +1 … if it is the only unit
 *    you control there." as the unit-choosing spells)
 *
 * Question: combat showdown at The Dreaming Tree, which P2 controls and defends with Deadbloom; P1
 * attacked with X (3) and Y (2).
 *   (a) P1 plays Siphon Power choosing the Tree: Deflect owed? does anyone draw? does P2's control matter?
 *   (b) P1 instead plays Ride the Wind choosing X at the Tree — does P1 draw although P2 controls the Tree?
 *   (c) P2 then plays a spell choosing its own Deadbloom there — does P2 draw, does P2 pay Deflect?
 *   (d) as (b) but the Tree is Uncontrolled (non-combat showdown) — is the draw ignored under 190.6.d?
 *
 * Rules: 170.7 (battlefields are legal spell targets), 171 (not permanents), 809 (Deflect taxes an
 * OPPONENT choosing THAT UNIT), 190.6 / 190.6.a (controller controls a battlefield's abilities unless
 * the ability indicates another player), 190.6.b (uncontrolled: likewise unless indicated), 190.6.c (an
 * ability naming the acting player is controlled by that player regardless of battlefield control),
 * 190.6.d ("you" with no controller = nobody — only for controller-relative text).
 *
 * Expected: (a) battlefields {tree, bf2} offered; P1 pays exactly 2 + 1 power (no Deflect); no Tree
 * item, nobody draws; X 4, Y 3, Deadbloom 7. (b) Tree item on the chain controlled by P1 above Ride the
 * Wind; P1 draws 1; P2 draws nothing. (c) P2's own first choice this turn → Tree item controlled by P2,
 * P2 draws 1, pays only En Garde's 1 energy (no Deflect on your own unit). (d) not ignored — P1 still
 * controls the item and draws while the Tree is Uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIPHON_POWER = "ogn-266-298";
const DREAMING_TREE = "ogn-292-298";
const DEADBLOOM = "ogn-161-298";
const RIDE_THE_WIND = "ogn-173-298";
const EN_GARDE = "ogn-046-298";

/**
 * P1's turn. The Dreaming Tree (live abilities) is controlled by `treeController` — P2 (defended by
 * Deadbloom) or nobody (empty). bf2 is an empty uncontrolled inert battlefield (a second legal
 * battlefield target / move destination). P1: X (3) and Y (2) in base, Siphon Power + Ride the Wind in
 * hand, exactly 4 energy + 1 rainbow + 1 chaos (Siphon 2+[rainbow], Ride 2+[chaos]; NOTHING spare for a
 * Deflect tax). P2: En Garde in hand, 1 energy + 1 rainbow (the rainbow must stay unspent).
 */
function board(treeController: Seat | null = P2) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { chaos: 1, rainbow: 1 } })
    .resources(P2, { energy: 1, power: { rainbow: 1 } })
    .battlefield("tree", { controller: treeController, def: DREAMING_TREE, inert: false, owner: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Attacker X" }, "X")
    .unit(P1, "base", { might: 2, name: "Attacker Y" }, "Y")
    .hand(P1, SIPHON_POWER, "siphon")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, EN_GARDE, "engarde");
  return treeController === P2 ? s.unit(P2, "tree", DEADBLOOM, "deadbloom") : s;
}

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 attacks the Tree with X and Y → combat showdown, P1 holds Focus. */
async function combatAtTree(): Promise<Game> {
  const game = await board(P2).build();
  await game.p1.move(["X", "Y"], "tree");
  const sd = game.gameState.interaction?.showdownStack?.at(-1);
  expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "tree", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("(a) Siphon Power targets the BATTLEFIELD — no Deflect, no Dreaming Tree draw", () => {
  test("Siphon Power offers battlefields as its target — the P2-controlled Tree AND the uncontrolled bf2 — never a unit (170.7); control is irrelevant to targetability", async () => {
    const game = await combatAtTree();
    expect(game.p1.can("cast", "siphon")).toBe(true);
    const offered = targetsOffered(game, P1, "siphon");
    expect(offered.sort()).toEqual(["bf2", "tree"]);
    expect(offered).not.toContain("deadbloom");
    expect(offered).not.toContain("X");
  });

  test("choosing the Tree costs exactly 2 energy + 1 power — Deadbloom's Deflect is NOT owed (no unit was chosen, 809); P1 could not have afforded a tax anyway", async () => {
    const game = await combatAtTree();
    await game.p1.cast("siphon", { targets: "tree" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "siphon", controller: P1, targets: ["tree"], triggered: false })]);
  });

  test("no Dreaming Tree item goes on the chain and NOBODY draws — neither the chooser P1 nor the Tree's controller P2 (190.6: control governs abilities, but the trigger condition 'chooses a unit' is simply unmet)", async () => {
    const game = await combatAtTree();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("siphon", { targets: "tree" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["siphon"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("siphon")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // Siphon spent, nothing drawn
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.chain()).toEqual([]);
  });

  test("effect: friendly units there +1 (X 4, Y 3), enemy units there -1 (Deadbloom 7) this turn; the combat showdown continues", async () => {
    const game = await combatAtTree();
    await game.p1.cast("siphon", { targets: "tree" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("X").might).toBe(4);
    expect(game.state("Y").might).toBe(3);
    expect(game.state("deadbloom").might).toBe(7);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "tree", isCombatShowdown: true });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Ride the Wind chooses P1's X at the P2-controlled Tree — P1 controls the trigger and draws (190.6.c)", () => {
  test("Ride the Wind offers P1's friendly units at the Tree (X, Y), not Deadbloom", async () => {
    const game = await combatAtTree();
    expect(targetsOffered(game, P1, "ride").sort()).toEqual(["X", "Y"]);
  });

  test("on finalization a Dreaming Tree item controlled by P1 — NOT by the Tree's controller P2 — sits above Ride the Wind", async () => {
    const game = await combatAtTree();
    await game.p1.cast("ride", { targets: "X" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // destination for X, asked as part of the play
    await game.p1.pick("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, rainbow: 1 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ride", controller: P1, targets: ["X"], triggered: false }),
      expect.objectContaining({ cardId: "tree", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the Tree item resolves first: P1 draws exactly 1; P2 (who controls the battlefield) draws nothing", async () => {
    const game = await combatAtTree();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("ride", { targets: "X" });
    await game.p1.pick("base");
    const p1Hand = game.p1.hand().length; // Ride already left the hand
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree item
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
  });

  test("Ride the Wind then resolves as normal: X is moved to base and readied; Y still attacks Deadbloom at the Tree; Focus passes on to P2", async () => {
    const game = await combatAtTree();
    await game.p1.cast("ride", { targets: "X" });
    await game.p1.pick("base");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.state("X")).toMatchObject({ combatRole: null, isExhausted: false, zone: "base" });
    expect(game.state("Y")).toMatchObject({ combatRole: "attacker", zone: "battlefield-tree" });
    expect(game.state("deadbloom")).toMatchObject({ combatRole: "defender", zone: "battlefield-tree" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P2 chooses its own Deadbloom at the Tree with En Garde — P2 draws, pays no Deflect", () => {
  /** (b) has happened (P1 already drew this turn); Focus is now with P2. */
  async function afterRide(): Promise<Game> {
    const game = await combatAtTree();
    await game.p1.cast("ride", { targets: "X" });
    await game.p1.pick("base");
    for (let i = 0; i < 4; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    return game;
  }

  test("En Garde (friendly only) offers P2 exactly Deadbloom; casting it costs P2 just 1 energy — its [rainbow] is untouched (Deflect taxes opponents only, 809)", async () => {
    const game = await afterRide();
    expect(targetsOffered(game, P2, "engarde")).toEqual(["deadbloom"]);
    await game.p2.cast("engarde", { targets: "deadbloom" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  test("a Dreaming Tree item controlled by P2 goes above En Garde — P2's OWN first unit-choice here this turn counts even though P1 already drew this turn (per-player tally)", async () => {
    const game = await afterRide();
    await game.p2.cast("engarde", { targets: "deadbloom" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "engarde", controller: P2, targets: ["deadbloom"], triggered: false }),
      expect.objectContaining({ cardId: "tree", controller: P2, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("resolution: P2 draws exactly 1, P1 draws nothing more; then En Garde gives Deadbloom +1 +1 (only unit P2 controls there) → 10", async () => {
    const game = await afterRide();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("engarde", { targets: "deadbloom" });
    const p2Hand = game.p2.hand().length; // En Garde already on the chain
    await game.p2.passPriority();
    await game.p1.passPriority(); // Tree item
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.state("deadbloom").might).toBe(8); // En Garde not yet resolved
    await game.p2.passPriority();
    await game.p1.passPriority(); // En Garde
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.state("deadbloom").might).toBe(10);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) the Tree is UNCONTROLLED (non-combat showdown) — the draw is NOT ignored under 190.6.d", () => {
  async function nonCombatAtTree(): Promise<Game> {
    const game = await board(null).build();
    await game.p1.move("X", "tree");
    expect(game.gameState.battlefields.tree).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "tree", focusPlayer: P1, isCombatShowdown: false });
    return game;
  }

  test("P1 (Focus) plays Ride the Wind choosing X at the uncontrolled Tree → a Dreaming Tree item controlled by P1 goes on the chain (190.6.b/190.6.c: the ability names the acting player)", async () => {
    const game = await nonCombatAtTree();
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "X" });
    await game.p1.pick("base");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ride", controller: P1, targets: ["X"] }),
      expect.objectContaining({ cardId: "tree", controller: P1, triggered: true }),
    ]);
  });

  test("it resolves and P1 draws 1 even though nobody controls the battlefield; Ride the Wind then moves X home readied", async () => {
    const game = await nonCombatAtTree();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("ride", { targets: "X" });
    await game.p1.pick("base");
    const p1Hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree item
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.state("X")).toMatchObject({ isExhausted: false, zone: "base" });
    expect(game.gameState.battlefields.tree?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
