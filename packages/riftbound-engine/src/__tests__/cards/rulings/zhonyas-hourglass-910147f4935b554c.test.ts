/**
 * Ruling 910147f4935b554c — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Watchful Sentry (ogn-096-298, "[Deathknell] — Draw 1") for the Deathknell nuance.
 *
 * Q: Can I reveal a hidden Zhonya's Hourglass after my unit dies during a showdown?
 * A: Yes — you keep control of the battlefield until combat cleanup concludes, so while you have Focus/priority in that
 *    showdown the hidden Zhonya's is still there and may be flipped. But to actually SAVE the unit you must flip it before
 *    it dies (e.g. in response to the spell that would kill it): you cannot react to a death itself; a Deathknell gives a
 *    window, but the unit is already dead by then.
 * Rules: 190.4.b (control frozen while a combat is ongoing there), 811 (hidden ⇒ playable as a Reaction for [0]),
 *        366–372 (a replacement must be in play before the event), 808 (Deathknell opens a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const WATCHFUL_SENTRY = "ogn-096-298";
/** Inline "[Action] Deal 3 to a unit." — the attacker's mid-showdown removal. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt (inline)",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

/** P2's turn 3 with [1]. P1 holds bf1 with a lone Defender (3) and Zhonya's face down there. P2: Raider (5) in base, Bolt in hand. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "defender")
    .facedown(P1, "bf1", ZHONYAS, "zhonyas")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Raider attacks; P2 (Focus) Bolts the Defender; P1 passes on the Bolt; it resolves and the Defender dies mid-showdown. */
async function defenderDiesToBoltMidShowdown(): Promise<Game> {
  const game = await board().hand(P2, BOLT, "bolt").build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("bolt", { targets: "defender" });
  await game.p2.passPriority();
  expect(game.p1.can("reveal", "zhonyas")).toBe(true); // (the moment to save it — declined here)
  await game.p1.passPriority();
  expect(game.zoneOf("defender")).toBe("trash");
  return game;
}

describe("Ruling 910147f4935b554c — a hidden Zhonya's can still be flipped after the unit died mid-showdown, but it saves nothing", () => {
  test("after the Defender dies to the Bolt the showdown is still on: bf1 is STILL controlled by P1 (unit-less), the facedown Zhonya's is still there, Focus passes to P1 — and revealing it is legal", async () => {
    const game = await defenderDiesToBoltMidShowdown();
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.zoneOf("zhonyas")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.reveal("zhonyas");
    expect(game.zoneOf("zhonyas")).toBe("base"); // in play as P1's gear, paid [0]
    expect(game.p1.energy()).toBe(0);
  });

  test("…but the Defender stays dead (you cannot react to a death): Zhonya's simply sits in play, the combat closes with nobody defending and the Raider conquers bf1", async () => {
    const game = await defenderDiesToBoltMidShowdown();
    await game.p1.reveal("zhonyas");
    await game.settle();
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("base"); // not "killed instead" — nothing was replaced
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("to SAVE the unit, flip Zhonya's in response to the Bolt (before the death): Zhonya's is killed instead, the Defender is healed/exhausted/recalled to base", async () => {
    const game = await board().hand(P2, BOLT, "bolt").build();
    await game.p2.move("raider", "bf1");
    await game.p2.cast("bolt", { targets: "defender" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.reveal("zhonyas");
    expect(game.zoneOf("zhonyas")).toBe("base"); // in play before the Bolt resolves
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("defender")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(bf1(game)?.controller).toBe(P2); // the emptied battlefield still falls to the Raider
  });

  test("Deathknell nuance: a lone Watchful Sentry dying to combat damage puts its Deathknell on the chain — P1 (still controlling bf1) may flip Zhonya's in response, but the Sentry is already in the trash and stays there; the Deathknell draws 1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .facedown(P1, "bf1", ZHONYAS, "zhonyas")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .deck(P1, ["ogn-175-298"], ["drawn"])
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus(); // combat damage: Sentry dies
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true })]);
    expect(bf1(game)?.controller).toBe(P1); // control not yet changed — cleanup hasn't concluded
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.reveal("zhonyas");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash"); // too late to save
    expect(game.p1.hand()).toContain("drawn"); // Deathknell resolved
    expect(game.zoneOf("zhonyas")).toBe("base"); // kept for a future unit
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
  });
});
