/**
 * Interaction: Lucian, Merciless (sfd-113-221) 3 Might, [Weaponmaster], "The first time I conquer
 *     each turn, ready me."
 *   × Temporal Breach (ven-066-166) "[Hidden] Banish a unit, then its owner plays it to the same
 *     location, ignoring its cost."
 *   × Retreat (ogn-104-298) "[Reaction] Return a friendly unit to its owner's hand. Its owner
 *     channels 1 rune exhausted."
 *   × Doran's Blade (sfd-095-221) "[Equip] [body]"   × On the Hunt (sfd-204-221) "Ready your units."
 *
 * Question: "the first time I conquer EACH TURN" is a per-OBJECT memory. Does a round trip through
 * banishment (or through hand) hand P1 a second ready off one card in the same turn — and what else
 * does the trip reset? Contrast with a relocation that is not a zone change.
 *
 * Rules: 124 / 124.1 (a card that changes zones becomes a NEW object; nothing about the old object
 * is tracked in any capacity), 056.2 (it goes to its owner's zone), 705 (continuous effects on the
 * old object end), 143.4 / 359.2.c (a unit enters the board exhausted), 419.4.a ("when you play me"
 * triggers on every play, including one an effect makes), 359.2.c / 455 / 456 / 458.1 (a move or a
 * Recall relocates without a zone change and leaves damage and statuses untouched), 143.4 (play
 * costs), 811.1.b (Hidden: hide for [rainbow], react later for [0]).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const LUCIAN_MERCILESS = "sfd-113-221";
const TEMPORAL_BREACH = "ven-066-166";
const RETREAT = "ogn-104-298";
const DORANS_BLADE = "sfd-095-221";
const ON_THE_HUNT = "sfd-204-221";

/**
 * Two uncontrolled battlefields and a ready Lucian in P1's base, with Temporal Breach, Retreat and
 * On the Hunt in hand. Moving into an empty uncontrolled battlefield conquers it; a unit gets one
 * move per readiness, so "Ready your units" is how a second conquer is reached in one turn.
 */
function board(meta?: { buffed?: boolean; damage?: number }) {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4, chaos: 3, mind: 3 } })
    .battlefield("bf1")
    .battlefield("bf2")
    .unit(P1, "base", LUCIAN_MERCILESS, "lucian", meta)
    .hand(P1, TEMPORAL_BREACH, "breach")
    .hand(P1, RETREAT, "retreat")
    .hand(P1, ON_THE_HUNT, "hunt");
}

describe("Lucian, Merciless × Temporal Breach × Retreat — resetting 'the first time I conquer each turn'", () => {
  test("baseline: the first conquer readies him; a SECOND conquer in the same turn does not (a per-object, per-turn memory)", async () => {
    const game = await board().build();

    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("lucian").isExhausted).toBe(false); // moving exhausted him, the trigger readied him

    await game.p1.move("lucian", "base");
    await game.settle();
    expect(game.state("lucian").isExhausted).toBe(true);
    await game.p1.cast("hunt");
    await game.settle();
    expect(game.state("lucian").isExhausted).toBe(false);

    await game.p1.move("lucian", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.state("lucian").isExhausted).toBe(true); // memory already spent this turn
    expect(game.violations()).toEqual([]);
  });

  test("baseline: the memory is per TURN — next turn's first conquer readies him again", async () => {
    const game = await board().build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    await game.p1.move("lucian", "base");
    await game.settle();

    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.state("lucian").isExhausted).toBe(false);

    await game.p1.move("lucian", "bf2");
    await game.settle();
    expect(game.state("lucian").isExhausted).toBe(false); // readied again on a fresh turn
  });

  test(
    "(a) Temporal Breach makes him a NEW object (124/124.1), so his next conquer THIS turn must ready him again — the engine keeps the old object's once-per-turn memory",
    async () => {
      // Expected: board → banishment is a zone change, so the replayed Lucian has not conquered this
      // turn; conquering bf2 fires "the first time I conquer each turn" and leaves him READY.
      // Actual: the per-turn ledger is keyed by the card instance, which survives the round trip, so
      // the trigger stays spent and he ends the second conquer exhausted.
      const game = await board().build();
      await game.p1.move("lucian", "bf1");
      await game.settle();
      await game.p1.move("lucian", "base");
      await game.settle();

      await game.p1.cast("breach", { targets: "lucian" });
      await game.settle();
      expect(game.zoneOf("lucian")).toBe("base"); // replayed to the same location

      await game.p1.cast("hunt");
      await game.settle();
      await game.p1.move("lucian", "bf2");
      await game.settle();

      expect(game.p1.points()).toBe(2);
      expect(game.state("lucian").isExhausted).toBe(false);
    },
  );

  test("(b) the round trip clears damage, buffs and statuses and he comes back EXHAUSTED to the same location (124.1, 705, 143.4/359.2.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { mind: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LUCIAN_MERCILESS, "lucian", { buffed: true, damage: 2, stunned: true })
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    expect(game.state("lucian")).toMatchObject({ damage: 2, isBuffed: true, isStunned: true, might: 4 });

    await game.p1.cast("breach", { targets: "lucian" });
    await game.settle();

    expect(game.zoneOf("lucian")).toBe("battlefield-bf1"); // "to the same location"
    expect(game.locationOf("lucian")).toBe("bf1");
    expect(game.state("lucian")).toMatchObject({
      damage: 0,
      isBuffed: false,
      isExhausted: true, // 143.4 — the reset is not free tempo
      isStunned: false,
      might: 3,
    });
    expect(game.violations()).toEqual([]);
  });

  test("(c) Weaponmaster's discount rides on the [Equip] activation, not on Lucian's cost — playing him from hand attaches Doran's Blade for [rainbow] less (free)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { body: 4, mind: 3 } })
      .battlefield("bf1")
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, LUCIAN_MERCILESS, "lucian")
      .build();

    await game.p1.play("lucian");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("blade");
    await game.settle();

    expect(game.state("blade").attachedTo).toBe("lucian");
    expect(game.state("lucian").attachments).toEqual(["blade"]);
    expect(game.p1.energy()).toBe(9); // Lucian's own 3 …
    expect(game.p1.power("body")).toBe(4); // … and the [body] equip pip was reduced away
  });

  test(
    "(c) the Breach REPLAY is a play, so [Weaponmaster] must fire again (419.4.a) and re-attach the Equipment for [rainbow] less",
    async () => {
      // "When you play me" triggers on the replay too — ignoring Lucian's cost is irrelevant to the
      // [Equip] discount — so P1 is offered the re-attach of Doran's Blade (which fell off with the
      // banish) and takes it. The offer is optional (821.1.c), so it waits for an answer.
      const game = await scenario()
        .resources(P1, { energy: 12, power: { body: 4, mind: 3 } })
        .battlefield("bf1")
        .gear(P1, DORANS_BLADE, "blade")
        .hand(P1, LUCIAN_MERCILESS, "lucian")
        .hand(P1, TEMPORAL_BREACH, "breach")
        .build();
      await game.p1.play("lucian");
      await game.p1.pick("blade");
      await game.settle();
      expect(game.state("blade").attachedTo).toBe("lucian");

      await game.p1.cast("breach", { targets: "lucian" });
      await game.settle();
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("blade");
      await game.settle();

      expect(game.state("blade").attachedTo).toBe("lucian");
      expect(game.state("lucian").attachments).toEqual(["blade"]);
    },
  );

  test("(d) Retreat is the other shape of the same trip: owner's hand, owner channels 1 rune EXHAUSTED, and the replay costs his full 3", async () => {
    const game = await board().build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    await game.p1.move("lucian", "base");
    await game.settle();

    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "lucian" });
    await game.settle();

    expect(game.zoneOf("lucian")).toBe("hand");
    expect(game.p1.hand()).toContain("lucian");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // the new rune arrives exhausted

    const energyBefore = game.p1.energy();
    await game.p1.play("lucian");
    await game.settle();
    expect(game.p1.energy()).toBe(energyBefore - 3); // no "ignoring its cost" here
    expect(game.locationOf("lucian")).toBe("base");
    expect(game.state("lucian").isExhausted).toBe(true);
  });

  test(
    "(d) board → owner's hand is a zone change too, so the replayed Lucian's next conquer this turn must ready him (124/124.1)",
    async () => {
      // Expected: same reset as the Breach — Retreat just charges the full cost and cannot put him
      // back at the same location.
      // Actual: the once-per-turn memory survives the hand trip, so he ends the second conquer exhausted.
      const game = await board().build();
      await game.p1.move("lucian", "bf1");
      await game.settle();
      await game.p1.move("lucian", "base");
      await game.settle();
      await game.p1.cast("retreat", { targets: "lucian" });
      await game.settle();
      await game.p1.play("lucian");
      await game.settle();
      await game.p1.cast("hunt");
      await game.settle();

      await game.p1.move("lucian", "bf2");
      await game.settle();
      expect(game.p1.points()).toBe(2);
      expect(game.state("lucian").isExhausted).toBe(false);
    },
  );

  test("(e) the 'no' side: relocating without a zone change (a move back to base — a Recall behaves the same) keeps the SAME object, spent memory, damage and buff (455/456/458.1)", async () => {
    const game = await board({ buffed: true, damage: 2 }).build();

    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.state("lucian")).toMatchObject({ damage: 2, isBuffed: true, isExhausted: false });

    await game.p1.move("lucian", "base");
    await game.settle();
    // 124 never fires: nothing is cleared and the once-per-turn stays spent.
    expect(game.state("lucian")).toMatchObject({ damage: 2, isBuffed: true, might: 4 });

    await game.p1.cast("hunt");
    await game.settle();
    await game.p1.move("lucian", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.state("lucian").isExhausted).toBe(true);
    expect(game.state("lucian").damage).toBe(2);
  });
});
