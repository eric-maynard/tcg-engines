/**
 * Ruling 8e8821253a1ba3c1 — Abandoned Hall (UNL-205 → unl-205-219, Battlefield: "When a player plays a spell, they may
 *   give a unit they control here +1 [Might] this turn.") × Challenge (OGN-128 → ogn-128-298, [Action] [2][body]:
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other.")
 *   (Abandon unl-131-219 is listed on the ruling only by name similarity.)
 *
 * Q: My unit is at Abandoned Hall; I Challenge with it and an enemy unit. Does the Hall's +1 apply before or after?
 * A: After. Challenge is played → reaction window → resolves (damage at current Mights). Only once it has finished
 *    resolving is "a player plays a spell" met; the Hall trigger then goes on the chain and resolves (+1 to a unit you
 *    control there). If your unit died to Challenge it is no longer there to receive the +1.
 * Rules: 383.4.b ("when you play" a spell = after it resolves), 332, 359 (resolution), 364 (turn-duration bonus).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const CHALLENGE = "ogn-128-298";

/** P1's turn: Duelist (`might`) stands at the live Abandoned Hall (P1's); P2's Brute (`enemyMight`) in P2's base; P1 holds Challenge with [2][body]. */
function board(might: number, enemyMight: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .unit(P1, "hall", { might, name: "Duelist" }, "duelist")
    .unit(P2, "base", { might: enemyMight, name: "Brute" }, "brute")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 8e8821253a1ba3c1 — Abandoned Hall's +1 comes AFTER Challenge has resolved", () => {
  test("casting Challenge puts ONLY Challenge on the chain — the Hall has not triggered yet, and the Duelist is still at printed Might during the reaction window", async () => {
    const game = await board(3, 2).build();
    await game.p1.cast("challenge", { targets: ["duelist", "brute"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", controller: P1, targets: ["duelist", "brute"] })]);
    expect(game.chain().some((c) => c.cardId === "hall")).toBe(false);
    expect(game.state("duelist").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // both players may react first
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("Challenge resolves at CURRENT Mights (3 ↔ 2: Brute dies, Duelist takes 2); THEN the Hall trigger goes on the chain for P1, who gives the surviving Duelist +1 (→ 4) this turn", async () => {
    const game = await board(3, 2).build();
    await game.p1.cast("challenge", { targets: ["duelist", "brute"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Challenge resolves
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash"); // took 3
    expect(game.state("duelist")).toMatchObject({ damage: 2, might: 3 }); // took 2 — and no +1 was in effect
    // Now the Hall's "when a player plays a spell" trigger is pending for the spell's player (P1).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "hall", pendingChoiceType: "opt-in" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hall", controller: P1, triggered: true })]);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hall" } });
      await game.p1.pick("duelist");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hall", targets: ["duelist"] })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("duelist")).toMatchObject({ might: 4, mightModifier: 1 });
    // "this turn"
    await game.advanceTurn();
    expect(game.state("duelist").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("if the Duelist (2) dies to the Brute (5) during Challenge, it is gone before the Hall trigger — P1 has no unit there to give +1 to", async () => {
    const game = await board(2, 5).build();
    await game.p1.cast("challenge", { targets: ["duelist", "brute"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("duelist")).toBe("trash");
    expect(game.state("brute").damage).toBe(2);
    // The Hall may still trigger (a spell was played), but it can never name the dead Duelist.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("duelist");
        await (d.allowDecline ? game.seat(d.seat).decline() : game.seat(d.seat).pick(d.options[0]?.key as string));
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).yes();
      } else if (d.kind === "action") {
        await game.acting().passPriority();
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("duelist")).toBe("trash");
    expect(game.state("duelist").mightModifier).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
