/**
 * Interaction: Cataclysmic Duel (ven-090-166) · Spell · Body · 8 + [body][body][body]
 *     "Each player chooses a unit they control. Kill the rest."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might — "[Deflect] (Opponents must pay [rainbow] to choose me
 *     with a spell or ability.)"
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   (+ Immortal Phoenix ogn-037-298 in each trash as a "when YOU kill a unit with a spell" probe for 411.6.)
 *
 * Board. P1's turn, pool = exactly 8 + [body]×3 (no spare power). P1: Watchful Sentry S1 in base, vanilla 2-Might V1
 * at bf1 (P1's). P2: Pouty Poro at bf2 (P2's) with a facedown card there, Watchful Sentry S2 in base.
 *
 * Expected:
 *  (a) Nothing is targeted at finalization (355.10.e — the units are chosen per player on resolution, Cull the
 *      Weak / Divine Judgment family), so Deflect never applies (809): castable with zero spare power, no pip for
 *      keeping or dooming the Poro. Legal regardless of board contents — even with no units anywhere it resolves
 *      doing nothing (359.3.e.10 / 419.3.c spirit). On resolution the choices go in turn order from the Turn Player
 *      (303.2.a; riftjudge Divine Judgment: the second chooser sees the first choice): P1 first, then P2. Each seat's
 *      list = exactly the units THAT player controls (P1 {S1, V1}; P2 {Poro, S2}); facedown cards are not units
 *      (355.9.a.3); no enemy units; no "keep nothing" (mandatory — 128.6 only excuses private zones). A player with
 *      one unit has a forced single option; a player with none makes no choice.
 *  (b) "Kill the rest" is ONE kill instruction by the spell's controller → S1 and S2 die simultaneously (370.1.a.2)
 *      only after BOTH have chosen; the kills are P1's-spell kills (411.6: P1's Phoenix triggers, P2's does not —
 *      unlike Cull the Weak). Both Deathknells trigger together and go on the chain in turn order — P1's S1 first
 *      (bottom), P2's S2 on top (383.3.d.1) → LIFO: P2 draws first, then P1. Duel → P1's trash.
 *  (c) P2 with no units gets no Decision. Neither player with units: still castable, nothing happens.
 *  (d) On P2's turn (P2 casts): P2, the Turn Player, chooses first, then P1 (303.2.a).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CATACLYSMIC_DUEL = "ven-090-166";
const POUTY_PORO = "ogn-013-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const HIDDEN_BLADE = "ogn-213-298"; // any [Hidden] card, seeded facedown for P2

const DUEL_COST = { energy: 8, power: { body: 3 } };

function board(opts: { caster?: typeof P1 | typeof P2; phoenixes?: boolean } = {}) {
  const caster = opts.caster ?? P1;
  const b = scenario()
    .turn(3)
    .active(caster)
    .resources(caster, DUEL_COST)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", WATCHFUL_SENTRY, "s1")
    .unit(P1, "bf1", { might: 2, name: "Vanilla V1" }, "v1")
    .unit(P2, "bf2", POUTY_PORO, "poro")
    .unit(P2, "base", WATCHFUL_SENTRY, "s2")
    .facedown(P2, "bf2", HIDDEN_BLADE, "p2Facedown")
    .hand(caster, CATACLYSMIC_DUEL, "duel");
  if (opts.phoenixes) {
    b.trash(P1, IMMORTAL_PHOENIX, "p1Phoenix").trash(P2, IMMORTAL_PHOENIX, "p2Phoenix");
  }
  return b;
}

/** The caster plays the Duel and both pass → resolution begins with the first chooser's pick open. */
async function resolving(opts: { caster?: typeof P1 | typeof P2; phoenixes?: boolean } = {}): Promise<Game> {
  const caster = opts.caster ?? P1;
  const game = await board(opts).build();
  await game.seat(caster).cast("duel");
  expect(game.seat(caster).resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.seat(caster).passPriority();
  await game.seat(caster === P1 ? P2 : P1).passPriority();
  return game;
}

const pickCards = (d: ReturnType<Game["decision"]>) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []);
const chainView = (game: Game) => game.chain().map((c) => `${c.controller === P1 ? "P1" : "P2"}:${c.cardId}${c.triggered ? "*" : ""}`);

describe("Cataclysmic Duel — nothing targeted, turn-order picks from each seat's own units, one simultaneous kill", () => {
  // ── (a) finalization: no targets, no Deflect ────────────────────────────────────────────────

  test("(a) castable with exactly 8 + [body]×3 and NO spare power although a Deflect Poro will be involved — nothing is chosen at play time (355.10.e, 809 inapplicable)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "duel")).toBe(true);
    const targets = game.p1.option("cast", "duel")?.fields.find((f) => f.name === "targets");
    expect(targets).toMatchObject({ max: 0, min: 0 }); // an empty target tuple is the only variant
    expect(targets?.options).toEqual([[]]);
    await game.p1.cast("duel");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "duel", controller: P1, targets: [], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority — no pick
  });

  test("(a) on resolution the TURN PLAYER (P1) chooses first: a mandatory RES pick (no decline / 'keep nothing') listing exactly P1's own units S1 and V1 — no enemy unit, no facedown card (303.2.a, 355.9.a.3)", async () => {
    const game = await resolving();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, timing: "RES" });
    expect(d?.source?.cardId).toBe("duel");
    expect(pickCards(d)).toEqual(["s1", "v1"]);
    expect(pickCards(d)).not.toContain("poro");
    expect(pickCards(d)).not.toContain("p2Facedown");
  });

  test("(a) after P1 keeps V1, P2 is the seat asked — from P2's OWN (redacted) view the Decision is fully answerable and lists exactly Poro and S2, no Deflect surcharge on the Poro, no decline", async () => {
    const game = await resolving();
    // While P1 decides, P2 sees only a summary of somebody else's decision.
    expect(game.p2.view().decision).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.p2.view().decision as { options?: unknown }).options).toBeUndefined();
    await game.p1.pick("v1");
    expect(game.actingSeat()).toBe(P2);
    const own = game.p2.view().decision as PickDecision;
    expect(own).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, timing: "RES" });
    expect(own.options.map((o) => o.card ?? o.key).sort()).toEqual(["poro", "s2"]);
    expect(own.options.every((o) => (o.deflect ?? 0) === 0)).toBe(true); // P2 choosing its own Poro pays nothing
    expect(pickCards(own)).not.toContain("s1");
    expect(pickCards(own)).not.toContain("p2Facedown");
  });

  test("(a)/(b) nothing dies between the two choices: after P1's pick S1 and S2 are both still on the board — 'kill the rest' waits for every player's choice", async () => {
    const game = await resolving();
    await game.p1.pick("v1");
    expect(game.zoneOf("s1")).toBe("base");
    expect(game.zoneOf("s2")).toBe("base");
    expect(game.chain()).toEqual([]); // the Duel is mid-resolution; no Deathknell yet
    expect(game.zoneOf("duel")).not.toBe("trash");
  });

  // ── (b) the kill, attribution, Deathknell order ─────────────────────────────────────────────

  test("(b) P1 keeps V1, P2 keeps the Poro → S1 and S2 die together in ONE event; V1, Poro and P2's facedown card are untouched; Duel → P1's trash; P1's pool was never charged a Deflect pip (370.1.a.2)", async () => {
    const game = await resolving();
    await game.p1.pick("v1");
    await game.p2.pick("poro");
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["s1", "duel"]));
    expect(game.p2.trash()).toContain("s2");
    expect(game.zoneOf("v1")).toBe("battlefield-bf1");
    expect(game.zoneOf("poro")).toBe("battlefield-bf2");
    expect(game.state("poro").damage).toBe(0);
    expect(game.zoneOf("p2Facedown")).toBe("facedown-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("(b) both Deathknells trigger off the same event and are added in TURN ORDER: P1's S1 at the bottom, P2's S2 on top (383.3.d.1)", async () => {
    const game = await resolving();
    await game.p1.pick("v1");
    await game.p2.pick("poro");
    expect(chainView(game)).toEqual(["P1:s1*", "P2:s2*"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(b) LIFO: S2's Deathknell resolves first (P2 draws 1 while P1 has not), then S1's (P1 draws 1); afterwards P1's open main phase, no violations", async () => {
    const game = await resolving();
    const h1 = game.p1.hand().length;
    const h2 = game.p2.hand().length;
    await game.p1.pick("v1");
    await game.p2.pick("poro");
    await game.acting().passPriority();
    await game.acting().passPriority(); // top item (S2's) resolves
    expect(game.p2.hand()).toHaveLength(h2 + 1);
    expect(game.p1.hand()).toHaveLength(h1);
    expect(chainView(game)).toEqual(["P1:s1*"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // S1's resolves
    expect(game.p1.hand()).toHaveLength(h1 + 1);
    expect(game.p2.hand()).toHaveLength(h2 + 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) 411.6 attribution — the kills are P1's SPELL's kills: P1's Immortal Phoenix ('when YOU kill a unit with a spell') triggers once per unit killed (S1 and S2), P2's Phoenix never triggers although P2 'chose'", async () => {
    const game = await resolving({ phoenixes: true });
    await game.p1.pick("v1");
    await game.p2.pick("poro");
    const p1Phoenix = game.chain().filter((c) => c.cardId === "p1Phoenix" && c.controller === P1 && c.triggered);
    const p2Phoenix = game.chain().filter((c) => c.cardId === "p2Phoenix");
    expect(p1Phoenix).toHaveLength(2);
    expect(p2Phoenix).toHaveLength(0);
    // P1's whole batch (S1's Deathknell + both Phoenix triggers) sits below P2's S2 Deathknell — turn order.
    expect(chainView(game).at(-1)).toBe("P2:s2*");
    expect(chainView(game)[0]).toBe("P1:s1*");
    // The Phoenix opt-ins are P1's to answer (unpayable here — pool is empty — so shown but not acceptable).
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("p1Phoenix");
  });

  // ── (c) empty sides ─────────────────────────────────────────────────────────────────────────

  test("(c) P2 controls NO units: only P1 is asked (its own two), P2 never gets a Decision, and only P1's unchosen unit dies", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, DUEL_COST)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", WATCHFUL_SENTRY, "s1")
      .unit(P1, "bf1", { might: 2, name: "Vanilla V1" }, "v1")
      .hand(P1, CATACLYSMIC_DUEL, "duel")
      .build();
    await game.p1.cast("duel");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickCards(game.decision())).toEqual(["s1", "v1"]);
    await game.p1.pick("v1");
    // No P2 prompt: straight on to the aftermath (S1's Deathknell on the chain).
    expect(game.decision()?.seat === P2 && game.decision()?.kind === "pick").toBe(false);
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("v1")).toBe("battlefield-bf1");
    expect(game.zoneOf("duel")).toBe("trash");
    expect(chainView(game)).toEqual(["P1:s1*"]);
  });

  test("(c) a player with exactly ONE unit has a forced single option — settle() takes it; the other side is still cut down to its keeper", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, DUEL_COST)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Vanilla V1" }, "v1")
      .unit(P2, "bf2", POUTY_PORO, "poro")
      .unit(P2, "base", WATCHFUL_SENTRY, "s2")
      .hand(P1, CATACLYSMIC_DUEL, "duel")
      .script(P2, ["poro"])
      .build();
    await game.p1.cast("duel");
    await game.settle(); // passes, takes P1's forced V1, feeds P2's scripted Poro, resolves S2's Deathknell
    expect(game.zoneOf("v1")).toBe("battlefield-bf1");
    expect(game.zoneOf("poro")).toBe("battlefield-bf2");
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.zoneOf("duel")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) NEITHER player controls a unit: the Duel is still legal to cast (legality never depends on the board), resolves doing nothing and goes to the trash", async () => {
    const game = await scenario().turn(3).resources(P1, DUEL_COST).battlefield("bf1", { controller: null }).hand(P1, CATACLYSMIC_DUEL, "duel").build();
    expect(game.p1.can("cast", "duel")).toBe(true);
    await game.p1.cast("duel");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("duel")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) cast on P2's turn ───────────────────────────────────────────────────────────────────

  test("(d) P2 casts it on P2's turn: turn order starts with the Turn Player — P2 chooses first (Poro / S2), THEN P1 (S1 / V1) (303.2.a)", async () => {
    const game = await resolving({ caster: P2 });
    const first = game.decision();
    expect(first).toMatchObject({ allowDecline: false, kind: "pick", seat: P2, timing: "RES" });
    expect(pickCards(first)).toEqual(["poro", "s2"]);
    await game.p2.pick("poro");
    const second = game.decision();
    expect(second).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, timing: "RES" });
    expect(pickCards(second)).toEqual(["s1", "v1"]);
    await game.p1.pick("v1");
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.p2.trash()).toContain("duel");
    // Deathknells in turn order from the Turn Player: P2's S2 first (bottom), P1's S1 on top.
    expect(chainView(game)).toEqual(["P2:s2*", "P1:s1*"]);
  });
});
