/**
 * Fallen Feline — ven-132-166 · Unit · Order · 2 energy + [order] · 3 Might
 *
 *   When you play me, name a spell.
 *   While I'm at a battlefield, opponents can't play spells with that name.
 *
 * Rules: 762 (naming a card: a real spell name — units are not nameable here), 419.1 (playing = putting
 * on the chain, so the static only stops NEW plays; it is checked continuously — 364), 811.1.b/.6 +
 * 811.1.c.3 (flipping a facedown card IS playing it, at Reaction speed), 108.2 ("opponents" = players
 * other than Feline's controller), cleanup step 4 is irrelevant: the lock keys on Feline's LOCATION.
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. The naming is a play TRIGGER (chain item, P2 gets priority before any name exists — a Reaction
 *     cast in that window is still legal); the name is then remembered on Feline for good.
 *  2. Location gate is live and continuous: in base → no lock; standard-move her to a battlefield →
 *     lock on at once; killed / back in base → lock off. Played straight to a battlefield → the lock
 *     bites the same turn (P2 cannot answer P1's next spell with the named Reaction).
 *  3. Scope: only OPPONENTS (P1 may still cast the named spell), only THAT NAME (other spells fine),
 *     every copy of that name; two Felines can lock two names.
 *  4. Facedown copies: revealing a hidden Block is playing Block — must be refused while locked.
 *  5. Costs: 2 + [order]; vocabulary offered to the namer contains spells, not units.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-132-166";
const CLEAVE = "ogn-004-298"; // 1-cost Fury Action: give a unit Assault 3 this turn
const DISCIPLINE = "ogn-058-298"; // 2-cost Calm Reaction: give a unit +2 Might this turn, draw 1
const BLOCK = "ogn-057-298"; // 2-cost Calm Action with [Hidden]
const SKULKER = "ogn-175-298"; // vanilla unit (must NOT be nameable)

/** Pass chain priority until a non-action prompt (the name prompt) or the open state. */
async function toPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return d;
    }
    await game.seat(d.seat).passPriority();
  }
  return game.decision();
}

/** P2's turn with 5 energy, Cleave + Discipline in hand, a unit to aim at; P1's Feline (already named `named`) at `where`. */
function locked(where: "base" | "bf1", named = "Cleave") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, where, CARD, "feline", { namedCard: named })
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P2, CLEAVE, "cleave")
    .hand(P2, CLEAVE, "cleave2")
    .hand(P2, DISCIPLINE, "disc");
}

describe("Fallen Feline (ven-132-166)", () => {
  test("registry payload: a play-self trigger that names a SPELL + a while-at-battlefield static restricting opponents from playing spells matching the named card; 2 + [order], 3 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 2, might: 3, name: "Fallen Feline", powerCost: ["order"] });
    expect(def?.abilities).toEqual([
      { effect: { cardType: "spell", type: "name-card" }, trigger: { event: "play-self" }, type: "triggered" },
      {
        condition: { type: "while-at-battlefield" },
        effect: { cardType: "spell", matchesNamedCard: true, type: "restrict-play", who: "opponents" },
        type: "static",
      },
    ]);
  });

  test("cost: 2 energy + 1 order, may be played to base or a battlefield you control; 3 Might, enters exhausted; without the order pip → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "feline").hand(P2, CLEAVE, "c").build();
    expect(game.p1.option("play", "feline")?.fields.find((f) => f.arg === "to")?.options).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("feline", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
    await game.settle({ policy: "first" });
    expect(game.state("feline")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "f").build()).p1.can("play", "f")).toBe(false);
  });

  test("'When you play me, name a spell': a triggered chain item, then P1 gets a NAME prompt whose vocabulary holds spells (Cleave, Discipline) but no unit names; the choice is recorded on Feline", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .hand(P1, CARD, "feline")
      .hand(P2, CLEAVE, "cleave")
      .hand(P2, DISCIPLINE, "disc")
      .hand(P2, SKULKER, "skulker")
      .build();
    await game.p1.play("feline");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "feline", controller: P1, triggered: true })]);
    const d = await toPrompt(game);
    expect(d).toMatchObject({ cardType: "spell", kind: "name", seat: P1 });
    const vocab = d?.kind === "name" ? d.vocabulary : [];
    expect(vocab).toEqual(expect.arrayContaining(["Cleave", "Discipline"]));
    expect(vocab).not.toContain("Shipyard Skulker");
    expect(vocab).not.toContain("Fallen Feline");
    await game.p1.name("Cleave");
    expect(game.state("feline").meta.namedCard).toBe("Cleave");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("while Feline is AT A BATTLEFIELD the opponent cannot play either copy of the named spell, but a differently-named spell is fine", async () => {
    const game = await locked("bf1").build();
    expect(game.p2.can("cast", "cleave")).toBe(false);
    expect(game.p2.can("cast", "cleave2")).toBe(false);
    expect((await game.p2.try((p) => p.cast("cleave", { targets: "foe" }))).ok).toBe(false);
    expect(game.zoneOf("cleave")).toBe("hand");
    expect(game.p2.energy()).toBe(5);
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(4);
  });

  test("negative space: with Feline in the BASE the name is remembered but nothing is locked — P2 casts Cleave freely", async () => {
    const game = await locked("base").build();
    expect(game.state("feline").meta.namedCard).toBe("Cleave");
    expect(game.p2.can("cast", "cleave")).toBe(true);
    await game.p2.cast("cleave", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });

  test("only OPPONENTS are restricted: Feline's controller may still play the named spell while she sits at a battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "feline", { namedCard: "Cleave" })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CLEAVE, "mine")
      .build();
    expect(game.p1.can("cast", "mine")).toBe(true);
    await game.p1.cast("mine", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.state("ally").keywords).toContain("Assault");
  });

  test("the lock follows her location live: base (free) → standard move to bf1 → P2's next turn Cleave is illegal, Discipline still legal", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "feline", { namedCard: "Cleave" })
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P2, CLEAVE, "cleave")
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await game.p1.move("feline", "bf1");
    await game.settle();
    expect(game.locationOf("feline")).toBe("bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRunes(2);
    expect(game.p2.energy()).toBe(2);
    expect(game.p2.can("cast", "cleave")).toBe(false);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  test("…and lifts the moment she leaves the battlefield: P2 attacks and kills Feline at bf1, then casts the once-forbidden Cleave in the same turn", async () => {
    const game = await locked("bf1").unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser").build();
    expect(game.p2.can("cast", "cleave")).toBe(false);
    await game.p2.move("bruiser", "bf1");
    await game.settle(); // 5 vs 3: Feline dies
    expect(game.zoneOf("feline")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "cleave")).toBe(true);
    await game.p2.cast("cleave", { targets: "bruiser" });
    expect(game.zoneOf("cleave")).toBe("chain");
  });

  test("played straight to a battlefield naming 'Discipline': the same turn, P2 (2 energy floating) may NOT answer P1's Cleave with Discipline; before the name existed it still could", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CARD, "feline")
      .hand(P1, CLEAVE, "mycleave")
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await game.p1.play("feline", { to: "bf1" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "disc")).toBe(true); // trigger unresolved: no name yet → no lock
    await game.p2.passPriority();
    expect(game.decision()?.kind).toBe("name");
    await game.p1.name("Discipline");
    await game.settle();
    await game.p1.cast("mycleave", { targets: "ally" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("cast");
  });

  test("two Felines at battlefields naming Cleave and Discipline lock BOTH names for the opponent", async () => {
    const game = await locked("bf1", "Cleave").unit(P1, "bf1", CARD, "feline2", { namedCard: "Discipline" }).build();
    expect(game.p2.can("cast", "cleave")).toBe(false);
    expect(game.p2.can("cast", "disc")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(expect.not.arrayContaining(["cast"]));
  });

  test("the name persists across turns: two full rounds later, Feline still at bf1, Cleave is still illegal for P2", async () => {
    const game = await locked("bf1").build();
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("feline").meta.namedCard).toBe("Cleave");
    await game.p2.tapRunes(2);
    expect(game.p2.can("cast", "cleave")).toBe(false);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  // Expected (811.1.b / 811.1.c.3: flipping a facedown card is PLAYING it): with Feline at a battlefield
  // having named "Block", P2 may not reveal-and-play the Block it hid at bf2 last turn, exactly as the
  // copy in hand is refused. Actual: `revealHidden` never consults the board's restrict-play statics,
  // so the facedown Block is offered (the hand copy is correctly refused).
  test("a facedown copy of the named spell can still be played from Hidden while Feline is at a battlefield (811.1.c.3 — revealing is playing)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "feline", { namedCard: "Block" })
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
      .facedown(P2, "bf2", BLOCK, "hiddenBlock")
      .hand(P2, BLOCK, "handBlock")
      .build();
    expect(game.p2.can("cast", "handBlock")).toBe(false);
    expect(game.p2.can("reveal", "hiddenBlock")).toBe(false);
    // Control: with Feline back in base the flip is legal again.
    const free = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "feline", { namedCard: "Block" })
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
      .facedown(P2, "bf2", BLOCK, "hiddenBlock")
      .build();
    expect(free.p2.can("reveal", "hiddenBlock")).toBe(true);
  });
});
