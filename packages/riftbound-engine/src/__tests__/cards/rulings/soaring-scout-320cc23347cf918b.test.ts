/**
 * Ruling 320cc23347cf918b — Soaring Scout (OGN-216 → ogn-216-298) · Unit · Order · 2 · 1 Might
 *     "[Deathknell] — Channel 1 rune exhausted."
 *   × Divine Judgment (OGN-244 → ogn-244-298) · Action · 7 + [order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: Does recycling a Deathknell unit (Soaring Scout) via Divine Judgment trigger the Deathknell?
 * A: No. Deathknell triggers only when the unit DIES (killed: board → trash). Recycling moves it to the
 *    bottom of the deck — a different action and zone — so nothing triggers.
 * Rules: 808 (Deathknell = "when I die"), 421 (Kill: board → trash), 434 (Recycle: → bottom of deck).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SOARING_SCOUT = "ogn-216-298";
const DIVINE_JUDGMENT = "ogn-244-298";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
};

describe("Ruling 320cc23347cf918b — recycling Soaring Scout with Divine Judgment does not trigger its Deathknell", () => {
  test("control: when Soaring Scout is KILLED it goes to the trash and its Deathknell channels 1 rune exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", SOARING_SCOUT, "scout")
      .runes(P1, "order", 2)
      .hand(P2, BOLT, "bolt")
      .build();
    const runeDeck = game.p1.runeDeck().length;
    await game.p2.cast("bolt", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(3); // 2 + 1 channeled
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // … exhausted
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
  });

  test("Divine Judgment: P1 keeps its two other units, the Scout is RECYCLED to the bottom of the Main Deck — not the trash — and no rune is channeled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .unit(P1, "base", SOARING_SCOUT, "scout")
      .unit(P1, "base", { might: 2, name: "Keeper A" }, "ka")
      .unit(P1, "base", { might: 2, name: "Keeper B" }, "kb")
      .runes(P1, "order", 2)
      .hand(P1, DIVINE_JUDGMENT, "dj")
      .build();
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.cast("dj");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const stop = await game.settle();
    // P1 has 3 units and keeps 2: P1 CHOOSES (the engine asks which one is recycled).
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["ka", "kb", "scout"]);
    await game.p1.pick("scout");
    const after = await game.settle();
    expect(after.reason).toBe("open");
    // Recycled: bottom of the main deck, never the trash.
    expect(game.zoneOf("scout")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("scout");
    expect(game.p1.trash()).toEqual(["dj"]);
    expect(game.p1.units().toSorted()).toEqual(["ka", "kb"]);
    // No Deathknell: nothing was put on the chain and no rune was channeled.
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck);
    expect(game.violations()).toEqual([]);
  });
});
