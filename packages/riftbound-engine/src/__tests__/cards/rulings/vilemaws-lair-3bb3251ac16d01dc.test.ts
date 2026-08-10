/**
 * Ruling 3bb3251ac16d01dc — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · 2 · [Hidden] [Action] — "Move a unit from a battlefield to its base."
 *   (Vilemaw unl-060-219 is listed by the scrape but plays no part.)
 *
 * Q: Does Vilemaw's Lair cancel out Fight or Flight's effect?
 * A: Yes. The Lair's "can't move from here to base" beats the spell's move instruction; the unit stays at the Lair
 *    (the spell still resolves and goes to the trash).
 * Rules: 105 (can't beats can), 359.3.e.6 (impossible instruction is ignored), 446 (move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

describe("Ruling 3bb3251ac16d01dc — Fight or Flight cannot pull a unit out of Vilemaw's Lair", () => {
  test("cast from hand on an ENEMY unit at the Lair: legal to play and paid for, but on resolution the unit does not move — it stays at the Lair; the spell is spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .unit(P2, "lair", { might: 4, name: "Spider" }, "spider")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase");
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "spider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("spider")).toBe("battlefield-lair");
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.p2.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("same for your OWN unit at the Lair (e.g. trying to dodge): it stays put", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 2, name: "Runner" }, "runner")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.cast("fof", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("battlefield-lair");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // no move happened
  });

  test("flipped from HIDDEN at the Lair during the opponent's attack: still no escape — the defender remains at the Lair and fights", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 2, name: "Runner" }, "runner")
      .facedown(P1, "lair", FIGHT_OR_FLIGHT, "fof")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "lair");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "fof" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["raider", "runner"]); // units HERE only
    await game.p1.pick("runner");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("battlefield-lair"); // did not get away
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash"); // 5 into 2
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
  });

  test("contrast — at an ordinary battlefield Fight or Flight works: the unit goes to its base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("plain", { controller: P2 })
      .unit(P2, "plain", { might: 4, name: "Spider" }, "spider")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.cast("fof", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("spider")).toBe("base");
    expect(game.gameState.battlefields.plain?.controller).toBe(null);
  });
});
