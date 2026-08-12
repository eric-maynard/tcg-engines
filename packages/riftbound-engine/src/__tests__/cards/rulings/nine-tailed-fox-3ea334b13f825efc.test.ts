/**
 * Ruling 3ea334b13f825efc — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend · Ahri
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum
 *    of 1 [Might]."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) · 3 Might · "When I attack or defend, give an enemy unit
 *     here -2 [Might] this turn, to a minimum of 1 [Might]." — the attacker's own attack trigger.
 *
 * Q: When does the legend's effect trigger, and where does it sit relative to "when I attack" effects?
 * A: It triggers the moment attackers and defenders are established. It is a DEFENDER-side trigger, so it
 *    is put on the initial chain above the attacker's triggers — and because the chain resolves last-in
 *    first-out, the defender's trigger resolves BEFORE the attacker's.
 * Rules: 383.4.e/f (attack & defend triggers fire on gaining the designation), 464.2.c (designations),
 *        340 (the chain resolves last-in first-out; the turn player's items go on first).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const AHRI_INQUISITIVE = "ogn-119-298";

/** P2's turn. P1 has the Fox legend and holds bf1 with a 4-Might Sentry; P2's Ahri, Inquisitive attacks from home. */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "base", AHRI_INQUISITIVE, "attacker");
}

/** P2 attacks bf1; both triggers form the initial chain. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("attacker", "bf1");
  expect(game.state("attacker").combatRole).toBe("attacker");
  expect(game.state("sentry").combatRole).toBe("defender");
  return game;
}

describe("Ruling 3ea334b13f825efc — the Fox is a defender trigger that fires as designations are handed out", () => {
  test("ruling 3ea334b13f825efc (1) — the moment the attacker is designated, the Fox is on the chain aimed at it (nothing has resolved: it is still a 3)", async () => {
    const game = await attacked();
    expect(game.chain().some((c) => c.cardId === "fox" && c.controller === P1 && c.triggered)).toBe(true);
    expect(game.state("attacker").might).toBe(3);
  });

  test("ruling 3ea334b13f825efc (2) — both sides' triggers form ONE initial chain, with the DEFENDER's (the Fox) placed above the attacker's", async () => {
    const game = await attacked();
    const ids = game.chain().map((c) => c.cardId);
    expect(ids).toContain("fox");
    expect(ids).toContain("attacker");
    expect(ids.indexOf("fox")).toBeGreaterThan(ids.indexOf("attacker")); // later on the chain = resolves first
  });

  test("ruling 3ea334b13f825efc (3) — LIFO: the Fox's -1 lands on the attacker FIRST, while the attacker's own trigger is still waiting", async () => {
    const game = await attacked();
    if (game.decision()?.kind === "pick") {
      await game.acting().pick("sentry"); // Ahri, Inquisitive names its victim at finalization
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("attacker").might).toBe(2); // 3 − 1 from the Fox
    expect(game.state("sentry").might).toBe(4); // the attacker's own trigger has not resolved yet
    expect(game.chain().map((c) => c.cardId)).toEqual(["attacker"]);
  });

  test("…and then the attacker's trigger resolves onto the defender", async () => {
    const game = await attacked();
    if (game.decision()?.kind === "pick") {
      await game.acting().pick("sentry");
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("sentry").might).toBe(2); // 4 − 2
    expect(game.state("attacker").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("the Fox only cares about battlefields YOU control: an attack on somebody else's battlefield does not trigger it", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, NINE_TAILED_FOX, "fox")
      .battlefield("bf2", { controller: null })
      .unit(P2, "base", AHRI_INQUISITIVE, "attacker")
      .build();
    await game.p2.move("attacker", "bf2");
    expect(game.chain().some((c) => c.cardId === "fox")).toBe(false);
    await game.settle();
    expect(game.state("attacker").might).toBe(3);
  });
});
