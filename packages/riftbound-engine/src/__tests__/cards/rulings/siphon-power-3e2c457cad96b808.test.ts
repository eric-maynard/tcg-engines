/**
 * Ruling 3e2c457cad96b808 — Siphon Power (OGN-266 → ogn-266-298) · Spell · Mind/Order · [2][rainbow] · [Reaction]
 *   "Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there -1 [Might]
 *    this turn, to a minimum of 1 [Might]."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) — "When I attack or defend, give an enemy unit here
 *     -2 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: If Siphon Power buffs my 1-Might recruits, does Ahri's ability drag them back down, and when does each
 *    effect apply?
 * A: They apply in the order they RESOLVE on the chain. Siphon Power played in response to Ahri's attack
 *    trigger resolves first (LIFO): the recruits go to 2, then Ahri's trigger resolves and takes the chosen one
 *    back to 1. Wait until Ahri's trigger has resolved and cast Siphon Power with Focus instead, and the
 *    recruit goes to 2 and STAYS there — Ahri's clause is a one-time reduction at resolution, not a lingering cap.
 * Rules: 337.1 (LIFO chain resolution), 355.15/359 (an effect reads the game state when it resolves),
 *        711 ("to a minimum of 1" bounds the reduction at the moment it is applied).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIPHON_POWER = "ogn-266-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** P1's Ahri attacks P2's bf1, which holds two 1-Might Recruits; her trigger is on the chain, aimed at "recruit". */
async function ahriAttacks(): Promise<Game> {
  const game = await scenario()
    .resources(P2, { energy: 4, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(1, "Recruit"), "recruit")
    .unit(P2, "bf1", unit(1, "Recruit II"), "recruit2")
    .unit(P1, "base", AHRI_INQUISITIVE, "ahri")
    .hand(P2, SIPHON_POWER, "siphon")
    .build();
  await game.p1.move("ahri", "bf1");
  expect(game.chain()).toMatchObject([{ cardId: "ahri", triggered: true }]);
  await game.p1.pick("recruit");
  return game;
}

/** Both seats pass priority once, resolving the top chain item. */
async function resolveTop(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 3e2c457cad96b808 — Siphon Power and Ahri apply in resolution order", () => {
  test("Siphon Power chained ON TOP of the attack trigger: +1 first (2 Might), then Ahri's -2 drags it back to 1", async () => {
    const game = await ahriAttacks();

    await game.p1.passPriority();
    await game.p2.cast("siphon", { targets: "bf1" });
    await game.p2.passPriority();
    await game.p1.passPriority();

    // Siphon Power resolved first (LIFO); Ahri's trigger is still on the chain.
    expect(game.state("recruit").might).toBe(2);
    expect(game.state("recruit2").might).toBe(2);
    expect(game.chain()).toHaveLength(1);

    await resolveTop(game);

    expect(game.state("recruit").might).toBe(1); // -2 from 2, floored at 1
    expect(game.state("recruit2").might).toBe(2); // Ahri only chose one of them
    expect(game.violations()).toEqual([]);
  });

  test("waiting until the trigger has resolved: the recruit goes to 2 and STAYS at 2", async () => {
    const game = await ahriAttacks();

    await resolveTop(game); // Ahri's -2 hits a 1-Might unit: floored, nothing changes
    expect(game.state("recruit").might).toBe(1);
    expect(game.state("recruit2").might).toBe(1);
    expect(game.chain()).toEqual([]);

    await game.p1.passFocus();
    await game.p2.cast("siphon", { targets: "bf1" });
    await game.p2.passPriority();
    await game.p1.passPriority();

    expect(game.state("recruit").might).toBe(2); // Ahri's clause did not linger as a cap
    expect(game.state("recruit2").might).toBe(2);
  });

  test("Siphon Power chooses a BATTLEFIELD, so it reaches every unit there, not a single target", async () => {
    const game = await ahriAttacks();
    await game.p1.passPriority();

    const field = game.p2.option("cast", "siphon")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["bf1"]]); // the battlefield, not any of the four units standing on it
  });
});
