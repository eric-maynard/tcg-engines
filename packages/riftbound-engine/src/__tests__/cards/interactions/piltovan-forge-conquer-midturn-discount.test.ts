/**
 * Interaction: Piltovan Forge (ven-161-166, Battlefield)
 *     "While you control this battlefield, the first friendly gear activated ability played each
 *      turn costs [1] less."
 *   × The Syren (ogn-184-298, Gear, two copies A and B in P1's base)
 *     "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
 *   × Seal of Discord (ogn-204-298, Gear) "[Exhaust]: [Reaction] — [Add] [chaos]."
 *
 * Question: the Forge changes hands MID-TURN. P2 holds it (2-Might defender) at the start of P1's
 * turn; P1 has X at bf2 (P1-controlled) and Y in base. When does the [1] discount start / stop
 * applying to P1's Syrens, and what counts as "the first friendly gear activated ability played
 * this turn"?
 *
 * Rules: 190.6 / 190.6.a / 190.6.d (control of a battlefield = control of its abilities; "you" /
 * "friendly" read from the controller), 403.3 (total cost is determined when the ability is
 * played — a continuous cost modification is live the instant its condition is), 356.6 (energy
 * cost floors at 0), 381 (activated abilities only on the controller's turn), 429.2 (an [Add]
 * ability is still activated → finalized → resolved, i.e. "played"), 151.2 ("this turn" facts are
 * facts about the turn), 323.6 (control lapses at an Open-State Cleanup with no unit there).
 *
 * Observability note: the harness exposes no cost preview. P1 is given NO runes, so the only
 * energy P1 ever has is what the test banks with `bank(game, n)`; the engine offers an activation
 * only when it is affordable. Hence "Syren enumerated at [0]" ⇔ `activateAbility` offered with an
 * empty pool and the pool still empty after it resolves; "enumerated at [1]" ⇔ NOT offered at 0
 * energy, offered at exactly 1, and that 1 is gone once the ability is played.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PILTOVAN_FORGE = "ven-161-166";
const THE_SYREN = "ogn-184-298";
const SEAL_OF_DISCORD = "ogn-204-298";
const DISCIPLINE = "ogn-058-298"; // Spell · Calm · 2 · Reaction · "Give a unit +2 Might this turn. Draw 1." — opens a chain for (f)
const GUST = "ogn-169-298"; // Spell · Chaos · 1 · Reaction · "Return a unit at a battlefield with 3 Might or less to its owner's hand."

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const offered = (game: Built, seat: "p1" | "p2", card: string, index = 0): boolean =>
  game[seat].legal().some((o) => o.key === `activateAbility:${card}#${index}`);

/** Put `n` energy straight into P1's pool (stands in for tapping runes; keeps the cost oracle exact). */
const bank = (game: Built, n: number) => game.p1.do("addResources", { energy: n });

/** Activate a Syren, answering its "friendly unit at a battlefield" pick with `unit`, and let it resolve. */
async function useSyren(game: Built, syren: string, unit: string): Promise<void> {
  await game.p1.activate(syren, 0, { answers: [unit] });
  game.script(P1, [(d) => (d.kind === "pick" ? unit : undefined)]);
  await game.settle();
  expect(game.locationOf(unit)).toBe("base");
  expect(game.state(syren).isExhausted).toBe(true);
}

/**
 * P1's turn, empty pools, P1 has no runes. P2 holds the Forge with a 2-Might defender; P1 holds
 * bf2 with X (2 Might) and has Y (3 Might — wins 3 v 2; small enough for Gust in (f)) in base
 * next to Syren-A, Syren-B and a Seal of Discord. P2 has its own Seal, one energy and a Gust.
 */
function board() {
  return scenario()
    .battlefield("forge", { controller: P2, def: PILTOVAN_FORGE, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "forge", { might: 2, name: "Defender" }, "defender")
    .unit(P1, "bf2", { might: 2, name: "X" }, "unitX")
    .unit(P1, "base", { might: 3, name: "Y" }, "unitY")
    .gear(P1, THE_SYREN, "syrenA")
    .gear(P1, THE_SYREN, "syrenB")
    .gear(P1, SEAL_OF_DISCORD, "p1seal")
    .gear(P2, SEAL_OF_DISCORD, "p2seal")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, GUST, "gust")
    .resources(P1, { energy: 0 })
    .resources(P2, { energy: 1 });
}

/** P1 walks Y into the Forge, wins 3 v 2 and conquers it; back to P1's Neutral Open. */
async function conquerForge(game: Built): Promise<void> {
  await game.p1.move("unitY", "forge");
  await game.settle();
  expect(game.zoneOf("defender")).toBe("trash");
  expect(game.locationOf("unitY")).toBe("forge");
  expect(game.gameState.battlefields.forge?.controller).toBe(P1);
  expect(game.actingSeat()).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("Piltovan Forge conquered mid-turn × The Syren ×2 × Seal of Discord", () => {
  // ─── (a) start of P1's Main Phase: P2 controls the Forge ────────────────────────────────────
  test("(a) while P2 controls the Forge, Syren-A is priced at its printed [1] for P1: not offered at 0 energy, offered at 1, and that 1 is spent (190.6.d — 'you'/'friendly' is P2)", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.forge?.controller).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    expect(offered(game, "p1", "syrenA")).toBe(false);
    expect(offered(game, "p1", "syrenB")).toBe(false);
    await bank(game, 1);
    expect(offered(game, "p1", "syrenA")).toBe(true);
    await useSyren(game, "syrenA", "unitX");
    expect(game.p1.energy()).toBe(0); // the full [1] was paid
  });

  test("(a) P2's gear activated abilities are on nobody's menu during P1's Neutral Open (381) — P2's Forge discount has nothing visible to act on; P1's own [Exhaust]-only Seal is offered", async () => {
    const game = await board().build();
    expect(offered(game, "p2", "p2seal")).toBe(false);
    expect(game.p2.legal().filter((o) => o.verb === "activate")).toEqual([]);
    expect(offered(game, "p1", "p1seal")).toBe(true);
  });

  // ─── (b) conquer mid-turn → discount live from the next window ─────────────────────────────
  test("(b) Y (3 Might) moves into the Forge, kills the 2-Might defender and conquers it (1 point); Y is healed by the combat cleanup (466.1.a.1); control — and with it the Forge's ability, 190.6 — passes to P1", async () => {
    const game = await board().build();
    await conquerForge(game);
    expect(game.state("unitY").damage).toBe(0);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(b) in the very next Neutral Open after the conquer — same turn, no gear ability used yet — Syren-A (and Syren-B) are offered at [0] + Exhaust with an EMPTY pool (403.3: cost fixed when played; 356.6 floor)", async () => {
    const game = await board().build();
    expect(offered(game, "p1", "syrenA")).toBe(false); // before: printed [1], unaffordable
    await conquerForge(game);
    expect(game.p1.energy()).toBe(0);
    expect(offered(game, "p1", "syrenA")).toBe(true);
    expect(offered(game, "p1", "syrenB")).toBe(true); // either copy could be "the first"
  });

  // ─── (c) first discounted, second full ─────────────────────────────────────────────────────
  test("(c) P1 activates Syren-A for [0] (X: bf2 → base, pool stays empty); Syren-B is then the SECOND gear ability this turn and is priced at the full [1]", async () => {
    const game = await board().build();
    await conquerForge(game);
    await useSyren(game, "syrenA", "unitX");
    expect(game.p1.energy()).toBe(0); // nothing was charged
    // Syren-B: [1] — not offered at 0, offered at 1, and the 1 is spent.
    expect(offered(game, "p1", "syrenB")).toBe(false);
    await bank(game, 1);
    expect(offered(game, "p1", "syrenB")).toBe(true);
    await useSyren(game, "syrenB", "unitY");
    expect(game.p1.energy()).toBe(0);
  });

  // ─── (d) a full-price activation BEFORE the conquest already was "the first this turn" ─────
  test("(d) Syren-A played at full price BEFORE conquering was already 'the first friendly gear activated ability this turn' (151.2 — a fact about the turn; mirrors the Ornn's Forge ruling): after the conquest Syren-B still costs [1]", async () => {
    const game = await board().build();
    await bank(game, 1);
    await useSyren(game, "syrenA", "unitX");
    expect(game.p1.energy()).toBe(0);
    await conquerForge(game);
    // P1 now controls the Forge, pool empty, but the "first" is already spent this turn.
    expect(offered(game, "p1", "syrenB")).toBe(false);
    await bank(game, 1);
    expect(offered(game, "p1", "syrenB")).toBe(true);
    await useSyren(game, "syrenB", "unitY");
    expect(game.p1.energy()).toBe(0); // full [1] paid
  });

  // ─── (e) a costless [Exhaust]-only gear ability (Seal of Discord) eats the discount ─────────
  test("(e) JUDGE CALL: with the Forge held from the start of the turn, exhausting Seal of Discord first IS playing a gear activated ability (429.2) — the [1] reduction floors its [0] at 0 (356.6) and Syren-A afterwards costs the full [1]", async () => {
    // Judge call stated explicitly: an [Add] ability is activated, finalized and resolved like any
    // other activated ability (429.2) — it merely skips the chain. It is therefore "the first
    // friendly gear activated ability played this turn"; the discount is applied to it (to no
    // visible effect) and is gone. Players wanting the discount must use the priced ability first.
    const game = await scenario()
      .battlefield("forge", { controller: P1, def: PILTOVAN_FORGE, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "forge", { might: 2, name: "Keeper" }, "keeper")
      .unit(P1, "bf2", { might: 2, name: "X" }, "unitX")
      .gear(P1, THE_SYREN, "syrenA")
      .gear(P1, SEAL_OF_DISCORD, "p1seal")
      .resources(P1, { energy: 0 })
      .build();
    // Before anything: Syren-A would be free (it would be the first).
    expect(offered(game, "p1", "syrenA")).toBe(true);
    // P1 exhausts the Seal first instead.
    await game.p1.activate("p1seal", 0);
    await game.settle();
    expect(game.state("p1seal").isExhausted).toBe(true);
    expect(game.p1.power("chaos")).toBe(1);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]); // an [Add] never lingers on the chain (429.2)
    // The Seal was the first gear activated ability this turn → Syren-A is now full price.
    expect(offered(game, "p1", "syrenA")).toBe(false);
    await bank(game, 1);
    expect(offered(game, "p1", "syrenA")).toBe(true);
    await useSyren(game, "syrenA", "unitX");
    expect(game.p1.energy()).toBe(0); // the [1] was paid …
    expect(game.p1.power("chaos")).toBe(1); // … out of energy, the chaos power is untouched
  });

  // ─── (f) control flips away again mid-turn → discount gone from the next window ────────────
  test("(f) after (b), P2 Reacts on a later chain with Gust (Y → hand); P1 has no unit at the Forge and loses control at the Open cleanup (323.6) — from then on the Syrens are priced at the printed [1] again although no gear ability was played this turn (190.6)", async () => {
    const game = await board().build();
    await conquerForge(game);
    expect(offered(game, "p1", "syrenB")).toBe(true); // discounted window: free at 0 energy
    // P1 opens a chain: Discipline (2) on X. P1 passes; P2 answers with Gust on Y (3 Might, at the Forge).
    await bank(game, 2);
    await game.p1.cast("discipline", { targets: "unitX" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["discipline"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "unitY" });
    await game.settle();
    expect(game.zoneOf("unitY")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.p1.units("forge")).toEqual([]);
    expect(game.gameState.battlefields.forge?.controller ?? null).toBe(null);
    // No gear ability has been played this turn, yet the discount left with the control.
    expect(game.p1.energy()).toBe(0);
    expect(offered(game, "p1", "syrenA")).toBe(false);
    expect(offered(game, "p1", "syrenB")).toBe(false);
    await bank(game, 1);
    expect(offered(game, "p1", "syrenB")).toBe(true);
    await useSyren(game, "syrenB", "unitX");
    expect(game.p1.energy()).toBe(0); // full [1] paid
    expect(game.violations()).toEqual([]);
  });
});
