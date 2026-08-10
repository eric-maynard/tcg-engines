/**
 * Interaction: Cruel Patron (ogn-208-298) · Unit · Order · 4 · 6 Might
 *     "As an additional cost to play me, kill a friendly unit."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — P1's LONE unit holding bf1
 *   × Recruit (ogn-272-298) · Unit token · 1 Might
 *
 * Question: P1's turn, Neutral Open, exactly 4 energy, Cruel Patron in hand. P1 controls bf1 with a lone
 * Vanguard Sergeant (carrying 1 damage and exhausted so its state is observable).
 *   (a) P1 also has a Recruit token in base. Which play locations are offered for Patron? Electing bf1,
 *       which units are offered as the kill-cost? Electing base, which? Play Patron → bf1 killing the
 *       Recruit: end state?
 *   (b) No Recruit — the Sergeant is P1's ONLY unit. Which locations are offered? Play it: where does
 *       Patron land, what happens to bf1 control and when?
 *   (c) P1 controls no units at all: is Patron in the legal-play list?
 *   (d) Rollback probe: a raw move submits {location: bf1, kill: Sergeant} on board (b) — what must the
 *       state look like afterwards?
 *
 * Rules: 355.2.a (valid locations: base or a controlled battlefield), 355.16 / 357.3 (no choice / payment
 * that deterministically leads to an illegal outcome "unless they have no choice"), 356.2.a.1 (mandatory
 * additional cost), 357.2 (non-standard costs are paid in step 4), 358.3 / 358.5 (Check Legality; on
 * failure everything is undone and the action cancelled), 190.4.a / 190.4.c / 323.6 (control persists only
 * while you have a unit there; lost at the following Cleanup in an Open state), 319.5 / 319.6 (a Cleanup
 * follows Patron leaving the chain / entering the board), 337.2 (a unit resolves immediately after
 * finalizing — no priority window), 419.2.a (unpayable → not a legal play), 419.4.b (Legion-style
 * counters key off Finalized plays).
 * Rulings: Cruel Patron 7e1f5339aa98e7ce / 81bdefc55681da4a / dbfdd1e2c7fcd2fb / db8a04e8cd97d7ad (pre-Unleashed) —
 * killing your only unit at the battlefield you are playing Patron to makes that location invalid, so the play is
 * illegal. RULING-CONFLICT: the official Unleashed clarification 9a32c2cc829f221a (187.4.c / 190.4 / 323.6 — control of a
 * battlefield cannot be lost while items are on the chain; "abilities that kill units as a cost in order to play another
 * unit will be able to kill units at battlefields and then play the resulting unit to that same battlefield", with Cruel
 * Patron as its own first example) and the engine's one BATTLEFIELD CONTROL TIMING model say LEGAL. The engine follows
 * the CR + the official clarification; the older facets are rewritten to it below. Ruling 78b8dc653fe50147 — a unit with
 * no triggers gives the opponent no window.
 *
 * Expected:
 *   (a) locations {base, bf1}; kill options at EITHER location = {Sergeant, Recruit}. bf1/kill Recruit: Recruit ceases to
 *       exist, energy 4 → 0, Patron at bf1 exhausted beside the Sergeant, P1 keeps bf1, no chain / no P2 priority.
 *   (b) locations {base, bf1}. → base: Sergeant → trash, 4 paid, Patron in base exhausted; bf1 has no P1 unit → P1
 *       loses control at the Cleanup following Patron's resolution. → bf1: legal; Patron alone there keeps bf1.
 *   (c) not a legal play at all.
 *   (d) the raw {bf1, kill Sergeant} bundle is one complete legal play — never a partial outcome.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CRUEL_PATRON = "ogn-208-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const RECRUIT = "ogn-272-298";

function board(opts: { recruit?: boolean; sergeant?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "base", { might: 2, name: "Enemy Bystander" }, "enemy") // never a "friendly" kill candidate
    .hand(P1, CRUEL_PATRON, "patron");
  if (opts.sergeant !== false) {
    s = s.unit(P1, "bf1", VANGUARD_SERGEANT, "sarge", { damage: 1, exhausted: true });
  }
  if (opts.recruit) {
    s = s.unit(P1, "base", RECRUIT, "recruit");
  }
  return s;
}

const playOption = (game: Game) => game.p1.option("play", "patron");
const locationsOffered = (game: Game) =>
  [...((playOption(game)?.fields.find((f) => f.name === "location")?.options ?? []) as string[])].map((z) => game.normalizeZone(z)).sort();
/** Kill-cost candidates offered for a given elected location (from the flat engine variants behind the option). */
function killsOfferedAt(game: Game, location: "base" | "bf1"): string[] {
  const vs = playOption(game)?.variants ?? [];
  const ids = vs
    .filter((v) => game.normalizeZone(String(v.params.location)) === game.normalizeZone(location === "bf1" ? "battlefield-bf1" : "base"))
    .map((v) => String(v.params.sacrificeId));
  return [...new Set(ids)].sort();
}
const cardsPlayed = (game: Game) => (game.gameState as unknown as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn?.[P1] ?? 0;

describe("Cruel Patron — killing the lone unit holding the battlefield you play Patron to (RULING-CONFLICT resolved to CR 190.4 / 323.6: legal, control persists mid-play)", () => {
  // ---- (a) Sergeant alone at bf1 + Recruit in base ------------------------------------------------------

  test("(a) locations offered for Patron = {base, bf1} (355.2.a)", async () => {
    const game = await board({ recruit: true }).build();
    expect(game.p1.can("play", "patron")).toBe(true);
    expect(locationsOffered(game)).toEqual(["base", "battlefield-bf1"]);
  });

  test("(a) electing BASE: kill-cost candidates = {Sergeant, Recruit}; the enemy unit is never offered", async () => {
    const game = await board({ recruit: true }).build();
    expect(killsOfferedAt(game, "base")).toEqual(["recruit", "sarge"]);
    const all = (playOption(game)?.fields.find((f) => f.arg === "sacrifice")?.options ?? []) as string[];
    expect(all).not.toContain("enemy");
  });

  // RULING-CONFLICT: riftjudge 7e1f5339aa98e7ce / 81bdefc55681da4a / dbfdd1e2c7fcd2fb / db8a04e8cd97d7ad say the lone
  // Sergeant must not be offered when bf1 is elected; CR 190.4 / 323.6 (control lapses only in an OPEN-state Cleanup —
  // Patron is on the chain while its cost is paid) + the official Unleashed clarification 9a32c2cc829f221a ("kill units as
  // a cost … then play the resulting unit to that same battlefield") say bf1 stays Valid — engine follows CR: both units
  // are candidates at bf1 exactly as in base (operations/battlefield-control.ts, rulings/cruel-patron-9a32c2cc829f221a).
  test("(a) electing bf1: kill-cost candidates = {Sergeant, Recruit} — bf1 cannot be lost mid-play (190.4, 323.6, official 9a32c2cc829f221a)", async () => {
    const game = await board({ recruit: true }).build();
    expect(killsOfferedAt(game, "bf1")).toEqual(["recruit", "sarge"]);
  });

  test("(a) play Patron → bf1 killing the Recruit: token ceases to exist, 4 energy → 0, Patron at bf1 EXHAUSTED beside the untouched Sergeant, P1 keeps bf1", async () => {
    const game = await board({ recruit: true }).build();
    await game.p1.play("patron", { sacrifice: "recruit", to: "bf1" });
    expect(game.has("recruit") ? game.zoneOf("recruit") : "gone").toBe("gone");
    expect(game.p1.trash()).toEqual([]); // a token never reaches the trash
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    expect(game.state("patron")).toMatchObject({ controller: P1, isExhausted: true, might: 6 });
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge")).toMatchObject({ damage: 1, isExhausted: true });
    expect([...game.p1.units("bf1")].sort()).toEqual(["patron", "sarge"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(cardsPlayed(game)).toBe(1);
  });

  test("(a) a unit with no triggers finalizes and resolves immediately (337.2): no chain item, no priority window for P2 — P1 is straight back in an open main phase", async () => {
    const game = await board({ recruit: true }).build();
    const r = await game.p1.play("patron", { sacrifice: "recruit", to: "bf1" });
    expect(r.executed.some((m) => m.seat === P2)).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal().filter((o) => o.verb !== "concede")).toEqual([]);
    const s = await game.settle();
    expect(s).toMatchObject({ reason: "open", steps: 0 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) the Sergeant is P1's ONLY unit ------------------------------------------------------------------

  // RULING-CONFLICT: riftjudge 7e1f5339… / db8a04e8… say bf1 is absent and {bf1, kill Sergeant} rejected; CR 190.4 /
  // 323.6 + official 9a32c2cc829f221a keep bf1 Valid through the play — engine follows CR: {base, bf1} both offered, and
  // Patron → bf1 killing the lone Sergeant lands there and HOLDS bf1 for P1.
  test("(b) with the Sergeant as the only friendly unit BOTH locations are offered and Patron → bf1 killing him is legal: Sergeant in trash, 4 paid, Patron alone at bf1, bf1 still P1's (190.4, 323.6)", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "patron")).toBe(true);
    expect(killsOfferedAt(game, "base")).toEqual(["sarge"]);
    expect(locationsOffered(game)).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("patron", { sacrifice: "sarge", to: "bf1" });
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) play Patron → base: Sergeant killed to trash as the cost (357.2), 4 energy paid, Patron in P1's base exhausted, no P1 unit left at bf1", async () => {
    const game = await board().build();
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.trash()).toEqual(["sarge"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.state("patron")).toMatchObject({ controller: P1, isExhausted: true, might: 6 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(cardsPlayed(game)).toBe(1);
  });

  // Expected (190.4.c / 323.6 with 319.5–319.6): Patron leaving the chain / entering the board triggers a
  // Cleanup in an Open state with no showdown at bf1 → P1 loses control of bf1 right there. Actual: bf1
  // still reads controller P1 after Patron has resolved; it only lapses at some later Cleanup.
  test("(b) P1 loses control of bf1 at the Cleanup following Patron's resolution (190.4.c, 323.6, 319.5)", async () => {
    const game = await board().build();
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });

  // Expected: at the latest by the turn transition (319.2) bf1 — empty of P1 units since the cost was paid —
  // is uncontrolled, so P1 can never Hold-score it. Actual: the cost-kill emptying bf1 never lapses control
  // (no later Cleanup re-checks it without another board action); bf1 stays P1's through P2's whole turn
  // and P1 is awarded a HOLD point for the empty battlefield at its next Beginning Phase.
  test("(b) downstream — bf1 is uncontrolled once the turn passes and P1 does NOT Hold-score the empty battlefield on its next turn (190.4.c, 323.6)", async () => {
    const game = await board().build();
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // ---- (c) no friendly unit at all --------------------------------------------------------------------------

  test("(c) P1 controls no units: the mandatory kill is unpayable → Cruel Patron is NOT a legal play even with 4 energy (356.2.a.1, 419.2.a)", async () => {
    const game = await board({ sergeant: false }).build();
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("play", "patron")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("play");
    await expect(game.p1.play("patron", { sacrifice: "enemy", to: "base" })).rejects.toThrow();
    expect(game.zoneOf("patron")).toBe("hand");
    expect(game.zoneOf("enemy")).toBe("base");
  });

  // ---- (d) the raw bundle {bf1, kill Sergeant} on board (b) ---------------------------------------------------

  // RULING-CONFLICT: riftjudge 7e1f5339… / db8a04e8… expect this refused and fully undone (358.5); CR 190.4 / 323.6 +
  // official 9a32c2cc829f221a make it a legal play — engine follows CR. What must hold either way: never a PARTIAL
  // outcome — everything happened (Sergeant dead, 4 paid, Patron on bf1, one card played).
  test("(d) a raw playUnit {location: bf1, kill: Sergeant} is a complete, legal play — Sergeant in trash, energy 0, Patron at bf1, bf1 P1's, exactly one card played (357.2, 358, 190.4)", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) =>
      p.do("playUnit", {
        cardId: "patron",
        costs: { paid: { kill: { objects: ["sarge"] } } },
        location: "battlefield-bf1",
        paidAdditionalCost: true,
        sacrificeId: "sarge",
      }),
    );
    expect(r.ok).toBe(true);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(cardsPlayed(game)).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});
