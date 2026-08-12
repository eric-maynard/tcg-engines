/**
 * Ruling a483e52f2d7d0492 — paying [Deflect] once per TRIGGER, not once per combat.
 *   Cards: Leona, Determined (OGN-238 → ogn-238-298) · 4 [Might] "[Shield] When I attack, stun an
 *     enemy unit here." (two copies attacking)
 *   × Navori Scout (SFD-037 → sfd-037-221) · 4 [Might] "[Deflect] (Opponents must pay [rainbow] to
 *     choose me with a spell or ability.)" — the lone defender.
 *
 * Q: Several attackers whose triggers all want to choose the same [Deflect] unit — do I pay per trigger?
 * A: Yes, separately for each triggered ability. You are never forced to pay: decline and that ability
 *    is removed from the chain with no effect (that is not being countered). An ability whose Deflect
 *    surcharge you cannot afford is removed without even being offered. Nuance: a unit already stunned
 *    cannot be stunned again, so paying twice for two stun triggers buys nothing.
 * Rules: 809.1.c.1 ([Deflect] surcharge is owed per choice), 383.3.b / 402.2 (a trigger's targets and
 *    base cost are settled at finalization), 404.1 / 404.2 (unpaid or unpayable ⇒ removed from the
 *    chain), 402.4.a (removal is not a counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA_DETERMINED = "ogn-238-298";
const NAVORI_SCOUT = "sfd-037-221";

/** P1's turn. Two Leonas in base; P2 holds bf1 with the [Deflect] Scout alone. */
function board(rainbow: number) {
  return scenario()
    .resources(P1, { energy: 0, power: { rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", NAVORI_SCOUT, "scout")
    .unit(P1, "base", LEONA_DETERMINED, "leonaA")
    .unit(P1, "base", LEONA_DETERMINED, "leonaB");
}

/** Both Leonas attack together. */
async function attack(rainbow: number): Promise<Game> {
  const game = await board(rainbow).build();
  await game.p1.move(["leonaA", "leonaB"], "bf1");
  expect(game.state("leonaA").combatRole).toBe("attacker");
  expect(game.state("leonaB").combatRole).toBe("attacker");
  return game;
}

/** Drain the chain by passing priority until it is empty. */
async function drain(game: Game): Promise<void> {
  while (game.chain().length > 0) {
    await game.acting().passPriority();
  }
}

describe("Ruling a483e52f2d7d0492 — one [Deflect] payment per triggered ability", () => {
  test("each attack trigger raises its OWN 'pay [rainbow] ([Deflect])' question", async () => {
    const game = await attack(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.prompt).toContain("[Deflect]");
    expect(game.decision()?.prompt).toContain("leonaA");
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.prompt).toContain("leonaB"); // a SECOND, separate payment
  });

  test("paying both costs two [rainbow] and puts both triggers on the chain", async () => {
    const game = await attack(2);
    await game.p1.yes();
    await game.p1.yes();
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId).slice().sort()).toEqual(["leonaA", "leonaB"]);
    expect(game.p1.power("rainbow")).toBe(0);
    await drain(game);
    expect(game.state("scout").isStunned).toBe(true);
  });

  test("you may decline: that ability leaves the chain with no effect, and its [rainbow] is not spent", async () => {
    const game = await attack(2);
    await game.p1.no(); // decline for leonaA
    await game.p1.yes(); // pay for leonaB
    expect(game.chain().map((c) => c.cardId)).toEqual(["leonaB"]);
    expect(game.p1.power("rainbow")).toBe(1); // only one payment was made
    await drain(game);
    expect(game.state("scout").isStunned).toBe(true);
  });

  test("declining BOTH leaves nothing on the chain and the Scout unstunned — declining is not a counter", async () => {
    const game = await attack(2);
    await game.p1.no();
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.state("scout").isStunned).toBe(false);
    expect(game.zoneOf("leonaA")).toBe("battlefield-bf1"); // the units themselves are untouched
  });

  test("with only one [rainbow] the second trigger is unpayable and is removed without being offered", async () => {
    const game = await attack(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toContain("leonaA");
    await game.p1.yes();
    expect(game.chain().map((c) => c.cardId)).toEqual(["leonaA"]); // leonaB's trigger is gone
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("with no [rainbow] at all neither trigger is even asked about", async () => {
    const game = await attack(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.state("scout").isStunned).toBe(false);
  });

  test("nuance: the second payment buys nothing — an already-stunned unit cannot be stunned again", async () => {
    const both = await attack(2);
    await both.p1.yes();
    await both.p1.yes();
    await both.acceptTriggerOrder();
    await drain(both);
    const one = await attack(2);
    await one.p1.no();
    await one.p1.yes();
    await drain(one);
    expect(both.state("scout").isStunned).toBe(one.state("scout").isStunned);
    expect(both.state("scout").isStunned).toBe(true);
    expect(both.violations()).toEqual([]);
  });
});
