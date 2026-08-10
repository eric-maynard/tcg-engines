/**
 * Ruling 765ca7d6661ac13f — Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · 2+[fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · 2+[order] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: My opponent plays Falling Star. Can I Hidden Blade my OWN unit in response?
 * A: Yes — provided the Blade is already hidden at that battlefield: facedown it has [Reaction], and "a unit at a battlefield"
 *    has no enemy qualifier. It resolves first: my unit dies and I (its controller) draw 2. When Falling Star then resolves,
 *    the instance aimed at the now-dead unit deals nothing (target gone). From HAND the Blade is only an [Action] and can NOT
 *    be played in response.
 * Rules: 811 / 737 (Hidden → Reaction while facedown; targets at that battlefield), 340 (LIFO), 359.3.e.9/12 (illegal target →
 *        that instruction is skipped), 341 (Action timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. P1 controls bf1 with Guard (4) and a facedown Hidden Blade there, plus Pal (5) in base and a second Blade in
 * hand with 2+[order] to spare. P2 has Falling Star + 2+[fury][fury]. Known P1 deck top d1, d2, d3.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "base", { might: 5, name: "Pal" }, "pal")
    .hand(P1, HIDDEN_BLADE, "bladeInHand")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

describe("Ruling 765ca7d6661ac13f — Hidden Blade (from facedown) on your own unit in response to Falling Star", () => {
  test("in response to Falling Star, the FACEDOWN Blade is playable (Reaction) and may choose P1's own Guard at that battlefield; the copy in HAND (an Action) is not playable now", async () => {
    const game = await board().hand(P2, FALLING_STAR, "star").build();
    await game.p2.cast("star", { targets: ["guard", "pal"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P2 })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    expect(game.p1.can("cast", "bladeInHand")).toBe(false); // [Action] from hand: not in response to a spell
    await game.p1.reveal("blade", { answers: ["guard"] });
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("guard");
    }
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } }); // from hidden for [0]
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "blade"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, targets: ["guard"] });
  });

  test("LIFO: the Blade resolves first — the Guard dies and P1 (its controller) draws 2 — while Falling Star still waits", async () => {
    const game = await board().hand(P2, FALLING_STAR, "star").build();
    await game.p2.cast("star", { targets: ["guard", "pal"] });
    await game.p2.passPriority();
    await game.p1.reveal("blade", { answers: ["guard"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    const hand0 = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade resolves
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    expect(game.state("pal").damage).toBe(0); // nothing of Falling Star has happened yet
  });

  // rule 359.3.e.5 / 359.3.e.7 — the instance aimed at the dead Guard simply fails; the Pal takes only ITS 3 (a 5-Might Pal
  // survives with 3 damage). The orphaned "Deal 3" is never re-aimed at whatever is left on the board (355.15).
  test("ruling 765ca7d6661ac13f — the instance aimed at the dead Guard is ignored; its 3 is never redirected onto the Pal", async () => {
    const game = await board().hand(P2, FALLING_STAR, "star").build();
    await game.p2.cast("star", { targets: ["guard", "pal"] });
    await game.p2.passPriority();
    await game.p1.reveal("blade", { answers: ["guard"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["guard", "blade"]));
    expect(game.state("pal")).toMatchObject({ damage: 3, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
