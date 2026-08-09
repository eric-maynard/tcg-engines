/**
 * Interaction: three "end of turn" effects at once, two controllers.
 *   × Sona, Harmonious (ogn-073-298) · Unit · Calm · 4 · Champion, 4 Might
 *     "At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes."   — P1, at bf1
 *   × Dark Child - Starter (ogs-017-024) · Legend · Fury/Chaos · Annie
 *     "At the end of your turn, ready up to 2 runes."                                     — P1's legend
 *   × Sanction (ven-035-166) · Spell · Calm · 3+[calm] · Reaction · "Choose one — Empower a unit.
 *     Disempower it at end of turn. / Disempower a unit that's [Empowered]. Empower it at end of turn."
 *                                                       — cast by P2 (mode 1) on P2's own unit, on P1's turn
 *
 * Rules: 317.1.a (Ending Step: end-of-turn effects happen), 383.3.d / 383.3.d.1 / 303.2.a (simultaneous
 * triggers: each controller orders their own, Turn Player first, then turn order — so P2's item lands on
 * TOP), 337.4 (controller of the newest item gets priority), 383.2.a.1 (Sona's "if I'm at a battlefield"
 * is an intervening-if: part of the TRIGGER condition), 320.1 (Closed state: only Reactions / [Add]),
 * 319.5 / 324.2 (each chain removal → a normal Cleanup), 317.2.b–d (Expiration: heal, 'this turn'
 * effects expire, Rune Pools empty), 167 / 167.1 (unspent Energy is lost; "ready" is a permanent's
 * status, not a pool resource).
 *
 * Question: at 317.1 all three fire. Who orders what, what resolves first, is P1 prompted for an order?
 * Follow-up: P1 exhausts one freshly readied rune for [1] mid-chain and never spends it — does the energy,
 * and do the readied runes, survive into P2's turn?
 *
 * Expected: P1 (Turn Player) orders Sona + Dark Child first (order Decision — P1 controls 2), then P2's
 * single Sanction Disempower trigger goes on top (no decision for P2). LIFO: P2's Disempower resolves
 * first, then P1's top item, then P1's bottom item. Only Reactions/[Add] are legal meanwhile; no Action
 * window afterwards. Expiration Step: the floating [1] is lost; the readied runes stay ready through P2's
 * turn and can pay for a Reaction there.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SONA = "ogn-073-298";
const DARK_CHILD = "ogs-017-024";
const SANCTION = "ven-035-166";
const DISCIPLINE = "ogn-058-298"; // Calm Action, 2: "Give a unit +2 [Might] this turn. Draw 1." — opens a chain for P2's Reaction
/** Inline 1-cost Reaction so P1 has something to spend readied runes on during P2's turn. */
const FLICK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Test Flick",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
};
/** Inline 1-cost Action — must NOT be castable in the Ending Step's Closed state. */
const JAB = { ...FLICK, abilities: [{ ...FLICK.abilities[0], timing: "action" }], name: "Test Jab", rulesText: "[Action] Deal 1 to a unit.", timing: "action" };

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 3, P1 active. P1: legend Dark Child - Starter, Sona at bf1 (or base for the contrast), a vanilla
 * Homebody in base, SEVEN calm runes r1..r7 all EXHAUSTED, 2 energy, Discipline + Flick + Jab in hand.
 * P2: a 3-Might Guard at bf2 (Sanction's object), 4 ready calm runes, 3 energy + 1 calm floating,
 * Sanction + a Discipline of its own in hand.
 */
function board(opts: { sonaAt?: "bf1" | "base" } = {}) {
  const b = scenario()
    .turn(3)
    .active(P1)
    .legend(P1, DARK_CHILD, "darkChild")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, opts.sonaAt ?? "bf1", SONA, "sona")
    .unit(P1, "base", { might: 2, name: "P1 Homebody" }, "p1Home")
    .unit(P2, "bf2", { might: 3, name: "P2 Guard" }, "guard");
  for (let i = 1; i <= 7; i++) {
    b.rune(P1, "calm", { alias: `r${i}`, exhausted: true });
  }
  return b
    .runes(P2, "calm", 4)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, FLICK, "flick")
    .hand(P1, JAB, "jab")
    .hand(P2, SANCTION, "sanction")
    .hand(P2, DISCIPLINE, "p2Discipline");
}

/**
 * During P1's turn: P1 casts Discipline on Homebody; in response P2 casts Sanction (mode 1: Empower) on
 * P2's own Guard; everything resolves. Then P1 ends the turn → Ending Step, triggers pending.
 */
async function atEndOfTurn(opts: { sonaAt?: "bf1" | "base" } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("discipline", { targets: "p1Home" });
  await game.p1.passPriority();
  await game.p2.cast("sanction", { mode: 0, targets: "guard" });
  await game.settle();
  expect(game.state("guard").isEmpowered).toBe(true);
  expect(game.zoneOf("sanction")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  await game.p1.endTurn();
  return game;
}

/** Answer P1's order offer so that `top` is the higher of P1's two items (resolves before the other). */
async function orderP1Only(game: Game, top: "sona" | "darkChild"): Promise<void> {
  const d = game.decision();
  expect(d?.kind).toBe("order");
  if (d?.kind !== "order") {
    return;
  }
  const s = d.items.find((i) => i.card === "sona")!.key;
  const k = d.items.find((i) => i.card === "darkChild")!.key;
  await game.p1.order(top === "darkChild" ? [s, k] : [k, s]); // first = bottom, last = top
}

/** Whoever holds priority passes, then the other player passes → the top item resolves. */
async function passAround(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/**
 * Order P1's pair, then let any P2-controlled item sitting on top of them (Sanction's delayed
 * Disempower, once the engine creates it — see the BUG tests) resolve, so the caller is looking at
 * P1's `top` item on top of the chain. Today the drain is a no-op.
 */
async function orderP1(game: Game, top: "sona" | "darkChild"): Promise<void> {
  await orderP1Only(game, top);
  for (let i = 0; i < 3 && game.chain().at(-1)?.controller === P2; i++) {
    await passAround(game);
  }
}

/** P1 then P2 pass priority → the top item resolves (337.4: the controller, P1, holds priority first). */
async function bothPass(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
}

const ready = (game: Game) => [...game.p1.runes({ ready: true })].sort();

describe("Sona + Dark Child + Sanction — three simultaneous 'end of turn' triggers, two controllers", () => {
  // ── who orders what ───────────────────────────────────────────────────────────────────────

  test("317.1.a / 383.3.d: at P1's Ending Step both of P1's triggers (Sona, Dark Child) are on the chain and P1 — controlling two simultaneous triggers — is offered their ORDER; nothing has resolved (all 7 runes still exhausted)", async () => {
    const game = await atEndOfTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card) : [];
    expect(items.sort()).toEqual(["darkChild", "sona"]);
    const p1Items = game.chain().filter((c) => c.controller === P1);
    expect(p1Items.map((c) => c.cardId).sort()).toEqual(["darkChild", "sona"]);
    expect(p1Items.every((c) => c.triggered)).toBe(true);
    expect(ready(game)).toEqual([]);
  });

  // 383.3.d.1 / 303.2.a: Sanction's "Disempower it at end of turn" is a delayed TRIGGERED ability
  // controlled by P2 that triggers at the same 317.1 timing; after the Turn Player (P1) places
  // Sona + Dark Child, P2 places that single item on TOP — three chain items, the newest controlled
  // by P2 (and P2, having only one, gets no order decision).
  test("P2's Sanction delayed Disempower trigger is the THIRD chain item, placed on top of P1's two (383.3.d.1)", async () => {
    const game = await atEndOfTurn();
    await orderP1Only(game, "darkChild");
    const chain = game.chain();
    expect(chain).toHaveLength(3);
    expect(chain.slice(0, 2).map((c) => c.controller)).toEqual([P1, P1]);
    expect(chain[2]).toMatchObject({ controller: P2, triggered: true });
    expect(chain[2]!.targets ?? []).toContain("guard");
  });

  // LIFO: P2's Disempower, being on top, resolves FIRST — after one round of passes the Guard is no
  // longer Empowered while BOTH of P1's rune triggers are still pending.
  test("chain resolves LIFO — P2's Guard loses Empowered first, with Sona and Dark Child still on the chain", async () => {
    const game = await atEndOfTurn();
    await orderP1Only(game, "darkChild");
    await passAround(game);
    expect(game.state("guard").isEmpowered).toBe(false);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["darkChild", "sona"]);
    expect(ready(game)).toEqual([]);
  });

  // ── P1's two triggers resolve in the order P1 chose ───────────────────────────────────────

  test("P1 puts Dark Child on top: it resolves first (P1 readies r1,r2) while Sona is still pending; then Sona resolves (r3–r6) → six ready, r7 still exhausted; P1 holds priority before P2 each time (337.4)", async () => {
    const game = await atEndOfTurn();
    await orderP1(game, "darkChild");
    expect(game.chain().filter((c) => c.controller === P1).map((c) => c.cardId)).toEqual(["sona", "darkChild"]); // bottom → top
    await bothPass(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "darkChild" } });
    expect(game.decision()).toMatchObject({ max: 2 });
    await game.p1.pick("r1", "r2");
    expect(ready(game)).toEqual(["r1", "r2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]);
    expect(game.phase()).toBe("ending");
    await bothPass(game);
    expect(game.decision()).toMatchObject({ kind: "pick", max: 4, seat: P1, source: { cardId: "sona" } });
    await game.p1.pick("r3", "r4", "r5", "r6");
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
    expect(game.state("r7").isExhausted).toBe(true);
  });

  test("P1 puts Sona on top instead: Sona's up-to-4 resolves first, Dark Child's up-to-2 second — same six runes ready at the end, opposite sequence", async () => {
    const game = await atEndOfTurn();
    await orderP1(game, "sona");
    expect(game.chain().filter((c) => c.controller === P1).map((c) => c.cardId)).toEqual(["darkChild", "sona"]);
    await bothPass(game);
    expect(game.decision()).toMatchObject({ kind: "pick", max: 4, seat: P1, source: { cardId: "sona" } });
    await game.p1.pick("r1", "r2", "r3", "r4");
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["darkChild"]);
    await bothPass(game);
    expect(game.decision()).toMatchObject({ kind: "pick", max: 2, seat: P1, source: { cardId: "darkChild" } });
    await game.p1.pick("r5", "r6");
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
  });

  test("Sona's pick offers only FRIENDLY runes ('ready up to 4 friendly runes') — none of P2's", async () => {
    const game = await atEndOfTurn();
    await orderP1(game, "sona");
    await bothPass(game);
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered.sort()).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
  });

  // ── contrast: Sona NOT at a battlefield ───────────────────────────────────────────────────

  test("contrast (383.2.a.1 — Sona is the rule's own example): with Sona in BASE her intervening-if fails, so she never triggers; only Dark Child goes on the chain and P1, now controlling a single trigger, gets NO order decision", async () => {
    const game = await atEndOfTurn({ sonaAt: "base" });
    expect(game.phase()).toBe("ending");
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.chain().filter((c) => c.controller === P1).map((c) => c.cardId)).toEqual(["darkChild"]);
    // 337.4 — P2's Sanction Disempower is still the newest item (it sits on top of Dark Child),
    // so P2, not P1, holds priority here.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  // ── Closed state: only Reactions / [Add] while items are pending ──────────────────────────

  test("320.1: while an end-of-turn trigger is pending P1 may use [Add] (exhaust a readied rune → +[1]) and Reactions, but no Action-speed play, no move, no second endTurn", async () => {
    const game = await atEndOfTurn();
    await orderP1(game, "darkChild");
    await bothPass(game);
    await game.p1.pick("r1", "r2"); // Dark Child readied r1, r2; Sona still on the chain
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("tapRune", "r1")).toBe(true);
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.p1.can("cast", "flick")).toBe(true); // Reaction: legal in the Closed state
    expect(game.p1.can("cast", "jab")).toBe(false); // Action: not legal
    const verbs = new Set(game.p1.legal().map((o) => o.verb));
    expect(verbs.has("endTurn")).toBe(false);
    expect(verbs.has("move")).toBe(false);
    expect(verbs.has("play")).toBe(false);
  });

  // ── follow-up: what survives into P2's turn ───────────────────────────────────────────────

  test("follow-up: P1 taps a readied rune for [1] mid-chain and never spends it → after the last trigger resolves there is NO Action window (straight into P2's turn); the Expiration Step empties P1's pool (167.1, 317.2.d) but the other five readied runes STAY READY in P2's main phase; Discipline's +2 has expired and the Guard is no longer Empowered", async () => {
    const game = await atEndOfTurn();
    await orderP1(game, "darkChild");
    await bothPass(game);
    await game.p1.pick("r1", "r2");
    await game.p1.tapRune("r1"); // floating [1]
    expect(game.p1.energy()).toBe(1);
    await bothPass(game);
    await game.p1.pick("r3", "r4", "r5", "r6");
    // Chain empty in the Ending Step → no priority for anyone; the turn rolls over.
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.energy()).toBe(0); // the unspent [1] is gone
    expect(game.p1.power()).toBe(0);
    expect(ready(game)).toEqual(["r2", "r3", "r4", "r5", "r6"]); // ready is a status, not a pool resource
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.state("r7").isExhausted).toBe(true);
    expect(game.state("p1Home").might).toBe(2); // 'this turn' +2 expired (317.2.c)
    expect(game.state("guard").isEmpowered).toBe(false); // by P2's turn the Empower is over either way
    expect(game.violations()).toEqual([]);
  });

  test("follow-up: those ready runes are spendable on P2's turn — P2 casts a spell, P1 responds by exhausting r3 and casting a 1-cost Reaction at the Guard (1 damage); r3 is now exhausted, the rest still ready", async () => {
    const game = await atEndOfTurn();
    await orderP1(game, "darkChild");
    await bothPass(game);
    await game.p1.pick("r1", "r2");
    await bothPass(game);
    await game.p1.pick("r3", "r4", "r5", "r6");
    await game.settle(); // → P2's main phase
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRunes(2);
    await game.p2.cast("p2Discipline", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(0);
    await game.p1.tapRune("r3");
    expect(game.p1.energy()).toBe(1);
    await game.p1.cast("flick", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("flick")).toBe("trash");
    expect(game.state("guard").damage).toBe(1);
    expect(ready(game)).toEqual(["r1", "r2", "r4", "r5", "r6"]);
    expect(game.violations()).toEqual([]);
  });
});
