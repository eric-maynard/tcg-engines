/**
 * Interaction: Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + [mind][order]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it
 *      [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × Ekko, Recurrent (ogn-110-298) · Champion Unit · Mind · 5 + [mind] · 5 Might
 *     "[Accelerate] … [Deathknell] — Recycle me to ready your runes. (When I die, get the effect.)"   — P1's, in base
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] · "Kill a unit."                     — P2's
 *
 * Rules: 477.1.b.1.a (a copy takes the printed rules text → the Reflection HAS Deathknell, 808.3), 428.1.a.1.b /
 * 808.1.d.2 (on a Kill the Deathknell is pended, noting attributes, BEFORE the permanent is put in the trash),
 * 186.1 (a token put into a non-board zone ceases to exist immediately), 185 (tokens are not cards), 204.3.a /
 * 740.4.a.2 / 403.1.b.1 ("Recycle me to …" as the FIRST part of a triggered effect is the ability's base cost,
 * paid at FINALIZATION), 359.3.e.12 (an object that no longer exists returns null → the cost cannot be paid),
 * 416.1.c (Recycle → bottom of owner's Main Deck), 816.1.b (Temporary = a real kill at the start of the
 * controller's Beginning Phase), 315.1.b (Awaken readies the turn player's objects before the Beginning Phase).
 *
 * Question: P1 resolves Mirror Image on its own Ekko → a ready Reflection copy (with Temporary) in P1's base; P1
 * then taps out (all 4 runes exhausted) and passes the turn.
 *   (a) P2 Vengeances the REFLECTION. Does the copied Deathknell do anything? Chain item / reaction window? Do
 *       P1's runes ready? Where is the token afterwards; what is in P1's trash / deck?
 *   (b) Control: P2 Vengeances the REAL Ekko — same walk.
 *   (c) Nobody kills it: what happens to the Reflection at the start of P1's next Beginning Phase; runes?
 *
 * Expected: (a) the token is killed → lands in P1's trash and immediately ceases to exist (186.1); "Recycle me" is
 * the trigger's base cost, payable at finalization — there is nothing to recycle → the pending trigger cannot be
 * finalized and is dropped: NO chain item, P1's runes stay EXHAUSTED, nothing is added to P1's deck, P1's trash
 * holds only Mirror Image (tokens aren't cards). (b) real Ekko: pended, lands in P1's trash, finalized by
 * recycling it from the trash → bottom of P1's deck while the item is still on the chain; P2 may react; on
 * resolution ALL of P1's runes ready; trash no longer contains Ekko. (c) Temporary kills the Reflection at the
 * start of P1's Beginning Phase — same as (a): token gone, deck gains nothing; P1's runes are ready anyway
 * because Awaken (315.1.b) already readied them.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const EKKO = "ogn-110-298";
const VENGEANCE = "ogn-229-298";
const FILLER = "ogn-175-298";

/**
 * P1's turn 2. P1: Ekko, Recurrent in base, exactly four MIND runes (ready), 1 mind + 1 order power floating (Mirror
 * Image = 3 energy from three runes + [mind][order]), Mirror Image in hand, known deck d1..d3 (+ filler). P2: six
 * order runes and Vengeance in hand (paid on P2's own turn: recycle 2 → [order][order], tap 4 → 4). One neutral
 * inert battlefield; victory score raised so nothing incidental ends the game.
 */
function board() {
  return scenario()
    .victoryScore(15)
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", EKKO, "ekko")
    .runes(P1, "mind", 4)
    .resources(P1, { energy: 0, power: { mind: 1, order: 1 } })
    .runes(P2, "order", 6)
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P2, VENGEANCE, "veng")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

/** P1 taps 3, Mirror-Images Ekko (→ Reflection id), taps the 4th rune (tapped out), ends turn; P2 floats exactly 4 + [order][order]. */
async function reflectedAndPassed(): Promise<{ game: Game; tok: string }> {
  const game = await board().build();
  await game.p1.tapRunes(3);
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "ekko" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id));
  expect(fresh).toHaveLength(1);
  const tok = fresh[0] as string;
  await game.p1.tapRunes(1);
  expect(game.p1.runes({ ready: true })).toEqual([]);
  await game.p1.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  await game.p2.recycleRune({ domain: "order" });
  await game.p2.recycleRune({ domain: "order" });
  await game.p2.tapRunes(4);
  expect(game.p2.resources()).toEqual({ energy: 4, power: { order: 2 } });
  return { game, tok };
}

const P1_DECK = ["d1", "d2", "d3", ...Array.from({ length: 7 }, (_, i) => `player-1:filler${i + 3}`)];

describe("Mirror Image × Ekko, Recurrent — a Reflection's copied 'Recycle me to ready your runes' when the token ceases to exist", () => {
  // ── premise ──────────────────────────────────────────────────────────────────────────────────────

  test("premise: the Reflection is a READY 5-Might token copy of Ekko in P1's base with Deathknell (477.1.b.1.a, 808.3) and Temporary; on P2's turn all four of P1's runes are still exhausted and P1's deck/trash are known", async () => {
    const { game, tok } = await reflectedAndPassed();
    expect(game.state(tok)).toMatchObject({ controller: P1, isToken: true, might: 5, name: "Ekko, Recurrent", owner: P1, zone: "base" });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.deck()).toEqual(P1_DECK);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p2.can("cast", "veng")).toBe(true);
  });

  // ── (a) Vengeance on the Reflection ──────────────────────────────────────────────────────────────

  test("(a) Vengeance kills the Reflection: it leaves the board and CEASES TO EXIST (186.1) — not on the board, not in P1's trash (tokens aren't cards, 185), P1's trash is still exactly [Mirror Image]", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: tok });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Vengeance resolves
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.has(tok)).toBe(false);
    expect(game.p1.base()).toEqual(["ekko"]); // only the real Ekko remains
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p2.trash()).toEqual(["veng"]);
  });

  test("(a) nothing is ever added to P1's Main Deck — there is no object to recycle (359.3.e.12): the deck is card-for-card unchanged after everything settles", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: tok });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p1.deck()).toEqual(P1_DECK);
    expect(game.p1.deck()).not.toContain(tok);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.violations()).toEqual([]);
  });

  // "Recycle me" is the trigger's base cost (204.3.a / 740.4.a.2); the token no longer exists at finalization so the
  // cost is unpayable and the effect never happens: P1's four runes stay EXHAUSTED.
  test("(a) P1's runes must NOT ready — the 'Recycle me' cost cannot be paid by a token that ceased to exist (204.3.a, 740.4.a.2, 186.1, 359.3.e.12)", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: tok });
    await game.settle();
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.runes({ ready: false })).toHaveLength(4);
  });

  // An unpayable finalization cost means the pending Deathknell is dropped (404.2): after Vengeance resolves the chain is
  // EMPTY and P2 is back in an open main phase (no reaction window on a phantom item).
  test("(a) the Reflection's Deathknell never reaches the chain — it cannot be finalized without paying 'Recycle me' (403.1.b.1, 740.4.a.2)", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: tok });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Vengeance resolves
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (b) control: Vengeance on the real Ekko ──────────────────────────────────────────────────────

  test("(b) real Ekko: the Deathknell is pended before the move and FINALIZED by recycling Ekko from P1's trash — while the item sits on the chain (P1's, triggered) Ekko is already at the BOTTOM of P1's deck, not in the trash, and the runes are not yet ready", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: "ekko" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Vengeance resolves → Ekko killed → trigger finalized (cost paid)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", controller: P1, triggered: true, type: "ability" })]);
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.deck()).toEqual([...P1_DECK, "ekko"]);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p1.runes({ ready: true })).toEqual([]); // effect not resolved yet
    expect(game.zoneOf(tok)).toBe("base"); // the Reflection is untouched
  });

  test("(b) P2 gets a reaction window on the Deathknell item (P1, its controller, holds priority first; after P1 passes it is P2's chain decision)", async () => {
    const { game } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: "ekko" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
  });

  test("(b) on resolution ALL FOUR of P1's runes ready; Ekko stays at the bottom of P1's deck; P1's trash = [Mirror Image] only; Vengeance in P2's trash", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.cast("veng", { targets: "ekko" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes({ ready: true })).toHaveLength(4);
    expect(game.p1.deck().at(-1)).toBe("ekko");
    expect(game.p1.deck()).toHaveLength(P1_DECK.length + 1);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p2.trash()).toEqual(["veng"]);
    expect(game.zoneOf(tok)).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) nobody kills it: Temporary ───────────────────────────────────────────────────────────────

  test("(c) left alone through P2's turn, the Reflection is killed by Temporary at the start of P1's Beginning Phase (816.1.b): by P1's main phase it has ceased to exist, is in no trash, and P1's deck gained NOTHING (only the turn draw d1 left it)", async () => {
    const { game, tok } = await reflectedAndPassed();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.p1.base()).toEqual(["ekko"]); // just the real Ekko
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual(P1_DECK.slice(1)); // d1 drawn, nothing appended
    expect(game.p1.deck()).not.toContain(tok);
    expect(game.violations()).toEqual([]);
  });

  test("(c) P1's runes are all ready on P1's turn regardless — Awaken (315.1.b) readied the four before the Beginning Phase, plus two freshly channeled: 6 of 6 ready; no observable extra effect from the dead Reflection", async () => {
    const { game } = await reflectedAndPassed();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.runes({ ready: true })).toHaveLength(6);
    expect(game.chain()).toEqual([]);
  });
});
