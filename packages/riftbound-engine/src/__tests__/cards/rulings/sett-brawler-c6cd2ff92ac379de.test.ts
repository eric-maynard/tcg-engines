/**
 * Ruling c6cd2ff92ac379de — Sett, Brawler (OGN-164 → ogn-164-298) · Champion Unit · Body · 4 Might
 *     "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Monastery of Hirana (OGN-282 → ogn-282-298) "When you conquer here, you may spend a buff to draw 1."
 *   × (nuances) The Boss (Sett legend, ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow], exhaust
 *     me, and spend its buff to heal it, exhaust it, and recall it instead." vs Disintegrate (ogn-005-298) "Deal 3 … If
 *     this kills it, do this: draw 1." and Hidden Blade (ogn-213-298) "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Buffed Sett conquers the Monastery — can I spend the buff for the draw AND get Sett's conquer buff? In what order?
 * A: Both triggers come from the same event, so you order them. Option 1: spend the existing buff on Hirana, then Sett
 *    re-buffs himself. Option 2 (unbuffed Sett): buff from Sett's trigger first, then spend it on Hirana.
 *    Nuances: The Boss REPLACES the death (the unit never dies) → Disintegrate's "if this kills it" draw does not
 *    happen; Hidden Blade's "its controller draws 2" still happens (it doesn't require the death).
 * Rules: 383.3.d (controller orders simultaneous triggers), 383.3.a/b (trigger costs paid on finalization),
 *        702 (Buff), 372–373 (replacement effects: the replaced event does not occur), 428 (Kill).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const MONASTERY = "ogn-282-298";
const THE_BOSS = "ogn-269-298";
const DISINTEGRATE = "ogn-005-298";
const HIDDEN_BLADE = "ogn-213-298";

type OrderD = Extract<Decision, { kind: "order" }>;
const keyOf = (d: OrderD, card: string) => d.items.find((i) => i.card === card)?.key as string;

/** P1's turn. Live Monastery held by P2's Weak (1). Sett (4, optionally BUFFED → 5) ready in P1's base; known deck. */
function hirana(buffed: boolean) {
  return scenario()
    .battlefield("mon", { controller: P2, def: MONASTERY, inert: false })
    .unit(P2, "mon", { might: 1, name: "Weak" }, "weak")
    .unit(P1, "base", SETT, "sett", buffed ? { buffed: true } : undefined)
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Sett attacks the Monastery, both pass, combat 5(4) into 1 → P1 conquers; both conquer triggers fire together. */
async function settConquers(game: Game): Promise<void> {
  await game.p1.move("sett", "mon");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 3 && game.decision()?.kind === "distribute"; i++) {
    const d = game.decision() as Extract<Decision, { kind: "distribute" }>;
    await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
  }
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.mon?.controller).toBe(P1);
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling c6cd2ff92ac379de — buffed Sett conquering Hirana: spend the buff for the draw AND end up buffed again", () => {
  test("premise: a buffed Sett reads 5", async () => {
    const game = await hirana(true).build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("Option 1 — both triggers fire off the one conquer; P1 is asked to spend a buff (yes → Sett's existing buff is spent) and to ORDER the two items; Hirana draws 1, then Sett's own trigger re-buffs him: +1 card AND buffed", async () => {
    const game = await hirana(true).build();
    await settConquers(game);
    // The Monastery's "you may spend a buff": P1's decision, sourced from the battlefield.
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "mon" } });
    await game.p1.yes();
    expect(game.state("sett").isBuffed).toBe(false); // the existing buff paid for it
    // Same triggering event → P1 chooses the order.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const od = d as OrderD;
    expect(od.items.map((i) => i.card).sort()).toEqual(["mon", "sett"]);
    await game.p1.order([keyOf(od, "sett"), keyOf(od, "mon")]); // Hirana on top → resolves first
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett", "mon"]);
    await passBoth(game); // Hirana: draw 1
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("sett").isBuffed).toBe(false);
    await passBoth(game); // Sett: buff me
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("Option 1, other stacking (Sett's item on top): same end state — Sett buffed, P1 +1 card", async () => {
    const game = await hirana(true).build();
    await settConquers(game);
    await game.p1.yes();
    const od = game.decision() as OrderD;
    expect(od.kind).toBe("order");
    await game.p1.order([keyOf(od, "mon"), keyOf(od, "sett")]); // Sett on top
    await passBoth(game); // Sett: buff me
    expect(game.state("sett").isBuffed).toBe(true);
    await passBoth(game); // Hirana: draw 1
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  // RULING-CONFLICT: this ruling's "Option 2" (unbuffed Sett buffs first, THEN spends that buff on Hirana) contradicts
  // CR 383.3.a/b (a trigger's "you may [cost] to …" is paid on FINALIZATION, before either item resolves) and the later
  // ruling 202877fb824b2d2b on this exact pair. Expected per THIS ruling: unbuffed Sett conquers → order Sett first →
  // buff → Hirana spends it → +1 card, Sett unbuffed. Actual (engine follows the CR): with no buff at finalization the
  // Monastery opt-in is never offered; Sett just ends buffed and P1 draws nothing.
  test.failing("BUG: ruling c6cd2ff92ac379de — Option 2 (unbuffed Sett: gain the conquer buff, then spend it on Hirana for a card); engine pays Hirana's cost at finalization so the opt-in is never offered", async () => {
    const game = await hirana(false).build();
    await settConquers(game);
    // Per the ruling P1 can order Sett's buff first and still be asked to spend it for Hirana.
    let asked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "order") {
        const od = d as OrderD;
        await game.p1.order([keyOf(od, "mon"), keyOf(od, "sett")].filter(Boolean)); // Sett on top → buffs first
      } else if (d.kind === "yes-no" && d.seat === P1) {
        asked = true;
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("sett");
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("sett").isBuffed).toBe(false);
  });
});

describe("Ruling c6cd2ff92ac379de (nuances) — The Boss replaces the death: 'if this kills' effects fail, unconditional riders still happen", () => {
  /** P2's turn. P1: The Boss legend (ready), 1 rainbow power, buffed Pal (2+1, 1 damage) at bf1. Known decks. */
  function bossBoard() {
    return scenario()
      .active(P2)
      .legend(P1, THE_BOSS, "boss")
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal", { buffed: true, damage: 1 })
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
  }

  /** Drive the chain; when The Boss asks P1 "pay [rainbow], exhaust me, spend its buff … instead?", say yes. */
  async function resolveWithBossSave(game: Game): Promise<void> {
    let saved = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        expect(d).toMatchObject({ seat: P1, source: { cardId: "boss" } });
        await game.p1.yes();
        saved = true;
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(saved).toBe(true);
    // The death was replaced: Pal healed, exhausted, recalled to base, buff spent; Boss exhausted, rainbow paid.
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.state("pal")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
  }

  // Expected: Disintegrate deals 3 (lethal) → The Boss recalls Pal instead of it dying → "If this kills it" is false →
  // P2 draws nothing. Actual: the engine still queues Disintegrate's reflexive "draw 1" and P2 draws a card.
  test("ruling c6cd2ff92ac379de — Disintegrate on a Boss-saved unit must NOT draw ('if this kills it' — it didn't die); engine draws anyway", async () => {
    const game = await bossBoard().resources(P2, { energy: 4 }).hand(P2, DISINTEGRATE, "dis").build();
    await game.p2.cast("dis", { targets: "pal" });
    await resolveWithBossSave(game);
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toEqual([]); // no "draw 1"
    expect(game.p2.deck()[0]).toBe("e1");
  });

  test("Hidden Blade on a Boss-saved unit: the kill is replaced (Pal recalled, alive) yet 'its controller draws 2' still happens — P1 draws 2", async () => {
    const game = await bossBoard().resources(P2, { energy: 2, power: { order: 1 } }).hand(P2, HIDDEN_BLADE, "blade").build();
    await game.p2.cast("blade", { targets: "pal" });
    await resolveWithBossSave(game);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
