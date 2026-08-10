/**
 * Ruling 5d7baf035bb13790 — Bullet Time (OGN-268 → ogn-268-298) · Body/Chaos Action spell · [1]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Chaos spell · [2] "[Hidden] [Action] Move a unit from a battlefield to
 *     its base."
 *
 * Q: The opponent plays Bullet Time during combat. Can I answer it with an Action spell like Fight or Flight, or only
 *    with Reactions?
 * A: Only Reactions — unless Fight or Flight is played from Hidden (that gives it Reaction timing). Once Bullet Time
 *    resolves you get Focus back and may play Actions; the showdown stays open even if your units were wiped, and if
 *    one side has no units left when everyone passes, the combat-damage step is simply skipped.
 * Rules: 336/341 (Closed state: Reactions only), 811 (hidden ⇒ Reaction), 347 (Focus alternates in a showdown),
 *        348/465 (combat damage only if both sides still have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P2's turn 3. P1 holds bf1 with two 2-Might defenders, a Fight or Flight facedown there and another in hand ([2]).
 * P2: 5-Might Raider in base, Bullet Time in hand, [1] + 2 floating [rainbow].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard A" }, "ga")
    .unit(P1, "bf1", { might: 2, name: "Guard B" }, "gb")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fofHidden")
    .hand(P1, FIGHT_OR_FLIGHT, "fofHand")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, BULLET_TIME, "bt");
}

/** Raider attacks bf1 (combat showdown, P2 has Focus); P2 casts Bullet Time at bf1 and passes priority to P1. */
async function bulletTimeOnTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P2, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("bt", { targets: "bf1" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P2 })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 5d7baf035bb13790 — answering Bullet Time in combat: Reactions (or a HIDDEN Fight or Flight) only; Actions after it resolves", () => {
  test("with Bullet Time pending (Closed state) P1 may NOT cast Fight or Flight from hand (Action) — but MAY reveal the hidden copy (Reaction timing)", async () => {
    const game = await bulletTimeOnTheChain();
    expect(game.p1.can("cast", "fofHand")).toBe(false);
    const early = await game.p1.try((p) => p.cast("fofHand", { targets: "raider" }));
    expect(early.ok).toBe(false);
    expect(game.zoneOf("fofHand")).toBe("hand");
    expect(game.p1.can("reveal", "fofHidden")).toBe(true);
  });

  test("nuance — from Hidden it IS a legal response: revealed at the Raider it sits above Bullet Time and resolves first (Raider home before any [rainbow] is paid)", async () => {
    const game = await bulletTimeOnTheChain();
    await game.p1.reveal("fofHidden");
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("raider");
    }
    expect(game.p1.energy()).toBe(2); // [0] from hidden
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt", "fofHidden"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("fofHidden")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt"]);
    expect(game.p2.power("rainbow")).toBe(2); // Bullet Time has not resolved/paid yet
  });

  test("P1 lets Bullet Time resolve (P2 pays 2 [rainbow]): both Guards die — yet the showdown does NOT close; Focus comes to P1, who may NOW cast Fight or Flight from hand (Action) at the Raider", async () => {
    const game = await bulletTimeOnTheChain();
    await game.p1.passPriority(); // both passed → Bullet Time resolves
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P2, source: { cardId: "bt" } });
    await game.p2.chooseX(2);
    expect(game.p2.power("rainbow")).toBe(0);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // Showdown still open although P1's side is wiped; Focus passes around to P1.
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    for (let i = 0; i < 2 && game.decision()?.seat !== P1; i++) {
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fofHand")).toBe(true);
    await game.p1.cast("fofHand", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fofHand"]);
  });

  test("…Fight or Flight sends the Raider home; when both then pass the showdown closes with NO combat-damage step (a side is empty): nobody takes combat damage, P2 conquers nothing and scores 0", async () => {
    const game = await bulletTimeOnTheChain();
    await game.p1.passPriority();
    await game.p2.chooseX(2);
    for (let i = 0; i < 2 && game.decision()?.seat !== P1; i++) {
      await game.p2.passFocus();
    }
    await game.p1.cast("fofHand", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("fofHand")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.state("raider")).toMatchObject({ combatRole: null, damage: 0 });
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
