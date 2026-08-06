/**
 * Interaction: Allay, Eager Admirer (unl-041-219)
 *     "[Deflect] … While I'm at a battlefield, your other units here have [Deflect]."
 *   × Frisky Hunter (unl-033-219)
 *     "When you play me, play a 1 [Might] Bird unit token with [Deflect] here."
 *   × Void Seeker (ogn-024-298) — 3 energy + [fury], "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Question: with Allay at bf1 and Frisky Hunter played to bf1 (creating a Deflect Bird there),
 * how much extra Power does the OPPONENT pay to Void Seeker each unit?
 *
 * Rules:
 *   809.1.b.3 — Deflect with no X is Deflect 1.
 *   809.1.c   — opponents' spells that choose the unit cost [Deflect value] more Power (any domain).
 *   809.2     — Deflect from multiple sources sums: printed Deflect + Allay's grant = Deflect 2.
 *   356.2.a.2 — the Deflect surcharge is a mandatory additional cost.
 * Allay's grant is conditional ("while I'm at a battlefield") and local ("your other units HERE").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALLAY = "unl-041-219";
const FRISKY_HUNTER = "unl-033-219";
const VOID_SEEKER = "ogn-024-298";

/** Void Seeker's own cost: 3 energy + 1 fury. P2 gets 3 spare off-domain power to cover any Deflect tax. */
const P2_POOL = { energy: 3, power: { fury: 1, mind: 3 } };
const SPARE = 3;

/**
 * P1 (turn player) has Allay at `allayAt`, plays Frisky Hunter to bf1 (Bird token lands at bf1),
 * then the turn passes to P2 who holds Void Seeker with P2_POOL.
 */
async function board(allayAt: "bf1" | "bf2" | "base", p2Pool: typeof P2_POOL = P2_POOL): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, allayAt, ALLAY, "allay")
    .hand(P1, FRISKY_HUNTER, "frisky")
    .hand(P2, VOID_SEEKER, "voidSeeker")
    .build();
  await game.p1.play("frisky", { to: "bf1" });
  await game.settle();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", p2Pool);
  return game;
}

function bird(game: Game): string {
  const id = game.p1.units("bf1").find((u) => game.state(u).name === "Bird");
  if (!id) {
    throw new Error("Bird token not found at bf1");
  }
  return id;
}

/** Extra power P2 spent beyond Void Seeker's own [fury] pip. */
async function deflectTaxFor(game: Game, target: string): Promise<number> {
  await game.p2.cast("voidSeeker", { targets: target });
  expect(game.p2.energy()).toBe(0);
  expect(game.p2.power("fury")).toBe(0);
  return SPARE - game.p2.power();
}

describe("Allay × Frisky Hunter Bird × Void Seeker — Deflect stacking (809.2)", () => {
  test("setup: Frisky Hunter's Bird token is a 1-Might unit at bf1 with printed Deflect, and Allay grants it a second Deflect", async () => {
    const game = await board("bf1");
    const b = bird(game);
    expect(game.locationOf(b)).toBe("bf1");
    expect(game.state(b).might).toBe(1);
    expect(game.state(b).isToken).toBe(true);
    expect(game.state(b).keywords).toContain("Deflect");
    expect(game.state(b).grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
    // Allay grants only to OTHER units — she has no granted Deflect herself.
    expect(game.state("allay").grantedKeywords.map((k) => k.keyword)).not.toContain("Deflect");
    expect(game.state("frisky").grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
  });

  test("(a) Allay at bf1: targeting the Bird costs P2 +2 power (printed Deflect 1 + Allay's Deflect 1 sum, 809.2)", async () => {
    const game = await board("bf1");
    expect(await deflectTaxFor(game, bird(game))).toBe(2);
  });

  test("(a') Allay at bf1: with only 1 spare power the Bird is NOT a legal target but Allay/Frisky Hunter still are", async () => {
    const game = await board("bf1", { energy: 3, power: { fury: 1, mind: 1 } });
    expect(game.p2.power()).toBe(2);
    const r = await game.p2.try((p) => p.cast("voidSeeker", { targets: bird(game) }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("voidSeeker")).toBe("hand");
    // Frisky Hunter (Deflect 1 via Allay) is affordable with the single spare power.
    await game.p2.cast("voidSeeker", { targets: "frisky" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
  });

  test("(b) Allay at bf1: targeting Allay herself costs +1 (only her own Deflect; her grant is to OTHER units)", async () => {
    const game = await board("bf1");
    expect(await deflectTaxFor(game, "allay")).toBe(1);
  });

  test("(c) Allay at bf1: targeting Frisky Hunter (no printed Deflect) costs +1 from Allay's grant", async () => {
    const game = await board("bf1");
    expect(await deflectTaxFor(game, "frisky")).toBe(1);
    await game.settle();
    expect(game.zoneOf("frisky")).toBe("trash"); // 4 damage ≥ 3 Might
  });

  test("(d) Allay in base: her grant is off — Bird costs +1 (printed only), Frisky Hunter +0", async () => {
    const game = await board("base");
    const b = bird(game);
    expect(game.state(b).grantedKeywords).toEqual([]);
    expect(game.state("frisky").keywords).not.toContain("Deflect");
    expect(await deflectTaxFor(game, b)).toBe(1);

    const g2 = await board("base");
    expect(await deflectTaxFor(g2, "frisky")).toBe(0);
  });

  test("(d') Allay at a DIFFERENT battlefield (bf2): 'here' does not reach bf1 — Bird +1, Frisky Hunter +0, Allay herself still +1", async () => {
    const game = await board("bf2");
    expect(game.state(bird(game)).grantedKeywords).toEqual([]);
    expect(await deflectTaxFor(game, bird(game))).toBe(1);

    const g2 = await board("bf2");
    expect(await deflectTaxFor(g2, "frisky")).toBe(0);

    const g3 = await board("bf2");
    expect(await deflectTaxFor(g3, "allay")).toBe(1);
  });

  test("Deflect only taxes opponents: P1 Void Seekers its own double-Deflect Bird for just 3 energy + [fury]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ALLAY, "allay")
      .hand(P1, FRISKY_HUNTER, "frisky")
      .hand(P1, VOID_SEEKER, "voidSeeker")
      .build();
    await game.p1.play("frisky", { to: "bf1" });
    await game.settle();
    const b = bird(game);
    expect(game.state(b).grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
    await game.p1.cast("voidSeeker", { targets: b });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    // 4 damage kills the 1-Might token; tokens leaving the board cease to exist.
    expect(game.p1.units("bf1")).not.toContain(b);
    expect(game.violations()).toEqual([]);
  });
});
