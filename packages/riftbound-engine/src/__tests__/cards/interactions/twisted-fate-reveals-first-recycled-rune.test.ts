/**
 * Interaction: Twisted Fate, Gambler (ogn-200-298) · Champion Unit · Chaos · 4 · 4 Might
 *     "When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the following based on its
 *      domain: [fury] — Deal 2 to an enemy unit here and 1 to all other enemy units here. [mind] — Draw 1.
 *      [order] — Stun an enemy unit."
 *   × Mind Rune (ogn-089-298) / Fury Rune (ogn-007-298) · basic runes · "[Exhaust]: Add [1]. / Recycle this: Add [C]."
 *
 * Rules: 164.2.b / 164.2.b.1 + 429.2 (a rune's "Recycle this: Add [C]" is an [Add] ability — no chain item, power
 * added at once), 416.1 / 416.1.b (Recycle = to the BOTTOM of its deck; runes go to the RUNE deck), 416.5.a (only
 * SIMULTANEOUS recycles let the owner order them — sequential ones stack in sequence), 161.2.b (runes never visit
 * the trash / main deck), 430.1 / 430.2.a (Channel takes from the TOP, channeled runes enter ready), 315.3.b
 * (Channel Phase channels 2).
 *
 * Board: P1's rune deck is EMPTY; P1 has ready runes M (Mind), F (Fury) + two others on board; TF ready in base;
 * P2 defends bf1 with two 1-Might units.
 * Question / expected:
 *   (a) recycle M then F: pool (0,{}) → mind 1 → mind 1 + fury 1; no chain item either time; rune deck top→bottom = [M, F].
 *   (b) TF attacks: trigger reveals the TOP = M (first recycled) ⇒ Mind mode: draw 1; M recycled again ⇒ deck [F, M];
 *       no damage from the trigger.
 *   (c) next P1 Channel Phase channels F then M, both ready; deck empty again.
 *   (d) swapped (F first): deck [F, M] ⇒ Fury mode: 2 to one defender + 1 to the other ⇒ both 1-Might units die,
 *       TF conquers; F goes under M ⇒ deck [M, F].
 *   (e) nothing recycled (deck empty): trigger resolves with no effect — no draw, no damage, no error; combat proceeds.
 *       Recycled runes are never in the trash or main deck.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TWISTED_FATE = "ogn-200-298";
const MIND_RUNE = "ogn-089-298";
const FURY_RUNE = "ogn-007-298";

/**
 * P1's turn-2 main phase, empty pools. NO rune-deck filler for anyone (P1's rune deck is explicitly empty).
 * P1: TF ready in base; runes on board = M (Mind), F (Fury), M2 (Mind), C (Chaos), all ready.
 * P2: D1 and D2 (1 Might each) holding bf1.
 */
function board() {
  return scenario()
    .fillDecks({ main: 10, runes: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "D1" }, "d1")
    .unit(P2, "bf1", { might: 1, name: "D2" }, "d2")
    .unit(P1, "base", TWISTED_FATE, "tf")
    .rune(P1, MIND_RUNE, { alias: "m" })
    .rune(P1, FURY_RUNE, { alias: "f" })
    .rune(P1, MIND_RUNE, { alias: "m2" })
    .rune(P1, "chaos", { alias: "c" });
}

/** TF moves into bf1 (becomes the attacker → trigger on the chain); everyone passes until the trigger has resolved. */
async function attackAndResolveTrigger(game: Game, furyVictim?: string): Promise<void> {
  await game.p1.move("tf", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tf", controller: P1, triggered: true })]);
  for (let i = 0; i < 10 && (game.chain().length > 0 || game.decision()?.kind === "pick"); i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" && d.seat === P1 && furyVictim !== undefined) {
      await game.p1.pick(furyVictim); // Fury mode: "an enemy unit here" for the 2
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Twisted Fate, Gambler × sequential rune Recycles into an EMPTY rune deck — the first rune recycled is the one revealed", () => {
  test("setup: P1's rune deck is empty, four ready runes on board, pool empty", async () => {
    const game = await board().build();
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["c", "f", "m", "m2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // ── (a) two sequential recycles ────────────────────────────────────────────────────────────────

  test("(a) 'Recycle this: Add [mind]' on M: +1 mind immediately, NO chain item (164.2.b / 429.2), M is now the whole rune deck; then F: +1 fury, deck top→bottom = [M, F] (416.1)", async () => {
    const game = await board().build();
    await game.p1.recycleRune("m");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // still Neutral Open — nothing to respond to
    expect(game.p1.runeDeck()).toEqual(["m"]);
    await game.p1.recycleRune("f");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, mind: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.runeDeck()).toEqual(["m", "f"]); // top first
    expect(game.zoneOf("m")).toBe("runeDeck");
    expect(game.zoneOf("f")).toBe("runeDeck");
    expect(game.p1.trash()).toEqual([]);
  });

  // ── (b) TF attacks: top rune = M ───────────────────────────────────────────────────────────────

  test("(b) M then F, TF attacks: the trigger reveals the TOP rune = M ⇒ Mind mode — P1 draws exactly 1, NO damage to either defender; M is recycled again under F ⇒ deck [F, M]", async () => {
    const game = await board().build();
    await game.p1.recycleRune("m");
    await game.p1.recycleRune("f");
    const hand = game.p1.hand().length;
    await attackAndResolveTrigger(game);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("d1")).toMatchObject({ damage: 0, isStunned: false, zone: "battlefield-bf1" });
    expect(game.state("d2")).toMatchObject({ damage: 0, isStunned: false, zone: "battlefield-bf1" });
    expect(game.p1.runeDeck()).toEqual(["f", "m"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, mind: 1 } }); // the trigger adds nothing
    // We are back in the combat showdown with both defenders still there.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // ── (c) next Channel Phase ─────────────────────────────────────────────────────────────────────

  test("(c) on P1's NEXT turn the Channel Phase takes F then M off the top (430.1), both enter READY (430.2.a), and the rune deck is empty again", async () => {
    const game = await board().build();
    await game.p1.recycleRune("m");
    await game.p1.recycleRune("f");
    await attackAndResolveTrigger(game);
    await game.settle(); // combat: TF (4) kills both 1-Might defenders and conquers
    expect(game.p1.runeDeck()).toEqual(["f", "m"]);
    await game.advanceTurn(); // → P2
    expect(game.p1.runeDeck()).toEqual(["f", "m"]); // P2's turn channels nothing of P1's
    await game.advanceTurn(); // → P1: Awaken, Beginning, Channel 2, Draw
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.runes().sort()).toEqual(["c", "f", "m", "m2"]);
    expect(game.state("f")).toMatchObject({ isReady: true, zone: "runePool" });
    expect(game.state("m")).toMatchObject({ isReady: true, zone: "runePool" });
    // Channel order F-before-M is visible in the pool order (F was on top).
    const pool = game.p1.runes();
    expect(pool.indexOf("f")).toBeLessThan(pool.indexOf("m"));
  });

  // ── (d) swapped order: F first ─────────────────────────────────────────────────────────────────

  test("(d) F then M ⇒ deck [F, M]; TF attacks ⇒ F revealed ⇒ Fury mode: 2 to the chosen defender and 1 to the other — both 1-Might defenders die; F goes under M ⇒ deck [M, F]; no card drawn", async () => {
    const game = await board().build();
    await game.p1.recycleRune("f");
    await game.p1.recycleRune("m");
    expect(game.p1.runeDeck()).toEqual(["f", "m"]);
    const hand = game.p1.hand().length;
    await attackAndResolveTrigger(game, "d1");
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.runeDeck()).toEqual(["m", "f"]);
  });

  test("(d) …so TF is alone at bf1 when combat would resolve: he takes no damage, conquers bf1 and P1 scores 1", async () => {
    const game = await board().build();
    await game.p1.recycleRune("f");
    await game.p1.recycleRune("m");
    await attackAndResolveTrigger(game, "d1");
    await game.settle();
    expect(game.state("tf")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) vs (d): the mode is decided purely by recycle ORDER — same runes, same board; M-first draws and deals nothing, F-first deals and draws nothing", async () => {
    const mindFirst = await board().build();
    await mindFirst.p1.recycleRune("m");
    await mindFirst.p1.recycleRune("f");
    const h1 = mindFirst.p1.hand().length;
    await attackAndResolveTrigger(mindFirst);
    const furyFirst = await board().build();
    await furyFirst.p1.recycleRune("f");
    await furyFirst.p1.recycleRune("m");
    const h2 = furyFirst.p1.hand().length;
    await attackAndResolveTrigger(furyFirst, "d2");
    expect([mindFirst.p1.hand().length - h1, mindFirst.p2.units("bf1").length]).toEqual([1, 2]);
    expect([furyFirst.p1.hand().length - h2, furyFirst.p2.units("bf1").length]).toEqual([0, 0]);
  });

  // ── (e) NO side: nothing recycled, deck empty ──────────────────────────────────────────────────

  test("(e) empty rune deck and nothing recycled: TF's trigger still goes on the chain but resolves with NO effect — no draw, no damage, no stun, no prompt, no error; deck stays empty", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await attackAndResolveTrigger(game);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.state("d1")).toMatchObject({ damage: 0, isStunned: false, zone: "battlefield-bf1" });
    expect(game.state("d2")).toMatchObject({ damage: 0, isStunned: false, zone: "battlefield-bf1" });
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.runes().sort()).toEqual(["c", "f", "m", "m2"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("(e) …and combat proceeds normally afterwards: TF (4 Might) kills both defenders, survives the 2 (healed at combat end, 466), conquers", async () => {
    const game = await board().build();
    await attackAndResolveTrigger(game);
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.state("tf")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("(e) a recycled rune never touches the trash or the main deck (161.2.b / 416.1.b) — not when recycled for power, not when TF re-recycles it", async () => {
    const game = await board().build();
    const mainDeck = game.p1.deck().length;
    await game.p1.recycleRune("m");
    await game.p1.recycleRune("f");
    await attackAndResolveTrigger(game); // reveals M, draws 1, recycles M again
    for (const r of ["m", "f"]) {
      expect(game.zoneOf(r)).toBe("runeDeck");
      expect(game.p1.trash()).not.toContain(r);
      expect(game.p1.deck()).not.toContain(r);
      expect(game.p1.hand()).not.toContain(r);
    }
    expect(game.p1.deck()).toHaveLength(mainDeck - 1); // only the Mind-mode draw left the main deck
  });
});
