/**
 * Interaction: Imposing Challenger (unl-105-219) · Unit · Body · 5 · 5 Might
 *     "When I move, you may move an enemy unit here with less Might than me to a different battlefield."
 *   × Shipyard Skulker (ogn-175-298) · Unit · Chaos · 3 · 3 Might (vanilla)          — P2's, alone at bfB
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)         — P1's, holding bfA
 *
 * Rules: 144.2 / 420.3.a (the Standard Move's cost is exhausting the mover — a unit moved by an EFFECT is
 * not exhausted), 190.3.a.1 / 450 (the CONTROLLER of the arriving unit applies Contested), 453 + 323.8 /
 * 323.9 (the Move's Cleanup stages a Showdown, and a Combat where opposing units stand), 323.10 (a staged
 * Combat ceases when the two sides are no longer both present before it opened), 323.8.a (the Showdown stays
 * staged while the contester still has a unit there), 323.12 (Neutral Open + Showdown-only battlefields → the
 * TURN PLAYER chooses which begins) evaluated before 323.13 (staged Combats), 344 / 345 (Focus to whoever
 * applied Contested — even on the other player's turn), 348.2.a (non-combat close: sole remaining player
 * establishes control = Conquer), 355.4 / 355.4.a (an ability that Moves chooses its DESTINATION when it is
 * finalized: a location other than the current one where the unit may be), 402 / 383.3.a (leading "you may"
 * and targets decided at finalization, before anyone gets priority), 449.1 ("a different battlefield" — the
 * source restricts the destination: never a base), 464.2.c.1 / .1.a (Attacker = the player who applied
 * Contested; that player takes Focus as the combat showdown opens).
 *
 * Question: three battlefields, P1's turn, Neutral Open. bfA: P1's with Vanguard Sergeant (4). bfB: P2's with
 * Shipyard Skulker (3) alone. bfC: empty, uncontrolled. P1's ready Imposing Challenger Standard-Moves base → bfB.
 *   (a) the post-move Cleanup: who contested bfB, what is staged, and is the whole trigger (opt-in, target,
 *       DESTINATION) finalized by P1 before P2 gets priority? Which destinations are offered? Can the combat
 *       begin while the trigger is on the chain?
 *   (b) P1 picks bfC: staged Combat at bfB ceases, Showdown stays; bfC staged for P2; TWO non-combat
 *       showdowns → turn player P1 picks the first; Focus per contester; both conquer (+1 each).
 *   (c) P1 picks bfA instead: bfB's non-combat Showdown runs BEFORE bfA's Combat; P2 attacks bfA with Focus
 *       on P1's turn; 3 into 4 → Skulker dies, P1 keeps bfA.
 *   (d) P1 declines (or the enemy has 5+ Might): plain combat at bfB, Challenger kills Skulker, P1 conquers.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPOSING_CHALLENGER = "unl-105-219";
const SHIPYARD_SKULKER = "ogn-175-298";
const VANGUARD_SERGEANT = "ogn-219-298";

/**
 * P1's turn 2, Neutral Open. bfA: P1-controlled, held by P1's Vanguard Sergeant. bfB: P2-controlled, held by
 * P2's Shipyard Skulker alone. bfC: empty, uncontrolled. P1's READY Imposing Challenger waits in P1's base.
 */
function board() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "bfA", VANGUARD_SERGEANT, "sergeant")
    .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", IMPOSING_CHALLENGER, "challenger");
}

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []);
const activeShowdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((sd) => sd.active);
const topShowdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const startOffers = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "startShowdown")
    .map((o) => o.key)
    .sort();

/** Challenger base → bfB; P1 opts in; (Skulker is the only legal unit → bound); P1 names `dest`; both pass → the push resolves. */
async function pushedTo(dest: "bfA" | "bfC", opts: { manual?: boolean } = {}): Promise<Game> {
  const game = await (opts.manual ? board().autoProcedures(false) : board()).build();
  await game.p1.move("challenger", "bfB");
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "target") {
    await game.p1.pick("skulker");
  }
  await game.p1.pick(`battlefield-${dest}`);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenger", controller: P1, targets: ["skulker"], triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("(a) the Standard Move and its Cleanup — everything about the trigger is decided by P1 at finalization", () => {
  test("the Challenger pays the move by exhausting (144.2) and arrives at bfB; P1 applied Contested there (190.3.a.1 / 450); P2 still controls bfB", async () => {
    const game = await board().build();
    expect(game.state("challenger").isReady).toBe(true);
    await game.p1.move("challenger", "bfB");
    expect(game.state("challenger")).toMatchObject({ isExhausted: true, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2, stagedBy: P1 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfC?.contested).toBe(false);
  });

  test("the 'When I move' trigger is a P1 item on the chain and its leading 'you may' is asked of P1 NOW (timing FIN) — P2 has not received priority, no showdown has begun, nobody has a combat role (323.13: not a Neutral Open state)", async () => {
    const game = await board().build();
    await game.p1.move("challenger", "bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenger", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "challenger", pendingChoiceType: "opt-in" }, timing: "FIN" });
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.state("challenger").combatRole).toBeNull();
    expect(game.state("skulker").combatRole).toBeNull();
    expect(game.p2.legal().filter((o) => o.moveId !== "concede")).toEqual([]); // P2 has nothing to do yet
  });

  test("after 'yes' the only legal unit (enemy, HERE, 3 < 5 → Skulker) is bound and P1 is asked the DESTINATION at once (355.4, timing FIN): exactly {bfA, bfC} — not bfB (current), not either base ('battlefield')", async () => {
    const game = await board().build();
    await game.p1.move("challenger", "bfB");
    await game.p1.yes();
    let d = game.decision();
    if (d?.kind === "pick" && d.semantics === "target") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["skulker"]);
      await game.p1.pick("skulker");
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "skulker" }, timing: "FIN" });
    expect(pickKeys(d)).toEqual(["battlefield-bfA", "battlefield-bfC"]);
    expect(pickKeys(d)).not.toContain("battlefield-bfB");
    expect(pickKeys(d)).not.toContain("base");
    expect((await game.p1.try((p) => p.pick("base"))).ok).toBe(false);
  });

  test("only once the destination is named does anyone get priority — P1 first, then P2 — and the staged combat at bfB still has NOT begun while the item sits on the chain", async () => {
    const game = await board().build();
    await game.p1.move("challenger", "bfB");
    await game.p1.yes();
    if (game.decision()?.kind === "pick" && (game.decision() as { semantics?: string }).semantics === "target") {
      await game.p1.pick("skulker");
    }
    await game.p1.pick("battlefield-bfC");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenger", targets: ["skulker"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.state("challenger").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
  });
});

describe("(b) P1 pushes the Skulker to the empty bfC", () => {
  test("resolution: Skulker bfB → bfC still controlled by P2 and NOT exhausted (420.3.a — only a Standard Move exhausts); P2 applied Contested at bfC (450) although P1's effect moved it", async () => {
    const game = await pushedTo("bfC", { manual: true });
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: false, owner: P2, zone: "battlefield-bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P2 });
  });

  test("bfB: no opposing units any more → the staged Combat ceased (323.10) but the Showdown is still staged for P1 (323.8.a); P2, unit-less there, has already lost control (190.4.c); nothing has begun and nobody scored yet", async () => {
    const game = await pushedTo("bfC", { manual: true });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bfB?.controller ?? null).toBeNull();
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.state("challenger").combatRole).toBeNull();
    expect(game.state("skulker").combatRole).toBeNull();
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
  });

  test("323.12: two Showdown-only battlefields staged in a Neutral Open state → the TURN PLAYER P1 is offered exactly {bfB, bfC} to begin; P2 is offered nothing", async () => {
    const game = await pushedTo("bfC", { manual: true });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(startOffers(game)).toEqual(["startShowdown:bfB", "startShowdown:bfC"]);
    expect(game.p2.legal().filter((o) => o.moveId === "startShowdown")).toEqual([]);
  });

  test("P1 opens bfB first: a NON-combat showdown with P1 (contester) holding Focus (345); pass/pass → P1 establishes control = Conquer, +1 (348.2.a)", async () => {
    const game = await pushedTo("bfC", { manual: true });
    await game.p1.choose("startShowdown:bfB");
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(topShowdown(game)).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("…and the Cleanup after bfB's showdown ends opens bfC's: P2 (contester) holds Focus and acts first although it is P1's turn (345); pass/pass → P2 conquers bfC, +1 on P1's turn", async () => {
    const game = await pushedTo("bfC", { manual: true });
    await game.p1.choose("startShowdown:bfB");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.turnPlayer()).toBe(P1);
    expect(topShowdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
  });

  test("end state (auto-driven): P1 holds bfA + bfB, P2 holds bfC, 1–1, Challenger at bfB unhurt, Skulker at bfC ready, back to P1's open main phase, no violations", async () => {
    const game = await pushedTo("bfC");
    await game.settle();
    await game.settle(); // the second (auto-begun) showdown is handed back once, then passed through
    await game.settle();
    expect(game.p1.battlefields({ controlled: true }).sort()).toEqual(["bfA", "bfB"]);
    expect(game.p2.battlefields({ controlled: true })).toEqual(["bfC"]);
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    expect(game.state("challenger")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(game.state("skulker")).toMatchObject({ damage: 0, isExhausted: false, zone: "battlefield-bfC" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P1 pushes the Skulker onto P1's own bfA (Sergeant there)", () => {
  test("resolution: Skulker at bfA, P2 applied Contested at P1-controlled bfA (Showdown + Combat staged); bfB reduced to a Showdown-only stage for P1; nothing begun yet in that very state", async () => {
    const game = await pushedTo("bfA", { manual: true });
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: false, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    // 323.12 offers only the Showdown-only battlefield (bfB) as a choice; bfA's Combat waits for 323.13.
    expect(startOffers(game)).not.toContain("startShowdown:bfA");
  });

  test("323.12 before 323.13: the bfB NON-combat showdown begins first (P1 Focus) while bfA has no roles yet; pass/pass → P1 conquers bfB (+1)", async () => {
    const game = await pushedTo("bfA");
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(topShowdown(game)).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("skulker").combatRole).toBeNull();
    expect(game.state("sergeant").combatRole).toBeNull();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("then the Combat at bfA begins: P2 is the ATTACKER and holds Focus on P1's turn (464.2.c.1 / .1.a); Skulker attacker, Sergeant defender", async () => {
    const game = await pushedTo("bfA");
    await game.p1.passFocus();
    await game.p2.passFocus(); // bfB done → next Cleanup reaches 323.13
    expect(game.turnPlayer()).toBe(P1);
    expect(topShowdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("sergeant").combatRole).toBe("defender");
  });

  test("outcome: 3 into 4 / 4 into 3 → Skulker dies, Sergeant survives (healed), P1 keeps bfA (a defence scores nothing) and holds bfA + bfB; P2 0 points; Challenger sits at bfB", async () => {
    const game = await pushedTo("bfA");
    await game.settle(); // bfB showdown through, bfA combat fought
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("challenger")).toBe("bfB");
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 0]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) no second move", () => {
  test("P1 declines the 'you may': the item leaves the chain, the state is Neutral Open and the staged Combat at bfB begins at once — P1 Attacker with Focus, Challenger attacker / Skulker defender", async () => {
    const game = await board().build();
    await game.p1.move("challenger", "bfB");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(topShowdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("challenger").combatRole).toBe("attacker");
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(game.locationOf("skulker")).toBe("bfB");
  });

  test("…5 kills 3 and survives 3: Skulker dies, Challenger conquers bfB for P1 (+1); bfC untouched, P2 scores nothing", async () => {
    const game = await board().build();
    await game.p1.move("challenger", "bfB");
    await game.p1.no();
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("challenger")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfC?.controller ?? null).toBeNull();
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 0]);
    expect(game.violations()).toEqual([]);
  });

  test("a 5-Might enemy is not 'less Might than me': after the opt-in there is nothing legal to choose — no target or destination prompt, the item never becomes a chain item (402.4), and the ordinary combat opens at bfB", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .battlefield("bfC", { controller: null })
      .unit(P1, "bfA", VANGUARD_SERGEANT, "sergeant")
      .unit(P2, "bfB", { might: 5, name: "Big" }, "big")
      .unit(P1, "base", IMPOSING_CHALLENGER, "challenger")
      .build();
    await game.p1.move("challenger", "bfB");
    const d = game.decision();
    // 402.1 (opt-in) is step 1, 402.4 (no legal choices → removed) is step 2: the engine may still ask the bare "you may".
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    const after = game.decision();
    expect(after?.kind).not.toBe("pick"); // neither Big nor a destination is ever offered
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("big")).toBe("bfB");
    expect(topShowdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.state("big").combatRole).toBe("defender");
  });
});
