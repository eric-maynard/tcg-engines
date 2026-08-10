/**
 * Ruling 9d58036cb05f5657 — Falling Star (OGN-029 → ogn-029-298) · Spell · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · "Give a unit +2 [Might] this turn. Draw 1."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: Can the caster change Falling Star's targets after they are chosen (e.g. after the opponent Disciplines one)?
 * A: No. Both targets are chosen together and are locked; even though the opponent has reaction windows, the caster
 *    never gets to re-aim either 3. If a target is removed (Retreat) the instance aimed at it just does nothing —
 *    no retargeting.
 * Rules: 355 (targets chosen at finalization and fixed), 359.3.e.8 (instructions execute in order), 355.11 (an
 *        instruction whose target is gone does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const DISCIPLINE = "ogn-058-298";
const RETREAT = "ogn-104-298";

/** P1's turn with [2][fury][fury]. P2: X (3) and Y (4) in base, Discipline + Retreat in hand with [2]+[1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 3 })
    .unit(P2, "base", { might: 3, name: "Unit X" }, "x")
    .unit(P2, "base", { might: 4, name: "Unit Y" }, "y")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, RETREAT, "retreat");
}

describe("Ruling 9d58036cb05f5657 — Falling Star's two targets are locked once chosen; no re-aiming after a reaction", () => {
  test("both targets are named together as the spell is played — the chain item carries [X, Y] before P2 can react", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "y"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1, targets: ["x", "y"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 reacts with Discipline on X (3 → 5); when priority returns to P1 there is NO option to change Falling Star's targets — only pass / other plays", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "y"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "x" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "disc"]);
    // Discipline resolves first (LIFO) …
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("x").might).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["x", "y"] })]);
    // … and whoever holds priority now has no verb that touches Falling Star's targets.
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    expect(d?.seat).toBe(P1); // priority is back with the caster …
    // … whose whole menu is pass / concede: nothing re-aims the Star.
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.p1.legal().some((o) => o.card === "star")).toBe(false);
  });

  test("resolution with the locked targets: X (now 5) takes 3 and survives, Y (4) takes 3 and survives; nothing was redirected to finish X off", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "y"] });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "x" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 3, might: 5, zone: "base" });
    expect(game.state("y")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Discipline, X (3) dies to its 3 and Y wears 3", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "y"] });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 3, zone: "base" });
  });

  test("nuance: P2 Retreats X in response — the instance aimed at X does nothing, Y still takes exactly 3; P1 is never asked to pick a replacement target", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "y"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "retreat")).toBe(true);
    await game.p2.cast("retreat", { targets: "x" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves: X → hand
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star" })]);
    // No retarget prompt: straight priority passes resolve the Star.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.state("y")).toMatchObject({ damage: 3, zone: "base" }); // 3, not 6
    expect(game.violations()).toEqual([]);
  });
});
