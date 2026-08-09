/**
 * Interaction: Green Father (unl-195-219, Legend) "When you conquer or hold, you may exhaust me to
 *   replace that battlefield with a Brush battlefield token. (… It can be swapped back when scored.)"
 *   × Bandle Tree (ogn-278-298, Battlefield) "You may hide an additional card here."
 *   × Hidden Blade (ogn-213-298, Spell) "[Hidden] [Action] Kill a unit at a battlefield. Its
 *     controller draws 2."  (+ a second Hidden card, Pakaa Cub ogn-135-298, facedown beside it)
 *
 * Question: P1 (legend Green Father) controls Bandle Tree with a unit and TWO facedown cards hidden
 * there on earlier turns. At the start of P1's Beginning Phase P1 holds the Tree and exhausts Green
 * Father to replace it with a Brush token.
 *  (a) Is that "losing control" (107.3.d — trash both)? Do the facedown cards move?
 *  (b) Brush has no extra-slot text — what happens to the two cards, who chooses, is it revealed?
 *  (c) Is the survivor still playable for [0] this turn?
 *  (d) Contrast: only ONE facedown card.
 *  (e) Brush swapped back to Bandle Tree on a later score — does the trashed card return / does the
 *      second slot reopen?
 *
 * Rules: 438.1 / 438.1.a (Replace = create the token in place, inheriting all statuses; same game
 * object), 652.2.b (units and hidden cards at a replaced battlefield do not move), 652.2.c (the
 * replaced battlefield's continuous effects cease), 107.3.b / .b.1 / .b.2 (Facedown Zone max 1; can
 * rise or fall; on a drop the zone's CONTROLLER trashes the difference), 421.3 (facedown permissions
 * come from the effect that hid them), 421.4 (a facedown card changing zones is revealed to all),
 * 811.1.b / 811.6 (from the next turn: gains Reaction, play ignoring base cost), 811.1.d.2 (targets
 * from Hidden are chosen at that battlefield), 190.6.d ("you" on a battlefield = its controller),
 * 438.7.b (Swap Back: original returns to the slot inheriting current statuses).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const BANDLE_TREE = "ogn-278-298";
const HIDDEN_BLADE = "ogn-213-298";
const PAKAA_CUB = "ogn-135-298"; // Unit · 3 Might · [Hidden] — the "other Hidden card"
const CONSULT = "ogn-083-298"; // Spell · [Hidden] [Reaction] Draw 2 — a Hidden card kept in hand for (e)

/**
 * End of P2's turn 2. P1: legend Green Father, controls Bandle Tree (live text) with a Holder on it,
 * Hidden Blade (+ optionally Pakaa Cub) facedown there since an earlier turn, Consult the Past in
 * hand. P2 controls a plain bf2 with a unit (a unit "at a battlefield" that is NOT at the Tree).
 */
function board(opts: { twoFacedown?: boolean; intruder?: boolean } = {}) {
  let s = scenario()
    .turn(2)
    .active(P2)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("tree", { controller: P1, def: BANDLE_TREE, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Faraway" }, "faraway")
    .hand(P1, CONSULT, "consult")
    .facedown(P1, "tree", HIDDEN_BLADE, "blade");
  if (opts.twoFacedown !== false) {
    s = s.facedown(P1, "tree", PAKAA_CUB, "cub");
  }
  if (opts.intruder) {
    s = s.unit(P2, "tree", { might: 2, name: "Intruder" }, "intruder");
  }
  return s;
}

/** P2 ends the turn → P1 holds the Tree → Green Father asks; answer it and settle. */
async function holdAndAnswerGreenFather(game: Game, yes: boolean): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
  await (yes ? game.p1.yes() : game.p1.no());
  await game.settle();
}

/** The battlefield `unit` stands on, whatever its slot key has become. */
function battlefieldUnder(game: Game, unit: string) {
  const id = game.locationOf(unit) as string;
  return { controller: game.gameState.battlefields[id]?.controller, id, name: game.state(id).name };
}

describe("Green Father → Brush over a Bandle Tree holding two facedown cards", () => {
  test("(a) replacing is NOT losing control: the slot is now a Brush still controlled by P1, the hold point counted, and neither facedown card was swept by 107.3.d — both are still facedown at the same battlefield (438.1, 652.2.b)", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    expect(battlefieldUnder(game, "holder")).toEqual({ controller: P1, id: "tree", name: "Brush" });
    expect(game.cardsAt("banishment").map((id) => game.state(id).name)).toEqual(["Bandle Tree"]); // 438.5
    // Nothing was trashed automatically; the cards did not move.
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("facedown-tree");
    expect(game.zoneOf("cub")).toBe("facedown-tree");
    expect(game.state("blade").isHidden).toBe(true);
    expect(game.state("cub").isHidden).toBe(true);
  });

  test("(b) Brush lacks the extra slot, so occupancy drops to 1 (107.3.b, 652.2.c): the zone's CONTROLLER (P1) is asked to put exactly one of the two facedown cards in the trash (107.3.b.2) — a compulsory pick, not P2's choice and not random", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(false);
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["blade", "cub"]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("(b) P1 trashes the Cub: it leaves the Facedown Zone REVEALED (421.4 — face up in the trash, named in P2's view), Hidden Blade stays facedown and hidden, and play continues to P1's main phase", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.state("cub").isHidden).toBe(false);
    expect(game.p2.cardsAt({ owner: P1, zone: "trash" })).toEqual(["cub"]); // the opponent sees its identity
    expect(game.zoneOf("blade")).toBe("facedown-tree");
    expect(game.state("blade").isHidden).toBe(true);
    expect(game.p1.facedown("tree")).toEqual(["blade"]);
  });

  test("(b) it is P1's free choice which one goes — picking Hidden Blade instead trashes the Blade and keeps the Cub hidden", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("blade");
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("blade").isHidden).toBe(false);
    expect(game.p1.facedown("tree")).toEqual(["cub"]);
    expect(game.state("cub").isHidden).toBe(true);
  });

  test("(c) the survivor never changed zones, so its Hidden permissions stand (421.3, 811.1.b): this very turn, with 0 energy, P1 may play Hidden Blade from facedown — it goes on the chain for [0]", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, triggered: false })]);
    expect(game.p1.energy()).toBe(0);
  });

  test("(c) played from Hidden at the Brush, Hidden Blade's 'unit at a battlefield' must be chosen HERE (811.1.d.2): the Holder and an enemy Intruder at the Brush are offered, the enemy unit at bf2 is not; killing the Intruder makes P2 draw 2", async () => {
    const game = await board({ intruder: true }).build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    await game.settle();
    const p2Hand = game.p2.hand().length;
    await game.p1.reveal("blade");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["holder", "intruder"]);
    await game.p1.pick("intruder");
    await game.settle();
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-tree");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });

  test("(d) contrast — with only ONE facedown card the new maximum (1) is not exceeded: no prompt at all, nothing trashed, Hidden Blade stays hidden under P1 at the Brush and P1 is in the main phase", async () => {
    const game = await board({ twoFacedown: false }).build();
    await holdAndAnswerGreenFather(game, true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(battlefieldUnder(game, "holder").name).toBe("Brush");
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("facedown-tree");
    expect(game.state("blade")).toMatchObject({ controller: P1, isHidden: true });
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("(d′) control — declining Green Father keeps Bandle Tree, so occupancy stays 2 and both cards remain facedown with no prompt", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(battlefieldUnder(game, "holder").name).toBe("Bandle Tree");
    expect(game.p1.facedown("tree").sort()).toEqual(["blade", "cub"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("(b″) while it is a Brush the zone really holds ONE: with Hidden Blade still facedown there, hiding Consult the Past at the Brush is refused even with [rainbow] to pay", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    await game.settle();
    await game.p1.do("addResources", { power: { rainbow: 1 } });
    expect(game.p1.can("hide", "consult")).toBe(false);
    expect((await game.p1.try((p) => p.hide("consult", "tree"))).ok).toBe(false);
    expect(game.p1.facedown("tree")).toEqual(["blade"]);
  });

  /**
   * (e) — one full round later P1 holds the Brush again. Two "when you hold/score" triggers go on the
   * chain: Green Father (readied in Awaken — decline it) and the Brush's own "you may replace this with
   * the battlefield it replaced" (accept it).
   */
  async function swapBackNextRound(game: Game): Promise<void> {
    await game.advanceTurn(); // P1 ends turn 3 → P2's turn 4
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn(); // → P1's turn 5 Beginning Phase: hold
    expect(game.phase()).toBe("beginning");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tree" } });
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
  }

  test("(e) swapped back on the next hold (438.7.b): the Holder now stands on Bandle Tree again under P1's control, the Brush token is gone, banishment is empty — and the Cub trashed in (b) stays in the trash", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    await game.settle();
    await swapBackNextRound(game);
    expect(game.p1.points()).toBe(2); // held twice
    const bf = battlefieldUnder(game, "holder");
    expect(bf).toMatchObject({ controller: P1, name: "Bandle Tree" });
    expect(game.battlefields().map((id) => game.state(id).name).sort()).toEqual(["Bandle Tree", "bf2"]);
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.p1.trash()).toContain("cub");
  });

  test("(e) the second slot reopens with the Tree's text (107.3.b.1): after the swap-back P1 — having played the Blade out earlier — hides Consult the Past AND a second Hidden card at the Tree; a Brush would have refused the second", async () => {
    const game = await board({ intruder: true }).hand(P1, PAKAA_CUB, "cub2").build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    await game.settle();
    // Empty the zone first: play the Blade on the enemy Intruder standing at the Brush.
    await game.p1.reveal("blade");
    await game.p1.pick("intruder");
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("intruder")).toBe("trash");
    await swapBackNextRound(game);
    const loc = game.locationOf("holder") as string;
    await game.p1.do("addResources", { power: { rainbow: 2 } });
    await game.p1.hide("consult", loc);
    expect(game.p1.can("hide", "cub2")).toBe(true);
    await game.p1.hide("cub2", loc);
    expect(game.p1.facedown(loc).sort()).toEqual(["consult", "cub2"]);
    expect(game.p1.power()).toBe(0);
  });

  // BUG — expected (438.7.b / 652.2.b): Swap Back is an extension of Replace, so a card still facedown at the
  // Brush stays facedown at the returning Bandle Tree (same slot, statuses inherited) and remains playable; with
  // the Tree's second slot back, one more card may be hidden beside it. Actual: the swap-back re-keys the slot to
  // the returning card's id and carries the units over, but leaves the facedown card behind in the old
  // `facedown-tree` zone — it is no longer at any battlefield (not listed there, not playable).
  test("(e) a card still facedown at the Brush rides through the swap-back — Hidden Blade is facedown at the returned Bandle Tree, still playable, and Consult the Past can be hidden next to it (2 of 2)", async () => {
    const game = await board().build();
    await holdAndAnswerGreenFather(game, true);
    await game.p1.pick("cub");
    await game.settle();
    await swapBackNextRound(game);
    const loc = game.locationOf("holder") as string;
    expect(game.state(loc).name).toBe("Bandle Tree");
    expect(game.p1.facedown(loc)).toEqual(["blade"]);
    expect(game.state("blade").isHidden).toBe(true);
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.do("addResources", { power: { rainbow: 1 } });
    await game.p1.hide("consult", loc);
    expect(game.p1.facedown(loc).sort()).toEqual(["blade", "consult"]);
  });
});
