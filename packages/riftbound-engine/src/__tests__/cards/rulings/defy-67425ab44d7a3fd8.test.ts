/**
 * Ruling 67425ab44d7a3fd8 — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298, Battlefield) "When a player chooses a friendly unit here with a spell for the first time each
 *     turn, they draw 1."
 *   × Cleave (OGN-004 → ogn-004-298) · Action · [1] "Give a unit [Assault 3] this turn."
 *
 * Q: How does the Dreaming Tree's draw still work when the spell targeting a unit there is countered by Defy?
 * A: Targets are chosen at finalization, which triggers the Tree immediately — before Defy can even be played. Chain: Cleave > Tree trigger;
 *    then Defy on top. Defy resolves and removes Cleave; the Tree trigger is still on the chain and resolves: draw 1.
 * Rules: 383.4.b (targeting triggers fire when the spell is finalized), 355 (finalization precedes any response), 340 (LIFO),
 *        425.1 (a countered spell leaves the chain without effect; triggers already created are unaffected).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DREAMING_TREE = "ogn-292-298";
const CLEAVE = "ogn-004-298";

/** P1's turn. P1 controls the LIVE Dreaming Tree with a 3-Might Dreamer on it; Cleave + [1]. P2: Defy + [1][calm]. Known P1 deck top d1, d2. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

describe("Ruling 67425ab44d7a3fd8 — the Dreaming Tree trigger is on the chain before Defy can be played, so it survives Cleave being countered", () => {
  test("finalizing Cleave on the Dreamer triggers the Tree IMMEDIATELY: chain = Cleave > Tree trigger while P1 still holds priority — P2 has had no chance to Defy yet", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    expect(chainIds(game)).toEqual(["cleave", "tree"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "cleave", targets: ["dreamer"] }); // targets locked in
    expect(game.chain()[1]).toMatchObject({ cardId: "tree", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 first; Defy not yet possible
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p1.hand()).toEqual([]); // no draw yet — it is a chain item
  });

  test("P1 passes → NOW P2 may Defy Cleave; chain becomes Cleave > Tree trigger > Defy", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "cleave" });
    expect(chainIds(game)).toEqual(["cleave", "tree", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("both pass: Defy resolves and REMOVES Cleave from the chain (countered → trash, no Assault) — the Tree trigger REMAINS as the only item", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(chainIds(game)).toEqual(["tree"]);
    expect(game.state("dreamer").grantedKeywords).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // still not drawn — the trigger hasn't resolved
  });

  test("…then the Tree trigger resolves and P1 draws 1 (d1) even though Cleave never resolved; end state: Dreamer plain 3, empty chain, P1's main phase", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("dreamer")).toMatchObject({ grantedKeywords: [], might: 3 });
    expect(game.p1.energy()).toBe(0); // Cleave's cost is not refunded
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
