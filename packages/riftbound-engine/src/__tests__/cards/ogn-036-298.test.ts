/**
 * Vi, Destructive — ogn-036-298 · Champion Unit (Vi) · Fury · 2 energy + 1 [fury] · 3 might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   Recycle 1 from your trash: Give me +1 [Might] this turn.
 *
 * Rule 810: Ganking adds battlefield→battlefield to the Standard Move (which exhausts).
 * Rule 145.2: unit activated abilities are Main-Phase / Open-State only.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-036-298";
const JUNK = "ogn-175-298"; // vanilla card to sit in the trash
const PUMP = 1; // ability index: #0 is the Ganking keyword, #1 the activated ability

describe("Vi, Destructive (ogn-036-298)", () => {
  test("cost: 2 energy + 1 fury to play; unaffordable without the fury", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "vi").build();
    await game.p1.play("vi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.state("vi").might).toBe(3);
    const broke = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "vi").build();
    expect(broke.p1.can("play", "vi")).toBe(false);
  });

  test("Ganking: may move from one battlefield to another (a vanilla unit there may not)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "vi")
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .build();
    expect(game.p1.can("gank", "vi")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("vi", "bf2");
    expect(game.locationOf("vi")).toBe("bf2");
    expect(game.state("vi").isExhausted).toBe(true); // it is still a Standard Move
    expect(game.locationOf("plain")).toBe("bf1");
  });

  test("activated: recycling 1 from trash gives +1 Might this turn (trash card goes to the bottom of the deck)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "vi").trash(P1, JUNK, "junk").build();
    expect(game.state("vi").might).toBe(3);
    await game.p1.activate("vi", PUMP);
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    expect(game.zoneOf("junk")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("junk");
    expect(game.state("vi").isExhausted).toBe(false); // no exhaust in the cost
    expect(game.p1.energy()).toBe(0); // no resource cost either
  });

  test("activated: repeatable while the trash has cards; not available with an empty trash", async () => {
    const game = await scenario().unit(P1, "base", CARD, "vi").trash(P1, JUNK, "j1").trash(P1, JUNK, "j2").build();
    await game.p1.activate("vi", PUMP);
    await game.settle();
    await game.p1.activate("vi", PUMP);
    await game.settle();
    expect(game.state("vi").might).toBe(5);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p1.can("activate", "vi")).toBe(false);
  });

  test("the +1 Might lasts only this turn", async () => {
    const game = await scenario().unit(P1, "base", CARD, "vi").trash(P1, JUNK, "junk").build();
    await game.p1.activate("vi", PUMP);
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("vi").might).toBe(3);
  });

  test("timing — a unit's non-[Action]/[Reaction] activated ability cannot be used on the opponent's turn (rule 145.2)", async () => {
    // Expected: with P2 as turn player, P1 has no legal `activate` for Vi (Main Phase of the
    // controller only). Actual: the engine offers it and puts the ability on the chain.
    const game = await scenario().active(P2).unit(P1, "base", CARD, "vi").trash(P1, JUNK, "junk").build();
    expect(game.p1.can("activate", "vi")).toBe(false);
    const r = await game.p1.try((p) => p.activate("vi", PUMP));
    expect(r.ok).toBe(false);
  });
});
