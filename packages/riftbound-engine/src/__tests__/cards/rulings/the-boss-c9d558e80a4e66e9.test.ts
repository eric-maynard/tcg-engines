/**
 * Ruling c9d558e80a4e66e9 — The Boss (OGN-269 → ogn-269-298) · Legend · Sett
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead. When you conquer, ready me."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *
 * Q: If Sett's legend ability saves a unit, does Viktor, Leader still make a Recruit token?
 * A: No. The Boss is a replacement effect — the death never happens, so Viktor's "when … dies" does not trigger.
 * Rules: 371.2 / 369 (replacement: the replaced event does not occur), 383 (death triggers need an actual death).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const VIKTOR_LEADER = "ogn-246-298";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
} as const;

/**
 * P2's turn. P1: The Boss (ready), 1 body power for [rainbow]; Viktor, Leader and a BUFFED Bruiser (2+1) at P1's bf1.
 * P2: Bolt (deal 3) + 1 energy.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VIKTOR_LEADER, "viktor")
    .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
    .hand(P2, BOLT, "bolt");
}

/** P2 Bolts the buffed Bruiser for 3 (lethal); both pass → the Boss's question is open for P1. */
async function boltBruiser(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 3 });
  await game.p2.cast("bolt", { targets: "bruiser" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
  return game;
}

const recruits = (game: Game) => game.findAll({ name: "Recruit" });

describe("Ruling c9d558e80a4e66e9 — a unit saved by The Boss did not die, so Viktor, Leader makes no Recruit", () => {
  test("P1 accepts the Boss's replacement: Boss exhausted, [rainbow] paid, buff spent; Bruiser healed, exhausted, recalled to base — NOT in the trash", async () => {
    const game = await boltBruiser();
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.p1.trash()).not.toContain("bruiser");
  });

  test("…and because no death occurred, Viktor's ability never hits the chain and no Recruit token exists", async () => {
    const game = await boltBruiser();
    await game.p1.yes();
    let viktorTriggered = false;
    for (let i = 0; i < 8; i++) {
      if (game.chain().some((c) => c.cardId === "viktor" && c.triggered)) {
        viktorTriggered = true;
      }
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(viktorTriggered).toBe(false);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units().toSorted()).toEqual(["bruiser", "viktor"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control — P1 declines the Boss: the Bruiser really dies, Viktor triggers, and a 1-Might Recruit token is played into P1's base", async () => {
    const game = await boltBruiser();
    await game.p1.no();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", triggered: true })]);
    await game.settle();
    expect(recruits(game)).toHaveLength(1);
    expect(game.state(recruits(game)[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 1, zone: "base" });
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.power("body")).toBe(1);
  });
});
