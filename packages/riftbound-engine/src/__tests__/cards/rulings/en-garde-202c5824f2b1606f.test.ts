/**
 * Ruling 202c5824f2b1606f — En Garde (OGN-046 → ogn-046-298) · Reaction [1][calm] "Give a friendly unit +1 [Might] this
 *     turn, then an additional +1 [Might] this turn if it is the only unit you control there."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] …"
 *   × The Dreaming Tree (OGN-292 → ogn-292-298, battlefield) "When a player chooses a friendly unit here with a spell
 *     for the first time each turn, they draw 1."
 *
 * Q: My unit is at the Dreaming Tree; I En Garde it; opponent Defies. Do I draw before or after Defy resolves — at all?
 * A: You draw. The Tree triggers the moment the unit is chosen and its item sits ABOVE En Garde; Defy goes above that.
 *    LIFO: Defy resolves (En Garde countered) → Tree trigger resolves (draw 1). The draw does not depend on En Garde
 *    resolving.
 * Rules: 383.4.b (targeting triggers fire on finalize), 340 (LIFO), 425.1 (countered spell → trash, no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const DEFY = "ogn-045-298";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn. P1 holds the (live) Dreaming Tree with a lone 3-Might Dreamer; En Garde + [1][calm]. P2: Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

async function enGardeThenDefy(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("engarde", { targets: "dreamer" });
  // Steps 1–2: En Garde (bottom) > Dreaming Tree draw trigger (top), P1's.
  expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree"]);
  expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
  expect(game.p1.hand()).toEqual([]); // not drawn yet — it is a chain item
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  // Step 3: Defy on top, targeting En Garde.
  await game.p2.cast("defy", { targets: "engarde" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree", "defy"]);
  return game;
}

describe("Ruling 202c5824f2b1606f — the Dreaming Tree draw sits between En Garde and Defy and survives the counter", () => {
  test("chain order after both plays: En Garde (bottom) > Dreaming Tree trigger > Defy (top)", async () => {
    await enGardeThenDefy();
  });

  test("resolution is LIFO: Defy resolves FIRST (En Garde countered → trash, P1 has still not drawn), THEN the Tree trigger draws P1 a card", async () => {
    const game = await enGardeThenDefy();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["tree"]); // the draw trigger is still there
    expect(game.p1.hand()).toEqual([]); // "before or after Defy?" — after
    await game.settle(); // Tree trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("end state: P1 drew exactly 1, En Garde did nothing (Dreamer still 3), both spells in trash, Defy's cost spent", async () => {
    const game = await enGardeThenDefy();
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("dreamer")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Defy, the Tree draw resolves first and then En Garde gives the lone Dreamer +2 (3 → 5)", async () => {
    const game = await board().build();
    await game.p1.cast("engarde", { targets: "dreamer" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree trigger resolves first
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("dreamer").might).toBe(3);
    await game.settle();
    expect(game.state("dreamer").might).toBe(5);
  });
});
