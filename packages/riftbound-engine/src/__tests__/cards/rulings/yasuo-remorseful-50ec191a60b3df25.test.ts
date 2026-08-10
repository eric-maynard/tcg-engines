/**
 * Ruling 50ec191a60b3df25 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might
 *   to an enemy unit here."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Yasuo attacks (showdown opens); Ride the Wind is cast on him before combat damage. Does he still deal his attack-trigger
 *    damage AND dodge combat damage?
 * A: Yes. His trigger is part of the showdown's Initial Chain and resolves before any Action can be played; Ride the Wind
 *    (Action speed) is only castable afterwards, then moves him away readied, so no combat damage is exchanged. (Only a
 *    Reaction that moves/kills him could pre-empt the trigger.)
 * Rules: 464.2 (initial chain of attack/defend triggers), 343–347 (Closed state: Reactions only; Focus/Actions after the chain
 *        empties), 465 (combat damage only if attackers AND defenders remain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn with exactly [2][chaos]. P2 holds bf1 with a 7-Might Wall (survives 6, would deal 7 back). Yasuo ready in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, RIDE_THE_WIND, "ride");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Yasuo attacks bf1; lock the trigger's target (Wall) if asked; stop at the first priority window of the initial chain. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("wall");
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 50ec191a60b3df25 — Yasuo's attack trigger lands first; Ride the Wind then pulls him out before combat damage", () => {
  test("while the attack trigger is on the Initial Chain, the Action-speed Ride the Wind is NOT playable (Closed state) — nothing P1 holds can pre-empt the trigger", async () => {
    const game = await yasuoAttacks();
    expect(game.p1.can("cast", "ride")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ride", { targets: "yasuo" }));
    expect(r.ok).toBe(false);
    expect(game.state("wall").damage).toBe(0);
  });

  test("the trigger resolves as part of the Initial Chain: Wall takes 6; only THEN does P1 get Focus and Ride the Wind become castable", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(true);
  });

  test("Ride the Wind on Yasuo (→ base): he leaves readied before the damage step — takes NO combat damage, Wall keeps bf1, and the combat closes with no result", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger: 6 to Wall
    await game.p1.cast("ride", { answers: ["base"], targets: "yasuo" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo")).toMatchObject({ damage: 0, isReady: true }); // moved AND readied, never hit for 7
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 6 < 7: the trigger alone did not kill it
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("being ready again, Yasuo can attack bf1 a second time this turn and his trigger fires again", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.cast("ride", { answers: ["base"], targets: "yasuo" });
    await game.settle();
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("yasuo", "bf1");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("wall");
    }
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
  });

  test("control: without Ride the Wind the combat runs — Yasuo (6) takes 7 from the Wall and dies", async () => {
    const game = await yasuoAttacks();
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash"); // 6 (trigger) + 6 (combat) ≥ 7
  });
});
