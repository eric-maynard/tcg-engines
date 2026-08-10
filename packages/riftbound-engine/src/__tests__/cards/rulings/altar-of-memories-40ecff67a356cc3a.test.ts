/**
 * Ruling 40ecff67a356cc3a — Altar of Memories (SFD-169 → sfd-169-221) · Gear · Order · 2
 *   "When a friendly unit dies, you may exhaust me to draw 1, then put a card from your hand on the top or bottom of your
 *    Main Deck."
 *   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." as the killer.)
 *
 * Q: Can all 3 Altars of Memories be used off one unit dying?
 * A: Yes. Each Altar is a separate object with its own "you may" trigger; one death triggers all three independently and
 *    you choose for each whether to use it (3, 2, 1 or none). Each resolves on its own (LIFO): exhaust that Altar, draw 1,
 *    put a card back. A copy that is already exhausted can't be used.
 * Rules: 383 (each object's trigger fires), 383.3.a (leading "you may" decided per item at finalization), 383.3.b (the
 *        "exhaust me" is that item's base cost, paid on accepting), 338 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALTAR = "sfd-169-221";
const VOID_SEEKER = "ogn-024-298";

const ALTARS = ["altar1", "altar2", "altar3"] as const;

/** P2's turn with Void Seeker paid. P1 holds bf1 with Victim (1) + Guard (4), three ready Altars in base, Junk in hand, a known deck. */
function board(opts: { thirdExhausted?: boolean } = {}) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Victim" }, "victim")
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .gear(P1, ALTAR, "altar1")
    .gear(P1, ALTAR, "altar2")
    .gear(P1, ALTAR, "altar3", opts.thirdExhausted ? { exhausted: true } : undefined)
    .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Junk" }, "junk")
    .deck(
      P1,
      [1, 2, 3, 4].map((n) => ({ cardType: "unit", energyCost: 1, might: 1, name: `D${n}` })),
      ["d1", "d2", "d3", "d4"],
    )
    .hand(P2, VOID_SEEKER, "vs");
}

/** Void Seeker kills the Victim; returns at P1's first Altar prompt. */
async function victimDies(opts?: { thirdExhausted?: boolean }): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.cast("vs", { targets: "victim" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("victim")).toBe("trash");
  return game;
}

/** Answer the per-Altar "you may exhaust me" prompts in the order they come: true = use it. Returns the Altars asked about. */
async function answerAltarPrompts(game: Game, answers: readonly boolean[]): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < answers.length; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    asked.push(d?.source?.cardId ?? "?");
    await (answers[i] ? game.p1.yes() : game.p1.no());
  }
  return asked;
}

/** Resolve everything: pass priority, and for each Altar resolution put the first offered hand card on the bottom. Counts draws. */
async function resolveAll(game: Game): Promise<{ recycled: number }> {
  let recycled = 0;
  for (let i = 0; i < 40; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "mainDeck-bottom")) {
      await game.p1.pick("mainDeck-bottom");
      recycled += 1;
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]!.card ?? d.options[0]!.key); // the card to put back
    } else {
      break;
    }
  }
  return { recycled };
}

describe("Ruling 40ecff67a356cc3a — three Altars of Memories all trigger off one death", () => {
  test("one friendly death ⇒ THREE independent Altar items on the chain, and P1 is asked 'exhaust to use?' once per Altar (three distinct sources)", async () => {
    const game = await victimDies();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual([...ALTARS]);
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    const asked = await answerAltarPrompts(game, [true, true, true]);
    expect(asked.sort()).toEqual([...ALTARS]);
  });

  // Timing note: the ruling words the exhaust as "part of the resolution"; CR 383.3.b makes "exhaust me" the item's base
  // cost paid when you accept at finalization — engine follows CR (FIXER-PRIMER §2 cost-at-finalization). Either way each
  // Altar is exhausted individually for its own trigger, which is what is asserted.
  test("using all three: each Altar is exhausted for ITS OWN trigger; the three items then resolve one by one — 3 draws in total, each followed by putting a card from hand on top/bottom (net hand size unchanged, deck reshuffled by 3 recycles)", async () => {
    const game = await victimDies();
    await answerAltarPrompts(game, [true, true, true]);
    expect(ALTARS.map((a) => game.state(a).isExhausted)).toEqual([true, true, true]);
    expect(game.chain()).toHaveLength(3);
    const handBefore = game.p1.hand().length;
    const { recycled } = await resolveAll(game);
    expect(recycled).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(handBefore); // +3 drawn, -3 put back
    // d1, d2, d3 were the three draws (top of deck each time after the previous put-back went to the bottom).
    expect(game.p1.deck().slice(0, 1)).toEqual(["d4"]);
    expect(game.violations()).toEqual([]);
  });

  test("'you may' per copy: accepting two and declining one ⇒ the declined item is removed (its Altar stays ready), two resolve (2 draws / 2 put-backs)", async () => {
    const game = await victimDies();
    const asked = await answerAltarPrompts(game, [true, false, true]);
    const declined = asked[1]!;
    expect(game.state(declined).isExhausted).toBe(false);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(asked.filter((a) => a !== declined).sort());
    const { recycled } = await resolveAll(game);
    expect(recycled).toBe(2);
    expect(asked.filter((a) => a !== declined).every((a) => game.state(a).isExhausted)).toBe(true);
  });

  test("…or none at all: three 'no' ⇒ nothing on the chain, no Altar exhausted, no card drawn", async () => {
    const game = await victimDies();
    const deckBefore = game.p1.deck();
    await answerAltarPrompts(game, [false, false, false]);
    expect(game.chain()).toEqual([]);
    expect(ALTARS.map((a) => game.state(a).isExhausted)).toEqual([false, false, false]);
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.p1.deck()).toEqual(deckBefore);
  });

  test("an Altar that is already exhausted cannot be used for this death: only the two ready copies are offered", async () => {
    const game = await victimDies({ thirdExhausted: true });
    const offered: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind !== "yes-no" || d.seat !== P1) {
        break;
      }
      if (d.canAccept !== false) {
        offered.push(d.source?.cardId ?? "?");
        await game.p1.yes();
      } else {
        await game.p1.no();
      }
    }
    expect(offered.sort()).toEqual(["altar1", "altar2"]);
    const { recycled } = await resolveAll(game);
    expect(recycled).toBe(2);
  });
});
