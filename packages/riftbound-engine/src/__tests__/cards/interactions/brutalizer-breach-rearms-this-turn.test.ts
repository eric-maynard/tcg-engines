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
 * present at a battlefield is Recalled during the NEXT Cleanup) · 149.3 / 323.7 (that recall) ·
 * 419.4.a ("When you play me" fires again on the replay) · 143.4 / 359.2.c (played unit enters
 * exhausted).
 *
 * Q: Brutalizer was attached LAST turn, so this turn it grants no +2. P1 flips Temporal Breach on
 *    their own Armed Assailant mid-showdown: the host is banished (Brutalizer detaches), the
 *    Assailant is replayed to the same location as a new object, and its Weaponmaster trigger
 *    fires again and re-equips Brutalizer for [rainbow] less. Does the re-attach make "attached to
 *    me this turn" TRUE for the new object (+2 mid-combat)? And if P1 declines, does the detached
 *    Brutalizer sit unattached at the battlefield until it is recalled at cleanup?
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
    // Mid-resolution, with the host in banishment, the Brutalizer is still a board card.
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("brut"));
    expect(game.state("brut").attachedTo).toBeUndefined();
    await game.p1.pick("brut");
    await game.settle();
    expect(game.zoneOf("brut")).toBe("battlefield-bf1");
    expect(game.zoneOf("brut")).not.toBe("trash");
  });

  // Expected (435.4 / 435.4.b): the host changed zones from a board zone to a non-board zone, so
  // the detached Brutalizer's location is the last location the host occupied — the contested bf1
  // — and 435.4.a / 149.3 / 323.7 only recall it during the NEXT Cleanup. Mid-resolution (a Closed
  // State) no Cleanup has run, so it must still be present at bf1 when the Weaponmaster prompt
  // opens.
  // Half fixed: `leave-board.ts detachOnLeave` now leaves the Equipment at the host's last board
  // location instead of teleporting it to `base` (435.4.b). What still fires too early is the
  // RECALL: the maintenance pass that follows the Breach's replay runs `performCleanup` step 5
  // while the [Weaponmaster] item is still queued, and recalls the loose Gear to base there.
  // Deferring that recall needs the resolution boundary itself to cover the replay
  // (`chain/resolution-guard.ts` is only held around `resolve.ts`'s own execute), which is a
  // separate change: gating step 5 on "an item is on the Chain" instead breaks the symmetric
  // reading in `rulings/eye-of-the-herald-fb0ba503d6b40afd` 4a, where a loose Eye IS at base with a
  // trigger still waiting.
  test.failing("BUG: the detached Brutalizer is teleported to base the instant its host is banished — 435.4.b puts it at the host's last location (bf1) and 435.4.a / 149.3 / 323.7 recall it only during the NEXT Cleanup", async () => {
    const game = await breached();
    expect(game.locationOf("brut")).toBe("bf1");
    expect(game.zoneOf("brut")).toBe("battlefield-bf1");
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
