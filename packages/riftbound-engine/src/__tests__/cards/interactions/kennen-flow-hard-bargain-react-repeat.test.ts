/**
 * Interaction: Kennen, Storm of Shuriken (ven-113-166) · Champion Unit · Chaos · 4 Might
 *     "When I conquer, give a spell in your trash [Flow] equal to its cost this turn. (You may play it
 *      from your trash for its Flow cost. Then banish it.)"
 *   × Hard Bargain (sfd-136-221) · Spell · Chaos · 2 · "[Reaction] [Repeat] [2] — Counter a spell
 *     unless its controller pays [2]."   (in P1's TRASH)
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   Props: Void Seeker (ogn-024-298, Action 3+[fury], "Deal 4 to a unit at a battlefield. Draw 1."),
 *          Wind Wall (ogn-064-298, Reaction 3+[calm][calm], "Counter a spell."), Stargazer (ven-098-166).
 *
 * Question (P1's turn): Kennen conquers bf1 and grants the trashed Hard Bargain "[Flow] equal to its
 * cost this turn". Later P1 casts Void Seeker at P2's unit, P2 responds with Discipline on it.
 *  (a) may P1 play Hard Bargain FROM THE TRASH as a Reaction on top of Discipline; Flow cost?
 *  (b) is Repeat still offered on the Flow play; totals; targets chosen when?
 *  (c) with Repeat: how many [2] ransoms keep Discipline; what if P2 declines the first?
 *  (d) where does Hard Bargain go afterwards (also if Wind Walled)?
 *  (e) NO sides: next (P2's) turn; no Kennen grant but a Stargazer discount.
 *
 * Rules: 829.1.b/.b.1/.b.2 (Flow = play from trash for the Flow cost, then a delayed replacement
 * banishes it as it leaves the chain; timing/permissions unchanged) · 829.1.c.1 + 356.1.a (Flow cost
 * is an alternate cost replacing the base) · 206 ("its cost" = printed cost → Flow [2]) · 813.1.c.1 /
 * 358.4 (printed [Reaction] → playable in the Closed state onto the chain) · 820.1.c.1 / 355.1.a /
 * 356.2.b.1 (Repeat is an optional ADDITIONAL cost, independent of origin) · 820.2 (choices for every
 * execution are made at play time) · 820.3.a (one spell played) · 359.3.e.7 (an execution whose target
 * is gone is ignored) · 425.1.c (countering refunds nothing) · 390.3.a (then-banish replacement also
 * applies when the Flowed spell is itself countered) · 419.1.a (no permission → no play from trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-113-166";
const HARD_BARGAIN = "sfd-136-221";
const DISCIPLINE = "ogn-058-298";
const VOID_SEEKER = "ogn-024-298";
const WIND_WALL = "ogn-064-298";
const STARGAZER = "ven-098-166";

/**
 * P1's turn: ready Kennen in base next to an EMPTY P2-held bf1 (walk-in conquer), Hard Bargain in P1's
 * trash, Void Seeker in hand; P2's 5-Might "Far" sits at bf2 and P2 holds Discipline + Wind Wall.
 * Pools: P1 9 energy + [fury] (Void Seeker 3+[fury] → 6 left); P2 8 energy + 3 calm (Discipline → 6 left).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1 } })
    .resources(P2, { energy: 8, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KENNEN, "kennen")
    .unit(P2, "bf2", { might: 5, name: "Far" }, "far")
    .trash(P1, HARD_BARGAIN, "hb")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, VOID_SEEKER, "vs2")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, WIND_WALL, "ww");
}

/** Kennen walks onto bf1 and conquers; his trigger's only candidate (Hard Bargain) is bound; settle to the open state. */
async function conquerAndGrant(game: Game): Promise<void> {
  await game.p1.move("kennen", "bf1");
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = r.decision;
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("hb");
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else {
      break;
    }
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

/** Void Seeker at Far; P2 answers with Discipline on Far and passes → P1 holds priority over [vs, disc]. */
async function stackDiscipline(game: Game): Promise<void> {
  await game.p1.cast("vs", { targets: "far" });
  await game.p1.passPriority();
  await game.p2.cast("disc", { targets: "far" });
  await game.p2.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "disc"]);
  expect(game.actingSeat()).toBe(P1);
}

/**
 * Flow Hard Bargain from the trash at Discipline (optionally with Repeat). The rules-correct call names
 * the target at play time (820.2); today's engine offers no `targets` on the Flow variant, so fall back
 * to the target-less form (the dedicated BUG test below pins that gap).
 */
async function flowHardBargain(game: Game, repeat = 0): Promise<void> {
  const withTarget = await game.p1.try((p) => p.cast("hb", { flow: true, targets: "disc", ...(repeat ? { repeat } : {}) }));
  if (!withTarget.ok) {
    await game.p1.cast("hb", { flow: true, ...(repeat ? { repeat } : {}) });
  }
}

/** Pass priority around until the top item resolves into a prompt (or the chain empties). */
async function passUntilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Kennen's granted Flow × Hard Bargain (Reaction, Repeat) from the trash vs Discipline", () => {
  // ── (a) permission, timing, Flow cost ────────────────────────────────────────────────────────
  test("(a) before the conquer Hard Bargain in the trash is unplayable; after Kennen's grant it is castable FROM THE TRASH as a Reaction on top of Discipline (only while P1 holds priority) — Flow variant only, Flow cost = printed [2] (206): 6 → 4", async () => {
    const game = await board().build();
    expect(game.p1.legal().some((o) => o.card === "hb")).toBe(false);
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "hb")).toBe(false); // empty chain: "a spell" has no legal target yet (355.8)
    await game.p1.cast("vs", { targets: "far" });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "far" });
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "hb")).toBe(false); // not P1's priority
    await game.p2.passPriority();
    expect(game.p1.can("cast", "hb")).toBe(true); // Closed state, Reaction timing kept (829.1.b.2 / 813.1.c.1)
    expect(game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "flow")).toMatchObject({ options: [true], required: true });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 0 } });
    await flowHardBargain(game);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(game.zoneOf("hb")).toBe("chain");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "disc", "hb"]);
    expect(game.chain()[2]).toMatchObject({ cardId: "hb", controller: P1, triggered: false });
  });

  // ── (b) Repeat on a Flow play ────────────────────────────────────────────────────────────────
  test("(b) Repeat is still offered on the Flow play (a single instance, 820.1.c.3): total [2] Flow + [2] Repeat = 4 (6 → 2), still ONE chain item (820.3.a)", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    const repeat = game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat");
    expect(repeat).toMatchObject({ max: 1, required: false });
    await flowHardBargain(game, 1);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "disc", "hb"]);
    expect(game.chain().filter((c) => c.cardId === "hb")).toHaveLength(1);
  });

  // BUG — expected (355.5 / 820.2): the spell(s) to counter are chosen as Hard Bargain is PLAYED — the
  // Flow variant must list the chain spells (vs, disc) as targets exactly like the hand cast does, and
  // a cast naming Discipline must be accepted. Actual: the from-trash Flow variants carry no `targets`
  // field at all; the counter's victim is only looked up at resolution (see the (c) decline BUG).
  test("(b) the counter target is chosen at play time on the Flow play too (355.5 / 820.2) — Discipline (or Void Seeker) is offered and naming Discipline is accepted", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    const targets = game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "targets");
    expect(targets?.options ?? []).toEqual(expect.arrayContaining([["vs"], ["disc"]]));
    await game.p1.cast("hb", { flow: true, repeat: 1, targets: "disc" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "disc", "hb"]);
  });

  // DESIGN (DESIGN.md §Paying costs): the 357.1.a "[Add] / tap runes while paying" sub-step is
  // deliberately not modelled — a play is only OFFERED when the current pool covers it; the player
  // taps runes first, then plays. So with 1 energy and ready runes the Flow play is absent until tapped.
  test("(b) DESIGN — paying is manual: with 1 energy in the pool and 3 ready runes the Flow play is not offered; after tapping one rune (2 energy) it is, and tapping two more unlocks the Repeat line", async () => {
    const game = await board().resources(P1, { energy: 4, power: { fury: 1 } }).runes(P1, "chaos", 3).build();
    await conquerAndGrant(game);
    await stackDiscipline(game); // Void Seeker leaves P1 with exactly 1 energy
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "hb")).toBe(false);
    await game.p1.tapRune();
    expect(game.p1.can("cast", "hb")).toBe(true);
    expect(game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")).toBeUndefined();
    await game.p1.tapRunes(2);
    expect(game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")).toMatchObject({ max: 1 });
  });

  // ── (c) resolution ───────────────────────────────────────────────────────────────────────────
  test("(c) LIFO — Hard Bargain resolves first; with Repeat paid P2 (Discipline's controller) is asked for [2] TWICE: paying both (6 → 4 → 2) keeps Discipline, which then resolves (+2 Might on Far, P2 draws 1); Hard Bargain is banished", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    await flowHardBargain(game, 1);
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(game.p2.energy()).toBe(6);
    await game.p2.yes();
    expect(game.p2.energy()).toBe(4);
    expect(game.zoneOf("disc")).toBe("chain");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 }); // second execution asks again
    await game.p2.yes();
    expect(game.p2.energy()).toBe(2);
    expect(game.zoneOf("hb")).toBe("banishment");
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash"); // resolved normally
    expect(game.state("far").might).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("far").damage).toBe(4); // 4 on a 7 — survives
    expect(game.chain()).toEqual([]);
  });

  test("(c) without Repeat, P2 DECLINES the single ransom: Discipline is countered → P2's trash with its [2] unrefunded (425.1.c), no +2 / no draw; Hard Bargain → banishment; Void Seeker then resolves (Far takes 4)", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    await flowHardBargain(game);
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    const p2Hand = game.p2.hand().length;
    await game.p2.no();
    expect(game.p2.resources()).toEqual({ energy: 6, power: { calm: 3 } }); // Discipline's 2 stay spent, ransom not paid
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("banishment");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("far").might).toBe(5);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("far").damage).toBe(4);
  });

  // BUG — expected (820.2 + 359.3.e.7): both executions were aimed at Discipline when Hard Bargain was
  // played; once P2 declines the first ransom Discipline is countered, so the second execution has no
  // legal target and is simply ignored — nobody is asked anything else and Void Seeker resolves.
  // Actual: the engine re-scans the chain for "a spell" at resolution, lands on P1's own Void Seeker and
  // asks P1 to ransom it (declining counters P1's own spell).
  test("(c) with Repeat, P2 declining the FIRST ransom counters Discipline and the second execution is ignored (359.3.e.7) — no further prompt, Void Seeker untouched and resolves", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    await flowHardBargain(game, 1);
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p2.energy()).toBe(6);
    expect(game.decision()?.kind).not.toBe("yes-no"); // exec-2: nothing to ask anybody
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("hb")).toBe("banishment");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("far").damage).toBe(4); // Void Seeker was never a chosen target
  });

  // ── (d) where Hard Bargain ends up ───────────────────────────────────────────────────────────
  test("(d) played via Flow → banished as it leaves the chain (829.1.b.1): it is in P1's BANISHMENT, not the trash, and can never be Flowed again — even with a fresh spell on the chain and energy to spare", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    await flowHardBargain(game);
    await passUntilPrompt(game);
    await game.p2.yes(); // P2 keeps Discipline; irrelevant here
    await game.settle();
    expect(game.zoneOf("hb")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["hb"]);
    expect(game.p1.trash()).not.toContain("hb");
    await game.p1.do("addResources", { energy: 6, power: { fury: 1 } });
    await game.p1.cast("vs2", { targets: "far" }); // a spell on the chain again, same turn, grant still "live"
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs2"]);
    expect(game.p1.can("cast", "hb")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "hb")).toBe(false);
  });

  test("(d) if P2 Wind Walls the Flowed Hard Bargain instead, it is STILL banished (left the chain not by its own execution — 829.1.b.1 / 390.3.a), P1's [2] is not refunded (425.1.c), and Discipline resolves untouched", async () => {
    const game = await board().resources(P2, { energy: 9, power: { calm: 3 } }).build();
    await conquerAndGrant(game);
    await stackDiscipline(game);
    await flowHardBargain(game);
    expect(game.p1.energy()).toBe(4);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "ww")).toBe(true);
    await game.p2.cast("ww", { targets: "hb" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "disc", "hb", "ww"]);
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no ransom prompt ever — Hard Bargain never resolved
    expect(game.zoneOf("hb")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("hb");
    expect(game.p1.energy()).toBe(4);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("far").might).toBe(7); // Discipline landed
    expect(game.state("far").damage).toBe(4);
  });

  // ── (e) NO sides ─────────────────────────────────────────────────────────────────────────────
  test("(e)(i) 'this turn' — on P2's following turn the un-played Hard Bargain is still in the trash but has no Flow: with a P2 spell on the chain and 6 energy, P1 cannot play it (419.1.a)", async () => {
    const game = await board().build();
    await conquerAndGrant(game);
    expect(game.zoneOf("hb")).toBe("trash");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p1.do("addResources", { energy: 6 });
    await game.p2.do("addResources", { energy: 2 });
    await game.p2.cast("disc", { targets: "far" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.p1.can("cast", "hb")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "hb")).toBe(false);
  });

  test("(e)(ii) discounts are not permissions — without Kennen's grant, a Stargazer on board and 9 energy still give P1 no way to play Hard Bargain from the trash onto a live chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { fury: 1 } })
      .resources(P2, { energy: 8, power: { calm: 3 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", STARGAZER, "stargazer")
      .unit(P2, "bf2", { might: 5, name: "Far" }, "far")
      .trash(P1, HARD_BARGAIN, "hb")
      .hand(P1, VOID_SEEKER, "vs")
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await stackDiscipline(game);
    expect(game.p1.energy()).toBe(6);
    expect(game.p1.can("cast", "hb")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "hb")).toBe(false);
    const forced = await game.p1.try((p) => p.cast("hb", { flow: true }));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.p1.energy()).toBe(6);
  });
});
