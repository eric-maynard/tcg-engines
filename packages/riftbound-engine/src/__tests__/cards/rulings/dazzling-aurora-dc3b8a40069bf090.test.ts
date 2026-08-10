/**
 * Ruling dc3b8a40069bf090 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · 9+[body][body]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it.
 *      Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) 8 Might [Deflect] "You may play me to an occupied enemy battlefield."
 *   × Thousand-Tailed Watcher (ogn-116-298) 7 Might "[Accelerate] ([1][mind]) … When you play me, give enemy units -3 …"
 *
 * Q: Does "ignoring its cost" also ignore additional costs like Accelerate? Can an Aurora-played Deadbloom go to an
 *    occupied battlefield? Do "this turn" buffs expire when Aurora triggers?
 * A: Only the printed cost is ignored — Accelerate may still be paid if you want. Deadbloom may be played to an occupied
 *    enemy battlefield, staging a combat during the end-of-turn phase. "This turn" effects are still active during
 *    Aurora's trigger: the Ending Phase is still your turn; they lapse only afterwards.
 * Rules: 356.2 (additional costs vs ignoring cost), 317.1/317.2 (ending step triggers before expiration), 323.9/323.13.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const WATCHER = "ogn-116-298";
const CLEAVE = "ogn-004-298"; // a spell on top of the deck: revealed, then recycled

/**
 * P1's turn, about to end. Aurora in P1's base; P1's Buffed Pal (2 Might, +2 this turn) in base. P2 holds bf1 with a
 * 3-Might Holder. Deck: Cleave, <unit under test>, filler.
 */
function board(unit: string, res: { energy?: number; mind?: number } = {}) {
  return scenario()
    .resources(P1, { energy: res.energy ?? 0, power: { mind: res.mind ?? 0 } })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Buffed Pal" }, "pal", { mightModifier: 2 })
    .deck(P1, [CLEAVE, unit, "ogn-175-298"], ["s1", "revealed", "later"]);
}

/** End P1's turn and pass priority until Aurora's item has resolved into its first non-priority prompt (or moved on). */
async function auroraResolves(game: Game): Promise<Decision | null> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return d;
  }
  return game.decision();
}

describe("Ruling dc3b8a40069bf090 — Aurora ignores only the printed cost: Accelerate is still on offer", () => {
  test("Watcher revealed with a spare [1][mind]: P1 is ASKED whether to pay Accelerate (a yes/no for P1); yes ⇒ [1][mind] spent, the Watcher enters READY, printed 7+[mind] never paid", async () => {
    const game = await board(WATCHER, { energy: 1, mind: 1 }).build();
    let d = await auroraResolves(game);
    // A destination prompt (only "base" is legal for the Watcher) may or may not be asked; answer it if so.
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "base")) {
      await game.p1.answer({ keys: ["base"], kind: "pick" });
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt ?? "").toMatch(/mind/i);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // nothing spent on the printed cost
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    for (let i = 0; i < 4 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.answer({ keys: ["base"], kind: "pick" });
    }
    expect(game.zoneOf("revealed")).toBe("base");
    expect(game.state("revealed").isReady).toBe(true);
  });

  test("declining Accelerate: the Watcher still enters (exhausted) for free — the spare [1][mind] is untouched until the pools empty at expiration", async () => {
    const game = await board(WATCHER, { energy: 1, mind: 1 }).build();
    let d = await auroraResolves(game);
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "base")) {
      await game.p1.answer({ keys: ["base"], kind: "pick" });
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    for (let i = 0; i < 4 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.answer({ keys: ["base"], kind: "pick" });
    }
    expect(game.zoneOf("revealed")).toBe("base");
    expect(game.state("revealed").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.deck().at(-1)).toBe("s1"); // the revealed spell was recycled
  });
});

describe("Ruling dc3b8a40069bf090 — an Aurora-played Deadbloom Predator may go to an occupied enemy battlefield: combat during the end of turn", () => {
  test("bf1 (enemy, occupied) is offered as the Predator's destination; choosing it opens a COMBAT showdown while it is still P1's Ending Phase; Predator (8) kills Holder (3) and conquers; then P2's turn begins", async () => {
    const game = await board(DEADBLOOM_PREDATOR).build();
    const d = await auroraResolves(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-bf1");
    expect(keys).toContain("base");
    await game.p1.answer({ keys: ["battlefield-bf1"], kind: "pick" });
    for (let i = 0; i < 6; i++) {
      const x = game.decision();
      if (x?.kind === "action" && x.context === "chain") {
        await game.seat(x.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.locationOf("revealed")).toBe("bf1");
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    // During this phase only showdown-legal actions exist: the decision is a showdown Focus decision, not a main-phase menu.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("revealed").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2); // "your turn continues until your opponent's turn begins"
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling dc3b8a40069bf090 — 'this turn' effects are still live while Aurora's trigger resolves", () => {
  test("Buffed Pal's +2 this turn is still applied at Aurora's resolution prompt (Ending Phase, still P1's turn) and only lapses once the turn has passed", async () => {
    const game = await board(DEADBLOOM_PREDATOR).build();
    expect(game.state("pal")).toMatchObject({ might: 4, mightModifier: 2 });
    const d = await auroraResolves(game);
    expect(d?.seat).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pal")).toMatchObject({ might: 4, mightModifier: 2 }); // still buffed mid-trigger
    if (d?.kind === "pick") {
      await game.p1.answer({ keys: ["base"], kind: "pick" });
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("pal")).toMatchObject({ might: 2, mightModifier: 0 }); // expired at 317.2, after the trigger
    expect(game.trace().expiration.some((p) => p.expired.includes("mightModifier:pal"))).toBe(true);
  });
});
