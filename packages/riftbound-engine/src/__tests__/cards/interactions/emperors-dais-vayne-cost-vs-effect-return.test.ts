/**
 * Interaction: Emperor's Dais (sfd-207-221) · Battlefield
 *     "When you conquer here, you may pay [1] and return a unit you control here to its owner's
 *      hand. If you do, play a 2 [Might] Sand Soldier unit token here."
 *     (errata'd cost-to wording — encoded as an optional trigger whose BASE COST is
 *      `[1] + return a friendly unit here`, effect = play the token)
 *   × Vayne, Hunter (ogn-035-298) · Champion Unit · Fury · 4+[fury] · 2 Might · [Assault 3]
 *     "When I conquer, you may pay [1] to return me to my owner's hand."
 *
 * Rules: 383.3.d (simultaneous triggers of one controller: that player orders them onto the chain),
 * 383.3.a / 402.1 (leading "you may" = opt-in decided at finalization), 383.3.a.2 (declined → removed,
 * never triggered), 383.3.b / 403.1.b.1 (a cost right after that "you may" is the BASE COST),
 * 383.3.b.1 / 404.1 (the whole cost is paid to finalize), 404.2 / 404.2.a (unpayable → removed, NOT
 * countered), 402.2 / 402.4 (choices — incl. cost objects — made at finalization; no legal choice →
 * removed), 355.10.c.1 (the returned unit is a cost object, not a target), 406.4 (opponents react only
 * after finalization), 359.3.e.4 / 359.3.e.12 (an object that left the board and came back is a new
 * object → "return me" does nothing), 190.4.c / 323.6 (an empty controlled battlefield is only lost at a
 * cleanup while the turn is in an OPEN state).
 *
 * Q: P1's lone Vayne walks onto the uncontrolled Emperor's Dais and conquers; both P1 triggers fire.
 *  (a) P1 has exactly [1] and finalizes the DAIS trigger first, returning Vayne as its cost → Vayne is in
 *      hand and the [1] spent before anyone has priority; Vayne's own trigger then can't be paid and is
 *      removed (not countered); P2's window sees nothing to Gust; the chain keeps the turn Closed so P1
 *      never loses the empty Dais; the Sand Soldier then holds it. Net: Vayne back AND a 2-Might holder.
 *  (b) Same energy but Vayne's trigger first and paid → [1] gone at once, Vayne stays (return is the
 *      EFFECT); Dais can no longer be paid → removed; Vayne bounces on resolution, Dais is left empty.
 *      With 2 energy both can be paid: Dais's cost bounces Vayne immediately, Vayne's trigger later
 *      resolves as a no-op.
 *  (c) 0 energy → neither trigger can be finalized; no prompt P1 can accept, no "free" return, no token.
 *  (d) A second P1 unit in base is never an eligible cost object — only "a unit you control HERE".
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DAIS = "sfd-207-221";
const VAYNE_HUNTER = "ogn-035-298";
const GUST = "ogn-169-298"; // Reaction — "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."

/**
 * P1's turn. Uncontrolled, unit-free Emperor's Dais (abilities live). P1: Vayne (2 Might) + a 1-Might
 * Homebody, both in base; `energy` energy. P2 controls bf2 (so nothing else is conquerable by accident)
 * and holds Gust with 3 energy + [chaos] to threaten Vayne in any reaction window.
 */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("dais", { controller: null, def: EMPERORS_DAIS, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", VAYNE_HUNTER, "vayne")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P2, GUST, "gust");
}

type Plan = { readonly vayne: boolean; readonly dais: boolean; readonly ret?: string };
type Seen = { vayneOptIn?: boolean; daisOptIn?: boolean; pickOptions?: string[]; order?: string[] };

const sandSoldiers = (game: Game) => game.cardsAt("dais").filter((id) => game.state(id).name === "Sand Soldier");
const chainCards = (game: Game) => game.chain().map((c) => c.cardId);
const isAction = (d: Decision | null) => d?.kind === "action";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Vayne alone moves onto the empty Dais; both players pass focus in the (non-combat) showdown → P1 conquers. */
async function conquerDais(game: Game): Promise<void> {
  await game.p1.move("vayne", "dais");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    await game.acting().passFocus();
  }
  expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

/**
 * Answer every P1 prompt about the two triggers per `plan` (yes/no per source; the returned unit;
 * keep any offered trigger order as listed) until the cursor is an action decision or belongs to P2.
 * Records what was asked in `seen`. An opt-in that cannot be accepted is answered "no" (404.2).
 */
async function answerP1(game: Game, plan: Plan, seen: Seen = {}): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      return d;
    }
    if (d.kind === "yes-no") {
      const src = d.source?.cardId;
      const want = src === "vayne" ? plan.vayne : plan.dais;
      if (src === "vayne") {
        seen.vayneOptIn = d.canAccept !== false;
      } else {
        seen.daisOptIn = d.canAccept !== false;
      }
      await (want && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick") {
      seen.pickOptions = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick(plan.ret ?? "vayne");
    } else if (d.kind === "order") {
      seen.order = d.items.map((it) => it.card ?? it.key);
      await game.acceptTriggerOrder();
    } else {
      return d;
    }
  }
  return game.decision();
}

/**
 * Play the whole line out: P1 answers per `plan`, everybody passes priority, until P1's open main
 * phase. Returns the set of Dais controllers observed at every intermediate cursor.
 */
async function runLine(game: Game, plan: Plan, seen: Seen = {}): Promise<Set<string | null>> {
  const controllers = new Set<string | null>();
  for (let i = 0; i < 40; i++) {
    controllers.add(game.gameState.battlefields.dais?.controller ?? null);
    const d = game.decision();
    if (isOpenMain(d) || !d) {
      break;
    }
    if (d.seat === P1 && d.kind !== "action") {
      await answerP1(game, plan, seen);
    } else if (d.kind === "action" && d.passKey) {
      await game.acting().pass();
    } else {
      break;
    }
  }
  expect(isOpenMain(game.decision())).toBe(true);
  return controllers;
}

describe("Emperor's Dais × Vayne, Hunter — cost-time return vs effect-time return on a double conquer trigger", () => {
  // ── (a) Dais first ─────────────────────────────────────────────────────────────────────────────

  test("(a) the conquer fires BOTH P1 triggers at once: two P1-controlled triggered items (Vayne + Dais) exist before anyone has priority; the point is already scored", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "vayne", controller: P1, triggered: true, countered: false }),
        expect.objectContaining({ cardId: "dais", controller: P1, triggered: true, countered: false }),
      ]),
    );
    // Nobody has been given priority yet: the cursor is a P1 finalization prompt, not an action menu.
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(isAction(d)).toBe(false);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.p1.energy()).toBe(1);
  });

  // Expected (383.3.d): P1 controls both simultaneous triggers and picks the order they are PLACED (and
  // hence finalized) in — so P1 must be able to take up the Dais trigger before deciding on Vayne's
  // payment: the first P1 prompt is either an ordering decision over {vayne, dais} or already about the
  // Dais. Actual: the engine finalizes in board-scan order and asks Vayne's "pay [1]?" first, offering a
  // (soft) reorder only after both are finalized — too late for order-dependent finalization costs.
  test.failing("BUG: (a) P1 chooses which of its two triggers to finalize first — the Dais trigger can be taken up before Vayne's payment is decided (383.3.d)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    if (d?.kind === "order") {
      expect(d.items.map((it) => it.card ?? it.key).sort()).toEqual(["dais", "vayne"]);
    } else {
      // No ordering prompt → the first finalization prompt must at least be reachable for the Dais.
      expect(d?.source?.cardId).toBe("dais");
    }
  });

  // Expected (383.3.a, 383.3.b/.b.1, 402.2, 404.1, 406.4): accepting the Dais trigger pays its whole base
  // cost — [1] AND "return a unit you control here" (Vayne, a cost object chosen in step 2) — during
  // finalization, i.e. before ANY player holds priority. So at the first action decision after the
  // conquer Vayne is already in P1's hand and P1 has 0 energy, with the Dais ability finalized on the
  // chain. Actual: the engine treats "pay [1] and return…" as a resolution-time payment: at the first
  // priority window Vayne is still on the Dais and the energy unspent.
  test("BUG: (a) Dais's '[1] + return Vayne' is paid at FINALIZATION — Vayne is in hand and the energy gone before the first priority window opens (383.3.b.1, 404.1, 406.4)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const d = await answerP1(game, { dais: true, ret: "vayne", vayne: false });
    expect(isAction(d)).toBe(true); // somebody now has priority
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.energy()).toBe(0);
    expect(chainCards(game)).toEqual(["dais"]);
  });

  // Expected (406.4 + the above): P2's first chance to react comes after the cost is paid, so Vayne (2
  // Might — otherwise a legal Gust target) is no longer at a battlefield: Gust is offered no Vayne.
  // Actual: Vayne is still on the Dais during P2's window and Gust may bounce her, which then leaves the
  // Dais payment impossible (no unit here) — the engine lets P2 break up a line the rules make atomic.
  test("BUG: (a) P2's reaction window opens only once Vayne is already in hand — Gust finds no Vayne to return (406.4)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    await answerP1(game, { dais: true, ret: "vayne", vayne: false });
    // Walk to P2's first decision of any kind.
    for (let i = 0; i < 6 && game.decision()?.seat !== P2; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "action" && d.passKey) {
        await game.p1.pass();
      } else {
        await answerP1(game, { dais: true, ret: "vayne", vayne: false });
      }
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("vayne")).toBe("hand");
    const gustTargets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(gustTargets).not.toContain("vayne");
  });

  test("(a) Vayne's own trigger leaves the chain WITHOUT being countered — what P2 gets to respond to is the Dais ability alone (383.3.a.2 / 404.2.a)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    await answerP1(game, { dais: true, ret: "vayne", vayne: false });
    for (let i = 0; i < 6 && game.decision()?.seat !== P2; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "action" && d.passKey) {
        await game.p1.pass();
      } else {
        await answerP1(game, { dais: true, ret: "vayne", vayne: false });
      }
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dais", controller: P1, countered: false, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "vayne")).toBe(false);
  });

  test("(a) uninterrupted line: for exactly [1] P1 ends with Vayne back in hand AND an exhausted 2-Might Sand Soldier token holding the Dais; P1 controlled the Dais at every step (190.4.c / 323.6)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const seen: Seen = {};
    const controllers = await runLine(game, { dais: true, ret: "vayne", vayne: false }, seen);
    expect([...controllers]).toEqual([P1]); // never uncontrolled / never P2 in between
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.hand()).toContain("vayne");
    const soldiers = sandSoldiers(game);
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0] as string)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 2, owner: P1, zone: "battlefield-dais" });
    expect(game.p1.units("dais")).toEqual(soldiers);
    expect(game.zoneOf("home")).toBe("base");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Vayne first ────────────────────────────────────────────────────────────────────────────

  test("(b) Vayne's trigger accepted first: the [1] is paid AT ONCE (energy 1 → 0) but Vayne herself stays on the Dais — 'return me' is the EFFECT, still waiting on the chain", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "vayne" } });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "vayne", controller: P1, triggered: true })]));
  });

  test("(b) …after which the Dais trigger cannot be paid: any Dais opt-in shown is unacceptable (yes() rejected), P1 is never asked which unit to return, and no Sand Soldier is ever played (383.3.b.1 / 404.2)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const seen: Seen = {};
    // Try to say yes to everything; answerP1 downgrades an unacceptable opt-in to "no" and records it.
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no" && d.source?.cardId === "dais") {
        expect(d.canAccept).toBe(false);
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      }
      if (d?.seat === P1 && d?.kind !== "action") {
        await answerP1(game, { dais: true, ret: "vayne", vayne: true }, seen);
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    expect(seen.vayneOptIn).toBe(true);
    expect(seen.daisOptIn ?? false).toBe(false); // never an acceptable Dais offer
    expect(seen.pickOptions).toBeUndefined();
    expect(sandSoldiers(game)).toEqual([]);
  });

  // Expected (383.3.b.1, 404.2): with P1 at 0 energy the Dais trigger cannot be finalized at all — it is
  // removed as a Pending item and never becomes a chain item, so P2's reaction window shows exactly one
  // thing: Vayne's ability. Actual: the engine finalizes the Dais trigger cost-free and only discovers the
  // missing [1] at resolution, so P2 sees [vayne, dais].
  test("BUG: (b) the unpayable Dais trigger never reaches the chain — P2's window holds Vayne's ability only (383.3.b.1 / 404.2)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    await answerP1(game, { dais: true, ret: "vayne", vayne: true });
    for (let i = 0; i < 6 && game.decision()?.seat !== P2; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "action" && d.passKey) {
        await game.p1.pass();
      } else {
        await answerP1(game, { dais: true, ret: "vayne", vayne: true });
      }
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(chainCards(game)).toEqual(["vayne"]);
  });

  test("(b) end state: Vayne bounces on RESOLUTION leaving nobody on the Dais — energy 0, no token, and the empty Dais is lost at the next Open-state cleanup (190.4.c); strictly worse than (a)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    await runLine(game, { dais: true, ret: "vayne", vayne: true });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.p1.units("dais")).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(1); // the conquer point itself stands
    expect(game.chain()).toEqual([]);
  });

  test("(b′) with 2 energy P1 can pay both: Vayne's [1], then Dais's [1] + Vayne-to-hand → the Sand Soldier holds the Dais and Vayne's later 'return me' is a harmless no-op on a card already in hand (359.3.e.4)", async () => {
    const game = await board(2).build();
    await conquerDais(game);
    const seen: Seen = {};
    const controllers = await runLine(game, { dais: true, ret: "vayne", vayne: true }, seen);
    expect(seen.vayneOptIn).toBe(true);
    expect(seen.daisOptIn).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.hand().filter((c) => c === "vayne")).toHaveLength(1);
    const soldiers = sandSoldiers(game);
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0] as string)).toMatchObject({ controller: P1, might: 2 });
    expect([...controllers]).toEqual([P1]);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) no energy ──────────────────────────────────────────────────────────────────────────────

  test("(c) 0 energy: P1 can accept NEITHER trigger (every opt-in shown is canAccept:false, yes() rejected), is never offered a unit to return 'for free', and Vayne simply keeps holding the Dais — no token", async () => {
    const game = await board(0).build();
    await conquerDais(game);
    const seen: Seen = {};
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no") {
        expect(d.canAccept).toBe(false);
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      }
      expect(d?.kind).not.toBe("pick"); // no cost-object choice without the [1]
      if (d?.seat === P1 && d?.kind !== "action") {
        await answerP1(game, { dais: true, ret: "vayne", vayne: true }, seen);
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    expect(isOpenMain(game.decision())).toBe(true);
    expect(seen.pickOptions).toBeUndefined();
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.p1.units("dais")).toEqual(["vayne"]);
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // Expected (383.3.b.1 / 404.2): with nothing payable neither trigger is ever FINALIZED, so no chain item
  // exists and no priority window opens — after P1 waves off the unpayable opt-ins the game is straight
  // back in P1's open main phase without P2 being asked anything. Actual: the Dais trigger is put on the
  // chain cost-free, so P2 receives a full reaction window (and P1 a priority pass) over a doomed item.
  test("BUG: (c) with 0 energy nothing is finalized — no chain item and no priority window for anyone (383.3.b.1 / 404.2)", async () => {
    const game = await board(0).build();
    await conquerDais(game);
    let sawPriority = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        sawPriority = true;
      }
      if (d?.seat === P1 && d?.kind !== "action") {
        await answerP1(game, { dais: true, ret: "vayne", vayne: true });
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    expect(isOpenMain(game.decision())).toBe(true);
    expect(sawPriority).toBe(false);
  });

  // ── (d) cost object must be HERE ───────────────────────────────────────────────────────────────

  test("(d) only 'a unit you control HERE' is an eligible cost object: the base-only Homebody is never a candidate (a pick, if shown, lists exactly Vayne and rejects Homebody); Vayne is the unit returned and Homebody never leaves base (402.2 / 402.4)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    let pickShown = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "pick") {
        pickShown = true;
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(["vayne"]);
        expect((await game.p1.try((p) => p.pick("home"))).ok).toBe(false);
        expect(game.zoneOf("home")).toBe("base");
        await game.p1.pick("vayne");
      } else if (d?.seat === P1 && d?.kind !== "action") {
        await answerP1(game, { dais: true, ret: "vayne", vayne: false });
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    // Whether the lone candidate was asked or bound automatically, the cost took VAYNE, never Homebody.
    expect(typeof pickShown).toBe("boolean");
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.zoneOf("home")).toBe("base");
    expect(sandSoldiers(game)).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });
});
