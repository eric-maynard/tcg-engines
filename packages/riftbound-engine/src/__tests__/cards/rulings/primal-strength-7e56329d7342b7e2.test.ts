/**
 * Ruling 7e56329d7342b7e2 — Primal Strength (OGN-154 → ogn-154-298) · Action · [4][body] "Give a unit +7 [Might] this turn."
 *   × Carnivorous Snapvine (OGN-149 → ogn-149-298) · [5][body][body] · 6 Might "When you play me, choose an enemy unit at a battlefield.
 *     We deal damage equal to our Mights to each other." × Discipline (OGN-058 → ogn-058-298) · Reaction · [2] "+2 [Might] this turn. Draw 1."
 *
 * Q: Can I play Primal Strength on Snapvine after playing it, so it fights with the extra Might?
 * A: No — Primal Strength is Action speed; only Reactions can be played in response to Snapvine's play trigger. Discipline
 *    (Reaction) works.
 * Rules: 309.1.a (a chain is a Closed state → Reactions only), 383 (the play trigger is on the chain), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRIMAL_STRENGTH = "ogn-154-298";
const SNAPVINE = "ogn-149-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn: [11] + [body]×3 (Snapvine 5+bb, Primal 4+b, Discipline 2). P2 holds bf1 with a 6-Might Brute. */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { body: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .hand(P1, SNAPVINE, "vine")
    .hand(P1, PRIMAL_STRENGTH, "primal")
    .hand(P1, DISCIPLINE, "disc");
}

/** P1 plays Snapvine (to base); its play trigger naming the Brute is on the chain and P1 holds priority. */
async function snapvinePlayed(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("cast", "primal")).toBe(true); // legal in the open main phase — just not once the trigger is pending
  await game.p1.play("vine");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("brute");
  }
  expect(game.zoneOf("vine")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vine", controller: P1, targets: ["brute"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 7e56329d7342b7e2 — no Primal Strength in response to Snapvine's trigger (Action speed); Discipline (Reaction) is fine", () => {
  test("with Snapvine's trigger pending, Primal Strength (Action) is NOT legal for P1 even with [6][body] left; Discipline (Reaction) IS", async () => {
    const game = await snapvinePlayed();
    expect(game.p1.energy()).toBe(6);
    expect(game.p1.power("body")).toBe(1);
    expect(game.p1.can("cast", "primal")).toBe(false);
    const r = await game.p1.try((p) => p.cast("primal", { targets: "vine" }));
    expect(r.ok).toBe(false);
    expect(game.p1.can("cast", "disc")).toBe(true);
  });

  test("control: unanswered, the fight is 6 vs 6 — Snapvine and the Brute kill each other", async () => {
    const game = await snapvinePlayed();
    await game.settle();
    expect(game.zoneOf("vine")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
  });

  test("Discipline on Snapvine in response resolves first (LIFO): Snapvine is 8 when the trigger resolves — it deals 8 (Brute dies) and takes 6 (survives, 6 damage on 8 Might); P1 drew 1", async () => {
    const game = await snapvinePlayed();
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "vine" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vine", "disc"]);
    while (game.chain().length > 1 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("vine").might).toBe(8);
    expect(game.state("brute").damage).toBe(0); // trigger not yet resolved
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("vine")).toMatchObject({ damage: 6, might: 8, zone: "base" });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("after the trigger has resolved (open state again) Primal Strength is castable — but too late to matter for the fight", async () => {
    const game = await snapvinePlayed();
    await game.p1.cast("disc", { targets: "vine" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "primal")).toBe(true);
  });
});
