/**
 * Ruling 74da2ae2784d26df — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].) If a friendly unit would die, kill this instead. …"
 *
 * Q: How does the cost work when using the Hidden route, and does the facedown card's orientation matter?
 * A: Played normally it costs 2 and enters your base ready. Via Hidden you pay only ONE power to hide it, and later
 *    play it from facedown for free — not 3 total. (Facedown orientation is irrelevant.)
 * Rules: 811.1.c (hide: pay [rainbow] = 1 power, put facedown at a battlefield you control), 811.1.d (play from
 *        facedown ignoring cost, from the next turn on), 143 (gear enters ready in base).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

describe("Ruling 74da2ae2784d26df — Zhonya's costs: [2] played normally, or 1 power to hide then [0] to flip", () => {
  test("normal play: exactly 2 energy (no power) is spent and the gear sits READY in P1's base; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, ZHONYAS, "zh").build();
    expect(game.p1.can("play", "zh")).toBe(true);
    await game.p1.play("zh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("zh")).toMatchObject({ isHidden: false, isReady: true, zone: "base" });
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, ZHONYAS, "zh").build()).p1.can("play", "zh")).toBe(false);
  });

  test("hidden route, step 1: hiding it at a battlefield you control costs ONE power (any domain) and no energy — with 0 energy and 1 power it can be hidden but not played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, ZHONYAS, "zh")
      .build();
    expect(game.p1.can("play", "zh")).toBe(false); // [2] not affordable
    expect(game.p1.can("hide", "zh")).toBe(true);
    await game.p1.hide("zh", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
    expect(game.chain()).toEqual([]); // hiding is not playing
  });

  test("hidden route, step 2: on a later turn it is played from facedown for [0] — with an EMPTY pool — so the whole route cost 1 power, never '3 runes'", async () => {
    const game = await scenario()
      .resources(P1, { power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, ZHONYAS, "zh")
      .build();
    await game.p1.hide("zh", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.can("reveal", "zh")).toBe(false); // not the turn it was hidden (811.1.d)
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    // Empty P1's pool completely so "for [0]" is observable.
    expect(game.p1.resources().energy).toBe(0);
    expect(Object.values(game.p1.resources().power).every((v) => v === 0)).toBe(true);
    expect(game.p1.can("reveal", "zh")).toBe(false); // P2's Neutral Open: no priority for P1 yet
    await game.advanceTurn(); // → P1's turn 2 later
    expect(game.turnPlayer()).toBe(P1);
    const pool = game.p1.resources();
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.p1.resources()).toEqual(pool); // nothing spent: [0]
    await game.settle();
    expect(game.state("zh").isHidden).toBe(false);
    expect(["base", "bf1"]).toContain(game.locationOf("zh") as string);
    expect(game.violations()).toEqual([]);
  });
});
