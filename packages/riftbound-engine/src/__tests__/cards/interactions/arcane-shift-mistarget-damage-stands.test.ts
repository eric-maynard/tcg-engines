/**
 * Interaction: Arcane Shift (sfd-200-221) · Spell · Mind/Chaos · 3 + [rainbow] · Action
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost.
 *      Deal 3 to an enemy unit at a battlefield. Banish this."
 *   × Flash (ogs-011-024) — "[Reaction] Move up to 2 friendly units to base."
 *   × Flurry of Blades (ogn-133-298) — "[Reaction] Deal 1 to all units at battlefields."
 *   × Vi, Destructive (ogn-036-298) — "[Ganking] Recycle 1 from your trash: give me +1 [Might] this turn."
 *   × Ability Watcher (ogn-103-298) — "When you play a spell, give me +1 [Might] this turn."
 *
 * Question: P1 casts Arcane Shift choosing its own unit U to banish and P2's unit E at a
 * battlefield for the damage. Branches:
 *   (a) P2 reacts by killing U — is the damage to E still dealt, does P1 get any substitute free
 *       banish-and-replay, and where does Arcane Shift itself end up?
 *   (b) P2 instead Flashes E back to base — does the banish-and-replay of U still happen?
 *   (c) both targets are removed.
 * In each case, can P1's Vi, Destructive use Arcane Shift from the trash afterwards?
 *
 * Expected: the three sentences are independent instructions except that "then its owner plays it"
 * is LINKED to the banish.
 *   (a) U is gone, so the banish instruction is ignored and, being its linked follow-up, the replay
 *       does not execute either (359.3.e.14 / 359.3.e.14.a) — P1 does NOT banish or replay some
 *       other unit, and nothing is played from the trash as a substitute. The damage instruction
 *       targets a different object and is unaffected: 3 damage is dealt to E, killing it if lethal
 *       (359.3.e.5's Void Seeker example — the unrelated instruction still resolves; 359.3.e.8).
 *       "Banish this" is not a target instruction and always executes: Arcane Shift is BANISHED,
 *       not trashed, so Vi can never recycle it and the trash count never goes up (427.2.b).
 *   (b) Mirror image: E is no longer at a battlefield, so the damage instruction is ignored
 *       (359.3.e.2 / 359.3.e.5) — no redirect to another enemy unit, no damage to base — while U is
 *       still banished and replayed by its OWNER ignoring its cost, as a NEW object (no damage,
 *       buffs or attachments carry over). Arcane Shift still self-banishes.
 *   (c) Both instructions are ignored; the spell has no effect at all but is still considered
 *       PLAYED (359.3.e.10) — "when you play a spell" abilities still trigger — and it still
 *       banishes itself. Costs already paid stay paid in every branch.
 *
 * Rules: 359.3.e.2, 359.3.e.4, 359.3.e.5, 359.3.e.8, 359.3.e.10, 359.3.e.14, 359.3.e.14.a, 427.2.b.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHIFT = "sfd-200-221";
const FLASH = "ogs-011-024";
const FLURRY = "ogn-133-298";
const VI = "ogn-036-298";
const SPELL_WATCHER = "ogn-103-298"; // 2 Might; "When you play a spell, give me +1 [Might] this turn."

interface BoardOpts {
  readonly eMight?: number;
  readonly uMeta?: Record<string, unknown>;
  readonly uMight?: number;
}

/**
 * P1: U at bf1 (the banish target), Vi and a spell-watcher in base, Arcane Shift in hand with
 * exactly its cost. P2: E at bf2 (the damage target).
 */
function board({ eMight = 5, uMeta, uMight = 1 }: BoardOpts = {}) {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: uMight, name: "U" }, "u", uMeta)
    .unit(P2, "bf2", { might: eMight, name: "E" }, "e")
    .unit(P1, "base", VI, "vi")
    .unit(P1, "base", SPELL_WATCHER, "watcher")
    .hand(P1, SHIFT, "shift");
}

describe("Arcane Shift: one mistargeted instruction, the others stand", () => {
  test("baseline: U is banished and replayed by its owner ignoring the cost, E takes 3, and Arcane Shift banishes ITSELF (not to the trash)", async () => {
    const game = await board().build();
    await game.p1.cast("shift", { targets: ["u", "e"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    // 354.3 — the replay waits until Arcane Shift has fully resolved (damage dealt, self banished).
    expect(game.state("e").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1"); // owner picks where it comes back
    await game.settle();
    expect(game.zoneOf("u")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // cost was ignored
  });

  test("(a) P2 kills U in response: the banish AND its linked replay are ignored — no substitute unit is banished, nothing is played from the trash — but E still takes the 3", async () => {
    const game = await board().hand(P2, FLURRY, "flurry").build();
    await game.p1.cast("shift", { targets: ["u", "e"] });
    await game.p1.passPriority();
    await game.p2.cast("flurry"); // 1 to all units at battlefields → the 1-Might U dies
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash"); // killed by P2, never banished
    expect(game.chain()).toEqual([]); // no pending replay
    expect(game.decision()).toMatchObject({ kind: "action" }); // nothing is asked of P1
    expect(game.state("e").damage).toBe(4); // 1 from Flurry + 3 from Arcane Shift
    expect(game.zoneOf("e")).toBe("battlefield-bf2");
    // Neither of P1's other units was substituted in for the banish-and-replay.
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.p1.trash()).toEqual(["u"]); // only P2's kill put anything there
    expect(game.zoneOf("shift")).toBe("banishment");
  });

  test("(a) the surviving damage instruction still kills: a 3-Might E dies to the 3", async () => {
    const game = await board({ eMight: 3 }).hand(P2, FLURRY, "flurry").build();
    await game.p1.cast("shift", { targets: ["u", "e"] });
    await game.p1.passPriority();
    await game.p2.cast("flurry");
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.zoneOf("e")).toBe("trash");
  });

  test("(b) P2 Flashes E to base: the damage instruction is ignored — no redirect, no damage anywhere — while U is still banished and replayed as a FRESH object", async () => {
    const game = await board({ uMeta: { buffed: true, damage: 2 }, uMight: 4 })
      .hand(P2, FLASH, "flash")
      .build();
    expect(game.state("u")).toMatchObject({ damage: 2, isBuffed: true });
    await game.p1.cast("shift", { targets: ["u", "e"] });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["e"] }); // E is friendly to P2
    await game.settle();
    expect(game.locationOf("e")).toBe("base");
    expect(game.state("e").damage).toBe(0); // 359.3.e.5 — ignored, never re-aimed
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("u")).toBe("battlefield-bf1");
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: false }); // new object (124)
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("(c) both targets removed: no effect at all, yet the spell was still PLAYED (the watcher's trigger fires) and still banishes itself", async () => {
    const game = await board().hand(P2, FLASH, "flash").hand(P2, FLURRY, "flurry").build();
    const watcherMight = game.state("watcher").might;
    await game.p1.cast("shift", { targets: ["u", "e"] });
    await game.p1.passPriority();
    await game.p2.cast("flurry"); // will kill U…
    await game.p2.cast("flash", { targets: ["e"] }); // …and E leaves the battlefield first (LIFO)
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.locationOf("e")).toBe("base");
    expect(game.state("e").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // costs stay paid
    // 359.3.e.10's own worked example: the "when you play a spell" ability "still triggers as the
    // spell resolves" even though not one of the spell's instructions could be executed.
    expect(game.state("watcher").might).toBe(watcherMight + 1);
    expect(game.violations()).toEqual([]);
  });

  test("Vi can never recycle Arcane Shift: 'Banish this' puts it in banishment, so P1's trash never gains it", async () => {
    const game = await board().hand(P2, FLASH, "flash").build();
    expect(game.p1.trash()).toEqual([]);
    await game.p1.cast("shift", { targets: ["u", "e"] });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["e"] });
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]); // Arcane Shift is NOT there; U was replayed, not trashed
    expect(game.p1.can("activate", "vi")).toBe(false); // nothing to recycle
  });
});
