/**
 * Ruling 69a90d6a8c4ee91a — Rift Herald (UNL-179 → unl-179-219) · Unit · Order · [8][order] · 7 Might (the defender)
 *   × Sacrifice (UNL-173 → unl-173-219) · Order Reaction · [1] "As an additional cost to play this, kill a friendly [Mighty]
 *     unit. Draw 2 and channel 1 rune exhausted."
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · Champion Unit · Order · [5][order] · 5 Might "[Ambush] When I attack, [Stun] an
 *     enemy unit here."
 *
 * Q: I'm defending with Rift Herald; I cast Sacrifice and then play Vi (Ambush) into the fight. Do I stun the attacker? Is Vi
 *    now an attacker?
 * A: No and no. Units entering an ongoing combat take their controller's role: I am the Defender, so Vi joins as a
 *    Defender; her "When I attack" condition is never met and nothing is stunned.
 * Rules: 442.1.a / 323.2.a (designation follows the controller's side), 383 (trigger conditions), Ambush (Reaction-speed
 *        play to a battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIFT_HERALD = "unl-179-219";
const SACRIFICE = "unl-173-219";
const VI = "unl-176-219";

/**
 * P2's turn. P1 holds bf1 with Rift Herald (7); a 5-Might (Mighty) Veteran waits in P1's base as Sacrifice fodder.
 * P1: Sacrifice + Vi in hand, exactly [6][order] (1 + 5+order). P2's 6-Might Raider attacks from base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RIFT_HERALD, "herald")
    .unit(P1, "base", { might: 5, name: "Veteran" }, "vet")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
    .hand(P1, SACRIFICE, "sac")
    .hand(P1, VI, "vi");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks bf1; P2 passes Focus; P1 casts Sacrifice (killing the Veteran) and it resolves; Focus returns to P1. */
async function defendedAndSacrificed(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
  expect(game.state("herald").combatRole).toBe("defender");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  const fodder = (game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options ?? []).map(String).toSorted();
  expect(fodder).toEqual(["herald", "vet"]); // both are Mighty (5+)
  const hand = game.p1.hand().length;
  const runes = game.p1.runes().length;
  await game.p1.cast("sac", { sacrifice: "vet" });
  expect(game.zoneOf("vet")).toBe("trash"); // the additional cost, paid up front
  await game.p1.passPriority();
  await game.p2.passPriority(); // Sacrifice resolves
  expect(game.zoneOf("sac")).toBe("trash");
  expect(game.p1.hand()).toHaveLength(hand - 1 + 2); // drew 2
  expect(game.p1.runes()).toHaveLength(runes + 1); // channeled 1 …
  expect(game.p1.runes({ ready: false })).toHaveLength(1); // … exhausted
  // Focus moved on to P2; P2 passes it back.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 Ambushes Vi into bf1 and passes until she is on the board. */
async function ambushVi(game: Game): Promise<void> {
  expect(game.p1.can("play", "vi")).toBe(true);
  const to = (game.p1.option("play", "vi")?.fields.find((f) => f.name === "location")?.options ?? []).map(String);
  expect(to).toEqual(["battlefield-bf1"]); // Ambush: to the battlefield where P1 has units (Rift Herald)
  await game.p1.play("vi", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  for (let i = 0; i < 6 && game.zoneOf("vi") !== "battlefield-bf1"; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  expect(game.zoneOf("vi")).toBe("battlefield-bf1");
}

describe("Ruling 69a90d6a8c4ee91a — Vi Ambushed into my DEFENSE is a Defender: no 'When I attack' stun", () => {
  test("Vi enters the ongoing combat on the defending side: she is designated DEFENDER (never Attacker), alongside Rift Herald", async () => {
    const game = await defendedAndSacrificed();
    await ambushVi(game);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1 });
    expect(game.state("vi").combatRole).toBe("defender");
    expect(game.state("herald").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("ruling: her 'When I attack, Stun an enemy unit here' does NOT trigger — no Vi item ever hits the chain, P1 is asked nothing, and the Raider is not stunned", async () => {
    const game = await defendedAndSacrificed();
    await ambushVi(game);
    expect(game.chain().some((c) => c.cardId === "vi")).toBe(false);
    const d = game.decision();
    expect(d?.kind).toBe("action"); // just Focus/priority — no target prompt for a stun
    expect(d?.kind === "pick" && d.source?.cardId === "vi").toBe(false);
    expect(game.state("raider").isStunned).toBe(false);
    // Let the rest play out: still no stun before damage; the un-stunned Raider deals its 6.
    await game.settle();
    const toDefenders = (game.gameState.damageLog ?? []).filter((r) => r.combat && (r.target === "herald" || r.target === "vi")).reduce((s, r) => s + r.amount, 0);
    expect(toDefenders).toBe(6);
    expect(game.zoneOf("raider")).toBe("trash"); // 6 vs 7 + 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — on MY attack Vi's trigger does fire: moving her into an enemy battlefield puts 'Vi' on the chain and stuns the enemy there", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", VI, "vi")
      .build();
    await game.p1.move("vi", "bf1");
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("wall");
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wall").isStunned).toBe(true);
  });
});
