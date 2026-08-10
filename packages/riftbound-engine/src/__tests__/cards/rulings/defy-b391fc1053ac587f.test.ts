/**
 * Ruling b391fc1053ac587f — Defy (OGN-045 → ogn-045-298) Reaction [1][calm] "Counter a spell that costs no more than [4] and no
 *   more than [rainbow]." × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell
 *   for the first time each turn, they draw 1." (+ Cleave ogn-004-298 [1] "Give a unit [Assault 3] this turn." as the spell.)
 *
 * Q: If I Defy the opponent's spell that targets their unit at the Dreaming Tree, does the opponent still draw?
 * A: Yes. The Tree triggers when the targeting spell is added to the chain — before Defy can be played. Defy negates the
 *    spell (it is never "played"/resolved) but not the targeting that already happened; the draw trigger resolves.
 * Rules: 383.4.b (choose-triggers fire at finalization), 340 (LIFO), 425.1 (countered spell leaves without effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DREAMING_TREE = "ogn-292-298";
const CLEAVE = "ogn-004-298";

/** P2's turn. P2 holds the LIVE Dreaming Tree with its Dreamer (3); P2: Cleave + [1], known deck top. P1: Defy + [1][calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P2, def: DREAMING_TREE, inert: false, owner: P2 })
    .unit(P2, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, DEFY, "defy")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

describe("Ruling b391fc1053ac587f — Defying the opponent's spell does not stop their Dreaming Tree draw", () => {
  test("P2's Cleave on its Dreamer puts the Tree trigger on the chain at once (Cleave > tree) — P1 cannot Defy before that", async () => {
    const game = await board().build();
    await game.p2.cast("cleave", { targets: "dreamer" });
    expect(chainIds(game)).toEqual(["cleave", "tree"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "tree", controller: P2, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "defy")).toBe(false);
    expect(game.p2.hand()).toEqual([]);
  });

  test("P2 passes → P1 Defies Cleave (chain Cleave > tree > Defy); Defy resolves first and counters Cleave; the Tree trigger is still there", async () => {
    const game = await board().build();
    await game.p2.cast("cleave", { targets: "dreamer" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "cleave" });
    expect(chainIds(game)).toEqual(["cleave", "tree", "defy"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(chainIds(game)).toEqual(["tree"]);
    expect(game.state("dreamer").grantedKeywords).toEqual([]); // Cleave never resolved
  });

  test("ruling: the Tree trigger then resolves and P2 (the opponent) STILL draws 1; Cleave had no effect and P2's [1] is not refunded", async () => {
    const game = await board().build();
    await game.p2.cast("cleave", { targets: "dreamer" });
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toEqual(["d1"]);
    expect(game.p2.deck()[0]).toBe("d2");
    expect(game.state("dreamer")).toMatchObject({ grantedKeywords: [], might: 3 });
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
