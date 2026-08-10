/**
 * Interaction: Divine Judgment (ogn-244-298) × Battle Mistress (sfd-203-221)
 *
 *   Divine Judgment — Spell · Order · 7 + [order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *   Battle Mistress — Legend (Sivir)
 *     "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted. …"
 *
 * Position: P1's turn; P1 (4 runes, all exhausted after paying) casts Divine Judgment. P2's legend
 * is a READY Battle Mistress; P2 controls 5 Fury runes (3 ready, 2 exhausted), pool 0/0.
 *
 * Questions / rulings under test:
 *  (a) With the spell on the chain and P2 holding priority, P2 may activate its basic runes'
 *      [Reaction] Add abilities (164.2.a "[E]: Add [1]", 164.2.b "Recycle this: Add [C]"): they
 *      finalize and resolve at once without joining the chain (429.2/429.2.a). The floated
 *      resources survive the spell's resolution.
 *  (b) Being recycled BY AN EFFECT adds nothing (429.4.a — you only Add when an effect says Add;
 *      164.2.b's [C] is the effect of the rune's own ability whose COST is "Recycle this"; the
 *      spell's recycle is an instructed action, 416.4). Ready and exhausted runes are equally
 *      eligible to keep / recycle.
 *  (c) Each player recycles their OWN cards (416.1.c), so P2 is the one recycling P2's runes even
 *      though P1's spell instructed it → "when YOU recycle a rune" is met for P2's Mistress. The
 *      cost "exhaust me" can be paid once → at most ONE exhausted Gold token; declining → ready
 *      legend, no Gold. Nothing triggers for P1's recycled runes.
 *  (d) Runes go to the bottom of their OWNER's Rune Deck (416.1.b/161.2.b) in the order the owner
 *      chooses (416.5.a). P2's floated energy persists through P1's turn and empties in P1's
 *      Expiration Step (317.2.d) — P2's next Main Phase opens at 0.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const BATTLE_MISTRESS = "sfd-203-221";

const P1_RUNES = ["o1", "o2", "o3", "o4"];
const P2_READY = ["r1", "r2", "r3"];
const P2_EXHAUSTED = ["r4", "r5"];
const P2_RUNES = [...P2_READY, ...P2_EXHAUSTED];

function board() {
  const b = scenario().resources(P1, { energy: 7, power: { order: 2 } }).hand(P1, DIVINE_JUDGMENT, "dj");
  for (const id of P1_RUNES) {
    b.rune(P1, "order", { alias: id, exhausted: true });
  }
  b.legend(P2, BATTLE_MISTRESS, "bm");
  for (const id of P2_READY) {
    b.rune(P2, "fury", { alias: id });
  }
  for (const id of P2_EXHAUSTED) {
    b.rune(P2, "fury", { alias: id, exhausted: true });
  }
  return b;
}

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** P1 casts Divine Judgment and passes; P2 now holds priority with the spell on the chain. */
async function castAndGiveP2Priority(game: Game): Promise<void> {
  await game.p1.cast("dj");
  expect(game.chain().map((c) => c.cardId)).toEqual(["dj"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/**
 * Both pass → the spell resolves. P1 recycles o1+o2 (keeps o3,o4); P2 recycles `p2Recycles`
 * (one pick at a time, in that order). Stops at whatever comes next (the Mistress opt-in).
 */
async function resolveWithChoices(game: Game, p2Recycles: readonly string[]): Promise<void> {
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("o1", "o2");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  for (const r of p2Recycles) {
    await game.p2.pick(r);
  }
}

/** Decline every pending Battle Mistress opt-in for P2 (however many the engine raises). */
async function declineMistress(game: Game): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const d = game.decision();
    if (d?.kind !== "yes-no" || d.seat !== P2) {
      return;
    }
    await game.p2.no();
  }
}

describe("Divine Judgment × Battle Mistress — forced recycle on the opponent", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) with Divine Judgment on the chain, P2 (priority) may tap its 3 ready runes: energy 0→3, chain undisturbed, still 5 runes, P2 keeps priority (164.2.a, 429.2)", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    for (const r of P2_READY) {
      expect(game.p2.can("tapRune", r)).toBe(true);
    }
    expect(game.p2.can("tapRune", "r4")).toBe(false); // already exhausted
    await game.p2.tapRune("r1");
    await game.p2.tapRune("r2");
    await game.p2.tapRune("r3");
    expect(game.p2.energy()).toBe(3);
    expect(game.p2.runes().sort()).toEqual([...P2_RUNES].sort());
    expect(game.p2.runes({ ready: true })).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dj"]); // Add abilities never join the chain
    expect(game.actingSeat()).toBe(P2); // 429.2.a — priority does not pass
    expect(game.zoneOf("dj")).toBe("chain");
  });

  test("(a) P2 may also use a rune's 'Recycle this: Add [C]' before resolution: +1 fury, down to 4 runes, spell still waiting on the chain (164.2.b, 429.2)", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    expect(game.p2.can("recycleRune", "r4")).toBe(true); // an exhausted rune can still be recycled for power
    await game.p2.recycleRune("r1");
    await declineMistress(game); // her opt-in off P2's own voluntary recycle is not this facet's subject
    expect(game.p2.power("fury")).toBe(1);
    expect(game.p2.runes().sort()).toEqual(["r2", "r3", "r4", "r5"]);
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.zoneOf("dj")).toBe("chain");
    expect(game.chain().some((c) => c.cardId === "dj")).toBe(true);
  });

  test("(a)+(b) floated resources survive resolution and the spell's recycle adds NOTHING: P1 +0/+0, P2 shows exactly the 3 energy it floated (429.4.a, 416.4)", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    await game.p2.tapRune("r1");
    await game.p2.tapRune("r2");
    await game.p2.tapRune("r3");
    const p1Before = game.p1.resources();
    expect(p1Before).toEqual({ energy: 0, power: { order: 0 } });
    await resolveWithChoices(game, ["r1", "r2", "r3"]);
    await declineMistress(game);
    await game.settle();
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 3, power: {} }); // no [C] for effect-recycled runes
    expect(game.p1.runes().sort()).toEqual(["o3", "o4"]);
    expect(game.p2.runes().sort()).toEqual(["r4", "r5"]);
  });

  test("(b) exhausted and ready runes are equally eligible: P2's recycle pick offers all 5 of its runes and P2 may keep two READY-was runes by recycling the exhausted ones", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    await game.p2.passPriority();
    await game.p1.pick("o1", "o2");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual([...P2_RUNES].sort());
    // recycle both exhausted runes + one ready one → keeps r2, r3
    await game.p2.pick("r4");
    await game.p2.pick("r5");
    await game.p2.pick("r1");
    await declineMistress(game);
    await game.settle();
    expect(game.p2.runes().sort()).toEqual(["r2", "r3"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  // ---------------------------------------------------------------- (c)
  test("(c) nothing triggers for P1's 2 recycled runes: no prompt between P1's choice and P2's, no Mistress item, no Gold for P1 (416.1.c — P1 recycling is not 'you' for P2)", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    await game.p2.passPriority();
    await game.p1.pick("o1", "o2");
    // P1's runes are already recycled; the very next thing is P2's own choice — no opt-in, no chain item.
    expect(game.zoneOf("o1")).toBe("runeDeck");
    expect(game.zoneOf("o2")).toBe("runeDeck");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(game.chain().some((c) => c.cardId === "bm")).toBe(false);
    expect(game.state("bm").isExhausted).toBe(false);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("(c) P2's Mistress DOES trigger off the spell-forced recycle of P2's own runes; accepting exhausts her and yields exactly ONE exhausted Gold token even though 3 runes were recycled", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    await resolveWithChoices(game, ["r1", "r2", "r3"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.state("bm").isExhausted).toBe(true); // cost paid on acceptance
    // Any further opt-ins (if the engine raised one trigger per rune) cannot be paid — decline them.
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind !== "yes-no" || d.seat !== P2) {
        break;
      }
      expect(d.canAccept).toBe(false);
      await game.p2.no();
    }
    expect(game.chain().filter((c) => c.cardId === "bm" && c.triggered)).toHaveLength(1);
    await game.settle();
    const gold = goldOf(game, "p2");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P2, isExhausted: true, isToken: true, name: "Gold" });
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.state("bm").isExhausted).toBe(true);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c) declining the opt-in leaves the Mistress ready and mints no Gold; the runes are recycled regardless", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    await resolveWithChoices(game, ["r1", "r2", "r3"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await declineMistress(game);
    await game.settle();
    expect(game.state("bm").isExhausted).toBe(false);
    expect(goldOf(game, "p2")).toHaveLength(0);
    expect(game.p2.runes().sort()).toEqual(["r4", "r5"]);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ---------------------------------------------------------------- (d)
  test("(d) recycled runes go to the bottom of their OWNER's Rune Deck, in the order the owner chose (416.1.b/.c, 416.5.a); nothing goes to a Main Deck or trash", async () => {
    const game = await board().build();
    const p1RuneDeck = game.p1.runeDeck().length;
    const p2RuneDeck = game.p2.runeDeck().length;
    const p1Main = game.p1.deck().length;
    const p2Main = game.p2.deck().length;
    await castAndGiveP2Priority(game);
    await resolveWithChoices(game, ["r3", "r1", "r2"]); // P2 chooses the order r3, r1, r2
    await declineMistress(game);
    await game.settle();
    expect(game.p1.runeDeck()).toHaveLength(p1RuneDeck + 2);
    expect(game.p2.runeDeck()).toHaveLength(p2RuneDeck + 3);
    expect(game.p1.runeDeck().slice(-2).sort()).toEqual(["o1", "o2"]);
    expect(game.p2.runeDeck().slice(-3)).toEqual(["r3", "r1", "r2"]);
    for (const r of ["o1", "o2"]) {
      expect(game.state(r).owner).toBe(P1);
    }
    for (const r of ["r1", "r2", "r3"]) {
      expect(game.state(r).owner).toBe(P2);
      expect(game.p1.runeDeck()).not.toContain(r);
    }
    expect(game.p1.deck()).toHaveLength(p1Main);
    expect(game.p2.deck()).toHaveLength(p2Main);
    expect(game.p1.trash()).toEqual(["dj"]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("(d) P2's floated 3 energy stays through the rest of P1's turn and is emptied in P1's Expiration Step — P2's next Main Phase opens at 0 (317.2.d, 316.3)", async () => {
    const game = await board().build();
    await castAndGiveP2Priority(game);
    await game.p2.tapRune("r1");
    await game.p2.tapRune("r2");
    await game.p2.tapRune("r3");
    await resolveWithChoices(game, ["r1", "r2", "r3"]);
    await declineMistress(game);
    await game.settle();
    // Back in P1's open main phase: P2 still holds the floated energy.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.energy()).toBe(3);
    const next = await game.advanceTurn();
    expect(next.next).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
  });
});
