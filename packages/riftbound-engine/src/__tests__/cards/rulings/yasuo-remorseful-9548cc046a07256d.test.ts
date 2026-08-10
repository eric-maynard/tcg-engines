/**
 * Ruling 9548cc046a07256d — Yasuo, Remorseful (OGN-076 → ogn-076-298) · [6][calm][calm] 6 Might "When I attack, deal damage equal to my
 *     Might to an enemy unit here."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Can Yasuo fire his 6-damage attack trigger twice in one combat by Riding the Wind out of the battlefield and back in?
 * A: No. "When I attack" triggers once per combat; leaving and re-entering the same ongoing combat does not re-trigger it. There is
 *    no heal/cleanup between the two Ride the Winds (damage stays marked), the showdown only ends when both pass Focus on an empty
 *    chain, and units heal only after the whole combat ends.
 * Rules: 464 (attack triggers when a unit becomes an attacker in a combat), 341 / 465 (showdown ends on consecutive Focus passes),
 *        520 (damage heals at end of combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn with exactly 2 × ([2][chaos]). P2's 20-Might Wall holds bf1 (survives everything, so damage can be read). Yasuo ready in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 20, name: "Wall" }, "wall")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, RIDE_THE_WIND, "ride1")
    .hand(P1, RIDE_THE_WIND, "ride2");
}

/** Drain chain priority (and Yasuo's forced single-target pick) until a Focus/main decision is reached. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => o.key === "base" || o.key === "battlefield-bf1" || (o.card ?? o.key) === "wall") ?? d.options[0];
      await game.p1.pick((want as { key: string }).key);
    } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

/** Yasuo attacks bf1; his trigger resolves (6 to the Wall); P1 has Focus in the open combat showdown. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  await drainChain(game);
  expect(game.state("wall").damage).toBe(6);
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Ride the Wind #1: Yasuo → base. Then P2 passes Focus back. Ride the Wind #2: Yasuo → bf1 again. Stops with the chain empty, still in the showdown. */
async function outAndBackIn(game: Game): Promise<void> {
  await game.p1.cast("ride1", { answers: ["base"], targets: "yasuo" });
  await drainChain(game);
  expect(game.locationOf("yasuo")).toBe("base");
  expect(game.state("yasuo").isReady).toBe(true);
  // The showdown is NOT over just because the attacker stepped out: it takes both players passing Focus on an empty chain.
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(game.state("wall").damage).toBe(6); // no heal / cleanup in between
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "ride2")).toBe(true);
  await game.p1.cast("ride2", { answers: ["bf1"], targets: "yasuo" });
  await drainChain(game);
  expect(game.locationOf("yasuo")).toBe("bf1");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
}

describe("Ruling 9548cc046a07256d — Yasuo's 'When I attack' fires once per combat, even if he Rides the Wind out and back in", () => {
  test("Yasuo attacks: the trigger fires ONCE — 6 damage marked on the Wall — and the combat showdown at bf1 is open with P1 on Focus", async () => {
    await yasuoAttacks();
  });

  test("Ride the Wind out (to base) and back in (to bf1) during that same showdown: Yasuo is an attacker at bf1 again but NO second trigger — nothing goes on the chain and the Wall still has exactly 6 damage", async () => {
    const game = await yasuoAttacks();
    await outAndBackIn(game);
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "yasuo")).toBe(false);
    expect(game.state("wall").damage).toBe(6); // not 12
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("the combat then resolves normally (Yasuo 6 into the Wall: 6 + 6 = 12 < 20, Wall lives; Yasuo takes 20 and dies) and only AFTER combat does the Wall heal to 0", async () => {
    const game = await yasuoAttacks();
    await outAndBackIn(game);
    expect(game.state("wall").damage).toBe(6); // still marked going into combat damage
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed at end of combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
