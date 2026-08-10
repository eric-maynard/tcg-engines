/**
 * Ruling bdceb30c30e825bf — Falling Star (OGN-029 → ogn-029-298) · Action · [2]+[fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × En Garde (OGN-046 → ogn-046-298) · Reaction · [1] · "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this
 *     turn if it is the only unit you control there."
 *
 * Q: When are Falling Star's targets chosen, and how does that interact with En Garde?
 * A: Targets are declared when Falling Star is PLAYED (both instances — the same unit twice is allowed); the damage is dealt when it
 *    RESOLVES. So the opponent sees exactly which units are targeted before deciding whether to respond with En Garde (and can avoid
 *    wasting it on a unit that dies anyway).
 * Rules: 355.5 (targets chosen at play/finalization and public on the chain), 359 (effects happen on resolution), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const EN_GARDE = "ogn-046-298";

/** P1's turn with [2]+[fury][fury]. P2: A (3) alone at bf1, B (3) in base, En Garde + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "A" }, "A")
    .unit(P2, "base", { might: 3, name: "B" }, "B")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, EN_GARDE, "eg");
}

describe("Ruling bdceb30c30e825bf — Falling Star's targets are public at play time; En Garde is decided with that knowledge", () => {
  test("targets are chosen AS IT IS PLAYED: casting requires naming both instances, they appear on the chain item (visible to P2), and no damage has been dealt yet", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "star")?.fields.find((f) => f.name === "targets");
    expect(field?.required).toBe(true);
    await game.p1.cast("star", { targets: ["A", "B"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1 })]);
    expect([...(game.chain()[0]?.targets ?? [])].toSorted()).toEqual(["A", "B"]);
    expect([...(game.p2.view().chain[0]?.targets ?? [])].toSorted()).toEqual(["A", "B"]); // the opponent sees them
    expect(game.state("A").damage).toBe(0);
    expect(game.state("B").damage).toBe(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 decides with full information
    expect(game.p2.can("cast", "eg")).toBe(true);
  });

  test("split 3/3 on A and B: P2, seeing A targeted for only 3, En Gardes the lone A (+2 → 5) — on resolution A survives with 3 damage, B dies", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["A", "B"] });
    await game.p1.passPriority();
    await game.p2.cast("eg", { targets: "A" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "eg"]);
    await game.settle();
    expect(game.state("A")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("eg")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("both instances on the SAME unit is legal (A, A → 6): P2 can see that En Garde (+2 → 5) would not save A and may simply keep it — A dies, B untouched, En Garde still in hand", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "star")?.fields.find((f) => f.name === "targets");
    const tuples = (field?.options ?? []).map((v) => JSON.stringify(v));
    expect(tuples).toContain(JSON.stringify(["A", "A"]));
    await game.p1.cast("star", { targets: ["A", "A"] });
    expect(game.p2.view().chain[0]).toMatchObject({ cardId: "star", targets: ["A", "A"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // P2 declines to respond
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.state("B")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.hand()).toEqual(["eg"]);
    expect(game.p2.energy()).toBe(1);
  });

  test("…and had P2 En Garded the doubly-targeted A anyway, it would indeed have been wasted: 6 damage kills the 5-Might A", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["A", "A"] });
    await game.p1.passPriority();
    await game.p2.cast("eg", { targets: "A" });
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("eg")).toBe("trash");
  });
});
