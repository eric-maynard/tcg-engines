/**
 * Ruling 1e8583a2a2998ef5 — Sett, Brawler (OGN-164 → ogn-164-298) · Champion · Body · 4 Might
 *     "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield · "When you conquer here, you may spend a buff to draw 1."
 *
 * Q: Sett conquers the Monastery — may I order the triggers so Sett buffs himself first and the Monastery then spends
 *    that very buff to draw?
 * A (riftjudge, pre-Unleashed): Yes — order Monastery link 1 / Sett link 2; the Monastery "is a 'may' whose cost is paid at
 *    resolution", so it needs no buff to go on the chain and can spend Sett's fresh one.
 *
 * RULING-CONFLICT: riftjudge 1e8583a2a2998ef5 says the Monastery's "spend a buff" is paid on RESOLUTION. CR 383.3.a (the
 * leading "you may" is decided during FINALIZATION), 383.3.b / 204.3.a / 740.4.a.2 ("[spend a buff] TO [draw 1]" right after
 * that "you may" is a cost within instructions = the trigger's BASE COST, "paid on finalization … in order to place the
 * triggered ability on the chain") and 404.2 (can't/won't pay ⇒ the Pending item is removed) say the opposite — and the
 * Unleashed-era ruling 202877fb824b2d2b on this exact pair agrees with the CR: "the cost must be paid when the trigger is
 * placed on the chain, prior to the resolution of Sett's ability". Both conquer triggers are FINALIZED (383.3.d: as one
 * batch, before either resolves), so Sett's buff does not exist yet when the Monastery's cost falls due. Engine follows the CR.
 * Rules: 383.3.a/b, 383.3.d (controller orders simultaneous triggers — AFTER they are finalized), 404.1/404.2, 336–340
 * (LIFO), 702 / 745 (Buff; spending needs a buff you control NOW), 467 (Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const MONASTERY = "ogn-282-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/** P1's turn. P2 holds the (live) Monastery with Weak (1). Unbuffed Sett (4) in P1's base; optionally a buffed Pal in base too. */
function board(withBuffedPal: boolean) {
  const s = scenario()
    .battlefield("mon", { controller: P2, def: MONASTERY, inert: false })
    .unit(P2, "mon", { might: 1, name: "Weak" }, "weak")
    .unit(P1, "base", SETT, "sett");
  return withBuffedPal ? s.unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true }) : s;
}

/** Sett attacks the Monastery; both pass focus; combat 4 into 1 → Sett conquers (both conquer triggers fire as ONE batch). */
async function settConquers(game: Game): Promise<void> {
  await game.p1.move("sett", "mon");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
    } else {
      break;
    }
  }
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.mon?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

const key = (d: OrderD, card: string) => d.items.find((i) => i.card === card)?.key as string;

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling 1e8583a2a2998ef5 (RULING-CONFLICT → CR 383.3.b) — the Monastery's 'spend a buff' is a FINALIZATION cost; Sett's conquer buff comes too late to pay it", () => {
  // The ruling's headline line. CR: with no buff you control when the batch is finalized, the Monastery's Pending item
  // cannot be paid for and is removed unasked (404.2) — only Sett's "buff me" reaches the chain; nothing to order.
  test("CR 383.3.b / 404.2 — no pre-existing buff: the Monastery never reaches the chain (no opt-in, no order offer); Sett buffs himself and P1 draws NOTHING", async () => {
    const game = await board(false).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    expect(game.decision()?.kind).not.toBe("yes-no"); // never offered: nothing could pay it right now
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await passBoth(game); // Sett resolves: buff me
    expect(game.chain()).toEqual([]);
    expect(game.state("sett").isBuffed).toBe(true); // the conquer buff could NOT be turned into a card
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.violations()).toEqual([]);
  });

  // With a buff that DOES exist (Pal's), the opt-in is asked at finalization and the lone payable buff — Pal's, Sett has
  // none yet — is spent AT ONCE, before the order offer and before anyone holds priority (404.1 / 406.4).
  test("CR 383.3.a/.b — a buff already on Pal: 'spend a buff?' is asked at FINALIZATION (timing FIN) and Pal's buff is gone the moment P1 says yes — while BOTH items are still unresolved and before the 383.3.d order offer", async () => {
    const game = await board(true).build();
    await settConquers(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "mon" }, timing: "FIN" });
    expect(game.state("pal").isBuffed).toBe(true);
    await game.p1.yes();
    expect(game.state("pal").isBuffed).toBe(false); // paid now (Sett had no buff to offer instead)
    expect(game.state("sett").isBuffed).toBe(false);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1, timing: "FIN" });
    expect((d as OrderD).items.map((i) => i.card).sort()).toEqual(["mon", "sett"]);
    expect(game.p1.hand()).toHaveLength(0); // the draw (the effect) still waits for resolution
  });

  test("the ruling's own ordering (Monastery link 1 / Sett link 2): Sett resolves first and buffs himself, the Monastery then just DRAWS — its cost was Pal's buff long ago; Sett KEEPS his fresh buff (contra the ruling), Pal ends unbuffed, +1 card", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    await game.p1.yes();
    const od = game.decision() as OrderD;
    expect(od.kind).toBe("order");
    await game.p1.order([key(od, "mon"), key(od, "sett")]); // Monastery bottom, Sett on top
    expect(game.chain().map((c) => c.cardId)).toEqual(["mon", "sett"]);
    await passBoth(game); // Sett: buff me
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand);
    await passBoth(game); // Monastery: draw 1 — nothing more is asked or spent
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([]);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("pal").isBuffed).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.violations()).toEqual([]);
  });

  test("the other order (Sett link 1 / Monastery link 2) ends identically — the payment never depended on resolution order: Pal unbuffed, Sett buffed, +1 card", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    await game.p1.yes();
    const od = game.decision() as OrderD;
    await game.p1.order([key(od, "sett"), key(od, "mon")]); // Monastery on top
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett", "mon"]);
    await passBoth(game); // Monastery: draw 1
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("sett").isBuffed).toBe(false);
    await passBoth(game); // Sett: buff me
    expect(game.chain()).toEqual([]);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("pal").isBuffed).toBe(false);
  });
});
