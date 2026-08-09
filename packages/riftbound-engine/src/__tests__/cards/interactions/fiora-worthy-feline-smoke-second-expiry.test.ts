/**
 * Interaction: Fiora, Worthy (sfd-180-221) · Champion Unit · Order · 3 Might
 *     "When a unit you control becomes [Mighty], you may pay [order] to ready it."
 *   × Fretful Feline (ven-071-166) · Unit · Body · 5 Might
 *     "When I become ready, give me +2 [Might] this turn."
 *   × Smoke Screen (ogn-093-298) · Spell · Mind · [Reaction]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Question. P1's turn. P1 controls Fiora, Worthy and an EXHAUSTED Fretful Feline (5 Might). P2 Smoke
 * Screens the Feline (-4 this turn, min 1 → 1 Might: no longer Mighty). Before ending the turn P1
 * recycles a rune to float one [order] Power, planning to pay Fiora's trigger when Smoke Screen wears
 * off at end of turn.
 *   (a) Is the floated [order] still in P1's pool when Fiora's trigger is finalized, given that 3e
 *       (pools empty) follows 3d ('this turn' effects expire) inside the same Expiration cleanup?
 *   (b) If P1 pays anyway (by activating a rune DURING finalization), Feline readies and gets +2
 *       'this turn' — does that +2 carry into P2's turn, or does the 317.2.f re-loop run a SECOND 3d
 *       that strips it?
 *
 * Rules: 317.2.b–d (Expiration Step: 3c heal, 3d all 'this turn' effects expire, 3e rune pools empty
 * — in that order, inside ONE special cleanup), 710 (current Might: 1 → 5 when the -4 expires =
 * "becomes Mighty"), 320 / 320.1 (during a cleanup new Pending Items may be added but nothing is
 * Finalized → Fiora's trigger waits until the cleanup is done, i.e. until AFTER 3e), 167.1 (unspent
 * Power is lost), 357.1.a (while paying a cost the controller may use Reaction [Add] abilities — a
 * rune's Recycle — to generate the [order] on the spot), 317.2.f (items underwent FEPR → return to
 * the start of the Expiration Step: a second 3c/3d/3e pass), 324.2.
 *
 * Expected: pass 1 — 3d: Smoke Screen expires, Feline 1 → 5, becomes Mighty → Fiora's trigger is
 * added as Pending; 3e: P1's floated [order] is LOST (a: no, it is gone before the trigger is ever
 * finalized). Cleanup ends → Fiora's trigger finalizes: P1 may still pay, but only by recycling a
 * rune right now. If paid: Feline readies → its own trigger → +2 this turn (7). 317.2.f → pass 2 —
 * 3d strips that +2 (7 → 5; still Mighty, so no new Fiora trigger, no loop); 3e empties whatever P1
 * over-generated. Entering P2's turn: Feline READY, 5 Might, 0 damage; P1's pool empty. If P1
 * declines: Feline stays exhausted at 5.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-180-221";
const FELINE = "ven-071-166";
const SMOKE_SCREEN = "ogn-093-298";
const CLEAVE = "ogn-004-298"; // 1-cost [Action] "give a unit Assault 3 this turn" — P1's chain-opener (no Might change out of combat)

/**
 * Turn 3, P1's Main Phase. P1: Fiora + an EXHAUSTED Fretful Feline + a vanilla 2-Might bystander in
 * base, two ready Order runes (r1 to float power now, r2 to pay with later), 1 energy and Cleave in
 * hand. P2: Smoke Screen in hand with exactly its cost (2 energy + 1 mind).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", FIORA, "fiora")
    .unit(P1, "base", FELINE, "feline", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .rune(P1, "order", { alias: "r1" })
    .rune(P1, "order", { alias: "r2" })
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** P1 opens a chain (Cleave on the bystander); P2 reacts with Smoke Screen on the Feline; both resolve. */
async function felineGetsSmoked(game: Game): Promise<void> {
  await game.p1.cast("cleave", { targets: "bystander" });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("smoke", { targets: "feline" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "smoke"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

/** Smoke the Feline, float one [order] off r1, and end P1's turn (nothing of the next steps answered). */
async function smokeFloatAndEndTurn(): Promise<Game> {
  const game = await board().build();
  await felineGetsSmoked(game);
  await game.p1.recycleRune("r1");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
  await game.p1.endTurn();
  return game;
}

const fioraAsk = (game: Game) => {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 ? (d as Extract<Decision, { kind: "yes-no" }>) : undefined;
};

describe("Fiora, Worthy × Fretful Feline × Smoke Screen — the trigger that only exists after the pool has emptied", () => {
  test("premise: P2 can Smoke Screen the Feline on P1's turn once P1 opens a chain ([Reaction]); the exhausted 5-Might Feline drops to the 1-Might floor and is no longer Mighty — Fiora does not trigger off LOSING Mighty", async () => {
    const game = await board().build();
    expect(game.state("feline")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p2.can("cast", "smoke")).toBe(false); // Neutral Open state of P1's turn: no Reaction window yet
    await felineGetsSmoked(game);
    expect(game.state("feline")).toMatchObject({ isExhausted: true, might: 1 });
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("premise: recycling r1 floats exactly one [order] in P1's pool, and it is still there for the rest of P1's Main Phase (pools only empty at 3e)", async () => {
    const game = await board().build();
    await felineGetsSmoked(game);
    await game.p1.recycleRune("r1");
    expect(game.p1.power("order")).toBe(1);
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes({ ready: true })).toEqual(["r2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("order")).toBe(1);
  });

  test("3d: the -4 'this turn' does not outlive P1's turn — entering P2's turn the Feline is back to 5 (Mighty again) with no damage (317.2.c, 710)", async () => {
    const game = await smokeFloatAndEndTurn();
    if (fioraAsk(game)) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("feline")).toMatchObject({ damage: 0, might: 5, mightModifier: 0 });
  });

  test("(a) 3e: the floated [order] is lost with the turn no matter what — P1's pool is empty once P2's turn is under way (317.2.d, 167.1)", async () => {
    const game = await smokeFloatAndEndTurn();
    if (fioraAsk(game)) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // Expected: 3d makes the Feline Mighty again (1 → 5) → Fiora, Worthy's "becomes Mighty" trigger is
  // added as a Pending Item during the cleanup (320.1) and finalized right after it — so P1 IS asked
  // "pay [order] to ready it?", and at that moment the floated [order] has already been emptied by 3e
  // (pool 0; the only way to accept is a rune's [Add]/Recycle offered alongside the question, 357.1.a).
  // Actual: the expiry of a Might penalty is not treated as "becoming Mighty" — no Fiora trigger is
  // ever raised and the game goes straight to P2's turn.
  test("(a) when Smoke Screen expires Fiora's trigger must be put to P1 — with the floated [order] already gone (pool 0) and r2's Recycle offered as the only way to pay (317.2.c→d, 320.1, 357.1.a)", async () => {
    const game = await smokeFloatAndEndTurn();
    const ask = fioraAsk(game);
    expect(ask).toBeDefined();
    expect(ask?.source?.cardId).toBe("fiora");
    expect(game.state("feline")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.power("order")).toBe(0); // (a): NO — 3e emptied it before the trigger was finalized
    expect((ask?.actions ?? []).some((o) => o.moveId === "recycleRune" && o.card === "r2")).toBe(true);
  });

  // Expected: P1 recycles r2 during the payment window and pays → Feline readies → Feline's own
  // "+2 this turn" trigger resolves (7) → 317.2.f second Expiration pass: 3d strips the fresh +2
  // (7 → 5, still Mighty → no new Fiora trigger, no loop), 3e empties the pool again. P2's turn opens
  // with the Feline READY at exactly 5 and P1 holding no power. Actual: no trigger, so there is
  // nothing to pay — the Feline enters P2's turn still exhausted.
  test("(b) paying via r2 during finalization readies the Feline; its '+2 this turn' is then stripped by the SECOND 3d pass — P2's turn starts with the Feline READY at 5 (not 7), undamaged, P1's pool empty, chain clear (317.2.f, 324.2)", async () => {
    const game = await smokeFloatAndEndTurn();
    expect(fioraAsk(game)).toBeDefined();
    await game.p1.recycleRune("r2"); // 357.1.a — generate the [order] now
    expect(game.p1.power("order")).toBe(1);
    expect(fioraAsk(game)?.canAccept).not.toBe(false);
    await game.p1.yes();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.state("feline")).toMatchObject({ damage: 0, isReady: true, might: 5, mightModifier: 0 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("r2")).toBe("runeDeck");
    expect(game.isOver()).toBe(false);
  });

  test("declining (or never being able to pay): the loop changes nothing — P2's turn opens with the Feline still EXHAUSTED at 5, Fiora untouched, P1's pool empty, r2 still ready in the pool", async () => {
    const game = await smokeFloatAndEndTurn();
    if (fioraAsk(game)) {
      await game.p1.no();
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.state("feline")).toMatchObject({ damage: 0, isExhausted: true, might: 5 });
    expect(game.state("fiora")).toMatchObject({ isReady: true, might: 3, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.runes({ ready: true })).toEqual(["r2"]);
    expect(game.violations()).toEqual([]);
  });
});
