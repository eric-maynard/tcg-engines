/**
 * Ruling c0f55a06745eeaf6 — "a Vex with Deflect 1" at Allay's battlefield.
 *   The scrape files this under Vex, Cheerless (SFD-146 → sfd-146-221), which has NO Deflect; the Vex that prints [Deflect] is
 *   Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "[Deflect] …" — used here as the questioner's "Vex with deflect 1".
 *   × Allay, Eager Admirer (UNL-041 → unl-041-219) · 3 Might · "[Deflect] While I'm at a battlefield, your other units here have [Deflect]."
 *   (Void Seeker ogn-024-298 · 3+[fury] "Deal 4 to a unit at a battlefield. Draw 1." is the opponent's choosing spell.)
 *
 * Q: Allay and a Deflect-1 Vex share a battlefield — does targeting the Vex cost 1 or 2 extra?
 * A: 2. Vex's own Deflect 1 plus the Deflect (1) Allay grants are summed (Deflect 2), so an opponent's spell/ability that
 *    chooses her costs 2 additional Power, of any domain.
 * Rules: 809.1.b.3 (bare Deflect = 1), 809.1.c / 809.1.c.1 (pay [rainbow] per point, any domain), 809.2 (Deflect values sum).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX_APATHETIC = "unl-150-219";
const ALLAY = "unl-041-219";
const VOID_SEEKER = "ogn-024-298";

const SPARE = 3;
/** Void Seeker's own [3][fury] plus 3 spare OFF-domain Power for whatever Deflect surcharge applies. */
const P2_POOL = { energy: 3, power: { fury: 1, mind: SPARE } };

/** P2's turn. P1 holds bf1 with Vex, Apathetic; Allay is at bf1 or in base per case. P2 holds Void Seeker. */
function board(allayAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .resources(P2, P2_POOL)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VEX_APATHETIC, "vex")
    .unit(P1, allayAt, ALLAY, "allay")
    .hand(P2, VOID_SEEKER, "seeker");
}

/** Extra Power P2 spent beyond Void Seeker's printed [fury] to choose `target`. */
async function deflectTax(game: Game, target: string): Promise<number> {
  await game.p2.cast("seeker", { targets: target });
  expect(game.p2.energy()).toBe(0);
  expect(game.p2.power("fury")).toBe(0);
  return SPARE - game.p2.power();
}

describe("Ruling c0f55a06745eeaf6 — Deflect-1 Vex at Allay's battlefield is Deflect 2: choosing her costs 2 extra Power", () => {
  test("premise: Vex prints Deflect (1); with Allay at the same battlefield she is ALSO granted Deflect by Allay", async () => {
    const game = await board("bf1").build();
    expect(game.state("vex").keywords).toContain("Deflect");
    expect(game.state("vex").grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
    // Allay's grant is "your OTHER units here": Allay herself only has her own printed Deflect.
    expect(game.state("allay").grantedKeywords.map((k) => k.keyword)).not.toContain("Deflect");
  });

  test("the values SUM: the target pick advertises a surcharge of 2 for Vex, and choosing her with Void Seeker costs P2 exactly 2 extra Power (paid from off-domain mind — any domain works)", async () => {
    const game = await board("bf1").build();
    const opt = game.p2.option("cast", "seeker");
    expect((opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat()).toContain("vex");
    expect(await deflectTax(game, "vex")).toBe(2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: SPARE - 2 } });
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash"); // 4 damage ≥ 4: the spell did resolve on her
    expect(game.violations()).toEqual([]);
  });

  test("with only 1 spare Power, Deflect-2 Vex cannot be chosen at all (Allay, Deflect 1, still can be — for +1)", async () => {
    const game = await board("bf1").resources(P2, { energy: 3, power: { fury: 1, mind: 1 } }).build();
    const offered = (game.p2.option("cast", "seeker")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("vex");
    expect(offered).toContain("allay");
    const r = await game.p2.try((p) => p.cast("seeker", { targets: "vex" }));
    expect(r.ok).toBe(false);
    await game.p2.cast("seeker", { targets: "allay" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
  });

  test("control: Allay in base (not 'here') grants nothing — Vex is plain Deflect 1 and costs just +1", async () => {
    const game = await board("base").build();
    expect(game.state("vex").grantedKeywords.map((k) => k.keyword)).not.toContain("Deflect");
    expect(await deflectTax(game, "vex")).toBe(1);
  });
});
