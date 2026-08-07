/**
 * Fizz, Trickster — sfd-140-221 · Champion Unit (Fizz) · Chaos · 3 energy + [chaos] · 3 Might
 *
 *   When you play me, you may play a spell from your trash with Energy cost no more than [3],
 *   ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power
 *   cost.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Eligibility reads the PRINTED Energy cost (206): ≤3 in (Confront 2, Incinerate 2, Void Seeker 3),
 *     4+ out (Disintegrate 4); only SPELLS, only YOUR trash; units in the trash are never offered.
 *  2. 356.1.b.2 — only the Energy cost is zeroed: with 0 energy left after paying for Fizz the spell is
 *     still playable; a spell with a Power cost (Void Seeker [fury]) still needs that power — without
 *     it the spell cannot be played at all; with it, the fury is spent and the energy is untouched.
 *  3. The spell is PLAYED (419.3): it goes on the chain, needs legal targets, the opponent gets
 *     priority to respond, and its own effect happens on resolution (Incinerate really deals 2).
 *  4. "Recycle that spell after you play it": once it resolves it goes to the BOTTOM OF THE MAIN DECK,
 *     not back to the trash (so Fizz cannot loop the same spell forever).
 *  5. "you may": declining / an empty-or-ineligible trash does nothing and Fizz still enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-140-221";
const CONFRONT = "ogn-129-298"; // Body [Action] 2 (no power): units you play enter ready this turn; draw 1
const INCINERATE = "ogs-003-024"; // Fury [Action] 2 (no power): deal 2 to a unit at a battlefield
const VOID_SEEKER = "ogn-024-298"; // Fury [Action] 3 + [fury]: deal 4 to a unit at a battlefield; draw 1
const DISINTEGRATE = "ogn-005-298"; // Fury [Action] 4 (no power): deal 3 — too expensive for Fizz
const SKULKER = "ogn-175-298"; // vanilla unit — not a spell
const TRASH_KEYS = ["confront", "inc", "vs", "dis", "skulk", "theirs"];

function board(extra: { energy?: number; power?: Record<string, number> } = {}) {
  return scenario()
    .resources(P1, { energy: extra.energy ?? 3, power: { chaos: 1, ...(extra.power ?? {}) } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "tgt")
    .trash(P1, CONFRONT, "confront")
    .trash(P1, INCINERATE, "inc")
    .trash(P1, VOID_SEEKER, "vs")
    .trash(P1, DISINTEGRATE, "dis")
    .trash(P1, SKULKER, "skulk")
    .trash(P2, CONFRONT, "theirs")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"])
    .hand(P1, CARD, "fizz");
}

const isSpellPick = (d: Decision | null): d is PickDecision => d?.kind === "pick" && d.options.some((o) => TRASH_KEYS.includes(o.key));

/** Play Fizz, answer the "you may", and drive to the trash-spell pick (or to wherever the engine stops). */
async function playAndAccept(game: Game, accept = true): Promise<PickDecision | undefined> {
  await game.p1.play("fizz");
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      return undefined;
    }
    if (isSpellPick(d)) {
      return d;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).answer(accept && d.canAccept !== false);
    } else {
      return undefined;
    }
  }
  return undefined;
}

/** After picking a targeted spell: answer its target prompt / pass P1's priority until P2 must act. */
async function handToOpponent(game: Game, target: string): Promise<void> {
  for (let i = 0; i < 6 && game.actingSeat() === P1; i++) {
    const d = game.decision()!;
    if (d.kind === "pick") {
      await game.p1.pick(target);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.p1.passPriority();
    } else {
      break;
    }
  }
}

describe("Fizz, Trickster (sfd-140-221)", () => {
  test("registry payload (skeleton): 3-cost [chaos] Fizz champion, 3 Might; one optional play-self trigger that plays a SPELL from the trash", async () => {
    const game = await scenario().hand(P1, CARD, "fizz").build();
    expect(game.state("fizz")).toMatchObject({ baseMight: 3, cardType: "unit", energyCost: 3, name: "Fizz, Trickster" });
    expect(game.state("fizz").powerCost).toEqual(["chaos"]);
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ isChampion: true, tags: ["Fizz"] });
    const abilities = (def?.abilities ?? []) as Record<string, any>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { from: "trash", target: { type: "spell" }, type: "play" },
      optional: true,
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("registry payload drops three printed clauses — the 'Energy cost no more than [3]' filter, 'ignoring its Energy cost', and 'Recycle that spell after you play it'", async () => {
    // Expected: the play effect carries an energyCost ≤ 3 filter, an ignore-energy-cost marker and a
    // recycle rider. Actual: `{ from: "trash", target: { type: "spell" }, type: "play" }` and nothing else.
    await scenario().hand(P1, CARD, "fizz").build();
    const ability = ((peekDefaultCardPool()?.get(CARD)?.abilities ?? [])[0] ?? {}) as Record<string, unknown>;
    const effect = JSON.stringify(ability.effect ?? {});
    expect(effect).toMatch(/"lte":3/);
    expect(effect).toMatch(/ignore/i);
    expect(JSON.stringify(ability)).toMatch(/recycle/i);
  });

  test("cost: 3 energy + [chaos]; enters the base exhausted as a 3-Might unit; unaffordable without the chaos or at 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "fizz").build();
    await game.p1.play("fizz");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle({ policy: "first" }); // empty trash: any "you may" is harmless
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("fizz")).toMatchObject({ isExhausted: true, might: 3 });
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "f").build()).p1.can("play", "f")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 2 } }).hand(P1, CARD, "f").build()).p1.can("play", "f")).toBe(false);
  });

  test("'When you play me' goes on the chain as Fizz's triggered ability; accepting (with energy to spare) offers a pick from your trash", async () => {
    const game = await board({ energy: 10 }).build();
    await game.p1.play("fizz");
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, triggered: true })]);
    // Re-drive from here (playAndAccept minus the play).
    let pick: PickDecision | undefined;
    for (let i = 0; i < 12 && !pick; i++) {
      const d = game.decision()!;
      if (isSpellPick(d)) {
        pick = d;
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "yes-no") {
        await game.p1.yes();
      }
    }
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    const keys = pick!.options.map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining(["confront", "inc"]));
    expect(keys).not.toContain("skulk"); // "a spell": units in the trash are never offered
    expect(keys).not.toContain("theirs"); // "from YOUR trash"
  });

  test("'Energy cost no more than [3]' — Disintegrate (printed 4) must not be offered; the eligible set is exactly {Confront, Incinerate, Void Seeker}", async () => {
    // Expected (206: printed cost): confront, inc, vs. Actual: Disintegrate is offered too (no ≤3 filter).
    const game = await board({ energy: 10, power: { fury: 1 } }).build();
    const pick = await playAndAccept(game);
    expect(pick).toBeDefined();
    expect(pick!.options.map((o) => o.key).sort()).toEqual(["confront", "inc", "vs"]);
  });

  test("'ignoring its Energy cost' (356.1.b.2) — with 0 energy left after paying for Fizz, Confront is still offered and is played for free", async () => {
    // Expected: pick offered at 0 energy; picking Confront puts it on the chain with energy still 0.
    // Actual: the engine only offers trash spells it can charge full price for, so nothing is offered.
    const game = await board().build();
    const pick = await playAndAccept(game);
    expect(game.p1.energy()).toBe(0);
    expect(pick?.options.map((o) => o.key)).toContain("confront");
    await game.p1.pick("confront");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().some((c) => c.cardId === "confront" && !c.triggered)).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]); // Confront's "Draw 1" resolved
  });

  test("the chosen spell is PLAYED (419.3): Incinerate goes on the chain, the opponent gets priority before it resolves, then it deals its 2 to the target", async () => {
    const game = await board({ energy: 10 }).build();
    const pick = await playAndAccept(game);
    expect(pick).toBeDefined();
    await game.p1.pick("inc");
    await handToOpponent(game, "tgt");
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toContain("inc");
    expect(game.state("tgt").damage).toBe(0);
    await game.settle();
    expect(game.state("tgt").damage).toBe(2);
    expect(game.zoneOf("inc")).not.toBe("chain");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'Recycle that spell after you play it' — after Confront resolves (draw 1) it sits at the BOTTOM of the main deck, not in the trash", async () => {
    // Expected: confront → mainDeck (last). Actual: it returns to the trash like a normally cast spell.
    const game = await board({ energy: 10 }).build();
    const pick = await playAndAccept(game);
    expect(pick).toBeDefined();
    await game.p1.pick("confront");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.trash()).not.toContain("confront");
    expect(game.zoneOf("confront")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("confront");
  });

  test("'(You must still pay its Power cost)' — Void Seeker with a [fury] available and only 2 energy left: fury spent, energy untouched, 4 damage + draw 1", async () => {
    // Expected per 356.1.b.2. Actual: Void Seeker is not offered because the engine wants its 3 energy too.
    const game = await board({ energy: 5, power: { fury: 1 } }).build();
    const pick = await playAndAccept(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, fury: 1 } });
    expect(pick?.options.map((o) => o.key)).toContain("vs");
    await game.p1.pick("vs");
    await handToOpponent(game, "tgt");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, fury: 0 } });
    expect(game.state("tgt").damage).toBe(4);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("356.1.b.2 negative space: WITHOUT fury power Void Seeker is not a legal pick — no damage, no draw, and nothing but Fizz was paid for", async () => {
    const game = await board({ energy: 6 }).build();
    const pick = await playAndAccept(game);
    expect(pick?.options.map((o) => o.key) ?? []).not.toContain("vs");
    if (pick) {
      const r = await game.p1.try((p) => p.pick("vs"));
      expect(r.ok).toBe(false);
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("tgt").damage).toBe(0);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
  });

  test("'you may': declining leaves the trash, deck and hand untouched and Fizz exhausted in base", async () => {
    const game = await board({ energy: 10 }).build();
    const pick = await playAndAccept(game, false);
    if (pick) {
      await game.p1.decline(); // an engine that skips the yes/no and offers a declinable pick is also fine
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.trash().sort()).toEqual(["confront", "dis", "inc", "skulk", "vs"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.state("fizz")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.state("tgt").damage).toBe(0);
    expect(game.p1.energy()).toBe(7);
  });

  test("419.3.c: a trash holding only a UNIT gives nothing to play — no dangling prompt, Fizz in base, the unit stays trashed", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { chaos: 1 } }).trash(P1, SKULKER, "skulk").hand(P1, CARD, "fizz").build();
    const pick = await playAndAccept(game);
    expect(pick).toBeUndefined();
    await game.settle({ policy: "first" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("skulk")).toBe("trash");
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.p1.energy()).toBe(4);
  });

  test("'from YOUR trash': the opponent's trashed Confront is never offered and never moves, whatever P1 picks", async () => {
    const game = await board({ energy: 10 }).build();
    const pick = await playAndAccept(game);
    expect(pick?.options.map((o) => o.key) ?? []).not.toContain("theirs");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.trash()).toEqual(["theirs"]);
  });
});
