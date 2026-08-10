/**
 * Ruling 8a3a90d4a722d60f — Fight or Flight (OGN-168 → ogn-168-298, [Hidden][Action] "Move a unit from a battlefield
 *   to its base.") × Tideturner (ogn-199-298, [Hidden] "When you play me, you may choose a unit you control at ANOTHER
 *   location. Move me to its location and it to my original location.") × Kayn, Unleashed (OGN-189 → ogn-189-298,
 *   [Ganking] "If I have moved twice this turn, I don't take damage.") × Bandle Tree (OGN-278, "You may hide an
 *   additional card here.") × Reaver's Row (OGN-285, "When you defend here, you may move a friendly unit here to base.")
 *
 * Q: Tideturner and FoF both facedown at Bandle Tree with Kayn; the opponent attacks. Can I flip Tideturner choosing
 *    Kayn, then chain FoF on Kayn to retreat him and have Tideturner swap him back?
 * A: No — Tideturner (errata) can only choose a unit at ANOTHER location, and Kayn is at Tideturner's own location.
 *    What works: play FoF first (Kayn → base; you still control the battlefield during the showdown), then flip
 *    Tideturner and swap it with Kayn. At Reaver's Row the Row's own defend trigger retreats the unit on the initial
 *    chain, so the retreat → Tideturner → (Kayn moved twice, takes no damage) defence works there.
 * Rules: 811 (Hidden / Bandle Tree capacity), Tideturner errata ("another location"), 188 (control persists while
 *        contested), 383.4.f (defend triggers on the initial chain), Kayn 465.2.c.10.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const TIDETURNER = "ogn-199-298";
const KAYN = "ogn-189-298";
const BANDLE_TREE = "ogn-278-298";
const REAVERS_ROW = "ogn-285-298";

/** P2's turn 3. P1 holds the live Bandle Tree with Kayn (6) and TWO facedown cards there (Tideturner + FoF); P2's Raider (5) attacks. */
function treeBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("tree", { controller: P1, def: BANDLE_TREE, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "tree", KAYN, "kayn")
    .facedown(P1, "tree", TIDETURNER, "tt")
    .facedown(P1, "tree", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

const tree = (game: Game) => game.gameState.battlefields.tree;

describe("Ruling 8a3a90d4a722d60f — Tideturner cannot pick a unit at its own location; FoF-first (or Reaver's Row) makes the swap work", () => {
  test("premise: Bandle Tree lets P1 keep two hidden cards there; when Raider attacks and P2 passes Focus, P1 may flip either", async () => {
    const game = await treeBoard().build();
    expect(game.p1.facedown("tree").sort()).toEqual(["fof", "tt"]);
    await game.p2.move("raider", "tree");
    expect(tree(game)).toMatchObject({ contested: true, controller: P1 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tt")).toBe(true);
    expect(game.p1.can("reveal", "fof")).toBe(true);
  });

  test("flipping Tideturner FIRST: it enters at the Tree and its trigger may only choose a unit at ANOTHER location — Kayn (here) is never offered, so the Tideturner→FoF→swap-back line is impossible", async () => {
    const game = await treeBoard()
      .unit(P1, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .build();
    await game.p2.move("raider", "tree");
    await game.p2.passFocus();
    await game.p1.reveal("tt");
    expect(game.zoneOf("tt")).toBe("battlefield-tree"); // a permanent: played and on the board at once
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "tt" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["elsewhere", "home"]); // units at OTHER locations only
    expect(offered).not.toContain("kayn");
    expect((await game.p1.try((p) => p.pick("kayn"))).ok).toBe(false);
  });

  test("the working alternative: flip FoF on Kayn first (Kayn → base, P1 STILL controls the contested Tree), then flip Tideturner and swap — Tideturner to base, Kayn back at the Tree as the defender", async () => {
    const game = await treeBoard().build();
    await game.p2.move("raider", "tree");
    await game.p2.passFocus();
    await game.p1.reveal("fof", { answers: ["kayn"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kayn");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", targets: ["kayn"] })]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("kayn")).toBe("base");
    expect(tree(game)).toMatchObject({ contested: true, controller: P1 }); // control kept during the showdown
    // Focus went round; when P1 next has it, flip Tideturner and choose Kayn (now at another location: base).
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("tt");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("kayn");
      await game.p1.pick("kayn");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", targets: ["kayn"], triggered: true })]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("kayn")).toBe("tree");
    expect(game.state("kayn").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 5 into Kayn's 6
    expect(game.locationOf("kayn")).toBe("tree");
    expect(tree(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("at Reaver's Row: the Row's defend trigger (initial chain) retreats Kayn without losing control; flipping Tideturner then swaps him back — moved twice, Kayn takes no combat damage and holds against a 7-Might attacker", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "row", KAYN, "kayn")
      .facedown(P1, "row", TIDETURNER, "tt")
      .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "row");
    // Reaver's Row triggers for the defender at the start of the showdown (initial chain).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kayn");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", targets: ["kayn"], triggered: true })]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("kayn")).toBe("base");
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P1 }); // no loss of control on the retreat
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("tt");
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kayn");
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("kayn")).toBe("row"); // moved twice this turn
    expect(game.locationOf("tt")).toBe("base");
    await game.settle();
    expect(game.state("kayn").damage).toBe(0); // "I don't take damage"
    expect(game.locationOf("kayn")).toBe("row");
    expect(game.locationOf("bruiser")).toBe("base"); // 6 < 7: survives, recalled as the attacker
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P1 });
  });
});
