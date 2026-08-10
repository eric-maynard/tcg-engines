/**
 * Ruling 8cac55a4dacb811d — Blood Rush (SFD-003 → sfd-003-221) · Action [1] "[Repeat] [1] … Give a unit [Assault 2] this turn."
 *   × Jae Medarda (SFD-142 → sfd-142-221) · 5 Might "When you choose me with a spell, draw 1."
 *
 * Q: Does Blood Rush with Repeat make Jae Medarda draw twice?
 * A: Yes. Repeat executes the effect one more time and you choose the target again for that execution — Jae is chosen twice,
 *    so her ability triggers twice: draw 1 + draw 1.
 * Rules: 820 (Repeat), 355.14.d (each choosing counts for triggered abilities), 383.4.b.2 (targeting triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLOOD_RUSH = "sfd-003-221";
const JAE_MEDARDA = "sfd-142-221";

/** P1's turn; Jae Medarda in base; Blood Rush in hand; known deck top d1..d3. */
function board(energy: number) {
  return scenario()
    .turn(3)
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", JAE_MEDARDA, "jae")
    .hand(P1, BLOOD_RUSH, "rush")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

describe("Ruling 8cac55a4dacb811d — a Repeated Blood Rush chooses Jae Medarda twice, so she draws twice", () => {
  test("control: Blood Rush WITHOUT Repeat chooses Jae once — one trigger, one card drawn, Assault 2 once", async () => {
    const game = await board(1).build();
    await game.p1.cast("rush", { targets: "jae" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().filter((c) => c.cardId === "jae" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("jae").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
  });

  test("with the Repeat paid ([1] + [1]) Jae is chosen for EACH execution: two separate Jae triggers sit on the chain above the single Blood Rush item", async () => {
    const game = await board(2).build();
    await game.p1.cast("rush", { repeat: 1, targets: ["jae"] });
    expect(game.p1.energy()).toBe(0); // base + repeat both paid
    const chain = game.chain();
    expect(chain.filter((c) => c.cardId === "rush")).toHaveLength(1); // one spell
    expect(chain[0]).toMatchObject({ cardId: "rush", targets: ["jae"], triggered: false });
    expect(chain.filter((c) => c.cardId === "jae" && c.triggered && c.controller === P1)).toHaveLength(2);
  });

  test("both triggers resolve: P1 draws 1 and then 1 more (d1, d2), and Blood Rush grants Assault 2 twice", async () => {
    const game = await board(2).build();
    await game.p1.cast("rush", { repeat: 1, targets: ["jae"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.state("jae").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 2 },
      { duration: "turn", keyword: "Assault", value: 2 },
    ]);
    expect(game.violations()).toEqual([]);
  });
});
