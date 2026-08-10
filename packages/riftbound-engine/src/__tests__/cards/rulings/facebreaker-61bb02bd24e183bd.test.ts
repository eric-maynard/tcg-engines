/**
 * Ruling 61bb02bd24e183bd — Facebreaker (OGN-220 → ogn-220-298) · Action spell · Order · [2] · [Hidden]
 *   "Stun a friendly unit and an enemy unit at the same battlefield."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield — "When a player chooses a friendly unit here with a
 *     spell for the first time each turn, they draw 1."
 *
 * Q: Can Facebreaker be played choosing only my own unit (to trigger the Dreaming Tree draw) when no enemy target exists?
 * A: No. Facebreaker requires BOTH targets; with no valid enemy unit at that battlefield it cannot be played at all,
 *    even if you only care about the friendly choice.
 * Rules: 355.5 / 355.10 (a spell needs a legal choice for every required target to be played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn. P1 controls the live Dreaming Tree with Dreamer (3) there; Facebreaker + [2]; known deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, FACEBREAKER, "fb")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 61bb02bd24e183bd — Facebreaker needs both a friendly AND an enemy target at the same battlefield", () => {
  test("no enemy unit at the Tree (an enemy elsewhere doesn't count): Facebreaker is not playable — no friendly-only cast, no Dreaming Tree draw", async () => {
    const game = await board().unit(P2, "bf2", { might: 2, name: "Far Foe" }, "farFoe").build();
    expect(game.p1.energy()).toBe(2); // affordable
    expect(game.p1.can("cast", "fb")).toBe(false);
    const offered = (game.p1.option("cast", "fb")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("dreamer");
    const r = await game.p1.try((p) => p.cast("fb", { targets: ["dreamer"] }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fb")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["fb"]); // nothing drawn
    expect(game.state("dreamer").isStunned).toBe(false);
  });

  test("contrast — with an enemy unit at the Tree, Facebreaker IS playable choosing [Dreamer, Foe]; the Tree's draw triggers and both get stunned", async () => {
    const game = await board().unit(P2, "tree", { might: 2, name: "Foe" }, "foe").build();
    expect(game.p1.can("cast", "fb")).toBe(true);
    await game.p1.cast("fb", { targets: ["dreamer", "foe"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "tree"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("dreamer").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});
