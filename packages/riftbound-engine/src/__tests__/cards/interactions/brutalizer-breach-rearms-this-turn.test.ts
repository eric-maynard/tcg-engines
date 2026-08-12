/**
 * Interaction: an ATTACH TIMESTAMP is shared by the host and the attachment — banishing the host
 * and replaying it RE-ARMS "attached to me this turn" mid-combat.
 *
 *   Brutalizer      (sfd-042-221) Equipment · Calm · 2 · +1 Might · [Equip] [calm]
 *     "If this was attached to me this turn, I have an additional +2 [Might]."
 *   Armed Assailant (sfd-002-221) Unit · Fury · 6 + [fury] · 6 Might
 *     "[Accelerate] … [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to
 *      me for [rainbow] less, even if it's already attached.)"
 *   Temporal Breach (ven-066-166) Spell · Mind · 2 + [mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *
 * Rules: 136.2.d (the "this" in Brutalizer's text is the ATTACHED Brutalizer) · 124 / 124.1 /
 * 056.1 (banished host = a new object, every temporary modification cleared) · 435.4 / 435.4.a /
 * 435.4.b (a detached card's location is the host's last board location; a Gear that becomes
 * present at a battlefield is Recalled during the NEXT Cleanup) · 149.3 / 457.1 / 323.7 (that
 * recall) · 319.3-319.6 / 321 / 321.1 / 309.1 / 320.1 (WHEN that "next Cleanup" is: as soon as the
 * Breach has finished resolving — a queued trigger leaves the turn Closed but does not defer a
 * Cleanup) · 419.4.a ("When you play me" fires again on the replay) · 143.4 / 359.2.c (played unit
 * enters exhausted).
 *
 * Q: Brutalizer was attached LAST turn, so this turn it grants no +2. P1 flips Temporal Breach on
 *    their own Armed Assailant mid-showdown: the host is banished (Brutalizer detaches), the
 *    Assailant is replayed to the same location as a new object, and its Weaponmaster trigger
 *    fires again and re-equips Brutalizer for [rainbow] less. Does the re-attach make "attached to
 *    me this turn" TRUE for the new object (+2 mid-combat)? And where is the detached Brutalizer
 *    while the [Weaponmaster] item is queued?
 * A: Yes to the re-arm. And the Brutalizer is already back in P1's base: it detaches at bf1
 *    (435.4.b), but the Cleanup that follows the Breach's resolution recalls it (323.7) before the
 *    queued trigger resolves — a Closed State does not defer a Cleanup, only a RESOLVING Chain
 *    Item does (321 / 321.1). See the recall test at the bottom of this file.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRUTALIZER = "sfd-042-221";
const ARMED_ASSAILANT = "sfd-002-221";
const TEMPORAL_BREACH = "ven-066-166";

/**
 * Turn 2, P1 active. P1 holds bf1 with the Armed Assailant and a Squire; Brutalizer is a ready
 * gear in P1's base and P1's Temporal Breach is already face down at bf1 (the only way to play a
 * standard-timing spell inside a showdown, rule 811). P2 has a Raider in base to attack with.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 6, power: { calm: 2, mind: 2 } })
    .resources(P2, { energy: 6 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ARMED_ASSAILANT, "aa")
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
    .gear(P1, BRUTALIZER, "brut")
    .facedown(P1, "bf1", TEMPORAL_BREACH, "breach")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** Turn 2: equip Brutalizer to the Assailant. Turn 3: P2 attacks bf1 and passes Focus to P1. */
async function underAttackNextTurn(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "aa" } });
  await game.settle();
  expect(game.state("brut").attachedTo).toBe("aa");
  expect(game.state("aa").might).toBe(9); // 6 printed + 1 base bonus + 2 "attached this turn"

  await game.advanceTurn(); // → turn 3, P2 active: the attach is now LAST turn
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

/** …and P1 flips the Breach on its own Assailant, stopping at the Weaponmaster prompt. */
async function breached(): Promise<Game> {
  const game = await underAttackNextTurn();
  await game.p1.reveal("breach");
  expect(game.decision()).toMatchObject({ kind: "pick", semantics: "target", source: { cardId: "breach" } });
  await game.p1.pick("aa");
  const settled = await game.settle();
  expect(settled.reason).toBe("unanswered");
  return game;
}

describe("Brutalizer × Temporal Breach × Armed Assailant — the attach event re-arms, the equipment's identity does not", () => {
  test("baseline: attached LAST turn, so this turn the conditional +2 is OFF — printed 6 + Brutalizer's base bonus only", async () => {
    const game = await underAttackNextTurn();
    expect(game.state("aa").might).toBe(7);
    expect(game.state("brut").attachedTo).toBe("aa");
  });

  test("the replay is a real play, so Weaponmaster fires again (419.4.a) — a declinable equip prompt naming Brutalizer, even though it is already attached", async () => {
    const game = await breached();
    expect(game.decision()).toMatchObject({
      allowDecline: true,
      kind: "pick",
      seat: P1,
      semantics: "equip",
      source: { cardId: "aa", pendingChoiceType: "weaponmaster-equip" },
    });
    expect((game.decision() as unknown as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["brut"]);
  });

  test("re-attaching makes 'attached to me this turn' TRUE for the NEW object: 6 + 1 + 2 = 9 mid-combat, and Weaponmaster makes the [calm] Equip free ([calm] − [rainbow])", async () => {
    const game = await breached();
    const before = game.p1.resources();
    await game.p1.pick("brut");
    await game.settle();
    expect(game.state("brut").attachedTo).toBe("aa");
    expect(game.state("aa").attachments).toContain("brut");
    expect(game.state("aa").might).toBe(9);
    expect(game.p1.resources()).toEqual(before); // [calm] reduced by [rainbow] costs nothing
    expect(game.violations()).toEqual([]);
  });

  test("the replayed Assailant is a NEW object (124 / 124.1): same location, entered exhausted (143.4 / 359.2.c), no damage carried over", async () => {
    const game = await breached();
    await game.p1.pick("brut");
    await game.settle();
    expect(game.zoneOf("aa")).toBe("battlefield-bf1");
    expect(game.locationOf("aa")).toBe("bf1");
    expect(game.state("aa").isExhausted).toBe(true);
    expect(game.state("aa").damage).toBe(0);
  });

  test("Brutalizer itself never left the board — it keeps its own object identity; what re-arms is the ATTACH EVENT, not the equipment's memory", async () => {
    const game = await breached();
    // With the host in banishment the Brutalizer is still a board card — detached at bf1 (435.4.b)
    // and then recalled to base by the Cleanup that follows the Breach's resolution (323.7).
    expect(game.zoneOf("brut")).toBe("base");
    expect(game.state("brut").attachedTo).toBeUndefined();
    await game.p1.pick("brut");
    await game.settle();
    expect(game.zoneOf("brut")).toBe("battlefield-bf1");
    expect(game.zoneOf("brut")).not.toBe("trash");
  });

  // RULING — this test previously asserted the OPPOSITE (`test.failing`: the loose Brutalizer must
  // still be AT bf1 when the [Weaponmaster] prompt opens, on the theory that a queued trigger holds
  // the Cleanup off). That reading is wrong; do not flip it back.
  // 435.4.b still stands and is what `leave-board.ts detachOnLeave` implements: the host changed
  // zones from a board zone to a non-board one, so the Brutalizer detaches AT bf1, not into base.
  // But 435.4.a / 149.3 / 457.1 / 323.7 recall an unattached non-Unit Gear at a Battlefield during
  // the NEXT Cleanup, and that Cleanup is the one the Breach's own resolution makes Outstanding —
  // 319.3 (a Pending Item added to the Chain), 319.4 (it is Finalized), 319.5 (the Breach leaves
  // the Chain), 319.6 (objects left and entered the Board). Rule 321 defers a Cleanup ONLY while a
  // Chain Item is RESOLVING (321.1 keeps it Outstanding until the resolution ends); a Closed State
  // does not — 309.1 makes that merely "a Chain exists" and 320.1 describes a Cleanup running with
  // items on the Chain. Only the steps 323 itself conditions on an Open State (323.6 control lapse,
  // 323.12 / 323.13 opening a Showdown / Combat) sit out; 323.7 is unconditional.
  // So by the time the queued [Weaponmaster] item resolves and offers the re-equip, the Brutalizer
  // is already back in P1's base and is equipped out of base (149.2) — which is why the re-equip
  // tests above still see it land at bf1 afterwards. Same shape as
  // `rulings/eye-of-the-herald-fb0ba503d6b40afd` 4a, where the loose Eye is at base while the Eye's
  // move trigger is still waiting on the Chain. Confirmed by the Spinning Axe ruling ("it detaches
  // and stays at the battlefield until the next Cleanup Recalls it") and by the banish-and-replay
  // ruling, which has the pending item suppress only the CONTROL step, not the Cleanup itself.
  test("the detached Brutalizer is recalled to base by the Cleanup that follows the Breach's resolution — the queued [Weaponmaster] item does not hold that Cleanup off (321 / 321.1 / 323.7)", async () => {
    const game = await breached();
    expect(game.zoneOf("brut")).toBe("base");
    expect(game.locationOf("brut")).toBe("base");
    expect(game.state("brut").attachedTo).toBeUndefined();
  });

  test("declined branch: with no re-equip the Brutalizer is unattached and grants nothing (the Assailant is back to printed 6), and it ends up recalled to P1's base (149.3 / 435.4.a / 323.7)", async () => {
    const game = await breached();
    await game.p1.decline();
    await game.settle();
    expect(game.state("brut").attachedTo).toBeUndefined();
    expect(game.state("aa").attachments).toEqual([]);
    expect(game.state("aa").might).toBe(6);
    expect(game.zoneOf("brut")).toBe("base");
    expect(game.locationOf("brut")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
