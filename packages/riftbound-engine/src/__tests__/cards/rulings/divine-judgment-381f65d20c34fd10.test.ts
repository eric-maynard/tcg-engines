/**
 * Ruling 381f65d20c34fd10 — Divine Judgment (OGN-244 → ogn-244-298) · Spell · Order · [7][order][order] · [Action]
 *   "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: Does Divine Judgment touch hidden cards, or do they survive "recycle the rest"?
 * A: Hidden cards are untouched and stay in play. "The rest" only means the rest of the card types the
 *    previous sentence enumerated — units, gear and runes on the board and cards in hand. Cards in other
 *    zones (trash, banishment) are likewise not recycled.
 * Rules: 359 ("the rest" is scoped by the preceding instruction), 706 (Hidden cards are their own zone at a
 *        battlefield), 323.7 (a hidden card is only lost when its battlefield's controller changes).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // a [Hidden] spell to sit face-down at bf1
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

describe("Ruling 381f65d20c34fd10 — Divine Judgment recycles only the listed categories", () => {
  test("units and hand cards are culled to 2 each; the hidden card, the trash and banishment are untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", unit(2, "Holder"), "holder")
      .unit(P1, "base", unit(2, "Second"), "second")
      .unit(P1, "base", unit(2, "Third"), "third")
      .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "hidden")
      .trash(P1, unit(1, "Corpse"), "corpse")
      .banishment(P1, unit(1, "Exiled"), "exiled")
      .unit(P2, "base", unit(2, "Enemy"), "enemy")
      .hand(P1, DIVINE_JUDGMENT, "dj")
      .hand(P1, unit(1, "Hand A"), "h1")
      .hand(P1, unit(1, "Hand B"), "h2")
      .hand(P1, unit(1, "Hand C"), "h3")
      .build();
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");

    await game.p1.cast("dj");

    // P1 has 3 units → keeps 2, recycles 1 (the Holder stays so bf1 keeps its controller).
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["holder", "second", "third"]);
    await game.p1.pick("third");

    // …then 3 cards in hand → keeps 2, recycles 1.
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["h1", "h2", "h3"]);
    await game.p1.pick("h3");
    await game.settle();

    expect(game.zoneOf("third")).toBe("mainDeck");
    expect(game.zoneOf("h3")).toBe("mainDeck");
    expect(game.p1.hand().sort()).toEqual(["h1", "h2"]);

    // The ruling's answer: none of these moved.
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.zoneOf("exiled")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("the hidden card is never even offered as something to recycle", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", unit(2, "Holder"), "holder")
      .unit(P1, "base", unit(2, "Second"), "second")
      .unit(P1, "base", unit(2, "Third"), "third")
      .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "hidden")
      .unit(P2, "base", unit(2, "Enemy"), "enemy")
      .hand(P1, DIVINE_JUDGMENT, "dj")
      .build();

    await game.p1.cast("dj");
    await game.settle();

    const options = (game.decision() as { options: { key: string }[] }).options.map((o) => o.key);
    expect(options).not.toContain("hidden");
    await game.p1.pick("third");
    await game.settle();
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
  });

  test("a player already at or below 2 in every category is asked nothing and loses nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .unit(P1, "base", unit(2, "Only"), "only")
      .unit(P2, "base", unit(2, "Enemy A"), "e1")
      .unit(P2, "base", unit(2, "Enemy B"), "e2")
      .hand(P1, DIVINE_JUDGMENT, "dj")
      .build();

    await game.p1.cast("dj");
    await game.settle();

    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.zoneOf("only")).toBe("base");
    expect(game.zoneOf("e1")).toBe("base");
    expect(game.zoneOf("e2")).toBe("base");
  });
});
