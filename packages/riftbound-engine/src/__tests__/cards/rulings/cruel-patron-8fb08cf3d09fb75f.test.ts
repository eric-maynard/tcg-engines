/**
 * Ruling 8fb08cf3d09fb75f — Cruel Patron (OGN-208 → ogn-208-298) · Unit · Order · 4 · 6 Might
 *     "As an additional cost to play me, kill a friendly unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) "Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and
 *     spend its buff to heal it, exhaust it, and recall it instead."   (+ Fight or Flight ogn-168-298 for the "move it" nuance)
 *
 * Q: Can The Boss's save-instead-of-dying satisfy Cruel Patron's "kill a friendly unit" cost? And does Hidden Blade
 *    still draw if The Boss saves the targeted unit?
 * A: Hidden Blade: yes — the unit dying isn't required; it was a valid target and its controller is identifiable → draw 2.
 *    Cruel Patron: yes — a cost replaced by another event still counts as paid. Nuance: MOVING the unit off the
 *    battlefield in response makes Hidden Blade find no "unit at a battlefield" → no draw.
 * Rules: 372 (replacement effects), 356.4 (replaced costs are paid), 359.3.e.14 (missing target → not performed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CRUEL_PATRON = "ogn-208-298";
const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

describe("Ruling 8fb08cf3d09fb75f — The Boss's replacement vs Hidden Blade's draw and Cruel Patron's kill cost", () => {
  test("Hidden Blade on P2's buffed X; The Boss (P2) replaces the death — X is healed, exhausted, recalled to base, buff spent — and X's controller P2 STILL draws 2", async () => {
    const game = await scenario()
      .legend(P2, THE_BOSS, "boss")
      .resources(P1, { energy: 2, power: { order: 1 } })
      .resources(P2, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "X" }, "x", { buffed: true })
      .hand(P1, HIDDEN_BLADE, "hb")
      .build();
    const deck0 = game.p2.deck().length;
    const hand0 = game.p2.hand().length;
    await game.p1.cast("hb", { targets: "x" });
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("hb")).toBe("trash");
    expect(deck0 - game.p2.deck().length).toBe(2);
    expect(game.p2.hand()).toHaveLength(hand0 + 2);
    expect(game.violations()).toEqual([]);
  });

  test("Cruel Patron naming buffed Fodder as its kill cost; The Boss (P1) replaces that death — Fodder survives exhausted/unbuffed in base, the cost still counts as paid, and Cruel Patron is played", async () => {
    const game = await scenario()
      .legend(P1, THE_BOSS, "boss")
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .unit(P1, "base", { might: 2, name: "Fodder" }, "fodder", { buffed: true })
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["fodder"]);
    await game.p1.play("patron", { sacrifice: "fodder" });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("base"); // not dead
    expect(game.state("fodder")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("patron")).toBe("base"); // cost deemed paid → played
    expect(game.state("patron").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 4 for the Patron + [rainbow] for The Boss
    expect(game.violations()).toEqual([]);
  });

  test("nuance — P2 instead MOVES X to base in response (hidden Fight or Flight): Hidden Blade finds no unit at a battlefield → X lives and nobody draws", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "X" }, "x")
      .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
      .hand(P1, HIDDEN_BLADE, "hb")
      .build();
    const deck0 = game.p2.deck().length;
    await game.p1.cast("hb", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.reveal("fof", { answers: ["x"] });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("x");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb", "fof"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("base");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(deck0 - game.p2.deck().length).toBe(0);
    expect(game.p2.hand()).toEqual([]);
  });
});
