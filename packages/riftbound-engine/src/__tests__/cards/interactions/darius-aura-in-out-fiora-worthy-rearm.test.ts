/**
 * Interaction: Fiora, Worthy (sfd-180-221) · Unit · Order · 3 · 3 Might
 *     "When a unit you control becomes [Mighty], you may pay [order] to ready it. (A unit is Mighty while it has 5+ [Might].)"
 *   × Darius, Executioner (ogn-243-298) · Unit · Order · 6 · 6 Might — "[Legion] — When you play me, ready me. Other friendly units have +1 [Might] here."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · Action — "Move a friendly unit and ready it."
 *
 * Question — state-trigger re-arming via an aura ENTERING and LEAVING. P1 controls Fiora (3, base), Darius (ready, base) and,
 * at bf1, two exhausted 4-Might units A and B plus an exhausted 5-Might unit W. P1 has [order]×4 (+ 2 and [chaos] for the spell).
 *   (a) P1 standard-moves Darius base→bf1: how many Fiora triggers, who orders them, when is each "may + [order]" decided; does W
 *       (5→6) trigger?
 *   (b) P1 plays Ride the Wind on Darius, moving him bf1→base (and readying him): A/B drop 5→4. Any trigger? Do A/B lose "ready"?
 *   (c) P1 standard-moves Darius base→bf1 AGAIN the same turn: A/B go 4→5 a second time — does Fiora trigger again for each?
 *   (d) contrast: Darius already at bf1 and A is PLAYED there (enters directly at 5) — does Fiora trigger for A?
 *
 * Rules: 709 ("becomes Mighty" = Might changes from < 5 to ≥ 5; 5→6 does not), 708, 383.3.a / 383.3.b (leading "you may pay
 * [order] to" = opt-in + base cost, both settled at FINALIZATION), 383.3.a.2 (declined ⇒ removed, never triggered), 383.3.d
 * (simultaneous triggers of one controller: that player orders them), 383.3.e (no "once each turn" here), 144 / 144.2 (standard
 * move; exhausting is its cost), 453 (Cleanup after a move), 359.3.e.6 (base is a legal Ride the Wind destination).
 * Ruling: riftjudge Darius / Fiora — a unit that ENTERS already at 5 under a pre-existing aura never "becomes" Mighty.
 *
 * Expected: (a) Darius arrives exhausted; A, B 4→5 simultaneously = two separate Fiora items (trigger source A resp. B), W 5→6 and
 * Darius himself ("other") trigger nothing; each item gets its own FIN opt-in that pays [order] on yes; P1 orders them (soft
 * offer); both resolve → A and B readied, order 4→2. (b) Ride the Wind → base legal; A/B back to 4, still READY; no trigger.
 * (c) A/B 4→5 again → two MORE Fiora items with FIN opt-in/payment each (order 2→0); declining removes that item. Trigger
 * counts across the turn [2, 0, 2] = 4, W never. (d) No trigger — A is never on the board below 5.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA_WORTHY = "sfd-180-221";
const DARIUS_EXECUTIONER = "ogn-243-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. Fiora + ready Darius in base; A(4) B(4) W(5) exhausted at P1's bf1; [order]×4 + 2/[chaos] for Ride the Wind. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1, order: 4 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Enemy Four" }, "enemy") // an ENEMY 4 never matters to "a unit you control"
    .unit(P1, "base", FIORA_WORTHY, "fiora")
    .unit(P1, "base", DARIUS_EXECUTIONER, "darius")
    .unit(P1, "bf1", { might: 4, name: "Unit A" }, "a", { exhausted: true })
    .unit(P1, "bf1", { might: 4, name: "Unit B" }, "b", { exhausted: true })
    .unit(P1, "bf1", { might: 5, name: "Unit W" }, "w", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

type RawItem = { id: string; cardId: string; triggered?: boolean; status?: string; mayKind?: string; optInCost?: unknown; triggerEvent?: { type?: string; cardId?: string } };
const rawChain = (game: Game): RawItem[] => ((game.gameState.interaction?.chain?.items ?? []) as unknown as RawItem[]);
/** Fiora's items on the chain → the unit each one was triggered BY (its "it"). */
const fioraItemsFor = (game: Game): string[] => rawChain(game).filter((i) => i.cardId === "fiora" && i.triggered).map((i) => String(i.triggerEvent?.cardId));

const isFioraOptIn = (d: Decision | null): boolean => d?.kind === "yes-no" && d.source?.cardId === "fiora" && d.source?.pendingChoiceType === "opt-in";

/** Answer every consecutive Fiora "Pay [order] to …?" opt-in with `answers` (in order); returns how many were asked. */
async function answerFioraOptIns(game: Game, answers: readonly boolean[]): Promise<number> {
  let asked = 0;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!isFioraOptIn(d)) {
      break;
    }
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    const a = answers[asked] ?? true;
    asked += 1;
    await (a ? game.p1.yes() : game.p1.no());
  }
  return asked;
}

/** (a) fully played out: Darius → bf1, both opt-ins paid, both items resolved. */
async function lineA(game: Game): Promise<void> {
  await game.p1.move("darius", "bf1");
  expect(await answerFioraOptIns(game, [true, true])).toBe(2);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

/** (b) on top of (a): Ride the Wind on Darius → base (destination named at finalization), resolved. */
async function lineB(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "darius" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("base"); // 359.3.e.6 — base is a legal destination
  await game.p1.pick("base");
  expect(await answerFioraOptIns(game, [])).toBe(0);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Darius aura in → out → in × Fiora, Worthy — 'becomes Mighty' re-arms after dropping below 5", () => {
  test("setup: with Darius in BASE his aura is not at bf1 — A 4, B 4, W 5 (all exhausted), Darius 6 ready; 'here' is his base for now, so only Fiora (3→4, not Mighty) feels it; order 4", async () => {
    const game = await board().build();
    expect(game.state("a")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("b")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("w")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("darius")).toMatchObject({ isReady: true, location: "base", might: 6 });
    expect(game.state("fiora").might).toBe(4); // a Base is a Location too — "here" = wherever Darius is
    expect(game.p1.power("order")).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  // ── (a) Darius walks in ─────────────────────────────────────────────────────────────────────────────

  test("(a) Darius standard-moves base→bf1: he EXHAUSTS (144.2), his passive applies at once — A 5, B 5, W 6, Darius himself still 6 ('other')", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    expect(game.state("darius")).toMatchObject({ isExhausted: true, location: "bf1", might: 6 });
    expect(game.state("a").might).toBe(5);
    expect(game.state("b").might).toBe(5);
    expect(game.state("w").might).toBe(6);
    expect(game.state("fiora").might).toBe(3); // not "here"
  });

  test("(a) exactly TWO Fiora items go on the chain — one triggered by A, one by B; W (5→6, already Mighty) and Darius trigger nothing (709 ex. 2)", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true, type: "ability" }),
      expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true, type: "ability" }),
    ]);
    expect([...fioraItemsFor(game)].sort()).toEqual(["a", "b"]);
    expect(fioraItemsFor(game)).not.toContain("w");
    expect(fioraItemsFor(game)).not.toContain("darius");
    for (const it of rawChain(game)) {
      expect(it).toMatchObject({ mayKind: "cost-at-finalization", triggerEvent: { type: "become-mighty" } });
    }
  });

  test("(a) each item is finalized in turn with its OWN 'may + pay [order]' decision (FIN ×2, before anyone gets priority): yes → [order] paid immediately (4→3→2), the ready itself waits for resolution", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    const first = game.decision();
    expect(isFioraOptIn(first)).toBe(true);
    expect(first).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "fiora", chainItemId: expect.any(String) }, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(3);
    const second = game.decision();
    expect(isFioraOptIn(second)).toBe(true);
    expect(second?.source?.chainItemId).not.toBe(first?.source?.chainItemId); // a separate item, a separate decision
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(2);
    expect(game.state("a").isExhausted).toBe(true); // nothing readied yet — that is the EFFECT
    expect(game.state("b").isExhausted).toBe(true);
    expect(rawChain(game).every((i) => i.status === "finalized")).toBe(true);
  });

  // Expected (383.3.d, DESIGN "Trigger ordering"): the two items are NOT interchangeable — one readies A, the other B (each
  // reads its own triggering unit) — so after both are finalized their controller P1 gets the soft `order` offer.
  test("(a) P1, controlling both simultaneous triggers, is offered to ORDER them (soft `order` decision, defaultable) once both are finalized (383.3.d)", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    expect(await answerFioraOptIns(game, [true, true])).toBe(2);
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
  });

  test("(a) after finalization P1 (controller of the newest item) holds priority; both items resolve → A and B READIED, W and Darius stay exhausted, order 4→2, back to an open main phase", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    expect(await answerFioraOptIns(game, [true, true])).toBe(2);
    await game.acceptTriggerOrder(); // no-op today (see BUG above); accepts the listed order once offered
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("a")).toMatchObject({ isReady: true, might: 5 });
    expect(game.state("b")).toMatchObject({ isReady: true, might: 5 });
    expect(game.state("w")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.power("order")).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) declining is per item (383.3.a.2): 'no' to the first, 'yes' to the second → one item left on the chain, one [order] paid, exactly one of A/B readied", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    expect(await answerFioraOptIns(game, [false, true])).toBe(2);
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.power("order")).toBe(3);
    await game.settle();
    const readied = ["a", "b"].filter((u) => game.state(u).isReady);
    expect(readied).toHaveLength(1);
    expect(fioraItemsFor(game)).toEqual([]);
  });

  // ── (b) Darius rides the wind home ──────────────────────────────────────────────────────────────────

  test("(b) Ride the Wind on Darius: base is offered and chosen as the destination at finalization; on resolution Darius is in base and READY, 2 + [chaos] paid", async () => {
    const game = await board().build();
    await lineA(game);
    await lineB(game);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("darius")).toMatchObject({ isReady: true, location: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("chaos")).toBe(0);
  });

  test("(b) the aura leaves with him: A 5→4, B 5→4, W 6→5 — losing Mighty triggers NOTHING (chain empty, order still 2) and A/B KEEP the ready they were given", async () => {
    const game = await board().build();
    await lineA(game);
    await lineB(game);
    expect(game.state("a")).toMatchObject({ isReady: true, might: 4 });
    expect(game.state("b")).toMatchObject({ isReady: true, might: 4 });
    expect(game.state("w")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("fiora").might).toBe(4); // "here" is now the base again: Fiora 3→4 — not a Mighty crossing either
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("order")).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) … and walks back in the same turn ───────────────────────────────────────────────────────────

  test("(c) Darius (readied by the spell) standard-moves base→bf1 AGAIN: A/B 4→5 a second time → Fiora triggers AGAIN for each (no 'once each turn') — two new items for A and B, two FIN opt-ins, order 2→0", async () => {
    const game = await board().build();
    await lineA(game);
    await lineB(game);
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("darius", "bf1");
    expect(game.state("darius")).toMatchObject({ isExhausted: true, location: "bf1" });
    expect(game.state("a").might).toBe(5);
    expect(game.state("b").might).toBe(5);
    expect(game.state("w").might).toBe(6);
    expect([...fioraItemsFor(game)].sort()).toEqual(["a", "b"]);
    expect(await answerFioraOptIns(game, [true, true])).toBe(2);
    expect(game.p1.power("order")).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("a")).toMatchObject({ isReady: true, might: 5 });
    expect(game.state("b")).toMatchObject({ isReady: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) trigger census for the whole turn: [2, 0, 2] Fiora items (4 total, 4 [order] spent), never one for W or Darius", async () => {
    const game = await board().build();
    const counts: number[] = [];
    const sources: string[] = [];
    await game.p1.move("darius", "bf1");
    sources.push(...fioraItemsFor(game));
    counts.push(await answerFioraOptIns(game, [true, true]));
    await game.settle();
    await game.p1.cast("rtw", { targets: "darius" });
    await game.p1.pick("base");
    sources.push(...fioraItemsFor(game));
    counts.push(await answerFioraOptIns(game, []));
    await game.settle();
    await game.p1.move("darius", "bf1");
    sources.push(...fioraItemsFor(game));
    counts.push(await answerFioraOptIns(game, [true, true]));
    await game.settle();
    expect(counts).toEqual([2, 0, 2]);
    expect([...sources].sort()).toEqual(["a", "a", "b", "b"]);
    expect(game.p1.power("order")).toBe(0);
    expect(game.state("w").isExhausted).toBe(true);
  });

  test("(c) the re-armed triggers are just as optional: decline both on the second crossing → items removed, no [order] spent (stays 2), nothing on the chain", async () => {
    const game = await board().build();
    await lineA(game);
    await lineB(game);
    await game.p1.move("darius", "bf1");
    expect(await answerFioraOptIns(game, [false, false])).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("order")).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c′) observable re-arm: decline both in (a) (A/B stay EXHAUSTED at 5), bounce Darius, walk him back → this time pay both → A and B are readied by the SECOND crossing", async () => {
    const game = await board().build();
    await game.p1.move("darius", "bf1");
    expect(await answerFioraOptIns(game, [false, false])).toBe(2);
    await game.settle();
    expect(game.state("a")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.power("order")).toBe(4);
    await lineB(game);
    expect(game.state("a")).toMatchObject({ isExhausted: true, might: 4 });
    await game.p1.move("darius", "bf1");
    expect(await answerFioraOptIns(game, [true, true])).toBe(2);
    await game.settle();
    expect(game.state("a")).toMatchObject({ isReady: true, might: 5 });
    expect(game.state("b")).toMatchObject({ isReady: true, might: 5 });
    expect(game.p1.power("order")).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: entering under a pre-existing aura ────────────────────────────────────────────────

  test("(d) Darius already AT bf1, A (printed 4) is PLAYED to bf1: it is 5 the moment it is on the board — it never 'becomes' Mighty, Fiora does not trigger, no opt-in, order untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 4 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Enemy Four" }, "enemy")
      .unit(P1, "base", FIORA_WORTHY, "fiora")
      .unit(P1, "bf1", DARIUS_EXECUTIONER, "darius")
      .unit(P1, "bf1", { might: 4, name: "Unit B" }, "b", { exhausted: true })
      .hand(P1, { cardType: "unit", energyCost: 2, might: 4, name: "Unit A" }, "a")
      .build();
    expect(game.state("b").might).toBe(5); // the aura is already up
    await game.p1.play("a", { to: "bf1" });
    expect(game.state("a")).toMatchObject({ location: "bf1", might: 5 });
    expect(isFioraOptIn(game.decision())).toBe(false);
    expect(fioraItemsFor(game)).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("order")).toBe(4);
    expect(game.state("a").isExhausted).toBe(true); // entered exhausted, nobody readied it
    expect(game.violations()).toEqual([]);
  });

  test("(d) control: that same A (entered at 5, no trigger) DOES become Mighty later — Darius rides the wind out (A 5→4) and walks back in (A 4→5) → one Fiora item for A, pay [order], A readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1, order: 4 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Enemy Four" }, "enemy")
      .unit(P1, "base", FIORA_WORTHY, "fiora")
      .unit(P1, "bf1", DARIUS_EXECUTIONER, "darius", { exhausted: true })
      .hand(P1, { cardType: "unit", energyCost: 2, might: 4, name: "Unit A" }, "a")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.play("a", { to: "bf1" });
    await game.settle();
    expect(fioraItemsFor(game)).toEqual([]);
    await game.p1.cast("rtw", { targets: "darius" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("a").might).toBe(4);
    await game.p1.move("darius", "bf1");
    expect(game.state("a").might).toBe(5);
    expect(fioraItemsFor(game)).toEqual(["a"]);
    expect(await answerFioraOptIns(game, [true])).toBe(1);
    await game.settle();
    expect(game.state("a").isReady).toBe(true);
    expect(game.p1.power("order")).toBe(3);
  });
});
