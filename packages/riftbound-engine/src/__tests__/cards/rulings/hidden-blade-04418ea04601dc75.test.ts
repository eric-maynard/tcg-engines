/**
 * Ruling 04418ea04601dc75 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Hidden · Action
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Crackshot Corsair (OGN-130 → ogn-130-298) · Unit · Body · 3 · "When I attack, deal 1 to an enemy unit here."
 *   (Falling Star OGN-029 is cited only as an example of text WITHOUT "here".)
 *
 * Q: If Hidden Blade kills Crackshot Corsair in response to its attack trigger, does the 1 damage still happen?
 * A: No. The trigger still resolves, but with Corsair gone it cannot define "here" and does nothing. Had the
 *    text lacked "here" (e.g. "When I attack, deal 1 to an enemy unit"), it would still deal the damage.
 * Rules: 383.4.e (attack triggers → Initial Chain), 811 (Hidden: react later for [0]), 359.2 (referents such
 *        as "here" are evaluated on resolution), LIFO chain resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const CRACKSHOT_CORSAIR = "ogn-130-298";

/** The ruling's hypothetical: same trigger, no "here" — "When I attack, deal 1 to an enemy unit." */
const DEADEYE = {
  abilities: [
    {
      effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  might: 3,
  name: "Deadeye (no 'here')",
  rulesText: "When I attack, deal 1 to an enemy unit.",
};

/**
 * P2's turn (turn 3). P1 controls bf1 with "warden" (4) and hid Hidden Blade there on an earlier turn.
 * P2's attacker (Corsair, or the no-"here" Deadeye) is ready in P2's base.
 */
function board(attacker: "corsair" | "deadeye" = "corsair") {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", attacker === "corsair" ? CRACKSHOT_CORSAIR : DEADEYE, "att");
}

/** P2 attacks bf1; the attack trigger lands on the Initial Chain (target = warden, forced or picked). */
async function attackBf1(game: Game): Promise<void> {
  await game.p2.move("att", "bf1");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2 && d.options.some((o) => (o.card ?? o.key) === "warden")) {
      await game.p2.pick("warden");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "att", controller: P2, triggered: true })]);
  expect(game.state("warden").damage).toBe(0);
}

/** P2 (attacker, priority) passes; P1 flips Hidden Blade at the attacker; both pass → Blade resolves (LIFO). */
async function bladeTheAttackerInResponse(game: Game): Promise<void> {
  expect(game.actingSeat()).toBe(P2);
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("reveal", "blade")).toBe(true);
  await game.p1.reveal("blade");
  // The Blade's target is chosen as it is finalized (355.5): a pick for P1 offering the attacker.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "blade", pendingChoiceType: "choose-target" }, timing: "FIN" });
  await game.p1.pick("att");
  expect(game.chain().map((c) => c.cardId)).toEqual(["att", "blade"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Hidden Blade resolves first
  expect(game.zoneOf("blade")).toBe("trash");
  expect(game.zoneOf("att")).toBe("trash");
}

/** Resolve whatever is left of the chain (the orphaned attack trigger), answering a forced pick if asked. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      if (d.options.length > 0) {
        await game.p2.pick(d.options[0]?.key as string);
      } else {
        await game.p2.decline();
      }
    } else {
      await game.acting().passPriority();
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 04418ea04601dc75 — killing Crackshot Corsair in response blanks its 'here' trigger", () => {
  test("control: unanswered, Corsair's attack trigger deals exactly 1 to the enemy unit here (Warden)", async () => {
    const game = await board().build();
    await attackBf1(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    await drainChain(game);
    expect(game.state("warden").damage).toBe(1);
    expect(game.locationOf("att")).toBe("bf1");
  });

  test("Corsair's trigger is on the chain; P1 may flip Hidden Blade (hidden at bf1) for [0] in response and it KILLS Corsair first (LIFO); Corsair's controller P2 draws 2", async () => {
    const game = await board().build();
    await attackBf1(game);
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await bladeTheAttackerInResponse(game);
    expect(game.p1.energy()).toBe(0); // played from hidden ignoring cost
    // "Its controller draws 2": 2 cards drawn in total (attribution is a separate ruling).
    expect(game.p2.hand().length - p2Hand + (game.p1.hand().length - p1Hand)).toBe(2);
    // The trigger is still pending — it was not removed with its source.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "att", triggered: true })]);
  });

  test("the orphaned trigger then RESOLVES but does nothing: Corsair is no longer 'here', so Warden takes NO damage; combat ends with bf1 still P1's", async () => {
    const game = await board().build();
    await attackBf1(game);
    await bladeTheAttackerInResponse(game);
    await drainChain(game);
    expect(game.state("warden").damage).toBe(0);
    await game.settle();
    expect(game.state("warden").damage).toBe(0);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast (no 'here'): the same play against 'When I attack, deal 1 to an enemy unit' — the dead attacker's trigger STILL deals 1 to Warden", async () => {
    const game = await board("deadeye").build();
    await attackBf1(game);
    await bladeTheAttackerInResponse(game);
    await drainChain(game);
    expect(game.state("warden").damage).toBe(1);
  });
});
