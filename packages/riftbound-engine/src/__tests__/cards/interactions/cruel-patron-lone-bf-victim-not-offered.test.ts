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
 * Rulings: Cruel Patron 7e1f5339aa98e7ce / 81bdefc55681da4a / dbfdd1e2c7fcd2fb / db8a04e8cd97d7ad —
 * killing your only unit at the battlefield you are playing Patron to makes that location invalid at
 * Check Legality, so the play is illegal. (Tension noted: Heedless Resurrection ruling 65067299111e398c
 * argues control persists through a Closed state; the Patron-specific rulings are explicit and are
 * followed here.) Ruling 78b8dc653fe50147 — a unit with no triggers gives the opponent no window.
 *
 * Expected:
 *   (a) locations {base, bf1}; bf1 → kill options {Recruit} ONLY (Sergeant would empty bf1 → illegal, so
 *       it must be absent, not rejected later); base → {Sergeant, Recruit}. bf1/kill Recruit: Recruit
 *       ceases to exist, energy 4 → 0, Patron at bf1 exhausted beside the Sergeant, P1 keeps bf1, no
 *       chain / no P2 priority.
 *   (b) locations {base} only. Play: Sergeant → trash, 4 paid, Patron in base exhausted; bf1 has no P1
 *       unit → P1 loses control at the Cleanup following Patron's resolution.
 *   (c) not a legal play at all.
 *   (d) refused / fully undone: Sergeant still at bf1 with 1 damage, exhausted, never in the trash; bf1
 *       still P1's; energy 4; Patron in HAND; chain empty; trash unchanged; no cards-played increment.
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

describe("Cruel Patron — the lone unit holding the battlefield you play Patron to is not a legal victim", () => {
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

  // Expected (355.16 / 357.3 / 358.3 + Patron rulings): with bf1 elected, killing the Sergeant would empty
  // bf1 and make the location illegal at Check Legality → that payment must be ABSENT from the offer.
  // Actual: the engine enumerates {location: bf1, sacrifice: sarge} as a valid variant.
  test.failing("BUG: (a) electing bf1: kill-cost candidates = {Recruit} ONLY — the lone Sergeant holding bf1 must not be offered (355.16, 357.3, 358.3)", async () => {
    const game = await board({ recruit: true }).build();
    expect(killsOfferedAt(game, "bf1")).toEqual(["recruit"]);
    await expect(game.p1.play("patron", { sacrifice: "sarge", to: "bf1" })).rejects.toThrow();
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

  // Expected: the only payable cost (kill the Sergeant) deterministically invalidates bf1 as a location, and
  // base IS an alternative, so bf1 must not be offered at all (355.16). Actual: {base, bf1} are both offered.
  test.failing("BUG: (b) with the Sergeant as the only friendly unit, the ONLY location offered is base — bf1 is absent (355.16, 358.3)", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "patron")).toBe(true);
    expect(killsOfferedAt(game, "base")).toEqual(["sarge"]);
    expect(locationsOffered(game)).toEqual(["base"]);
  });

  // Expected: the bundle {to: bf1, kill: Sergeant} is illegal and must be rejected. Actual: accepted —
  // Patron lands at bf1 and P1 keeps the battlefield it just emptied.
  test.failing("BUG: (b) play(patron → bf1, kill Sergeant) is rejected outright (358.3 / Patron rulings)", async () => {
    const game = await board().build();
    await expect(game.p1.play("patron", { sacrifice: "sarge", to: "bf1" })).rejects.toThrow();
    expect(game.zoneOf("patron")).toBe("hand");
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

  // ---- (d) rollback probe: forced {bf1, kill Sergeant} on board (b) --------------------------------------------

  // Expected (358.3 + 358.5): whether the raw submission is refused up front or undone at Check Legality, the
  // state afterwards is EXACTLY the state before — in particular no partial rollback (unit dead but Patron in
  // hand, or energy gone). Actual: the engine accepts the move; the Sergeant is in the trash and Patron sits
  // at bf1 with 0 energy left.
  test.failing("BUG: (d) a raw playUnit {location: bf1, kill: Sergeant} leaves the game untouched — Sergeant at bf1 (1 dmg, exhausted, never trashed), bf1 P1's, energy 4, Patron in hand, chain/trash empty, no cards-played increment (358.3, 358.5, 419.4.b)", async () => {
    const game = await board().build();
    const hashBefore = game.stateHash();
    await game.p1.try((p) =>
      p.do("playUnit", {
        cardId: "patron",
        costs: { paid: { kill: { objects: ["sarge"] } } },
        location: "battlefield-bf1",
        paidAdditionalCost: true,
        sacrificeId: "sarge",
      }),
    );
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge")).toMatchObject({ damage: 1, isExhausted: true });
    expect(game.p1.trash()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.zoneOf("patron")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(cardsPlayed(game)).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.stateHash()).toBe(hashBefore);
  });
});
