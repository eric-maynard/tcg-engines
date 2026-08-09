/**
 * Interaction: Loyal Pup (sfd-126-221) · Unit · Chaos · 3 · 3 Might
 *     "When you defend at a battlefield, you may move me there."
 *   × Reaver's Row (ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla attacker)
 *   (+ Shipyard Skulker ogn-175-298, vanilla 3 Might, as the unit already on the Row;
 *    + Jhin, Murderous Artist unl-022-219 "When I move, [Add] [1][rainbow]" as a move-trigger witness.)
 *
 * Rules: 383.4.f / .f.2.a (Defend Triggers fire when the PLAYER/unit gains Defender — checked once per
 * combat), 464.2.c.3 / .c.3.a (designations at combat start; late arrivals get theirs in the next
 * Cleanup), 464.2.e.1 (Attacker's triggers first, Defender's last → on top), 383.3.a (leading "you
 * may" is decided at finalization), 355.15 (choices locked at finalization), 144.2 (exhausting is only
 * the Standard Move's cost), 190.3.a.1 / 190.3.b (an already-Contested battlefield is not re-contested,
 * nothing new is staged), 323.2.a / 323.2.c (gain designation on arrival / lose it once elsewhere),
 * 810.1.c (Ganking only widens the Standard Move), 449.1 (an effect move's destination is whatever the
 * effect says), 190.4.c / 323.6 (no units + Open state → lose control at the next Cleanup), 446.1
 * (board→board = a Move), 465.1 / 465.2.c.3 / 466.1.a.1 / 466.3 (damage step, lethal-first assignment,
 * heal, result).
 *
 * Question: P1 controls Reaver's Row with Skulker (3) on it; Loyal Pup (3) is EXHAUSTED in P1's base
 * (variant: ready and alone at bfC, which P1 also controls). P2's turn: Vanguard Sergeant (4)
 * Standard-Moves into the Row.
 *   (a) both are P1 Defend Triggers, on the chain together (P1 orders them); "you may" and the Row's
 *       target are fixed at finalization — the Row can only ever pick Skulker, never the later Pup.
 *   (b) the exhausted Pup may be effect-moved into the ongoing combat, stays exhausted, becomes a
 *       Defender, nothing re-triggers, no new showdown.
 *   (c) variant: Pup moves bfC→Row without Ganking; bfC goes uncontrolled.
 *   (d) the Row's "to base" is a MOVE (fires move triggers; Skulker drops Defender); an instant with
 *       zero defenders does not end the combat.
 *   (e) Pup only → 6 vs 4: Sergeant dies, exactly one defender dies, P1 keeps the Row. Both → Pup alone
 *       dies, Sergeant survives healed, P2 conquers +1. Neither → Skulker dies, P2 conquers +1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LOYAL_PUP = "sfd-126-221";
const REAVERS_ROW = "ogn-285-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SHIPYARD_SKULKER = "ogn-175-298";
const JHIN = "unl-022-219";

/** P2 to act. Reaver's Row (live text) held by P1 with Skulker on it; bfC also P1's; Sergeant in P2's base. */
function board(pupAt: "base" | "bfC" = "base") {
  const s = scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bfC", { controller: P1 })
    .unit(P1, "row", SHIPYARD_SKULKER, "skulker")
    .unit(P2, "base", VANGUARD_SERGEANT, "sergeant");
  return pupAt === "base"
    ? s.unit(P1, "base", LOYAL_PUP, "pup", { exhausted: true })
    : s.unit(P1, "bfC", LOYAL_PUP, "pup");
}

const showdownStack = (game: Game) => game.gameState.interaction?.showdownStack ?? [];
const showdown = (game: Game) => showdownStack(game).at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const optInFor = (d: Decision | null) => (d?.kind === "yes-no" ? d.source?.cardId : undefined);

/**
 * Sergeant attacks the Row; P1 answers the two opt-ins (asked Pup first, then Row — scan order) and
 * keeps the listed trigger order (Pup bottom, Row on top → the Row resolves FIRST) unless `pupOnTop`.
 */
async function attackAndAnswer(game: Game, opts: { pup: boolean; row: boolean; pupOnTop?: boolean }): Promise<void> {
  await game.p2.move("sergeant", "row");
  expect(optInFor(game.decision())).toBe("pup");
  await game.p1.answer(opts.pup);
  expect(optInFor(game.decision())).toBe("row");
  await game.p1.answer(opts.row);
  const d = game.decision();
  if (d?.kind === "order") {
    const keyOf = (card: string) => d.items.find((i) => i.card === card)?.key as string;
    await game.p1.order(opts.pupOnTop ? [keyOf("row"), keyOf("pup")] : []);
  }
}

/** Both players pass priority once (resolves the top chain item). */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Loyal Pup × Reaver's Row — defend triggers moving units into / out of an ongoing combat", () => {
  // ── (a) triggering, ordering, finalization ──────────────────────────────────────────────────

  test("(a) the Standard Move opens combat at the Row: P2 attacks with Focus, P1 defends; BOTH 'When you defend' abilities trigger for P1 at once — Pup's from base, the Row's from the battlefield (383.4.f, 464.2.c.3)", async () => {
    const game = await board().build();
    await game.p2.move("sergeant", "row");
    expect(game.state("sergeant").isExhausted).toBe(true); // 144.2 — the Standard Move's cost
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(game.state("pup").combatRole).toBeNull(); // not at the Row
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "pup", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "row", controller: P1, triggered: true }),
    ]);
    // The vanilla Sergeant has no attack trigger, so the Combat Chain holds only the Defender's items.
    expect(game.chain().every((i) => i.controller === P1)).toBe(true);
  });

  test("(a) each leading 'you may' is decided by P1 at FINALIZATION, before anyone gets priority; declining removes that item from the chain (383.3.a/.a.2)", async () => {
    const game = await board().build();
    await game.p2.move("sergeant", "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "pup", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.no();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pup", controller: P1, triggered: true })]);
    // Only now does the priority window open.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) with both accepted P1 — their common controller — is offered the relative order of its two triggers (defaults: Pup bottom, Row on top)", async () => {
    const game = await board().build();
    await game.p2.move("sergeant", "row");
    await game.p1.yes();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card) : []).toEqual(["pup", "row"]);
    await game.p1.order([]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["pup", "row"]); // last = top = resolves first
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) the Row's target ('a friendly unit here') is chosen at finalization too — with two units on the Row the pick is asked at FIN timing, before ordering and before priority (355.15)", async () => {
    const game = await board().unit(P1, "row", { might: 1, name: "Extra" }, "extra").build();
    await game.p2.move("sergeant", "row");
    await game.p1.yes(); // Pup
    await game.p1.yes(); // Row → now its target
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["extra", "skulker"]); // never the Pup in base
    await game.p1.pick("skulker");
    expect(game.decision()?.kind).toBe("order");
  });

  test("(a) the Row can never send the Pup home: even when the Pup's trigger is ordered to resolve FIRST (Pup arrives, then the Row resolves), the Row moves its locked target Skulker, not the newly-arrived Pup (355.15)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, pupOnTop: true, row: true });
    expect(game.chain().map((i) => i.cardId)).toEqual(["row", "pup"]);
    await resolveTop(game); // Pup's trigger
    expect(game.locationOf("pup")).toBe("row");
    expect(game.locationOf("skulker")).toBe("row");
    await resolveTop(game); // Row's trigger
    expect(game.locationOf("skulker")).toBe("base");
    expect(game.locationOf("pup")).toBe("row");
    expect(game.chain()).toEqual([]);
  });

  // ── (b) exhausted Pup into an ongoing combat ────────────────────────────────────────────────

  test("(b) YES: the EXHAUSTED Pup is effect-moved base→Row, stays exhausted, and gains Defender in the following Cleanup; the Row stays Contested by P2 with the same single showdown — nothing new is staged (144.2, 464.2.c.3.a, 190.3.b)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, row: false });
    expect(showdownStack(game)).toHaveLength(1);
    await resolveTop(game);
    expect(game.locationOf("pup")).toBe("row");
    expect(game.state("pup")).toMatchObject({ combatRole: "defender", isExhausted: true, might: 3 });
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(bf(game, "row")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdownStack(game)).toHaveLength(1);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", focusPlayer: P2, isCombatShowdown: true });
  });

  test("(b) the Pup's arrival re-triggers nothing — 'When you defend' is checked once per combat: chain empty, straight to P2's Focus (383.4.f.2.a)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, row: false });
    await resolveTop(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  // ── (c) variant: Pup alone at bfC ───────────────────────────────────────────────────────────

  test("(c) variant: the ready Pup at bfC (no Ganking) may still be moved bfC→Row by its own effect; it is not exhausted by it and defends there (810.1.c, 449.1, 420.3.a)", async () => {
    const game = await board("bfC").build();
    expect(game.state("pup").keywords).not.toContain("Ganking");
    await attackAndAnswer(game, { pup: true, row: false });
    await resolveTop(game);
    expect(game.locationOf("pup")).toBe("row");
    expect(game.state("pup")).toMatchObject({ combatRole: "defender", isExhausted: false });
    expect(game.p1.units("bfC")).toEqual([]);
  });

  // Expected: the Pup's move empties bfC of P1's units; once its chain item has resolved the chain is
  // empty (Showdown OPEN state, 310.3) and no showdown is at bfC, so the very next Cleanup (319.1/.8)
  // strips P1's control of bfC (190.4.c / 323.6). Actual: the engine keeps bfC under P1 for the rest of
  // the Row combat and only drops it when that combat's final cleanup runs.
  test("(c) variant: bfC becomes uncontrolled at the Cleanup right after the Pup leaves it — the state is Open between chain items even mid-showdown (190.4.c, 323.6, 319.1)", async () => {
    const game = await board("bfC").build();
    await attackAndAnswer(game, { pup: true, row: false });
    await resolveTop(game);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active).toBe(true); // combat at the Row still on
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: null });
  });

  test("(c) variant: at the latest once the Row combat is over bfC is uncontrolled — answering the call cost P1 that battlefield; Pup + Skulker (6) beat the Sergeant and P1 keeps the Row", async () => {
    const game = await board("bfC").build();
    await attackAndAnswer(game, { pup: true, row: false });
    await game.settle();
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(bf(game, "row")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  // ── (d) the Row's "move … to base" ──────────────────────────────────────────────────────────

  test("(d) Reaver's Row MOVES the unit (446.1): a 'When I move' unit (Jhin) sent home by the Row fires its move trigger — P1 immediately gets [1] + [rainbow]", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "row", JHIN, "jhin")
      .unit(P2, "base", VANGUARD_SERGEANT, "sergeant")
      .build();
    await game.p2.move("sergeant", "row");
    expect(optInFor(game.decision())).toBe("row");
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await resolveTop(game);
    expect(game.locationOf("jhin")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  test("(d) once in base Skulker loses its Defender designation and is otherwise untouched (ready, undamaged) (323.2.c)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: false, row: true });
    expect(game.state("skulker").combatRole).toBe("defender");
    await resolveTop(game);
    expect(game.locationOf("skulker")).toBe("base");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: false });
  });

  test("(d) BOTH accepted, listed order (Row resolves first): after Skulker leaves P1 has ZERO units at the Row, yet the combat does not end — Row still Contested, showdown active, Pup's item still waiting on the chain (465.1 / 466.3 are checked later)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, row: true });
    await resolveTop(game); // Row's trigger (top)
    expect(game.locationOf("skulker")).toBe("base");
    expect(game.p1.units("row")).toEqual([]);
    expect(bf(game, "row")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pup", controller: P1, triggered: true })]);
    await resolveTop(game); // Pup's trigger
    expect(game.locationOf("pup")).toBe("row");
    expect(game.state("pup").combatRole).toBe("defender");
  });

  // Expected: P1 already gained the Defender designation when this combat opened, and Defend Triggers
  // are checked once per combat (383.4.f.2.a) — the Pup arriving at a Row momentarily empty of P1 units
  // triggers nothing; the chain is empty and P2 simply has Focus. Actual: when the Pup lands on the
  // defender-less Row the engine fires BOTH "When you defend" abilities again (Pup + Reaver's Row go
  // back on the chain and P1 is asked the two opt-ins a second time).
  test.failing("BUG: (d) BOTH accepted, listed order: the Pup arriving after Skulker left must NOT re-trigger 'When you defend' on either card (383.4.f.2.a)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, row: true });
    await resolveTop(game); // Row: Skulker → base
    await resolveTop(game); // Pup: base → Row
    expect(game.locationOf("pup")).toBe("row");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  // ── (e) outcomes ────────────────────────────────────────────────────────────────────────────

  test("(e) Pup only: defenders 3+3 = 6 ≥ 4 → Sergeant dies; its 4 damage, assigned lethal-first, kills exactly ONE defender and the survivor is healed; P1 keeps the Row, nobody scores (465.2.c.3, 466.1.a.1)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, row: false });
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("trash");
    const dead = ["pup", "skulker"].filter((u) => game.zoneOf(u) === "trash");
    const alive = ["pup", "skulker"].filter((u) => game.zoneOf(u) === "battlefield-row");
    expect(dead).toHaveLength(1);
    expect(alive).toHaveLength(1);
    expect(game.state(alive[0] as string).damage).toBe(0);
    expect(bf(game, "row")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(e) Both (Pup ordered to arrive first, then Skulker leaves): Pup (3) defends alone vs Sergeant (4) → Pup dies, Sergeant survives healed, P2 conquers the Row and scores 1; Skulker safe and ready in base", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, pupOnTop: true, row: true });
    await game.settle();
    expect(game.zoneOf("pup")).toBe("trash");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.state("skulker")).toMatchObject({ damage: 0, isExhausted: false, zone: "base" });
    expect(bf(game, "row")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("(e) Both, listed order (Skulker out, then Pup in): same end state — Pup dies alone, Sergeant survives, P2 conquers +1 (the order only changes the intermediate picture)", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: true, row: true });
    await resolveTop(game);
    await resolveTop(game);
    // Tolerate the spurious re-trigger prompts (see BUG above) by declining them.
    for (let i = 0; i < 4 && game.decision()?.kind === "yes-no" && game.decision()?.seat === P1; i++) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("pup")).toBe("trash");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.zoneOf("skulker")).toBe("base");
    expect(bf(game, "row")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
  });

  test("(e) Neither: Skulker (3) alone dies to 4, Sergeant survives healed, P2 conquers the Row and scores 1; the Pup never left base and is still exhausted", async () => {
    const game = await board().build();
    await attackAndAnswer(game, { pup: false, row: false });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.state("pup")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(bf(game, "row")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
  });
});
