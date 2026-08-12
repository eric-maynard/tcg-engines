/**
 * Ruling 2b86b7319da58cce — Defy (OGN-045 → ogn-045-298) · [Reaction] · Calm · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Abandon (UNL-131 → unl-131-219) · [Reaction] · [2]
 *     "Counter a spell. Return it to its owner's hand instead of putting it in their trash. [Predict]."
 *   × Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit."
 *
 * Q: If something returns my Defy from the chain to my hand, can I use it again in the same chain, or do I
 *    have to wait for the whole chain to resolve?
 * A: You can use it again right away. The chain resolves one item at a time and players get priority between
 *    items, so as soon as Defy is back in hand you may cast it again — it is a [Reaction], which is what
 *    lets you add to a chain that is already going.
 * Rules: 336/337 (one item at a time, priority between items), 340 (priority windows), 350 (Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const ABANDON = "unl-131-219";
const CHARM = "ogn-043-298";

/** P2's turn. P2 casts Charm at P1's Pawn; P1 holds Defy and enough [calm] to cast it TWICE. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn")
    .resources(P1, { energy: 2, power: { calm: 2 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .hand(P2, CHARM, "charm")
    .hand(P2, ABANDON, "abandon")
    .hand(P1, DEFY, "defy");
}

/** Chain: Charm → Defy (on Charm) → Abandon (on Defy). Then Abandon resolves. */
async function abandonResolved(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "pawn", answers: ["bf1"] });
  await game.p2.passPriority();
  await game.p1.cast("defy", { targets: "charm" });
  await game.p1.passPriority();
  await game.p2.cast("abandon", { targets: "defy" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "defy", "abandon"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Abandon resolves
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // Abandon's [Predict]
  await game.p2.decline();
  await game.p2.passPriority(); // priority comes back around to P1 with Charm still on the chain
  return game;
}

describe("Ruling 2b86b7319da58cce — a Defy bounced off the chain can be cast again in the same chain", () => {
  test("Abandon counters the Defy and puts it back in P1's HAND (not the trash); Charm is still on the chain", async () => {
    const game = await abandonResolved();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p1.hand()).toContain("defy");
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  });

  test("ruling: P1 does NOT have to wait for the chain to empty — Defy is castable again immediately", async () => {
    const game = await abandonResolved();
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "charm" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "defy"]);
  });

  test("…and the second Defy does its job: Charm is countered and never moves the Pawn", async () => {
    const game = await abandonResolved();
    await game.p1.cast("defy", { targets: "charm" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("pawn")).toBe("base");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: if P1 does not re-cast it, the surviving Charm resolves and the Pawn is moved", async () => {
    const game = await abandonResolved();
    await game.settle();
    expect(game.locationOf("pawn")).toBe("bf1");
    expect(game.zoneOf("defy")).toBe("hand");
  });
});
