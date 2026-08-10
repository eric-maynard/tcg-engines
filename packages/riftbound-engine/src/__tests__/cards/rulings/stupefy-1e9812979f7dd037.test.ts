/**
 * Ruling 1e9812979f7dd037 — Stupefy (OGN-095 → ogn-095-298, Reaction, 1) "Give a unit -1 [Might] this turn, to a
 *   minimum of 1 [Might]. Draw 1."
 *   × The Dreaming Tree (ogn-292-298, Battlefield) "When a player chooses a friendly unit here with a spell for the
 *     first time each turn, they draw 1."
 *
 * Q: Exact sequence when I Stupefy my OWN unit at the Dreaming Tree — when is the trigger added/finalized?
 * A: The Tree triggers while the spell is being played (choices made, costs paid) and is added as a pending item;
 *    the spell finalizes, then the trigger finalizes ON TOP of it → chain = Stupefy < Tree trigger. The caster keeps
 *    priority. (So the Tree draw resolves before Stupefy.)
 * Rules: 346–351 (playing a spell: pending → choose → pay → finalize), 383.4.b.2 (targeting triggers), 337.1, 340.1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn. P1 controls the live Dreaming Tree (bf1) with a 3-Might Dreamer on it; Stupefy in hand, exactly 1 energy; known deck. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling 1e9812979f7dd037 — Stupefy on your own unit at the Dreaming Tree: chain = Stupefy < Tree trigger, caster keeps priority", () => {
  test("right after the cast: cost paid, target locked, and the chain reads [Stupefy (bottom), Dreaming Tree trigger (top)] with P1 still holding priority", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "dreamer" });
    expect(game.p1.energy()).toBe(0); // costs paid during the play, before anything else happens
    expect(game.chain()).toEqual([
      expect.objectContaining({
        cardId: "stupefy",
        controller: P1,
        targets: ["dreamer"],
        triggered: false,
        type: "spell",
      }),
      expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true, type: "ability" }),
    ]);
    // The player who played the spell retains priority (may play another reaction or pass).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual([]); // nothing drawn yet — both items are merely on the chain
  });

  test("resolution is LIFO: the Tree trigger resolves first (P1 draws d1) while Stupefy still waits; then Stupefy (-1 → 2 Might, draw d2)", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "dreamer" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Tree trigger) resolves
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]);
    expect(game.state("dreamer").might).toBe(3); // Stupefy has not resolved yet
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("dreamer").might).toBe(2);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("'first time each turn': a second spell choosing the same friendly unit there this turn adds NO Tree trigger", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, STUPEFY, "stupefy2").build();
    await game.p1.cast("stupefy", { targets: "dreamer" });
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "stupefy2"]);
    await game.p1.cast("stupefy2", { targets: "dreamer" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stupefy2" })]); // alone — no trigger this time
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "d3"]); // only Stupefy's own draw
    expect(game.state("dreamer").might).toBe(1);
  });
});
