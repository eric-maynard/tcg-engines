/**
 * Interaction: Noxian Emissary (ven-128-166) · Unit · Order · 2 · 2 Might
 *     "[Empower] [1][order] ([1][order]: Empower me. Use only if not Empowered.)
 *      [Empowered][>>][Deathknell][>] Play two 1 [Might] Recruit unit tokens to your base.
 *      (When I die while Empowered, get the effect.)"                                   — P2's, in P2's base
 *   × Sanction (ven-035-166) · Spell · Calm · 3+[calm] · Reaction · "Choose one — Empower a unit. Disempower it
 *     at end of turn. / Disempower a unit that's [Empowered]. Empower it at end of turn."  — one in EACH hand
 *   × Vengeance (ogn-229-298) · Spell · Order · 4+[order][order] · "Kill a unit."          — P1's
 *
 * Rules: 827.1.c.1 ([Empower] = "[Cost]: Empower this. Play only if not Empowered." — an ACTIVATED ability),
 * 828.1.b.1 / 828.1.c ("[Empowered][>>] Text" = "while I have the Empowered status I gain Text"; the dependent
 * ability is Active only while Empowered), 828.2 / 808.3 (having an Empowered ability / having Deathknell is a
 * checkable characteristic), 727.1.b / 727.1.b.1 (a dependent ability is PRESENT but INACTIVE until its condition
 * is met), 727.1.c.1 (a dependent triggered ability must be Active for its trigger to be evaluated), 721.2
 * (Inactive abilities do not trigger), 808.1.c / 808.1.d.3 (Deathknell = "when I'm killed"; attributes are noted
 * as it leaves the board), 442.1 (Disempower removes the status), 441.1 (Empower), 340.1 (LIFO resolution),
 * 337.4 (after finalizing an item its controller keeps priority first), 381 (activated abilities: only on the
 * controller's turn in an Open state), 143.4 (units enter exhausted), 359.3.e.12 (an instruction naming an object
 * that no longer exists does nothing).
 *
 * Question — P1's turn:
 *   (a) Emissary Empowered, P1 Vengeances it, nobody responds — Recruits? Where, in what state?
 *   (b) Emissary Empowered, P1 Vengeances it and, holding priority (337.4), answers its OWN spell with Sanction
 *       mode 2 on the Emissary. Is the Deathknell live when the Emissary dies? Recruits? What does Sanction's
 *       "Empower it at end of turn" do later?
 *   (c) Mirror: Emissary NOT Empowered, P1 Vengeances it, P2 responds with Sanction mode 1 on it — Recruits?
 *   (d) In (c), could P2 instead have responded by activating the Emissary's own [Empower]?
 *   (e) Text-state map of the Deathknell line: rest/unempowered, rest/empowered, the instant of death in a/b/c;
 *       does an unempowered Emissary still "have Deathknell" as a characteristic?
 *
 * Expected: (a) dies while Empowered → Deathknell Active → P2's trigger on the chain → two 1-Might Recruit tokens
 * in P2's base, EXHAUSTED; Emissary → P2's trash; Vengeance → P1's trash. (b) chain [Vengeance, Sanction(m2)];
 * Sanction resolves first → Disempowered → dependent Deathknell Inactive; Vengeance resolves → dies NOT Empowered
 * → no trigger, no Recruits; at end of turn the delayed "Empower it" finds nothing. (c) chain [Vengeance, P2's
 * Sanction(m1)]; Sanction resolves first → Empowered → Deathknell Active; Vengeance → dies Empowered → two
 * exhausted Recruits in P2's base; the EOT "Disempower it" finds nothing. (d) No — [Empower] is an activated
 * ability: only on P2's own turn in an Open state (381). (e) unempowered = present-but-Inactive yet still "has
 * Deathknell" (808.3 / 828.2); empowered = Active; (a) fires, (b) silent (and never retroactively), (c) fires.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMISSARY = "ven-128-166";
const SANCTION = "ven-035-166";
const VENGEANCE = "ogn-229-298";
const EMPOWER_MODE = 0; // Sanction's printed bullets: 0 = "Empower a unit…", 1 = "Disempower a unit that's [Empowered]…"
const DISEMPOWER_MODE = 1;

/**
 * P1's turn 2. P2: Noxian Emissary in base (Empowered or not), a Sanction in hand with 4 energy + calm + order
 * (3+[calm] for Sanction AND 1+[order] for [Empower], so (d) is never an affordability question). P1: Vengeance
 * (4+[order][order]) + its own Sanction (3+[calm]) in hand, exactly 7 energy + 2 order + 1 calm. One neutral,
 * inert battlefield so the board is otherwise empty.
 */
function board(opts: { empowered: boolean }) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", EMISSARY, "em", opts.empowered ? { empowered: true } : undefined)
    .resources(P1, { energy: 7, power: { calm: 1, order: 2 } })
    .resources(P2, { energy: 4, power: { calm: 1, order: 1 } })
    .hand(P1, VENGEANCE, "veng")
    .hand(P1, SANCTION, "p1Sanction")
    .hand(P2, SANCTION, "p2Sanction");
}

/** P2's Recruit tokens currently in P2's base. */
function recruits(game: Game, seat: typeof P1 | typeof P2 = P2): string[] {
  return game.cardsAt("base", seat).filter((id) => {
    const s = game.state(id);
    return s.cardType === "unit" && s.name === "Recruit" && s.isToken;
  });
}

/** (b) P1 Vengeances the Empowered Emissary and, keeping priority, Sanctions (mode 2) it itself. Nothing resolved. */
async function selfSanctioned(): Promise<Game> {
  const game = await board({ empowered: true }).build();
  await game.p1.cast("veng", { targets: "em" });
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 337.4: P1 first
  await game.p1.cast("p1Sanction", { mode: DISEMPOWER_MODE, targets: "em" });
  return game;
}

/** (c) P1 Vengeances the UNempowered Emissary, passes; P2 answers with Sanction mode 1 on it. Nothing resolved. */
async function p2Sanctioned(): Promise<Game> {
  const game = await board({ empowered: false }).build();
  await game.p1.cast("veng", { targets: "em" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("p2Sanction", { mode: EMPOWER_MODE, targets: "em" });
  return game;
}

describe("Noxian Emissary × Sanction × Vengeance — is the [Empowered]>>[Deathknell] live at the moment of death?", () => {
  // ── (e) at rest ───────────────────────────────────────────────────────────────────────────────────

  test("(e) rest/unempowered: the Deathknell line is PRESENT (rules text, 'has Deathknell' characteristic — 808.3 / 828.2 / 727.1.b.1) although Inactive; [Empower] is NOT activatable on P1's turn (381)", async () => {
    const game = await board({ empowered: false }).build();
    const s = game.state("em");
    expect(s.isEmpowered).toBe(false);
    expect(s.rulesText).toContain("[Deathknell]");
    expect(s.keywords).toContain("Deathknell");
    expect(game.p2.can("activate", "em")).toBe(false); // not P2's turn
  });

  test("(e) rest/empowered: same characteristic, status Empowered; [Empower] is not offered even on P2's own turn ('only if not Empowered', 827.1.c.1)", async () => {
    const game = await board({ empowered: true }).active(P2).build();
    expect(game.state("em")).toMatchObject({ isEmpowered: true, might: 2, zone: "base" });
    expect(game.state("em").keywords).toContain("Deathknell");
    expect(game.p2.can("activate", "em")).toBe(false);
  });

  test("(d) control: on P2's OWN turn, Open state, empty chain, the unempowered Emissary's [Empower] [1][order] IS activatable and empowers it on resolution", async () => {
    const game = await board({ empowered: false }).active(P2).build();
    expect(game.p2.can("activate", "em")).toBe(true);
    await game.p2.activate("em");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 1, order: 0 } });
    await game.settle();
    expect(game.state("em").isEmpowered).toBe(true);
    expect(game.p2.can("activate", "em")).toBe(false);
  });

  // ── (a) baseline: dies while Empowered ────────────────────────────────────────────────────────────

  test("(a) Vengeance (4 + [order][order]) on the Empowered Emissary, both pass: the Emissary is killed → P2's trash, and its Deathknell goes on the chain as P2's TRIGGERED item (808.1.d.3, 828.1.c)", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("veng", { targets: "em" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "veng", controller: P1, targets: ["em"], triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance resolves
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.p2.trash()).toContain("em");
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "em", controller: P2, triggered: true })]);
    expect(recruits(game)).toEqual([]); // not yet
  });

  test("(a) the trigger resolves: exactly two 1-Might Recruit unit TOKENS in P2's base (not P1's), entering EXHAUSTED (143.4); Vengeance in P1's trash, Emissary in P2's", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("veng", { targets: "em" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    const toks = recruits(game);
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ baseMight: 1, controller: P2, isExhausted: true, isToken: true, might: 1, owner: P2, zone: "base" });
    }
    expect(recruits(game, P1)).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["veng"]);
    expect(game.p2.trash()).toEqual(["em"]);
    expect(game.p2.hand()).toEqual(["p2Sanction"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P1 disempowers it in response to its own Vengeance ────────────────────────────────────────

  test("(b) 337.4: right after finalizing Vengeance P1 still holds priority and may cast the Reaction Sanction; mode 2 offers the Empowered Emissary; chain = [Vengeance, Sanction(m2 → em)], P1 fully spent", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("veng", { targets: "em" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "p1Sanction")).toBe(true);
    const modeField = game.p1.option("cast", "p1Sanction")?.fields.find((f) => f.name === "mode");
    expect(modeField?.options).toContain(DISEMPOWER_MODE); // legal because em IS Empowered when chosen
    await game.p1.cast("p1Sanction", { mode: DISEMPOWER_MODE, targets: "em" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["veng", "p1Sanction"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, mode: DISEMPOWER_MODE, targets: ["em"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
  });

  test("(b) LIFO (340.1): Sanction resolves FIRST → Emissary Disempowered (442.1) and still alive in base with Vengeance pending underneath", async () => {
    const game = await selfSanctioned();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sanction resolves
    expect(game.zoneOf("p1Sanction")).toBe("trash");
    expect(game.state("em")).toMatchObject({ isEmpowered: false, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "veng", targets: ["em"] })]);
  });

  test("(b) Vengeance then kills the NOT-Empowered Emissary: the dependent Deathknell is Inactive at the death event (828.1.b.1, 727.1.c.1, 721.2) → NO trigger on the chain, NO Recruits; em → P2's trash", async () => {
    const game = await selfSanctioned();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sanction
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.chain()).toEqual([]); // nothing triggered
    expect(recruits(game)).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["p1Sanction", "veng"]);
    expect(game.p2.trash()).toEqual(["em"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) end of turn: Sanction's delayed 'Empower it' refers to an object that no longer exists (359.3.e.12) → nothing happens, nothing fires retroactively; still zero Recruits on P2's turn", async () => {
    const game = await selfSanctioned();
    await game.settle();
    expect(recruits(game)).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.state("em").isEmpowered).toBe(false);
    expect(recruits(game)).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) mirror: P2 empowers it in response ────────────────────────────────────────────────────────

  test("(c) unempowered Emissary Vengeanced; P2's Sanction offers ONLY mode 1 (mode 2 needs an [Empowered] unit — none exists, 355.8); P2 casts mode 1 on em: chain = [Vengeance, Sanction(m1 → em)]", async () => {
    const game = await board({ empowered: false }).build();
    await game.p1.cast("veng", { targets: "em" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "p2Sanction")).toBe(true);
    const modeField = game.p2.option("cast", "p2Sanction")?.fields.find((f) => f.name === "mode");
    expect(modeField?.options).toEqual([EMPOWER_MODE]);
    await game.p2.cast("p2Sanction", { mode: EMPOWER_MODE, targets: "em" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["veng", "p2Sanction"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, mode: EMPOWER_MODE, targets: ["em"] });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 0, order: 1 } });
  });

  test("(c) Sanction resolves first → Emissary Empowered (441.1) → dependent Deathknell now Active; Vengeance resolves → dies WHILE Empowered → Deathknell trigger on the chain as P2's item", async () => {
    const game = await p2Sanctioned();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Sanction resolves
    expect(game.state("em")).toMatchObject({ isEmpowered: true, zone: "base" });
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance resolves
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "em", controller: P2, triggered: true })]);
  });

  test("(c) …and it resolves into two EXHAUSTED 1-Might Recruit tokens in P2's base — the same kill spell yields 2 tokens here vs 0 in (b), decided at the death event, not when Vengeance was played", async () => {
    const game = await p2Sanctioned();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    const toks = recruits(game);
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ controller: P2, isExhausted: true, isToken: true, might: 1, owner: P2, zone: "base" });
    }
    expect(game.p1.trash()).toEqual(["veng"]);
    expect(game.p2.trash().sort()).toEqual(["em", "p2Sanction"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) end of turn: Sanction's delayed 'Disempower it' finds nothing (em is in the trash); the two Recruits persist into P2's turn; no violations", async () => {
    const game = await p2Sanctioned();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("em")).toBe("trash");
    expect(recruits(game)).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) [Empower] is not a response ───────────────────────────────────────────────────────────────

  test("(d) in (c)'s response window P2 can NOT activate the Emissary's own [Empower] (activated ability, no Reaction tag → only on P2's turn in an Open state, 381) even though P2 can afford [1][order]; only the Reaction spell is offered", async () => {
    const game = await board({ empowered: false }).build();
    await game.p1.cast("veng", { targets: "em" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 1, order: 1 } });
    expect(game.p2.can("activate", "em")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["cast", "concede", "passPriority"]);
    const r = await game.p2.try((p) => p.activate("em"));
    expect(r.ok).toBe(false);
    expect(game.chain()).toHaveLength(1); // nothing was added
    expect(game.state("em").isEmpowered).toBe(false);
  });

  test("(d) nor at rest during P1's turn (Open state but not P2's turn): P2 has no [Empower] option at all", async () => {
    const game = await board({ empowered: false }).build();
    expect(game.p2.legal().some((o) => o.verb === "activate")).toBe(false);
    expect(game.p2.can("activate", "em")).toBe(false);
  });
});
