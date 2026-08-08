/**
 * Sigil of the Storm — ogn-287-298 · Battlefield
 *
 *   When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)
 *
 * Rules: 383.4.c.2.b / 471.2.a ("When you conquer here" is a Conquer Effect of whoever performed the
 * conquer, triggering at the battlefield conquered — never on a Hold, never for another battlefield),
 * 416.1.b (runes recycle to the bottom of the RUNE deck), 416.1.c (each player recycles to their OWN
 * deck), 416.4 (as part of an effect you recycle as many as possible — zero runes = nothing happens),
 * 416.6 ("recycle X" picks on resolution and does NOT target — the reminder text says so verbatim),
 * 159/160 (the Rune Pool counter is separate: a rune recycled by an EFFECT adds no Power, unlike the
 * rune's own "Recycle me: [Add] [C]" ability; energy already floated from a rune stays).
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. "you" is the CONQUEROR, whoever owns the battlefield card: P1 taking P2's Sigil recycles a P1 rune;
 *     P2 taking it back recycles a P2 rune. The opponent's runes are never on offer.
 *  2. Mandatory and exactly one: 12 runes in the pool → a forced 1-of-12 pick with no decline; 0 runes →
 *     the trigger still resolves and the game moves on (no stall, the conquer point stands).
 *  3. "Doesn't choose anything": the trigger is put on the chain with NO target, P1 gets priority first
 *     (the classic line: tap your runes for energy in response, then feed the Sigil an exhausted one), and
 *     the rune is selected only as it resolves — so a rune that left in response cannot make it "fizzle";
 *     another rune must go (416.4).
 *  4. An effect-recycle is not the rune's [Add] ability: no Power is produced; the recycled rune is the
 *     bottom card of its owner's rune deck.
 *  5. "here" only: holding the Sigil scores but recycles nothing; conquering a DIFFERENT battlefield while
 *     you control the Sigil recycles nothing.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-287-298";

/** P1 (runes r1 fury ready, r2 mind exhausted) attacks P2's 1-Might defender at the Sigil with a 3-Might unit. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .rune(P1, "fury", { alias: "r1" })
    .rune(P1, "mind", { alias: "r2", exhausted: true })
    .rune(P2, "calm", { alias: "theirs" })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def");
}

describe("Sigil of the Storm (ogn-287-298)", () => {
  test("registry payload: one triggered ability — on conquer by the controller, recycle 1 friendly rune from the board", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Sigil of the Storm" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, from: "board", target: { controller: "friendly", type: "rune" }, type: "recycle" },
      trigger: { event: "conquer", on: "controller" },
      type: "triggered",
    });
  });

  test("conquering here puts ONE triggered item (controlled by the conqueror) on the chain and P1 must name one of P1's runes — no decline, the opponent's rune not offered", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["r1", "r2"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "Sigil of the Storm", triggered: true })]);
  });

  test("the named rune (an EXHAUSTED one is fine) goes to the BOTTOM of P1's rune deck; no Power is produced; the other rune and P2's rune stay", async () => {
    const game = await board().build();
    const runeDeck0 = game.p1.runeDeck().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.pick("r2");
    await game.settle();
    expect(game.zoneOf("r2")).toBe("runeDeck");
    expect(game.p1.runeDeck()).toHaveLength(runeDeck0 + 1);
    expect(game.p1.runeDeck().at(-1)).toBe("r2");
    expect(game.p1.runes()).toEqual(["r1"]);
    expect(game.p2.runes()).toEqual(["theirs"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // an effect-recycle is not "Recycle me: [Add] [C]"
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("exactly one, even from a full pool: 12 runes → a forced 1-of-12 pick, 11 remain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .runes(P1, "fury", 12)
      .unit(P1, "base", { might: 3 }, "raider")
      .unit(P2, "bf1", { might: 1 }, "def")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1 });
    expect(d.options).toHaveLength(12);
    await game.settle({ policy: "first" });
    expect(game.p1.runes()).toHaveLength(11);
    expect(game.p1.runeDeck()).toHaveLength(13);
  });

  test("'must' with ZERO runes: the trigger resolves doing nothing — no prompt, no stall, the conquer point stands (416.4)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .rune(P2, "calm", { alias: "theirs" })
      .unit(P1, "base", { might: 3 }, "raider")
      .unit(P2, "bf1", { might: 1 }, "def")
      .build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.runes()).toEqual(["theirs"]); // never the opponent's rune
    expect(game.chain()).toEqual([]);
  });

  test("'you' is the conqueror, not the card's owner: P2 re-taking their own Sigil from P1 recycles a P2 rune (forced single pick), P1's rune untouched", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .rune(P1, "fury", { alias: "mine" })
      .rune(P2, "calm", { alias: "theirs" })
      .unit(P2, "base", { might: 3 }, "raider")
      .unit(P1, "bf1", { might: 1 }, "def")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle(); // the lone P2 rune is a forced pick
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("theirs")).toBe("runeDeck");
    expect(game.p2.runes()).toEqual([]);
    expect(game.p1.runes()).toEqual(["mine"]);
  });

  test("negative space — HOLDING the Sigil scores the hold point but recycles nothing (a conquer effect is not a hold effect)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .rune(P1, "fury", { alias: "r1" })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("r1")).toBe("runePool");
    expect(game.p1.runes()).toHaveLength(3); // r1 + 2 channeled
    expect(game.decision()?.kind).toBe("action");
  });

  test("negative space — conquering a DIFFERENT battlefield (Sigil controlled by the opponent) recycles nothing", async () => {
    const game = await board().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 1 }, "other").build();
    await game.p1.move("raider", "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.runes().sort()).toEqual(["r1", "r2"]);
  });

  // BUG — expected: "When you conquer HERE" only; P1 already controls the Sigil (bf1) and conquers bf2, so
  // nothing is recycled (383.4.c.2.b / 471.2.a). Actual: the parsed trigger has no `location: "here"`
  // (contrast Zaun Warrens / Minefield), so it fires on ANY conquer by the Sigil's controller and P1 is
  // asked to recycle a rune.
  test.failing("BUG: 'here' — conquering ANOTHER battlefield while you control the Sigil must not trigger it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .rune(P1, "fury", { alias: "r1" })
      .rune(P1, "mind", { alias: "r2" })
      .unit(P1, "bf1", { might: 3 }, "sitter")
      .unit(P1, "base", { might: 3 }, "raider")
      .unit(P2, "bf2", { might: 1 }, "def")
      .build();
    await game.p1.move("raider", "bf2");
    const r = await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes().sort()).toEqual(["r1", "r2"]);
  });

  // BUG — expected (416.6 + the printed reminder "This doesn't choose anything"): the trigger is added to
  // the chain with NO target; P1 receives priority first (and may tap runes for energy in response), and
  // which rune to recycle is decided only as the ability RESOLVES. Actual: the engine asks for a rune
  // "target" while finalizing the trigger (before any priority) and records it as the item's target.
  test.failing("BUG: doesn't choose — no rune is named until resolution; P1 can float energy from r1 in response and then recycle the exhausted r1, keeping the energy", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat → conquer → trigger pending
    expect(game.chain()).toEqual([expect.objectContaining({ name: "Sigil of the Storm", triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.tapRune("r1"); // respond first
    expect(game.p1.energy()).toBe(1);
    await game.settle(); // both pass → resolves → NOW the rune is selected
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("r1");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual(["r2"]);
    expect(game.p1.energy()).toBe(1);
  });

  // BUG — expected (416.4 / 416.6): the recycle is not targeted, so if the rune P1 meant to give up leaves
  // in response (here: P1 uses r1's own Recycle for 1 power), P1 must still recycle one of the runes that
  // remain — r2 goes to the rune deck. Actual: r1 was locked in as a "target" up front, the ability finds
  // it gone and does nothing; r2 stays in the pool.
  test.failing("BUG: cannot fizzle — the rune P1 had in mind leaves in response, so the remaining rune r2 must be recycled instead", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("r1"); // (engine quirk: asked early — name r1)
    }
    await game.p1.recycleRune("r1"); // in response: r1 → rune deck, +1 fury
    expect(game.p1.power("fury")).toBe(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r2")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
  });
});
