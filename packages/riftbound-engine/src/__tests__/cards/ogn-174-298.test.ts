/**
 * Sai Scout — ogn-174-298 · Unit · Chaos · 6 energy · 5 Might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   You may play me to an open battlefield.
 *
 * Rules: 817 (Vision: one triggered look/recycle when played), 594 (recycle → bottom of the
 * Main Deck), 355.2.a/b (units are normally played to base / a battlefield you control; this
 * adds OPEN battlefields), 170.11.c (open = unoccupied AND uncontrolled), 323.11.a + 323.12 +
 * 469.1 (a lone unit at a battlefield its controller doesn't control applies Contested → a
 * showdown begins → unopposed, its controller conquers and scores).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-174-298";
const FILLER = "ogn-175-298";

function inHand() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("open", { controller: null })
    .battlefield("mine", { controller: P1 })
    .battlefield("theirs", { controller: P2 }) // enemy-controlled, empty
    .deckTop(P1, FILLER, "top")
    .hand(P1, CARD, "sai");
}

type Built = Awaited<ReturnType<ReturnType<typeof inHand>["build"]>>;
const playTargets = (game: Built) => game.p1.option("play", "sai")?.fields.find((f) => f.arg === "to")?.options ?? [];

describe("Sai Scout (ogn-174-298)", () => {
  test("costs 6 energy (no power); a 5-Might unit; unaffordable at 5", async () => {
    const game = await inHand().build();
    await game.p1.play("sai", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("sai")).toBe("base");
    expect(game.state("sai").might).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sai", triggered: true })]);
    const poor = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sai").build();
    expect(poor.p1.can("play", "sai")).toBe(false);
  });

  test("Vision: looks at the top card of YOUR deck and may recycle it to the bottom", async () => {
    const game = await inHand().deckTop(P2, FILLER, "theirTop").build();
    await game.p1.play("sai", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "sai" } });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["top"]);
    await game.p1.pick("top");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).not.toBe("top");
    expect(deck.at(-1)).toBe("top");
    expect(game.p2.deck()[0]).toBe("theirTop");
    expect(game.decision()?.kind).toBe("action"); // exactly one Vision prompt
  });

  test("Vision: declining leaves the card on top", async () => {
    const game = await inHand().build();
    await game.p1.play("sai", { to: "base" });
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.decision()?.kind).toBe("action");
  });

  test("may be played to an OPEN battlefield (in addition to base / a battlefield you control); not to an empty enemy battlefield", async () => {
    const game = await inHand().build();
    const to = playTargets(game);
    expect(to).toEqual(expect.arrayContaining(["base", "battlefield-mine", "battlefield-open"]));
    expect(to).not.toContain("battlefield-theirs");
    await game.p1.play("sai", { to: "open" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("sai")).toBe("battlefield-open");
  });

  test("'open' means unoccupied AND uncontrolled (170.11.c) — an uncontrolled battlefield holding an enemy unit is not offered", async () => {
    // Expected: a battlefield nobody controls but where an enemy unit sits is occupied, hence not
    // open, hence not a legal play location. Actual: the engine offers every uncontrolled battlefield.
    const game = await inHand().battlefield("squatted", { controller: null }).unit(P2, "squatted", { might: 2 }, "squatter").build();
    const to = playTargets(game);
    expect(to).toContain("battlefield-open");
    expect(to).not.toContain("battlefield-squatted");
  });

  test("after entering an open battlefield alone, a showdown is staged and — unopposed — P1 conquers it and scores 1 (323.11.a, 469.1)", async () => {
    const game = await inHand().build();
    await game.p1.play("sai", { to: "open" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline(); // Vision
      await game.settle();
    }
    expect(game.zoneOf("sai")).toBe("battlefield-open");
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
