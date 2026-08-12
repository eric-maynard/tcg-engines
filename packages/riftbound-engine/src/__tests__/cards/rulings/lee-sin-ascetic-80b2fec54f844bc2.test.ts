/**
 * Ruling 80b2fec54f844bc2 — Lee Sin, Ascetic (OGN-078 → ogn-078-298) · 5 Might ·
 *   "[Shield] · [Exhaust]: Buff me. · I can have any number of buffs."
 *
 * Q: Moving Lee Sin exhausts him — does he get his self-buff from that, or must he be exhausted
 *    "in place" via his own ability?
 * A: Moving never buffs him. The buff is an ACTIVATED ability whose cost happens to be [Exhaust];
 *    it is not a trigger on becoming exhausted. A Standard Move exhausts him for the move and
 *    nothing else, and since both need the exhaust you cannot get both out of one ready Lee Sin.
 * Rules: 380/402 (activated abilities: the cost is paid on activation, they are not triggers),
 *        442.1.a / 447 (a Standard Move exhausts the mover), 383 (triggered abilities need a
 *        printed trigger condition — Lee Sin has none for "when I become exhausted").
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const LEE_SIN_ASCETIC = "ogn-078-298";
const EXHAUST_BUFF = 1; // ability index of "[Exhaust]: Buff me." (index 0 is the [Shield] keyword)

/** P1's turn; Lee Sin ready in base, one empty uncontrolled battlefield to walk onto. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", LEE_SIN_ASCETIC, "lee");

describe("Ruling 80b2fec54f844bc2 — moving Lee Sin exhausts him but never buffs him", () => {
  test("baseline: he starts ready, unbuffed, at printed 5 Might", async () => {
    const game = await board().build();
    expect(game.state("lee")).toMatchObject({ baseMight: 5, isBuffed: false, isReady: true, might: 5 });
  });

  test("a Standard Move exhausts him and NOTHING else — no buff, no Might change, nothing on the chain", async () => {
    const game = await board().build();
    await game.p1.move("lee", "bf1");
    expect(game.state("lee")).toMatchObject({ isBuffed: false, isExhausted: true, might: 5 });
    expect(game.locationOf("lee")).toBe("bf1");
    expect(game.chain()).toEqual([]); // exhausting is not a trigger condition on this card
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: false, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("the buff comes only from the activated ability: activate → +1 buff, 6 Might", async () => {
    const game = await board().build();
    await game.p1.activate("lee", EXHAUST_BUFF);
    expect(game.state("lee").isExhausted).toBe(true); // the exhaust is the COST, paid on activation
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 6 });
  });

  test("you cannot do both with one ready Lee Sin — after moving, the ability's cost is unpayable", async () => {
    const game = await board().build();
    await game.p1.move("lee", "bf1");
    expect(game.p1.can("activate", "lee")).toBe(false);
    const denied = await game.p1.try((p) => p.activate("lee", EXHAUST_BUFF));
    expect(denied.ok).toBe(false);
    expect(game.state("lee")).toMatchObject({ isBuffed: false, might: 5 });
  });

  test("…and symmetrically: after buffing he is exhausted, so he can no longer make a Standard Move", async () => {
    const game = await board().build();
    await game.p1.activate("lee", EXHAUST_BUFF);
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, isExhausted: true });
    const denied = await game.p1.try((p) => p.move("lee", "bf1"));
    expect(denied.ok).toBe(false);
    expect(game.locationOf("lee")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
