/**
 * Interaction: Emperor's Dais (sfd-207-221) · Battlefield
 *     "When you conquer here, you may pay [1] and return a unit you control here to its owner's
 *      hand. If you do, play a 2 [Might] Sand Soldier unit token here."
 *   × Vayne, Hunter (ogn-035-298) · Champion Unit · Fury · 4+[fury] · 2 Might · [Assault 3]
 *     "When I conquer, you may pay [1] to return me to my owner's hand."
 *
 * Two leading-"you may" conquer triggers of ONE controller with DIFFERENT cost models (optional-kind.ts):
 *   • Vayne — "you may pay [1] TO return me": `cost-at-finalization`. 383.3.a / 402.1 opt-in at FIN; 383.3.b /
 *     204.3.a / 404.1 the [1] is the BASE COST, paid to finalize (unpayable ⇒ 404.2 removed, not countered);
 *     "return me" is the EFFECT, on resolution.
 *   • Dais — "you may pay [1] and return a unit you control here … . IF YOU DO, play …": `may-at-finalization`.
 *     383.3.a / 402.1 opt-in at FIN (free — 205: a "pay … . If you do" is NOT a cost, there is no "[X] to [Y]"
 *     link); 402.2 the unit "you control here" is CHOSEN at FIN (on the item's targets, still on the board);
 *     444.2 the [1] is asked — and declinable — as the item RESOLVES, then the chosen unit is returned and,
 *     if both happened (359.3.e.14 linked "if you do"), the Sand Soldier is played here. A chosen unit that
 *     left / no longer qualifies at resolution ⇒ nothing at all (359.3.e.5).
 *   (Should the printed text ever be errata'd to "… pay [1] and return a unit you control here TO play …", the
 *    Dais becomes `cost-at-finalization` too: def → `pay-cost {energy:1, returnToHand:{…here}}` and this file's
 *    (a)/(c) expectations flip to "paid and bounced before the first priority window".)
 * Also: 383.3.d (P1 orders its two finalized items — soft `order` prompt; LIFO), 406.4 (opponents respond only
 * after finalization), 359.3.e.4 (a card that left the board and came back is a new object), 190.4 / 323.6
 * (an emptied controlled battlefield is lost only at an OPEN-state cleanup).
 *
 * Board: P1's lone Vayne walks onto the uncontrolled Dais and conquers (1 point); both P1 triggers fire.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DAIS = "sfd-207-221";
const VAYNE_HUNTER = "ogn-035-298";
const GUST = "ogn-169-298"; // Reaction [2][chaos] — "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."

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

type Plan = { readonly vayne: boolean; readonly dais: boolean; readonly daisPay?: boolean; readonly ret?: string; readonly top?: "dais" | "vayne" };
type Seen = { finPrompts: string[]; resPrompts: string[]; pickOptions?: string[]; order?: string[]; unacceptable: string[] };
const newSeen = (): Seen => ({ finPrompts: [], resPrompts: [], unacceptable: [] });

const sandSoldiers = (game: Game) => game.cardsAt("dais").filter((id) => game.state(id).name === "Sand Soldier");
const chainCards = (game: Game) => game.chain().map((c) => c.cardId);
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Vayne alone moves onto the empty Dais; both pass focus in the non-combat showdown → P1 conquers. */
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
 * Answer every P1 non-action prompt per `plan`: FIN/RES yes-no per source (an unacceptable "yes" is recorded and
 * answered "no"), the Dais unit pick, and the 383.3.d order (`top` names the item to resolve FIRST).
 */
async function answerP1(game: Game, plan: Plan, seen: Seen = newSeen()): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      return d;
    }
    if (d.kind === "yes-no") {
      const src = d.source?.cardId as string;
      (d.timing === "FIN" ? seen.finPrompts : seen.resPrompts).push(src);
      let want = src === "vayne" ? plan.vayne : d.timing === "RES" ? (plan.daisPay ?? plan.dais) : plan.dais;
      if (want && d.canAccept === false) {
        seen.unacceptable.push(`${src}@${d.timing}`);
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        want = false;
      }
      await (want ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick") {
      seen.pickOptions = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick(plan.ret ?? "vayne");
    } else if (d.kind === "order") {
      seen.order = d.items.map((it) => it.card ?? it.key);
      if (plan.top) {
        const keys = d.items.map((it) => it.key);
        const topKey = d.items.find((it) => it.card === plan.top)?.key as string;
        await game.p1.order([...keys.filter((k) => k !== topKey), topKey]);
      } else {
        await game.acceptTriggerOrder();
      }
    } else {
      return d;
    }
  }
  return game.decision();
}

/** Play the line out to P1's open main phase; returns every Dais controller observed on the way. */
async function runLine(game: Game, plan: Plan, seen: Seen = newSeen()): Promise<Set<string | null>> {
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

/** Walk to P2's first decision (its reaction window), answering P1 per `plan` and passing P1's priority. */
async function toP2Window(game: Game, plan: Plan, seen: Seen = newSeen()): Promise<void> {
  for (let i = 0; i < 8 && game.decision()?.seat !== P2; i++) {
    const d = game.decision();
    if (d?.seat === P1 && d.kind === "action" && d.passKey) {
      await game.p1.pass();
    } else {
      await answerP1(game, plan, seen);
    }
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Emperor's Dais × Vayne, Hunter — a finalization COST ('pay [1] to') vs a resolution-time PAY ('pay [1] … . If you do')", () => {
  test("the conquer fires BOTH P1 triggers at once: two P1 triggered items exist and the cursor is a P1 FINALIZATION prompt (nobody has priority yet); the point is already scored", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "vayne", controller: P1, countered: false, triggered: true }),
        expect.objectContaining({ cardId: "dais", controller: P1, countered: false, triggered: true }),
      ]),
    );
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.p1.energy()).toBe(1);
  });

  // ── (a) Dais only: decline Vayne's costed trigger, take the Dais ────────────────────────────────────

  test("(a) declining Vayne (383.3.a.2 — removed, never a chain item) and taking the Dais: NOTHING is paid or bounced at finalization — energy still 1, Vayne still on the Dais and named on the item's targets (402.2), no paidObjects", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const seen = newSeen();
    const d = await answerP1(game, { dais: true, vayne: false }, seen);
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    expect(seen.finPrompts.sort()).toEqual(["dais", "vayne"]);
    expect(seen.resPrompts).toEqual([]);
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dais", controller: P1, targets: ["vayne"], triggered: true })]);
    const item = game.gameState.interaction?.chain?.items[0] as { optional?: boolean; paidObjects?: unknown; mayKind?: string };
    expect(item).toMatchObject({ mayKind: "may-at-finalization", optional: false });
    expect(item.paidObjects).toBeUndefined();
  });

  test("(a) 406.4 — P2's reaction window: Vayne (2 Might) is STILL at the Dais, so Gust may target her — the ruling-era 'atomic' line does not exist for an 'If you do' wording", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    await toP2Window(game, { dais: true, vayne: false });
    expect(chainCards(game)).toEqual(["dais"]);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    const gustTargets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(gustTargets).toContain("vayne");
  });

  test("(a) uninterrupted: P2 passes → the Dais item RESOLVES: 'pay [1]?' (timing RES, 444.2) → yes → Vayne to hand, exhausted 2-Might Sand Soldier here; P1 controlled the Dais at every step (the chain kept the state Closed, then the token holds it)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const seen = newSeen();
    const controllers = await runLine(game, { dais: true, vayne: false }, seen);
    expect(seen.resPrompts).toEqual(["dais"]);
    expect([...controllers]).toEqual([P1]);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("hand");
    const soldiers = sandSoldiers(game);
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0] as string)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 2, owner: P1, zone: "battlefield-dais" });
    expect(game.p1.units("dais")).toEqual(soldiers);
    expect(game.zoneOf("home")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) 444.2 — opted in but declining the PAY on resolution: energy kept, Vayne stays, no token", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const seen = newSeen();
    await runLine(game, { dais: true, daisPay: false, vayne: false }, seen);
    expect(seen.resPrompts).toEqual(["dais"]);
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  });

  test("(a✕) P2 Gusts the chosen Vayne in response → on resolution the Dais's object is gone (359.3.e.5): no pay question, no return, no token, energy kept; the now-empty Dais lapses at the next Open cleanup (190.4)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    await toP2Window(game, { dais: true, vayne: false });
    await game.p2.cast("gust", { targets: "vayne" });
    const seen = newSeen();
    await runLine(game, { dais: true, vayne: false }, seen);
    expect(seen.resPrompts).toEqual([]); // never asked to pay for nothing
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.p1.units("dais")).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // ── (b) both taken ───────────────────────────────────────────────────────────────────────────────

  test("(b) Vayne's trigger accepted: ITS [1] is a base cost paid AT ONCE (energy 1 → 0, 404.1) while Vayne herself stays — 'return me' is the effect; the Dais opt-in that follows is still acceptable (it costs nothing to finalize)", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "vayne" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.chain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "vayne", controller: P1, triggered: true }),
        expect.objectContaining({ cardId: "dais", controller: P1, targets: ["vayne"], triggered: true }),
      ]),
    );
  });

  test("(b) with exactly [1] spent on Vayne: the Dais (on top by default) resolves first and its pay CANNOT be made (no pool, no rune: the question is skipped or unacceptable) → no return by the Dais, no token; then Vayne's item bounces her — the Dais is left empty and lost at the next Open cleanup", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    const seen = newSeen();
    await runLine(game, { dais: true, vayne: true }, seen);
    expect(seen.resPrompts.every((s) => s === "dais")).toBe(true);
    expect(seen.unacceptable).toEqual(seen.resPrompts.map(() => "dais@RES")); // shown ⇒ unacceptable
    expect(seen.pickOptions).toBeUndefined(); // the lone unit here was bound without asking
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.p1.units("dais")).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("(b′) 2 energy, default order (Dais on top): Vayne's [1] at FIN, the Dais's [1] at RES → Vayne to hand + Sand Soldier holds the Dais; Vayne's later 'return me' finds her already in hand — a no-op (359.3.e.4); energy 0, one Vayne in hand", async () => {
    const game = await board(2).build();
    await conquerDais(game);
    const seen = newSeen();
    const controllers = await runLine(game, { dais: true, vayne: true }, seen);
    expect(seen.finPrompts.sort()).toEqual(["dais", "vayne"]);
    expect(seen.resPrompts).toEqual(["dais"]);
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

  test("(b″) 2 energy but P1 orders VAYNE on top (383.3.d): she bounces first, so when the Dais resolves its chosen unit has left the board — no pay question, no token, [1] left over; the order genuinely matters", async () => {
    const game = await board(2).build();
    await conquerDais(game);
    const seen = newSeen();
    await runLine(game, { dais: true, top: "vayne", vayne: true }, seen);
    expect(seen.order?.sort()).toEqual(["dais", "vayne"]);
    expect(seen.resPrompts).toEqual([]);
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).not.toBe(P1);
  });

  // ── (c) no energy ────────────────────────────────────────────────────────────────────────────────

  test("(c) 0 energy, declining everything: Vayne's costed opt-in is shown but unacceptable (DESIGN manual pay: canAccept:false, yes() rejected); with the Dais declined too NOTHING is finalized — no chain item, no priority window for anyone", async () => {
    const game = await board(0).build();
    await conquerDais(game);
    const seen = newSeen();
    let sawPriority = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        sawPriority = true;
      }
      if (d?.seat === P1 && d.kind !== "action") {
        await answerP1(game, { dais: false, vayne: true }, seen);
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    expect(seen.unacceptable).toEqual(["vayne@FIN"]);
    expect(sawPriority).toBe(false);
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  });

  test("(c) 0 energy, taking the FREE Dais opt-in: a real chain item P2 may respond to (406.4), but on resolution the [1] can never be paid — Vayne keeps holding the Dais, no 'free' return, no token", async () => {
    const game = await board(0).build();
    await conquerDais(game);
    const seen = newSeen();
    let sawP2Window = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.seat === P2) {
        sawP2Window = true;
        expect(chainCards(game)).toEqual(["dais"]);
      }
      if (d?.seat === P1 && d.kind !== "action") {
        await answerP1(game, { dais: true, vayne: true }, seen);
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    expect(sawP2Window).toBe(true);
    expect(seen.unacceptable).toContain("vayne@FIN");
    expect(seen.unacceptable).toEqual(expect.arrayContaining(seen.resPrompts.map(() => "dais@RES"))); // a RES pay shown with nothing to pay it is unacceptable
    expect(game.zoneOf("vayne")).toBe("battlefield-dais");
    expect(game.p1.units("dais")).toEqual(["vayne"]);
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // ── (d) the chosen unit must be HERE ─────────────────────────────────────────────────────────────

  test("(d) 402.2 / 402.4 — only 'a unit you control HERE' can be chosen: the base-only Homebody is never a candidate (a pick, if shown, lists exactly Vayne and rejects Homebody); Vayne is the unit returned and Homebody never leaves base", async () => {
    const game = await board(1).build();
    await conquerDais(game);
    let pickShown = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "pick") {
        pickShown = true;
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(["vayne"]);
        expect((await game.p1.try((p) => p.pick("home"))).ok).toBe(false);
        await game.p1.pick("vayne");
      } else if (d?.seat === P1 && d.kind !== "action") {
        await answerP1(game, { dais: true, vayne: false });
      } else if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      }
    }
    expect(typeof pickShown).toBe("boolean"); // asked or auto-bound — either way it took VAYNE
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.zoneOf("home")).toBe("base");
    expect(sandSoldiers(game)).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });
});
