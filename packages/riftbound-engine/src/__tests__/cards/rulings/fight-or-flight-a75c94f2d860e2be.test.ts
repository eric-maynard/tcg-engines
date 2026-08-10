/**
 * Ruling a75c94f2d860e2be — Fight or Flight (OGN-168 → ogn-168-298) · Action [2] · "[Hidden] Move a unit from a battlefield to its base."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Ember Monk (OGN-167 → ogn-167-298) · 4 Might · "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and
 *     recall it."   (× Vilemaw unl-060-219 as the Lair's namesake occupant.)
 *
 * Q: Can you Fight or Flight at Vilemaw's Lair?
 * A: You may legally play it on a unit there (it counts as played — e.g. Ember Monk still triggers off the hidden play), but the
 *    move fails: "can't" beats "can", the unit stays. Recalls (Zhonya's, etc.) are not moves and are NOT blocked by the Lair.
 * Rules: 105 ("can't" overrides), 359.3.e (an impossible instruction is skipped), 419.4 (a resolved spell was played),
 *        141.3 / Zhonya's reminder (recall isn't a move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const VILEMAWS_LAIR = "ogn-295-298";
const EMBER_MONK = "ogn-167-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";
const VILEMAW = "unl-060-219";

describe("Ruling a75c94f2d860e2be — Fight or Flight at Vilemaw's Lair: playable, but the move fails; recalls still work", () => {
  test("P1 reveals a hidden Fight or Flight at its own Lair on its Scout there: the spell resolves (played: Ember Monk gets +2), yet the Scout does not move to base", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "lair", EMBER_MONK, "monk")
      .unit(P1, "lair", { might: 2, name: "Scout" }, "scout")
      .facedown(P1, "lair", FIGHT_OR_FLIGHT, "fof")
      .build();
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision();
      const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
      expect(offered).toEqual(["monk", "scout"]); // from hidden: only units at the Lair
      await game.p1.pick("scout");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, targets: ["scout"] })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash"); // resolved, not countered
    expect(game.zoneOf("scout")).toBe("battlefield-lair"); // the Lair forbids the move
    expect(game.p1.units("base")).toEqual([]);
    // "on play" style triggers still happen: Ember Monk saw a card played from Hidden.
    expect(game.state("monk")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("cast from hand on the enemy Vilemaw at an enemy-held Lair: legal, [2] spent, resolves — Vilemaw stays put", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .unit(P2, "lair", VILEMAW, "vilemaw")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "vilemaw" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("vilemaw")).toBe("battlefield-lair");
  });

  test("control — at an inert battlefield the same cast sends the unit to its base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: true })
      .unit(P2, "lair", VILEMAW, "vilemaw")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.cast("fof", { targets: "vilemaw" });
    await game.settle();
    expect(game.zoneOf("vilemaw")).toBe("base");
  });

  test("recall is not a move: Zhonya's Hourglass still recalls P1's dying Guard from the Lair to base (healed, exhausted), Zhonya's killed", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "lair", { might: 3, name: "Guard" }, "guard")
      .gear(P1, ZHONYAS_HOURGLASS, "zhonya")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "lair");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("raider")).toBe("battlefield-lair");
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
