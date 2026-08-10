/**
 * Ruling bccc307b298738ab — Mystic Vortex (VEN-160 → ven-160-166) · Battlefield
 *   "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *   × Discipline (ogn-058-298, printed [Reaction] spell, 2) · Long Sword (sfd-022-221, [Quick-Draw] Equipment, 2+[fury])
 *   × Inferna (unl-002-219, [Ambush] unit, 2) · Zhonya's Hourglass (ogn-077-298, [Hidden] gear, played facedown for [0])
 *
 * Q: Does Mystic Vortex only tax cards with the printed Reaction keyword, or also cards that merely PLAY at Reaction speed
 *    (Ambush, Quick-Draw, Hidden)?
 * A: It taxes any card that HAS Reaction as a characteristic when played, however it got it: Quick-Draw cards have Reaction
 *    inherently; Ambush cards have it while being played to a battlefield where you have units; Hidden cards have it when
 *    played from facedown. All pay [rainbow] more during a showdown there.
 * Rules: 813.4–813.5 (conditionally granted Reaction counts), 819.1.b (Quick-Draw ⇒ Reaction), 822.1.b (Ambush ⇒ Reaction
 *        when played to a battlefield with your units), 811.6 (Hidden cards have Reaction), 356.1.b.3 (increases apply even
 *        when the base cost is ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_VORTEX = "ven-160-166";
const DISCIPLINE = "ogn-058-298";
const LONG_SWORD = "sfd-022-221";
const INFERNA = "unl-002-219";
const ZHONYAS = "ogn-077-298";
/** A plain Action spell (no Reaction of any kind) as the negative control. */
const JAB = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Jab (Action)",
  timing: "action",
} as const;

type Res = { energy: number; power?: Record<string, number> };
type Builder = ReturnType<typeof scenario>;

/**
 * P2's turn. P1 holds Mystic Vortex (live text) with a Guard (3); P2's Raider (4) attacks it and passes Focus, so P1 holds
 * Focus in a showdown AT the Vortex. `extra` adds the card under test; `res` is P1's exact pool.
 */
async function showdownAtVortex(res: Res, extra: (b: Builder) => Builder): Promise<Game> {
  const base = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, res)
    .battlefield("vortex", { controller: P1, def: MYSTIC_VORTEX, inert: false })
    .unit(P1, "vortex", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
  const game = await extra(base).build();
  await game.p2.move("raider", "vortex");
  await game.p2.passFocus();
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "vortex", focusPlayer: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling bccc307b298738ab — Mystic Vortex taxes every card that HAS Reaction when played, not just printed [Reaction]", () => {
  test("printed [Reaction] (Discipline, 2): during the showdown here it costs 2 + [rainbow] — unplayable on exactly 2 energy, playable with 2 + one power of any domain, and that power is spent", async () => {
    const poor = await showdownAtVortex({ energy: 2 }, (b) => b.hand(P1, DISCIPLINE, "disc"));
    expect(poor.p1.can("cast", "disc")).toBe(false);
    const game = await showdownAtVortex({ energy: 2, power: { fury: 1 } }, (b) => b.hand(P1, DISCIPLINE, "disc"));
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "guard" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle({ policy: "passive" });
  });

  test("negative controls: a plain ACTION spell (Jab, 1) is not taxed in the same showdown; and outside any showdown Discipline costs just its printed 2", async () => {
    const game = await showdownAtVortex({ energy: 1 }, (b) => b.hand(P1, JAB, "jab"));
    expect(game.p1.can("cast", "jab")).toBe(true);
    await game.p1.cast("jab", { targets: "raider" });
    expect(game.p1.resources().energy).toBe(0);
    const calm = await scenario()
      .turn(3)
      .resources(P1, { energy: 2 })
      .battlefield("vortex", { controller: P1, def: MYSTIC_VORTEX, inert: false })
      .unit(P1, "vortex", { might: 3, name: "Guard" }, "guard")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    expect(calm.p1.can("cast", "disc")).toBe(true);
    await calm.p1.cast("disc", { targets: "guard" });
    expect(calm.p1.resources().energy).toBe(0);
  });

  test("[Hidden] (Zhonya's facedown at the Vortex): flipping it in this showdown is no longer free — impossible with an empty pool, and with one power available the flip spends it ('Hidden cards have [Reaction]')", async () => {
    const broke = await showdownAtVortex({ energy: 0 }, (b) => b.facedown(P1, "vortex", ZHONYAS, "zhonya"));
    expect(broke.p1.can("reveal", "zhonya")).toBe(false);
    const game = await showdownAtVortex({ energy: 0, power: { calm: 1 } }, (b) => b.facedown(P1, "vortex", ZHONYAS, "zhonya"));
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("zhonya")).toBe("base"); // played (and, being gear, already home in base)
    // Same hidden card, no showdown (P1's own open turn): the flip is free again.
    const free = await scenario()
      .turn(3)
      .resources(P1, { energy: 0 })
      .battlefield("vortex", { controller: P1, def: MYSTIC_VORTEX, inert: false })
      .unit(P1, "vortex", { might: 3, name: "Guard" }, "guard")
      .facedown(P1, "vortex", ZHONYAS, "zhonya")
      .build();
    expect(free.p1.can("reveal", "zhonya")).toBe(true);
  });

  test("[Ambush] (Inferna, 2): played as a Reaction to a battlefield where P1 has units during this showdown, it costs 2 + [rainbow] — not playable on exactly 2, playable with 2 + a power, which is spent", async () => {
    const poor = await showdownAtVortex({ energy: 2 }, (b) => b.hand(P1, INFERNA, "inferna"));
    expect(poor.p1.can("play", "inferna")).toBe(false);
    const game = await showdownAtVortex({ energy: 2, power: { fury: 1 } }, (b) => b.hand(P1, INFERNA, "inferna"));
    expect(game.p1.can("play", "inferna")).toBe(true);
    const to = game.p1.option("play", "inferna")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-vortex"); // Ambush: only where P1 has units (not base on P2's turn)
    expect(to.map(String)).not.toContain("base");
    await game.p1.play("inferna", { to: "vortex" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("inferna")).toBe("battlefield-vortex");
  });

  // Expected (ruling, 819.1.b): Long Sword has Reaction inherently via [Quick-Draw], so during the showdown at the Vortex it
  // costs 2 + [fury] + [rainbow]: with exactly 2 energy + 1 fury it must NOT be playable, and playing it with 2 fury spends both.
  // Actual: the engine lets it be played at Reaction speed but charges only the printed 2 + [fury] — the Vortex surcharge
  // does not see Quick-Draw's inherent Reaction.
  test("ruling bccc307b298738ab — Mystic Vortex's +[rainbow] is not applied to a [Quick-Draw] card (Long Sword pays only its printed cost)", async () => {
    const exact = await showdownAtVortex({ energy: 2, power: { fury: 1 } }, (b) => b.hand(P1, LONG_SWORD, "sword"));
    expect(exact.p1.can("play", "sword")).toBe(false); // 2 + fury is one [rainbow] short
    const game = await showdownAtVortex({ energy: 2, power: { fury: 2 } }, (b) => b.hand(P1, LONG_SWORD, "sword"));
    expect(game.p1.can("play", "sword")).toBe(true);
    await game.p1.play("sword");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(what the engine does today with Quick-Draw, for the record) Long Sword IS playable at Reaction speed in the showdown — the timing half of 819.1.b works", async () => {
    const game = await showdownAtVortex({ energy: 2, power: { fury: 2 } }, (b) => b.hand(P1, LONG_SWORD, "sword"));
    expect(game.state("sword").keywords).toContain("Quick-Draw");
    expect(game.p1.can("play", "sword")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
