/**
 * Ruling d4a85dabfa5a27b0 — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   (spell used to do the choosing: Cleave, ogn-004-298 · Action · [1] "Give a unit [Assault 3] this turn.")
 *
 * Q: Does the Dreaming Tree draw on RESOLUTION of the targeting spell, or on targeting?
 * A: On targeting — it triggers the moment the spell is finalized (targets chosen). Chain becomes Spell → Tree draw, so the draw
 *    resolves BEFORE the spell does; countering the spell (Defy) therefore does not stop the draw (Defy resolves, then the draw,
 *    and the countered spell never does anything).
 * Rules: 383.4.b.2 (targeting triggers fire on finalize), 337–340 (finalize precedes the reaction window; LIFO), 425.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const DEFY = "ogn-045-298";
const CLEAVE = "ogn-004-298";
const FILLER = "ogn-175-298";

/** P1's turn. P1 controls the live Dreaming Tree with a Dreamer (3) on it; Cleave + [1]. P2: Defy + [1][calm]. P1 deck: d1, d2. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

describe("Ruling d4a85dabfa5a27b0 — the Dreaming Tree triggers on TARGETING (finalize), not on the spell's resolution", () => {
  test("the instant Cleave is finalized on the Dreamer the Tree's draw is a chain item ABOVE it — before the first reaction window (P1 still holds priority, P2 could not act yet)", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    expect(chainIds(game)).toEqual(["cleave", "tree"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "tree", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual([]); // the draw itself still has to resolve
  });

  test("no counter: the draw resolves FIRST — P1 has d1 in hand while Cleave is still on the chain, unresolved (Dreamer has no Assault yet)", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item = Tree draw
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(chainIds(game)).toEqual(["cleave"]);
    expect(game.state("dreamer").grantedKeywords).toEqual([]);
    await game.settle(); // now Cleave
    expect(game.state("dreamer").keywords).toContain("Assault");
    expect(game.zoneOf("cleave")).toBe("trash");
  });

  test("with Defy: chain Cleave → Tree draw → Defy resolves LIFO — Defy counters Cleave, then the draw STILL happens; Cleave never grants anything", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "cleave" });
    expect(chainIds(game)).toEqual(["cleave", "tree", "defy"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(true); // the draw is untouched by the counter
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]); // drew anyway
    expect(game.zoneOf("cleave")).toBe("trash"); // countered
    expect(game.state("dreamer")).toMatchObject({ grantedKeywords: [], might: 3 });
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
