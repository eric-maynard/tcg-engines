/**
 * A REFUSAL MUST CARRY ITS CAUSE.
 *
 * A blocked action used to do one of two things, and a player could tell
 * neither from a bug: vanish from the offered set (an illegally-timed [Action]
 * was not even enumerated as an invalid move, so clicking it said nothing), or
 * fail with an internal string ("no legal variant matches to=\"bfB\"", which
 * reads as a claim about the destination — the one thing that was fine).
 *
 * There is now ONE channel. Wherever legality is actually decided, the move's
 * `condition` returns a `Refusal` (`game-definition/refusal.ts`): a stable
 * `code`, the RULE it comes from, and a human `message` naming the OBJECT that
 * blocks it. The core carries it on `EnumeratedMove.validationError`, the
 * harness reads it back with `refusalOf` and puts it on the error it throws,
 * and the app server ships the same rows to the client. This spec fixes the
 * contract for the four blocked SHAPES, so the next blocked action of each
 * shape is explained for free:
 *
 *   1. wrong timing        — 331.1.a / 338.1.a.2 / 159.2.a.1
 *   2. a play-forbidding rider — 054.1
 *   3. a static that forbids a destination — 358.3.a
 *   4. a mover without [Ganking] — 144.4.c.1 / 810.1.b
 *
 * Two invariants, both of which the engine broke before this existed:
 *   - a refusal names the OBJECT, never only the argument that was refused;
 *   - a listed-but-refused action changes nothing when it is attempted.
 */
import { describe, expect, test } from "bun:test";
import type { PlayerId } from "@tcg/core";
import { P1, P2, scenario } from "../../harness";
import { refusalOf } from "../../game-definition/refusal";

const REBUKE = "ogn-172-298"; // [Action] Return a unit at a battlefield to its owner's hand.
const LULLABY = "unl-190-219"; // [Reaction] Counter a spell. Its controller can't play spells this turn.
const MAGESEEKER_WARDEN = "ogn-070-298"; // opponents can only play units to their base
const DEADBLOOM_PREDATOR = "ogn-161-298"; // "You may play me to an occupied enemy battlefield."
const COMMANDER_LEDROS = "ogn-231-298"; // [Ganking]
const SUNLIT_GUARDIAN = "ogn-054-298"; // no [Ganking]

const ACTION_BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** Every refusal says the same four things, whatever shape produced it. */
function expectWellFormed(refusal: ReturnType<typeof refusalOf>) {
  expect(refusal).toBeDefined();
  expect(typeof refusal?.code).toBe("string");
  expect(refusal?.code).not.toBe("");
  // The rule id is a real core-rules id ("338.1.a.2"), so a client can link it…
  expect(refusal?.rule ?? "").toMatch(/^\d{3}(\.\d+)*(\.[a-z])?(\.\d+)*$/);
  // …and the message quotes it, so a plain-text surface loses nothing.
  expect(refusal?.message ?? "").toContain(`rule ${refusal?.rule}`);
}

describe("shape 1 — wrong timing (331.1.a / 338.1.a.2 / 159.2.a.1)", () => {
  async function chainLoadedOnOpponentsTurn() {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "bf1", { might: 3, name: "Theirs" }, "theirs")
      .resources(P1, { energy: 4, power: { chaos: 2, rainbow: 2 } })
      .resources(P2, { energy: 3 })
      .hand(P1, REBUKE, "rebuke")
      .hand(P1, LULLABY, "lullaby")
      .hand(P2, ACTION_BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "mine" });
    await game.p2.passPriority();
    return game;
  }

  test("the [Action] is ENUMERATED as an invalid move and the reason names the timing, not just 'condition not met'", async () => {
    const game = await chainLoadedOnOpponentsTurn();
    const rows = game.engine.enumerateMoves(P1 as PlayerId, { moveIds: ["playSpell"], validOnly: false });
    const row = rows.find((m) => (m.params as { cardId?: string }).cardId === game.card("rebuke"));
    expect(row?.isValid).toBe(false);

    const refusal = refusalOf(row?.validationError);
    expectWellFormed(refusal);
    expect(refusal?.code).toBe("TIMING_ILLEGAL");
    expect(refusal?.message).toMatch(/\[Action\]/);
    // It names the STATE that refuses it — here a loaded chain, where only a
    // [Reaction] is legal. A reason that described some OTHER state ("only on
    // your turn", with no chain in sight) would be a false explanation, which
    // is worse than a bare refusal, so the wording follows the turn state.
    expect(refusal?.message).toMatch(/chain/i);
    expect(refusal?.message).toMatch(/\[Reaction\]/);
    // It names the card it refuses, so a client can put it on that tile.
    expect(refusal?.subjectId).toBe(game.card("rebuke"));
  });

  test("the legally-timed [Reaction] in the same hand carries NO refusal (a refusal is not a blanket 'you may not act')", async () => {
    const game = await chainLoadedOnOpponentsTurn();
    const rows = game.engine.enumerateMoves(P1 as PlayerId, { moveIds: ["playSpell"], validOnly: false });
    const lullaby = rows.filter((m) => (m.params as { cardId?: string }).cardId === game.card("lullaby"));
    expect(lullaby.some((m) => m.isValid)).toBe(true);
    expect(lullaby.filter((m) => !m.isValid).every((m) => refusalOf(m.validationError) === undefined)).toBe(true);
  });

  test("listing is not offering: attempting the refused play leaves the position byte-identical", async () => {
    const game = await chainLoadedOnOpponentsTurn();
    const before = game.stateHash();
    const attempt = await game.p1.try((p) => p.cast("rebuke", { targets: "theirs" }));
    expect(attempt.ok).toBe(false);
    expect(game.stateHash()).toBe(before);
  });
});

describe("shape 2 — a rider that forbids playing (054.1)", () => {
  test("the refusal names the card that imposed the rider", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .resources(P1, { energy: 4, power: { chaos: 2, rainbow: 2 } })
      .resources(P2, { energy: 3 })
      .hand(P1, LULLABY, "lullaby")
      .hand(P2, ACTION_BOLT, "bolt")
      .hand(P2, ACTION_BOLT, "bolt2")
      .build();
    await game.p2.cast("bolt", { targets: "mine" });
    await game.p2.passPriority();
    await game.p1.cast("lullaby", { targets: "bolt" });
    await game.settle();

    const rows = game.engine.enumerateMoves(P2 as PlayerId, { moveIds: ["playSpell"], validOnly: false });
    const row = rows.find((m) => (m.params as { cardId?: string }).cardId === game.card("bolt2"));
    expect(row?.isValid).toBe(false);

    const refusal = refusalOf(row?.validationError);
    expectWellFormed(refusal);
    expect(refusal?.code).toBe("SPELLS_FORBIDDEN_THIS_TURN");
    expect(refusal?.rule).toBe("054.1");
    // The OBJECT is the rider's source — "Lilting Lullaby: you can't play spells this turn".
    expect(refusal?.objectId).toBe(game.card("lullaby"));
    expect(refusal?.objectName).toBe("Lilting Lullaby");
    expect(refusal?.message).toMatch(/can'?t play spells/i);
  });
});

describe("shape 3 — a static that forbids a destination (358.3.a)", () => {
  test("the refused play names the Mageseeker Warden, not the battlefield", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 20, power: { body: 6, calm: 6 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "bfA", { might: 2, name: "Anchor A" }, "anchorA")
      .unit(P2, "bfB", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "bfB", MAGESEEKER_WARDEN, "warden")
      .hand(P1, DEADBLOOM_PREDATOR, "pred")
      .build();

    const attempt = await game.p1.try((p) => p.play("pred", { to: "bfB" }));
    expect(attempt.ok).toBe(false);
    const message = (attempt as { error: { message: string } }).error.message;
    expect(message).toContain("Mageseeker Warden");
    expect(message).toContain("rule 358.3.a");

    const refusal = (attempt as { error: { detail?: { refusal?: ReturnType<typeof refusalOf> } } }).error.detail
      ?.refusal;
    expectWellFormed(refusal);
    expect(refusal?.code).toBe("PLAY_RESTRICTED_TO_BASE");
    expect(refusal?.objectId).toBe(game.card("warden"));
    expect(game.zoneOf("pred")).toBe("hand");
  });
});

describe("shape 4 — a mover without [Ganking] (144.4.c.1 / 810.1.b)", () => {
  test("the refused group move names the unit that cannot take the leg, not the destination", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 10, power: { calm: 5, order: 5 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "bfA", COMMANDER_LEDROS, "ledros")
      .unit(P1, "bfA", SUNLIT_GUARDIAN, "guardian")
      .unit(P1, "bfB", { might: 1, name: "Beacon" }, "beacon")
      .build();

    const attempt = await game.p1.try((p) => p.move(["ledros", "guardian"], "bfB"));
    expect(attempt.ok).toBe(false);
    const message = (attempt as { error: { message: string } }).error.message;
    expect(message).toContain("Sunlit Guardian");
    expect(message).toContain("Ganking");
    expect(message).toContain("rule 810.1.b");

    const refusal = (attempt as { error: { detail?: { refusal?: ReturnType<typeof refusalOf> } } }).error.detail
      ?.refusal;
    expectWellFormed(refusal);
    expect(refusal?.code).toBe("MOVE_NEEDS_GANKING");
    expect(refusal?.objectId).toBe(game.card("guardian"));

    // Nothing moved and nothing exhausted: a refusal is not a partial action.
    expect(game.locationOf("ledros")).toBe("bfA");
    expect(game.locationOf("guardian")).toBe("bfA");
    expect(game.state("ledros").isExhausted).toBe(false);
  });

  test("the same group WITHOUT the ungifted unit is legal — the refusal was about that unit alone", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 10, power: { calm: 5, order: 5 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "bfA", COMMANDER_LEDROS, "ledros")
      .unit(P1, "bfA", SUNLIT_GUARDIAN, "guardian")
      .unit(P1, "bfB", { might: 1, name: "Beacon" }, "beacon")
      .build();
    await game.p1.move("ledros", "bfB");
    expect(game.locationOf("ledros")).toBe("bfB");
  });
});
