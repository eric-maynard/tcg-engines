/**
 * Ruling 5b50917fd03b30c5 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Chaos spell · [2] "[Hidden] [Action] Move a unit from a battlefield to
 *     its base."
 *
 * Q: Can Fight or Flight answer Yasuo's attack trigger and stop the damage?
 * A: Only as a REACTION from its hidden spot: it then resolves first (LIFO), moves Yasuo to base, and his trigger —
 *    which hits an enemy unit "here" — finds Yasuo no longer at the battlefield and deals no damage. Played from hand
 *    it is an Action: too late, the trigger has already resolved and dealt its damage.
 * Rules: 811 (a hidden card is played as a Reaction), 340 (LIFO), 341 (Reactions only while a chain is pending),
 *        359.3.e (target/"here" re-checked on resolution → mistarget, no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P1's turn 3. P2 holds bf1 with an 8-Might Wall, a Fight or Flight facedown there (hidden earlier) and a second copy
 * in hand with [2]. Yasuo ready in P1's base.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fofHidden")
    .hand(P2, FIGHT_OR_FLIGHT, "fofHand")
    .unit(P1, "base", YASUO, "yasuo");
}

/** Yasuo attacks bf1 (target Wall locked/answered); P1 passes priority on his own trigger → P2 to respond. */
async function yasuoAttacksP2ToRespond(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("wall");
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 5b50917fd03b30c5 — hidden Fight or Flight (Reaction) blanks Yasuo's trigger; from hand (Action) it is too late", () => {
  test("with Yasuo's trigger pending, P2 may REVEAL the hidden Fight or Flight (Reaction timing, [0]) but may NOT cast the copy in hand (Action timing)", async () => {
    const game = await yasuoAttacksP2ToRespond();
    expect(game.p2.can("reveal", "fofHidden")).toBe(true);
    expect(game.p2.can("cast", "fofHand")).toBe(false);
    const early = await game.p2.try((p) => p.cast("fofHand", { targets: "yasuo" }));
    expect(early.ok).toBe(false);
    expect(game.zoneOf("fofHand")).toBe("hand");
    expect(game.state("wall").damage).toBe(0);
  });

  test("P2 reveals it choosing Yasuo: chain is [Yasuo trigger, Fight or Flight]; LIFO — Fight or Flight resolves first and Yasuo is back in P1's base while his trigger still waits", async () => {
    const game = await yasuoAttacksP2ToRespond();
    await game.p2.reveal("fofHidden");
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
      await game.p2.pick("yasuo");
    }
    expect(game.p2.energy()).toBe(2); // played from hidden for [0]
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "fofHidden"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["yasuo"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("fofHidden")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    expect(game.state("wall").damage).toBe(0);
  });

  test("ruling: Yasuo's trigger then resolves with Yasuo no longer 'here' — it mistargets: Wall takes NO damage; the attack fizzles out with bf1 still P2's", async () => {
    const game = await yasuoAttacksP2ToRespond();
    await game.p2.reveal("fofHidden");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("yasuo");
    }
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("yasuo")).toBe("base");
    await game.settle();
    expect(game.state("wall").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — from hand as an ACTION: P2 can only cast it once the trigger has resolved (Wall already took 6) and Focus reaches P2; it still sends Yasuo home, but the damage is done", async () => {
    const game = await yasuoAttacksP2ToRespond();
    await game.p2.passPriority(); // both passed → trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(6);
    // Attacker (P1) holds Focus first; when it passes to P2, the Action is finally legal.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "fofHand")).toBe(true);
    await game.p2.cast("fofHand", { targets: "yasuo" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fofHand")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed only by the combat cleanup afterwards
    expect((game.gameState.damageLog ?? []).some((r) => !r.combat && r.target === "wall" && r.amount === 6)).toBe(true); // …the 6 WAS dealt
  });
});
