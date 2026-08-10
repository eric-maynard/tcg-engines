/**
 * Interaction: Annie, Fiery (ogs-001-024) · Champion Unit · Fury · 4 Might
 *     "Your spells and abilities deal 1 Bonus Damage."
 *   × Stormbringer (ogn-250-298) · Spell · Fury/Body · 6 + [C][C]
 *     "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a
 *      battlefield, then move your unit there."            — no dealing subject
 *   × Last Breath (ogn-260-298) · Spell [Action] · Calm/Chaos · 3 + [C][C]
 *     "Ready a friendly unit. IT deals damage equal to its Might to an enemy unit at a battlefield."
 *   × Unyielding Spirit (ogn-145-298) · Spell [Reaction] · Body · 1 + [body]
 *     "Prevent all spell and ability damage this turn."
 *   (+ Immortal Phoenix ogn-037-298 in P1's trash — "When you kill a unit with a spell, you may pay
 *    [1][fury] to play me from your trash" — as the kill-attribution probe.)
 *
 * Position: P1's turn. P1: Annie, Fiery and a vanilla 4-Might unit F in base (exhausted for the Last
 * Breath lines). P2: E1 (4 Might) and E2 (5 Might — one more than F, so "4" and "4+1" are told apart)
 * at bf1; P2 holds Unyielding Spirit for variant (c).
 *
 * Question: (a) Stormbringer choosing F at bf1: how much do E1/E2 take, what is the source, who is
 * credited with the kills? (b) Last Breath on exhausted F at E1/E2: does Annie's +1 apply, what is the
 * source? (c) both again after P2 resolved Unyielding Spirit.
 *
 * Rules: 417.6.a (no source named → the spell is the source), 417.6.b.3 (a spell naming a UNIT as the
 * dealer: the unit is the source, NOT in addition to the spell), 417.6.b.4 (controller of the source is
 * responsible), 713 / 715.2 (Bonus Damage, per target separately), 428.5.c / 428.5.c.1 (Cleanup kills
 * attributed to the spell that dealt the damage / its responsible player), 437.4 (fully prevented = not
 * dealt).
 *
 * Expected: (a) Stormbringer is the source, it is P1's spell → +1 each: E1 and E2 take 5 apiece and both
 * die; kills credited to a spell of P1's (Phoenix triggers); F then moves to bf1. (b) F is the source →
 * no Annie bonus: exactly 4 — E2 (5) survives with 4 damage, E1 (4) dies credited to F (no Phoenix
 * trigger). (c) Stormbringer's spell damage is fully prevented (0/0) but F still moves into the defended
 * bf1 and a combat showdown opens; Last Breath's unit damage is NOT spell/ability damage → still 4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANNIE_FIERY = "ogs-001-024";
const STORMBRINGER = "ogn-250-298";
const LAST_BREATH = "ogn-260-298";
const UNYIELDING_SPIRIT = "ogn-145-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P1's turn. bf1 (P2's): E1 (4) and E2 (5). P1's base: Annie, Fiery (unless `annie:false`) and vanilla
 * F (4; exhausted when `fExhausted`). Immortal Phoenix sits in P1's trash. P1 has 6 + [rainbow][rainbow]
 * (Stormbringer's full cost; Last Breath's 3 + 2 fits inside it); P2 has exactly 1 + [body] for Spirit.
 */
function board(opts: { annie?: boolean; fExhausted?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Enemy E1" }, "e1")
    .unit(P2, "bf1", { might: 5, name: "Enemy E2" }, "e2");
  if (opts.annie !== false) {
    s = s.unit(P1, "base", ANNIE_FIERY, "annie");
  }
  return s
    .unit(P1, "base", { might: 4, name: "Friendly F" }, "f", opts.fExhausted ? { exhausted: true } : undefined)
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, STORMBRINGER, "storm")
    .hand(P1, LAST_BREATH, "last")
    .hand(P2, UNYIELDING_SPIRIT, "spirit");
}

/** Pass priority around until the spell chain is empty (stops at any prompt / showdown / trigger). */
async function resolveChain(game: Game): Promise<void> {
  while (game.decision()?.kind === "action" && game.chain().some((i) => !i.triggered)) {
    await game.acting().passPriority();
  }
}

/** P1 passes on its own spell; P2 answers with Unyielding Spirit (LIFO → resolves first); drain the spells. */
async function p2ShieldsThenResolve(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.p2.can("cast", "spirit")).toBe(true);
  await game.p2.cast("spirit");
  expect(game.chain().at(-1)).toMatchObject({ cardId: "spirit", controller: P2 });
  await resolveChain(game);
  expect(game.zoneOf("spirit")).toBe("trash");
}

/** Immortal Phoenix trigger items currently on the chain (the "killed with a SPELL by P1" witness). */
function phoenixTriggers(game: Game) {
  return game.chain().filter((i) => i.cardId === "phoenix" && i.triggered);
}

describe("Stormbringer vs Last Breath with Annie, Fiery — spell-sourced vs unit-sourced damage", () => {
  // ── (a) Stormbringer: the spell deals the damage ──────────────────────────────────────────────

  test("(a) Stormbringer's play-time choices: a friendly BASE unit + a battlefield; cast choosing F at bf1 for 6 + [C][C]", async () => {
    const game = await board().build();
    const tuples = (game.p1.option("cast", "storm")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(tuples).toContainEqual(["f", "bf1"]);
    expect(tuples.every(([unit]) => unit === "f" || unit === "annie")).toBe(true); // only P1's base units
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "storm", controller: P1, targets: ["f", "bf1"] })]);
  });

  test.failing("BUG: (a) with Annie: the SPELL is the source (417.6.a) and it is P1's → +1 Bonus Damage to EACH target (715.2): E1 (4) and E2 (5) both take 5 and die → P2's trash", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await resolveChain(game);
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash"); // 5 Might — only dies because of the +1
    expect(game.p2.trash().sort()).toEqual(["e1", "e2"]);
    expect(game.zoneOf("storm")).toBe("trash");
  });

  test("(a) control without Annie: the same Stormbringer deals exactly F's Might (4) — E1 dies, E2 (5) survives with 4 damage — so the extra point above is Annie's", async () => {
    const game = await board({ annie: false }).build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await resolveChain(game);
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.state("e2")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });

  test.failing("BUG: (a) the Cleanup kills are credited to a SPELL with P1 responsible (428.5.c/.c.1): P1's Immortal Phoenix 'When you kill a unit with a spell' triggers — once per unit killed", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await resolveChain(game);
    expect(phoenixTriggers(game)).toHaveLength(2);
    expect(phoenixTriggers(game).every((i) => i.controller === P1)).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
  });

  test.failing("BUG: (a) '…then move your unit there': F ends up at the now-empty bf1", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await resolveChain(game);
    expect(game.locationOf("f")).toBe("bf1");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.state("f").damage).toBe(0);
  });

  // ── (b) Last Breath: the readied UNIT deals the damage ────────────────────────────────────────

  test("(b) Last Breath readies exhausted F, then F — not the spell — deals its Might: E2 (5) takes EXACTLY 4 and survives; Annie's +1 does not attach to unit-sourced damage (417.6.b.3)", async () => {
    const game = await board({ fExhausted: true }).build();
    expect(game.state("f").isExhausted).toBe(true);
    await game.p1.cast("last", { targets: ["f", "e2"] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    await resolveChain(game);
    expect(game.state("f")).toMatchObject({ isExhausted: false, zone: "base" });
    expect(game.state("e2")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("last")).toBe("trash");
    expect(game.state("annie").zone).toBe("base"); // Annie is right there — and still no bonus
  });

  test("(b) Last Breath at E1 (4): exactly lethal → E1 dies, but the kill is F's, not a spell's — Immortal Phoenix does NOT trigger and play returns to P1's open Main Phase", async () => {
    const game = await board({ fExhausted: true }).build();
    await game.p1.cast("last", { targets: ["f", "e1"] });
    await resolveChain(game);
    expect(game.zoneOf("e1")).toBe("trash");
    expect(phoenixTriggers(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("e2").damage).toBe(0);
  });

  // ── (c) under Unyielding Spirit ───────────────────────────────────────────────────────────────

  test.failing("BUG: (c) Unyielding Spirit resolved first: Stormbringer's SPELL damage is fully prevented — E1 and E2 take 0 and stay (437.4); no kill, no Phoenix trigger", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await p2ShieldsThenResolve(game);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("e1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(phoenixTriggers(game)).toEqual([]);
    expect(game.zoneOf("storm")).toBe("trash");
  });

  test("(c) …but the move is not damage: F still goes to bf1 — now a DEFENDED battlefield — so a combat showdown opens with F attacking E1 + E2 and P1 holding Focus", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await p2ShieldsThenResolve(game);
    expect(game.locationOf("f")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test.failing("BUG: (c) that combat then resolves on unit (combat) damage, which Spirit does not touch: F (4) into E1 (4) + E2 (5) dies; bf1 stays P2's", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: ["f", "bf1"] });
    await p2ShieldsThenResolve(game);
    await game.settle();
    expect(game.zoneOf("f")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
  });

  test("(c) Last Breath under Unyielding Spirit: F is the source → NOT spell/ability damage → E2 still takes 4 (survives at 5), and aimed at E1 (4) it still kills", async () => {
    const atE2 = await board({ fExhausted: true }).build();
    await atE2.p1.cast("last", { targets: ["f", "e2"] });
    await p2ShieldsThenResolve(atE2);
    expect(atE2.state("e2")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(atE2.state("f").isExhausted).toBe(false);

    const atE1 = await board({ fExhausted: true }).build();
    await atE1.p1.cast("last", { targets: ["f", "e1"] });
    await p2ShieldsThenResolve(atE1);
    expect(atE1.zoneOf("e1")).toBe("trash");
    expect(phoenixTriggers(atE1)).toEqual([]);
    expect(atE1.violations()).toEqual([]);
  });
});
