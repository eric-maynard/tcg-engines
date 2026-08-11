/**
 * Interaction: Iterative Design (ven-051-166, Spell, Mind, 4) "Play a 3 [Might] Mech unit token. [Flow] [2][mind]
 *     (You may play this from your trash for its Flow cost. Then banish it.)"
 *   × Rek'Sai, Breacher (sfd-029-221, Champion Unit, Fury, 3) "[Accelerate] [Assault] Friendly units played from
 *     anywhere other than a player's hand have [Accelerate]."
 *   × Heart of the Tempest (ven-197-166, Legend) "When you play a card from anywhere other than your hand,
 *     empower me. …"
 *   (+ Wind Wall ogn-064-298 "[Reaction] Counter a spell." for the countered contrast.)
 *
 * Question: P1's legend is Heart of the Tempest (not empowered); P1 controls Rek'Sai, Breacher and bf1; Iterative
 * Design is in P1's trash; P1's turn, Open state; P1 Flows it. (a) cost / timing / Add-during-pay? (b) the Mech
 * token played on resolution: where may it go, does Breacher grant it Accelerate, what is the price for a
 * domain-less token, when is it elected/paid, does it enter ready? (c) does Heart of the Tempest trigger for the
 * spell (played from trash)? for the token? how many empowers and when? (d) where does Iterative Design end up
 * (resolved / countered)? (e) contrast: hard-cast from HAND with Breacher out.
 *
 * Rules: 829.1.c.1 (Flow cost is an ALTERNATE cost replacing the base [4]), 829.1.b.2 (no timing change),
 * 829.1.b.1 / 390.3.a ("then banish it" = delayed replacement on leaving the chain — countered included),
 * 356.1.a, 357.1.a (Add during pay — DESIGN: manual, pool-only), 185 / 350.2 (tokens are not cards but are
 * PLAYED), 185.2.a + 419.3 (the token play follows the unit-play steps), 355.2.a (base or a controlled
 * battlefield), 185.3.a.1 (token cost 0), 185.3.b + 805.1.a.2 (no domain → the Accelerate power is [A]),
 * 805.2 / 355.1.a / 356.2.b.1 (Accelerate = optional additional cost elected and paid AS the unit is played),
 * 805.6 (paid → enters ready), 359.2.c (otherwise exhausted), 419.4.a (play triggers fire when the play
 * completes), 425.1.b (countered → not played for triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ITERATIVE_DESIGN = "ven-051-166";
const REKSAI_BREACHER = "sfd-029-221";
const HEART_OF_THE_TEMPEST = "ven-197-166";
const WIND_WALL = "ogn-064-298"; // 3 + [calm][calm]

type Pool = { energy: number; power?: Record<string, number> };

/**
 * P1's turn-2 main phase. P1: Heart of the Tempest (NOT empowered), Rek'Sai, Breacher in base, bf1 held by a
 * 1-Might Holder (durable control), one READY fury rune "r1" (never auto-tapped). P2: Wind Wall + 3+[calm][calm].
 * `from` puts Iterative Design in P1's trash (Flow) or hand; default pools leave exactly [1] + one CALM power
 * after paying — enough for one Accelerate [1][A], and calm ≠ Rek'Sai's fury on purpose.
 */
function board(opts: { from?: "trash" | "hand"; pool?: Pool; breacher?: boolean } = {}) {
  const from = opts.from ?? "trash";
  const pool = opts.pool ?? (from === "trash" ? { energy: 3, power: { mind: 1, calm: 1 } } : { energy: 5, power: { calm: 1 } });
  let s = scenario()
    .resources(P1, pool)
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .legend(P1, HEART_OF_THE_TEMPEST, "hot")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .rune(P1, "fury", { alias: "r1" })
    .hand(P2, WIND_WALL, "ww");
  if (opts.breacher !== false) {
    s = s.unit(P1, "base", REKSAI_BREACHER, "reksai");
  }
  return from === "trash" ? s.trash(P1, ITERATIVE_DESIGN, "design") : s.hand(P1, ITERATIVE_DESIGN, "design");
}

const mechs = (game: Game) => game.findAll({ name: "Mech", owner: P1 }).filter((id) => game.has(id) && game.zoneOf(id) !== "gone");

const isAccelerateElection = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P1 && /Accelerate/.test(d.prompt);

/** Cast (Flow from trash / plain from hand) and have both players pass so Iterative Design starts resolving. */
async function castAndPass(game: Game, from: "trash" | "hand" = "trash"): Promise<void> {
  await game.p1.cast("design", from === "trash" ? { flow: true } : {});
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Answer the Accelerate election (if shown) and the destination prompt (if shown); then drain. */
async function finishTokenPlay(game: Game, accelerate: boolean, to = "battlefield-bf1"): Promise<{ asked: boolean }> {
  let asked = false;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (isAccelerateElection(d)) {
      asked = true;
      await game.p1.answer(accelerate);
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick(d.options.some((o) => o.key === to) ? to : d.options[0]!.key);
    } else {
      break;
    }
  }
  await game.settle();
  return { asked };
}

describe("(a) Flowing Iterative Design from the trash — cost, timing, Add", () => {
  test("Flow is the only way to cast it from the trash and costs exactly [2][mind] instead of [4] (829.1.c.1, 356.1.a): pool 3/mind1/calm1 → 1/mind0/calm1; it is P1's spell item on the chain and P1 gets priority first", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "design")).toBe(true);
    expect(game.p1.option("cast", "design")?.fields.find((f) => f.arg === "flow")).toMatchObject({ options: [true], required: true });
    await game.p1.cast("design", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, mind: 0 } });
    expect(game.zoneOf("design")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "design", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("the trash copy is never castable for its base [4] — 4 energy without a MIND power cannot play it (Flow needs the [mind] pip)", async () => {
    const game = await board({ pool: { energy: 4, power: { calm: 1 } } }).build();
    expect(game.p1.can("cast", "design")).toBe(false);
    const r = await game.p1.try((p) => p.cast("design", { flow: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("design")).toBe("trash");
  });

  test("timing is unchanged by Flow (829.1.b.2): no [Action]/[Reaction] → not on P2's turn, and not in response while P2's own spell is on the chain", async () => {
    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("cast", "design")).toBe(false);
    const chain = await board().active(P2).resources(P2, { energy: 4 }).hand(P2, ITERATIVE_DESIGN, "p2design").build();
    await chain.p2.cast("p2design");
    await chain.p2.passPriority();
    expect(chain.actingSeat()).toBe(P1);
    expect(chain.p1.can("cast", "design")).toBe(false);
  });

  test("Add during the pay step (357.1.a) is MANUAL: with 1 energy + [mind] in the pool and a READY rune, Flow is not offered until P1 taps the rune himself; then it is, and casting leaves 0/mind0", async () => {
    // DESIGN (DESIGN.md § Paying costs): the play-time Add sub-step is intentionally not implemented — a play
    // is offered only when the CURRENT pool covers it; ready runes are never credited or auto-exhausted.
    const game = await board({ pool: { energy: 1, power: { mind: 1 } } }).build();
    expect(game.p1.runes({ ready: true })).toEqual(["r1"]);
    expect(game.p1.can("cast", "design")).toBe(false);
    await game.p1.tapRune("r1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1 } });
    expect(game.p1.can("cast", "design")).toBe(true);
    await game.p1.cast("design", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("design")).toBe("chain");
  });
});

describe("(b) the Mech token play under Rek'Sai, Breacher — Accelerate election, price, readiness, location", () => {
  test("as Iterative Design resolves, the token play begins with its Accelerate ELECTION (805.2, 355.1.a): P1 is asked 'Pay [1][any] to Accelerate Mech?' mid-resolution, before any Mech is on the board and with nothing paid yet", async () => {
    const game = await board().build();
    await castAndPass(game);
    const d = game.decision();
    expect(isAccelerateElection(d)).toBe(true);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "RES" });
    expect(d?.prompt).toMatch(/\[1\]\[any\]/); // domain-less token → the power pip is [A] (805.1.a.2, 185.3.b)
    expect(mechs(game)).toEqual([]);
    expect(game.zoneOf("design")).toBe("chain"); // still resolving
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, mind: 0 } });
  });

  test("accepting pays exactly [1] + ONE power of ANY domain — the off-domain CALM (Rek'Sai is Fury, the token has no domain) — on top of the token's cost 0 (185.3.a.1): pool → 0/0; then P1 picks base or bf1 (355.2.a) and the Mech enters bf1 READY (805.6)", async () => {
    const game = await board().build();
    await castAndPass(game);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(dest?.kind === "pick" ? dest.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const [mech] = mechs(game);
    expect(mechs(game)).toHaveLength(1);
    expect(game.state(mech!)).toMatchObject({
      baseMight: 3,
      cardType: "unit",
      controller: P1,
      domains: [],
      energyCost: 0,
      isReady: true,
      isToken: true,
      might: 3,
      owner: P1,
      zone: "battlefield-bf1",
    });
    expect(game.state("reksai").domains).toEqual(["fury"]); // the grantor's domain is irrelevant
    expect(game.p1.runes({ ready: true })).toEqual(["r1"]); // nothing auto-tapped
    expect(game.violations()).toEqual([]);
  });

  test("declining: nothing is paid (1 + calm kept) and the Mech enters EXHAUSTED at the chosen location (359.2.c) — the base here", async () => {
    const game = await board().build();
    await castAndPass(game);
    const { asked } = await finishTokenPlay(game, false, "base");
    expect(asked).toBe(true);
    const [mech] = mechs(game);
    expect(game.state(mech!)).toMatchObject({ isExhausted: true, isToken: true, might: 3, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, mind: 0 } });
    expect(game.state(mech!).grantedKeywords).toEqual([]); // Accelerate is play-time only (805.2.a) — nothing lingers
  });

  test("Rek'Sai absent: the token has no Accelerate — no election at all, the Mech enters exhausted, the spare 1 + calm is untouched", async () => {
    const game = await board({ breacher: false }).build();
    await castAndPass(game);
    const { asked } = await finishTokenPlay(game, true);
    expect(asked).toBe(false);
    const [mech] = mechs(game);
    expect(game.state(mech!)).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, mind: 0 } });
  });

  test("pool cannot cover [1][A] (Flow paid from exactly 2 + mind; a READY rune sits untapped): the election is not offered, the rune is not touched, the Mech enters exhausted", async () => {
    // DESIGN (DESIGN.md § Paying costs / FIXER-PRIMER §7): plays — including effect plays of tokens — are
    // POOL-ONLY; an optional additional cost the current pool cannot pay is simply absent (never a
    // canAccept:false prompt, never an auto-tap), deviating from 357.1.a's Add sub-step on purpose.
    const game = await board({ pool: { energy: 2, power: { mind: 1 } } }).build();
    await castAndPass(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const { asked } = await finishTokenPlay(game, true);
    expect(asked).toBe(false);
    expect(game.p1.runes({ ready: true })).toEqual(["r1"]);
    const [mech] = mechs(game);
    expect(game.state(mech!)).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
  });
});

describe("(c) Heart of the Tempest — the spell (from trash) empowers once; the token (not a card) never does", () => {
  test("Iterative Design was PLAYED FROM THE TRASH → exactly one 'empower me' trigger, placed on the chain once the spell has finished resolving (419.4.a — the Mech is already on the board) and resolving to an EMPOWERED legend", async () => {
    // Expected: after the token lands and Iterative Design leaves the chain, ONE triggered item from the
    // legend ("hot") is on the chain; both pass → hot.isEmpowered === true. Actual: no trigger is ever raised
    // for a Flow play from the trash (the legend does empower for facedown / Champion-Zone / Harrowing plays,
    // see cards/ven-197-166) — the legend stays un-empowered and the game returns to P1's main phase.
    const game = await board().build();
    await castAndPass(game);
    await game.p1.yes();
    await game.p1.pick("battlefield-bf1");
    expect(mechs(game)).toHaveLength(1); // token first …
    expect(game.state("hot").isEmpowered).toBe(false); // … empower only when the trigger resolves
    expect(game.chain().filter((c) => c.cardId === "hot" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.state("hot").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("end state of the Flow path — legend EMPOWERED (one empower from the trash-played card; the token adds none)", async () => {
    // Same defect as above, asserted on the settled position only.
    const game = await board().build();
    await castAndPass(game);
    await finishTokenPlay(game, true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("hot").isEmpowered).toBe(true);
  });

  test("the Mech TOKEN is not a card (185, 350.2): a token play alone never satisfies 'play a CARD from anywhere other than your hand' — hand-cast Iterative Design + accelerated token leaves the legend un-empowered with no trigger ever on the chain", async () => {
    const game = await board({ from: "hand" }).build();
    await castAndPass(game, "hand");
    await game.p1.yes();
    expect(game.chain().some((c) => c.cardId === "hot")).toBe(false);
    await game.p1.pick("battlefield-bf1");
    expect(game.chain().some((c) => c.cardId === "hot")).toBe(false);
    await game.settle();
    expect(mechs(game)).toHaveLength(1);
    expect(game.state("hot").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
  });
});

describe("(d) where Iterative Design ends up", () => {
  test("resolved after Flow: BANISHED as it leaves the chain (829.1.b.1) — P1's banishment, not the trash — and it cannot be Flowed again; cards-played count stays 1 (the token is not a card)", async () => {
    const game = await board().build();
    await castAndPass(game);
    await finishTokenPlay(game, true);
    expect(game.zoneOf("design")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["design"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("cast", "design")).toBe(false);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("countered by Wind Wall after Flow: STILL banished (the replacement applies to any departure not of its own doing), no Mech, no Accelerate question, no empower (425.1.b), the [2][mind] is not refunded; P1's count stays 1, P2's is 1", async () => {
    const game = await board().build();
    await game.p1.cast("design", { flow: true });
    await game.p1.passPriority();
    expect(game.p2.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options).toEqual([["design"]]);
    await game.p2.cast("ww", { targets: "design" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // nobody was asked anything
    expect(game.zoneOf("design")).toBe("banishment");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(mechs(game)).toEqual([]);
    expect(game.findAll({ name: "Mech" })).toEqual([]);
    expect(game.state("hot").isEmpowered).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, mind: 0 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(e) contrast — hard-cast from HAND with Rek'Sai out", () => {
  test("costs the full [4] (no Flow field from hand): pool 5/calm1 → 1/calm1", async () => {
    const game = await board({ from: "hand" }).build();
    expect(game.p1.option("cast", "design")?.fields.some((f) => f.arg === "flow")).toBe(false);
    await game.p1.cast("design");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.zoneOf("design")).toBe("chain");
  });

  test("the token is still 'played from anywhere other than a hand' → the SAME Accelerate election is offered; paying [1][calm] → Mech READY at bf1, pool 0/0", async () => {
    const game = await board({ from: "hand" }).build();
    await castAndPass(game, "hand");
    const d = game.decision();
    expect(isAccelerateElection(d)).toBe(true);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    const { asked } = await finishTokenPlay(game, true);
    expect(asked).toBe(true);
    const [mech] = mechs(game);
    expect(game.state(mech!)).toMatchObject({ isReady: true, isToken: true, might: 3, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("Heart of the Tempest does NOT trigger (the card came from hand; the token is not a card) and Iterative Design goes to the TRASH — from where it is a Flow candidate once [2][mind] is in the pool", async () => {
    const game = await board({ from: "hand" }).build();
    await castAndPass(game, "hand");
    await finishTokenPlay(game, false);
    expect(game.state("hot").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("design")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.can("cast", "design")).toBe(false); // 1 energy + calm: cannot Flow yet
    await game.p1.do("addResources", { energy: 1, power: { mind: 1 } });
    expect(game.p1.can("cast", "design")).toBe(true);
    expect(game.p1.option("cast", "design")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
  });
});
