/**
 * Ruling 560b15527b6eaa48 — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Divine Judgment (OGN-244 → ogn-244-298) · Spell · [7][order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: A unit at the Dreaming Tree is chosen to be kept with Divine Judgment — does the Tree's draw happen before or after…?
 * A: It doesn't happen at all. Divine Judgment does not TARGET: its choices are made on resolution, and a choice made on resolution
 *    is by definition not a target. The Tree only triggers on targeting, so no card is drawn.
 * Rules: 355.1/355.4 (targets are chosen at finalization; resolution-time choices are not targets), the Tree's trigger.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const DIVINE_JUDGMENT = "ogn-244-298";
const DISCIPLINE = "ogn-058-298"; // control: a spell that DOES target ("Give a unit +2 [Might] this turn. Draw 1.")

/**
 * P1's turn. P1 controls the (live) Dreaming Tree with Dreamer on it, plus Homebody and Extra in base (3 units → one must go);
 * hand: Divine Judgment + KeepA + KeepB (exactly 2 other cards, so the hand count only changes if something is DRAWN); deck top d1.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
    .unit(P1, "base", { might: 1, name: "Extra" }, "extra")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .hand(P1, DIVINE_JUDGMENT, "dj")
    .hand(P1, { cardType: "spell", energyCost: 1, name: "KeepA" }, "keepA")
    .hand(P1, { cardType: "spell", energyCost: 1, name: "KeepB" }, "keepB")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 560b15527b6eaa48 — Divine Judgment's keep-choices are not targets: the Dreaming Tree does not draw", () => {
  test("casting Divine Judgment asks for NO objects up front (nothing is targeted): it goes on the chain bare and the Tree does not trigger on the cast", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "dj")?.fields ?? [];
    expect(fields.filter((f) => f.name === "targets")).toEqual([]);
    await game.p1.cast("dj");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dj", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    expect(game.p1.hand().sort()).toEqual(["keepA", "keepB"]);
  });

  test("on resolution P1 chooses (keeps Dreamer at the Tree, lets Extra go) — a resolution-time choice — and draws NOTHING: hand still exactly KeepA+KeepB, d1 still on top, no Tree item ever on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("dj");
    await game.p1.passPriority();
    await game.p2.passPriority();
    let sawTree = false;
    for (let i = 0; i < 12; i++) {
      sawTree ||= game.chain().some((c) => c.cardId === "tree");
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        // The engine phrases the unit choice as "which to recycle": keeping Dreamer + Homebody = recycling Extra.
        const keys = d.options.map((o) => o.key);
        await game.p1.pick(keys.includes("extra") ? "extra" : keys[0]!);
      } else if (d.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options[0]!.key);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(sawTree).toBe(false);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("battlefield-tree"); // chosen/kept
    expect(game.zoneOf("extra")).toBe("mainDeck"); // "recycle the rest"
    expect(game.p1.hand().sort()).toEqual(["keepA", "keepB"]);
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: a spell that TARGETS the Dreamer (Discipline) does trigger the Tree — P1 draws 1 from the Tree plus Discipline's own 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
      .hand(P1, DISCIPLINE, "discipline")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p1.cast("discipline", { targets: "dreamer" });
    expect(game.chain().some((c) => c.cardId === "tree" && c.triggered)).toBe(true);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });
});
