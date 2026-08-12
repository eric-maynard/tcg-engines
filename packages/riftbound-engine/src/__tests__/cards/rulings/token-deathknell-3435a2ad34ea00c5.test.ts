/**
 * Ruling 3435a2ad34ea00c5 — (no specific card) [Deathknell] on a token that is bounced.
 *   Exercised with an inline 2-Might TOKEN unit carrying "[Deathknell] — Draw 1" and
 *   Zaunite Bouncer (OGN-188 → ogn-188-298) "When you play me, return another unit at a battlefield
 *   to its owner's hand."
 *
 * Q: Does returning a token unit to hand trigger its [Deathknell]?
 * A: No. [Deathknell]'s trigger condition is the permanent being KILLED and sent to the trash
 *    (808.1.d). A unit moved to hand — or any zone other than the trash — never dies, so the ability
 *    never triggers. Tokens can carry Deathknell; that requirement does not change for them (and the
 *    token simply ceases to exist once it leaves the board).
 * Rules: 808.1.d (Deathknell = killed → trash), 186.1 (a token that leaves the board ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ZAUNITE_BOUNCER = "ogn-188-298"; // 4 Energy + [chaos][chaos]

/** A TOKEN unit with "[Deathknell] — Draw 1". */
const SENTRY_TOKEN = {
  abilities: [
    { effect: { amount: 1, type: "draw" }, keyword: "Deathknell", type: "keyword" },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  isToken: true,
  might: 2,
  name: "Test Sentry Token",
  rulesText: "[Deathknell] — Draw 1. (When I die, get the effect.)",
} as const;

/** Base-speed "Deal 9 to a unit." */
const SMITE = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Smite",
  rulesText: "Deal 9 to a unit.",
  timing: "standard",
} as const;

/** P1 controls bf1 with an Anchor and the Deathknell token. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .unit(P1, "bf1", SENTRY_TOKEN, "token");
}

describe("Ruling 3435a2ad34ea00c5 — bouncing a token to hand does not trigger its [Deathknell]", () => {
  test("the token really does carry Deathknell — killing it draws a card", async () => {
    const game = await board().hand(P1, SMITE, "smite").build();
    expect(game.state("token").isToken).toBe(true);
    expect(game.state("token").keywords).toContain("Deathknell");
    const handBefore = game.p1.hand().length;
    await game.p1.cast("smite", { targets: "token" });
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1); // Smite left hand, Deathknell drew 1
    expect(game.has("token")).toBe(false); // the token ceased to exist (186.1)
    expect(game.zoneOf("token")).toBe("gone");
    expect(game.violations()).toEqual([]);
  });

  test("returning it to hand instead: no Deathknell draw, and the token simply ceases to exist", async () => {
    const game = await board().hand(P1, ZAUNITE_BOUNCER, "bouncer").build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("bouncer", { to: "bf1" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("token"); // the trigger's target, named at finalization
    await game.settle();
    expect(game.locationOf("bouncer")).toBe("bf1");
    // Bouncer left hand; the token did NOT arrive there (186.1) and NOTHING was drawn.
    expect(game.p1.hand().length).toBe(handBefore - 1);
    expect(game.has("token")).toBe(false);
    expect(game.zoneOf("token")).toBe("gone");
    expect(game.p1.trash()).not.toContain("token"); // it never went to the trash, so it never died
    expect(game.violations()).toEqual([]);
  });

  test("the same for a non-token unit: a bounce is not a death, so no Deathknell", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
      .unit(P1, "bf1", { ...SENTRY_TOKEN, isToken: false, name: "Test Sentry" }, "sentry")
      .hand(P1, ZAUNITE_BOUNCER, "bouncer")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("bouncer", { to: "bf1" });
    await game.p1.pick("sentry");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("hand"); // a real card does land in hand
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1); // …and that is the only hand change
    expect(game.violations()).toEqual([]);
  });
});
