/**
 * Ruling 89af049b8089fc27 — (general [Hidden]; exercised with Hidden Blade, OGN-213 → ogn-213-298 ·
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Action] Kill a unit at a battlefield.
 *   Its controller draws 2.")
 *
 * Q: Once a card is hidden, can it still be played for its normal cost so as to dodge the Hidden restrictions,
 *    and does it gain [Reaction]?
 * A: No, and yes. A card played from the facedown zone is played for [0] at Reaction speed, and its choices are
 *    restricted to the battlefield it was hidden at ("here"). It cannot be taken back and played at full price
 *    instead. It gains [Reaction] only from the NEXT turn — not the turn it was hidden. A card you never hid is
 *    of course still an ordinary hand card at full cost.
 * Rules: 811.1.b (hide for [A]; from the next turn it gains [Reaction] and may be played ignoring its base cost),
 *        811.1.d/811.1.d.2 ("here" restriction on the choices), 811.3 (or play it from hand as normal),
 *        811.6 (facedown ⇒ Reaction speed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298"; // [Hidden] [Action] · [2] + [order] · Kill a unit at a battlefield.

/** [Action] "Deal 1 to a unit." — P2's slow spell, only there to open a chain P1 may react on. */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Poke",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** Turn 3, P2 active. P1 holds bf1 (Sentry) with a Blade hidden there on an earlier turn; P2 holds bf2 (Wall). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 6, power: { order: 2, rainbow: 2 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "holder")
    .unit(P2, "bf1", { might: 2, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, POKE, "poke");
}

/** P2 casts a spell and passes: P1 now has priority in a Closed State. */
async function p1HasPriority(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("poke", { targets: "holder" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 89af049b8089fc27 — a hidden card is played from Hidden: [0], Reaction speed, choices restricted to 'here'", () => {
  test("on the opponent's turn, mid-chain, the facedown Blade IS playable — Reaction speed (811.6)", async () => {
    const game = await p1HasPriority();
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("its choices are restricted to the battlefield it was hidden at: the target prompt offers only units at bf1, never the Wall at bf2", async () => {
    const game = await p1HasPriority();
    await game.p1.reveal("blade");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN", source: { cardId: "blade" } });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(keys).toContain("raider");
    expect(keys).toContain("holder"); // both units standing at bf1
    expect(keys).not.toContain("wall"); // 811.1.d.2 — "here"
  });

  test("playing it costs nothing — energy and Power are untouched, and the kill happens", async () => {
    const game = await p1HasPriority();
    const energyBefore = game.p1.energy();
    const powerBefore = game.p1.power("order");
    await game.p1.reveal("blade");
    await game.p1.pick("raider");
    expect(game.p1.energy()).toBe(energyBefore);
    expect(game.p1.power("order")).toBe(powerBefore);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("there is no way to play the hidden card for its printed cost instead — the facedown card is not castable from hand", async () => {
    const game = await p1HasPriority();
    expect(game.p1.can("cast", "blade")).toBe(false);
    const res = await game.p1.try((p) => p.cast("blade", { targets: "wall" }));
    expect(res.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
  });

  test("a card you did NOT hide is unaffected (811.3): from hand it costs its printed price and may name a unit at ANY battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
      .hand(P1, HIDDEN_BLADE, "blade2")
      .build();
    const targets = game.p1.option("cast", "blade2")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toContain("wall"); // no "here" restriction from hand
    const energyBefore = game.p1.energy();
    await game.p1.cast("blade2", { targets: "wall" });
    expect(game.p1.energy()).toBeLessThan(energyBefore); // paid its real cost
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("the timing half: a card hidden THIS turn cannot be played yet — [Reaction] arrives on a later turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2, order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
      .hand(P1, HIDDEN_BLADE, "blade3")
      .build();
    await game.p1.hide("blade3", "bf1");
    expect(game.zoneOf("blade3")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "blade3")).toBe(false);
    await game.advanceTurn(); // P1 ends → P2's turn
    await game.advanceToTurnOf(P1); // …and back round to P1
    expect(game.p1.can("reveal", "blade3")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
