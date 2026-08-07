/**
 * Sprite Call — ogn-094-298 · Spell (Action) · Mind · 3 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Play a ready 3 [Might] Sprite unit token with [Temporary]. (Kill it at the start of its
 *   controller's Beginning Phase, before scoring.)
 *
 * Rule 723 (Hidden): hide for [rainbow] at a battlefield you control; from the next turn it gains
 * Reaction and may be played for 0; a unit it plays must be played at that battlefield.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SPRITE_CALL = "ogn-094-298";
const sprites = (ids: string[]) => ids.filter((c) => c.startsWith("token-sprite-"));

function fromHand() {
  return scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).hand(P1, SPRITE_CALL, "sc");
}

function hidden() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2 }, "holder")
    .hand(P1, SPRITE_CALL, "sc");
}

describe("Sprite Call (ogn-094-298)", () => {
  test("costs 3 energy; plays a 3-Might Sprite unit token with Temporary (to base or a battlefield you control); spell → trash", async () => {
    const game = await fromHand().build();
    await game.p1.cast("sc");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("base");
    await game.settle();
    const [tok] = sprites(game.p1.base());
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ baseMight: 3, isToken: true, might: 3, name: "Sprite" });
    expect(game.state(tok!).keywords).toContain("Temporary");
    expect(game.zoneOf("sc")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, SPRITE_CALL, "sc").build();
    expect(poor.p1.can("cast", "sc")).toBe(false);
  });

  test("the token may be played to a battlefield you control", async () => {
    const game = await fromHand().build();
    await game.p1.cast("sc");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(sprites(game.p1.units("bf1"))).toHaveLength(1);
  });

  test("the Sprite token is played READY", async () => {
    const game = await fromHand().build();
    await game.p1.cast("sc");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    const [tok] = sprites(game.p1.base());
    expect(game.state(tok!).isReady).toBe(true);
  });

  test("Temporary: the token is killed at the start of its controller's next Beginning Phase", async () => {
    const game = await fromHand().build();
    await game.p1.cast("sc");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    await game.advanceTurn(); // → P2: still there
    expect(sprites(game.p1.base())).toHaveLength(1);
    await game.advanceTurn(); // → P1: killed during Beginning
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites([...game.p1.base(), ...game.p1.units("bf1")])).toHaveLength(0);
  });

  test("Action: not playable from hand on the opponent's turn", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 3 }).hand(P1, SPRITE_CALL, "sc").build();
    expect(game.p1.can("cast", "sc")).toBe(false);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control; cannot be played from facedown the same turn", async () => {
    const game = await hidden().build();
    expect(game.p1.option("hide", "sc")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("sc", "bf1");
    expect(game.p1.resources().power).toEqual({ rainbow: 0 });
    expect(game.zoneOf("sc")).toBe("facedown-bf1");
    expect(game.state("sc").isHidden).toBe(true);
    expect(game.p1.can("reveal", "sc")).toBe(false);
  });

  test("Hidden: on a later turn it plays from facedown for 0 energy", async () => {
    const game = await hidden().build();
    await game.p1.hide("sc", "bf1");
    await game.advanceTurn();
    // rule 316.5.b: Reaction (811.6) only adds Closed States, so in P2's
    // Neutral Open State P1 still holds no Priority.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("reveal", "sc")).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const energyBefore = game.p1.resources().energy;
    await game.p1.reveal("sc");
    expect(game.p1.resources().energy).toBe(energyBefore);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1 })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
      await game.settle();
    }
    expect(sprites(game.p1.units("bf1"))).toHaveLength(1);
    expect(game.zoneOf("sc")).toBe("trash");
  });

  test("played from facedown, the Sprite must be played at THAT battlefield — base is not a legal destination (Hidden rule)", async () => {
    const game = await hidden().build();
    await game.p1.hide("sc", "bf1");
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1: only the Turn Player has Priority in a Neutral Open State (316.5.b)
    await game.p1.reveal("sc");
    await game.settle();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.key) : ["battlefield-bf1"];
    expect(offered).toEqual(["battlefield-bf1"]);
  });
});
