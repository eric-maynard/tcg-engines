/**
 * Sprite Mother — ogn-106-298 · Unit · Mind · 4 energy + [mind] · 3 might
 *
 *   When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here.
 *   (Kill it at the start of its controller's Beginning Phase, before scoring.)
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const sprites = (ids: string[]) => ids.filter((c) => c.startsWith("token-sprite-"));

function ready() {
  return scenario().resources(P1, { energy: 4, power: { mind: 1 } }).battlefield("bf1", { controller: P1 }).hand(P1, SPRITE_MOTHER, "sm");
}

describe("Sprite Mother (ogn-106-298)", () => {
  test("costs 4 energy + 1 mind power; not playable without the mind power", async () => {
    const game = await ready().build();
    await game.p1.play("sm", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("sm")).toBe("base");
    expect(game.state("sm").might).toBe(3);
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, SPRITE_MOTHER, "sm").build();
    expect(noPower.p1.can("play", "sm")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, SPRITE_MOTHER, "sm").build();
    expect(lowEnergy.p1.can("play", "sm")).toBe(false);
  });

  test("When you play me: a triggered ability goes on the chain and plays a 3-Might Sprite token with Temporary", async () => {
    const game = await ready().build();
    await game.p1.play("sm", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sm", triggered: true })]);
    await game.settle();
    const toks = sprites(game.p1.base());
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isToken: true, might: 3, name: "Sprite" });
    expect(game.state(toks[0]!).keywords).toContain("Temporary");
  });

  test("'here': played to base → the token is in base (no destination prompt)", async () => {
    const game = await ready().build();
    await game.p1.play("sm", { to: "base" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(sprites(game.p1.base())).toHaveLength(1);
    expect(sprites(game.p1.units("bf1"))).toHaveLength(0);
  });

  test("'here': played to a battlefield you control → the token is at that battlefield", async () => {
    const game = await ready().build();
    await game.p1.play("sm", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("sm")).toBe("bf1");
    expect(sprites(game.p1.units("bf1"))).toHaveLength(1);
    expect(sprites(game.p1.base())).toHaveLength(0);
  });

  test("the Sprite token is played READY", async () => {
    const game = await ready().build();
    await game.p1.play("sm", { to: "base" });
    await game.settle();
    const [tok] = sprites(game.p1.base());
    expect(game.state(tok!).isReady).toBe(true);
  });

  test("Temporary: the token is killed at the start of P1's next Beginning Phase; Sprite Mother stays", async () => {
    const game = await ready().build();
    await game.p1.play("sm", { to: "base" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(sprites(game.p1.base())).toHaveLength(1);
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game.p1.base())).toHaveLength(0);
    expect(game.zoneOf("sm")).toBe("base");
  });

  test("only 'when you PLAY me': a Sprite Mother put onto the board by other means creates nothing", async () => {
    const game = await scenario().unit(P1, "base", SPRITE_MOTHER, "sm").hand(P1, { energyCost: 0, might: 1 }, "tick").build();
    await game.p1.play("tick", { to: "base" });
    await game.settle();
    expect(sprites(game.p1.base())).toHaveLength(0);
  });
});
