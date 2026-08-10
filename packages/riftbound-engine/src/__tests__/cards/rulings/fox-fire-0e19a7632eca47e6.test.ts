/**
 * Ruling 0e19a7632eca47e6 — Fox-Fire (OGN-256 → ogn-256-298) · Calm/Mind · [Hidden][Action] · [3]
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *
 * Q: Played from hidden, can Fox-Fire only affect the battlefield it is on because it "chooses"?
 * A: Yes. Fox-Fire chooses (targets) units — the word "choose" need not be printed — so the hidden restriction applies: only units at
 *    the battlefield it was hidden at. (Cast from hand it may aim at any one battlefield.)
 * Rules: 355.5 (choosing a game object = targeting), 811.1.d.2 (a card played from facedown may only choose targets "here").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";

/**
 * Turn 3, P2's turn. P1 holds bf1 (Keeper 5 + Fox-Fire facedown there since an earlier turn).
 * P2: Scout (1) at bf1; at bf2 P2's Prize (3) — the unit P1 would rather kill.
 */
function hiddenBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Keeper" }, "keeper")
    .unit(P2, "bf1", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 3, name: "Prize" }, "prize")
    .facedown(P1, "bf1", FOX_FIRE, "fox");
}

const flatTargets = (opts: readonly unknown[] | undefined) => new Set((opts ?? []).flatMap((o) => (Array.isArray(o) ? o : [o])).map(String));

describe("Ruling 0e19a7632eca47e6 — hidden Fox-Fire is a targeting ('choosing') effect, so it is confined to its own battlefield", () => {
  test("Fox-Fire's kill IS a targeted choice: cast from hand it asks for `targets` (units), and the chain item records them", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Prize" }, "prize")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    const field = game.p1.option("cast", "fox")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ kind: "cards", required: true });
    await game.p1.cast("fox", { targets: ["prize"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", targets: ["prize"] })]);
    await game.settle();
    expect(game.zoneOf("prize")).toBe("trash");
  });

  test("as a Reaction on the opponent's turn (P2's Raider attacks bf1, P2 passes Focus): the flipped Fox-Fire offers bf1's units only — the Prize at bf2 is not offered and forcing it is rejected", async () => {
    const game = await hiddenBoard().unit(P2, "base", { might: 6, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "fox")).toBe(true);
    const offered = flatTargets(game.p1.option("reveal", "fox")?.fields.find((f) => f.name === "targets")?.options);
    expect(offered.has("prize")).toBe(false);
    expect(offered.has("scout")).toBe(true);
    expect((await game.p1.try((p) => p.reveal("fox", { targets: ["prize"] }))).ok).toBe(false);
    expect(game.zoneOf("fox")).toBe("facedown-bf1");
    expect(game.zoneOf("prize")).toBe("battlefield-bf2");
  });

  test("on P1's own turn the same holds: revealing it can kill the Scout here (for [0]) but never the Prize over at bf2", async () => {
    const game = await hiddenBoard().active(P1).build();
    expect(game.p1.can("reveal", "fox")).toBe(true);
    const offered = flatTargets(game.p1.option("reveal", "fox")?.fields.find((f) => f.name === "targets")?.options);
    expect(offered.has("prize")).toBe(false);
    expect(offered.has("scout")).toBe(true);
    expect((await game.p1.try((p) => p.reveal("fox", { targets: ["prize"] }))).ok).toBe(false);
    await game.p1.reveal("fox", { targets: ["scout"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P1, targets: ["scout"] })]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("prize")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });
});
