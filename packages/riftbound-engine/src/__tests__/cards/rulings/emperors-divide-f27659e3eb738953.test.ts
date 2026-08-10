/**
 * Ruling f27659e3eb738953 — Emperor's Divide (SFD-043 → sfd-043-221) · [Hidden] [Action] · Calm · [2]
 *     "Move any number of friendly units at a battlefield to their base."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield — "When a player chooses a friendly unit here with a spell
 *     for the first time each turn, they draw 1."
 *
 * Q: Does Emperor's Divide trigger The Dreaming Tree when choosing friendly units there?
 * A: Yes — "any number" choices are targets. Choosing one or more friendly units at the Tree triggers it ONCE as the
 *    spell is finalized; the Tree's draw resolves first, then Emperor's Divide. Choosing zero units = no targets = no
 *    trigger.
 * Rules: 355.12–355.13 ("any number" sets are targeting; zero allowed), 383.4.b.2 (targeting trigger fires at
 *        finalization, sits above the spell), 383.3.e (first time each turn), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DIVIDE = "sfd-043-221";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn with exactly [2]. P1 holds the live Dreaming Tree with Dreamer A (3) and Dreamer B (2); known deck top d1, d2. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 3, name: "Dreamer A" }, "da")
    .unit(P1, "tree", { might: 2, name: "Dreamer B" }, "db")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .hand(P1, EMPERORS_DIVIDE, "divide")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling f27659e3eb738953 — Emperor's Divide choosing units at The Dreaming Tree triggers it (once); zero choices do not", () => {
  test("choosing BOTH Dreamers: right after the spell finalizes the chain is [Divide, Tree trigger] — exactly ONE Tree item (P1's) on top; nothing drawn or moved yet", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["da", "db"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "divide", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "tree", controller: P1, triggered: true }),
    ]);
    expect(game.chain().filter((c) => c.cardId === "tree")).toHaveLength(1); // once per spell, not per unit
    expect(game.p1.hand()).toEqual([]);
    expect(game.locationOf("da")).toBe("tree");
    expect(game.locationOf("db")).toBe("tree");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the Tree trigger resolves first: P1 draws 1 while Emperor's Divide is still on the chain and both units are still at the Tree", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["da", "db"] });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "divide" })]);
    expect(game.locationOf("da")).toBe("tree");
    expect(game.locationOf("db")).toBe("tree");
  });

  test("then Emperor's Divide resolves: both Dreamers are moved to P1's base; P1 holds exactly the one drawn card", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["da", "db"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.locationOf("da")).toBe("base");
    expect(game.locationOf("db")).toBe("base");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("choosing just ONE unit there is enough (a non-zero number): the Tree triggers and P1 draws 1; only that unit moves", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["db"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["divide", "tree"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.locationOf("db")).toBe("base");
    expect(game.locationOf("da")).toBe("tree");
  });

  test("choosing ZERO units: the spell is played with no targets — no Tree trigger, no draw; it resolves doing nothing", async () => {
    const game = await board().build();
    const targetsField = game.p1.option("cast", "divide")?.fields.find((f) => f.arg === "targets");
    expect(targetsField?.min ?? 0).toBe(0); // "any number" includes none
    await game.p1.cast("divide", { targets: [] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["divide"]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle();
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.locationOf("da")).toBe("tree");
    expect(game.locationOf("db")).toBe("tree");
    expect(game.violations()).toEqual([]);
  });
});
