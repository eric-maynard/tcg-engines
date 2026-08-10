/**
 * Ruling a61a774cfd158b68 — Allay, Eager Admirer (UNL-041 → unl-041-219) · 3 Might
 *     "[Deflect] … While I'm at a battlefield, your other units here have [Deflect]."
 *   × Ornn, Forge God (SFD-085 → sfd-085-221) · 4 Might · "[Deflect 2] … [Weaponmaster] … I have +1 [Might] for each friendly gear."
 *   (Void Seeker ogn-024-298, "Deal 4 to a unit at a battlefield. Draw 1.", is the opponent's choosing spell.)
 *
 * Q: Holding a battlefield with Allay and Ornn together — does Ornn have Deflect 3 instead of 2?
 * A: Yes. Ornn's printed Deflect 2 + Allay's granted Deflect (1) sum to Deflect 3: opponents must pay 3 Power (any
 *    domain) to choose him.
 * Rules: 809.1.b.3 (bare Deflect = 1), 809.1.c (pay [rainbow] per point to choose), 809.2 (Deflect values sum).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALLAY = "unl-041-219";
const ORNN = "sfd-085-221";
const VOID_SEEKER = "ogn-024-298";

const SPARE = 4;
/** Void Seeker's own [3][fury] plus 4 spare off-domain Power for any Deflect surcharge. */
const P2_POOL = { energy: 3, power: { fury: 1, mind: SPARE } };

function board(allayAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .resources(P2, P2_POOL)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ORNN, "ornn")
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

describe("Ruling a61a774cfd158b68 — Ornn (Deflect 2) at Allay's battlefield has Deflect 3", () => {
  test("Ornn at bf1 with Allay: printed Deflect 2 plus a granted Deflect from Allay — the pick surfaces a surcharge of 3 and choosing him costs P2 exactly 3 extra Power", async () => {
    const game = await board("bf1").build();
    expect(game.state("ornn").keywords).toContain("Deflect");
    expect(game.state("ornn").grantedKeywords.map((k) => k.keyword)).toContain("Deflect");
    expect(await deflectTax(game, "ornn")).toBe(3);
    await game.settle();
    expect(game.zoneOf("ornn")).toBe("trash"); // 4 ≥ 4: the spell resolved on him
    expect(game.violations()).toEqual([]);
  });

  test("with only 2 spare Power Ornn (Deflect 3) cannot be chosen at all — but Allay herself (just her own Deflect 1) can, for +1", async () => {
    const game = await board("bf1").resources(P2, { energy: 3, power: { fury: 1, mind: 2 } }).build();
    const offered = (game.p2.option("cast", "seeker")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("ornn");
    expect(offered).toContain("allay");
    const r = await game.p2.try((p) => p.cast("seeker", { targets: "ornn" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("seeker")).toBe("hand");
    await game.p2.cast("seeker", { targets: "allay" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 1 } });
  });

  test("control: Allay in base (not 'here') grants nothing — Ornn is plain Deflect 2 and costs +2", async () => {
    const game = await board("base").build();
    expect(game.state("ornn").grantedKeywords).toEqual([]);
    expect(await deflectTax(game, "ornn")).toBe(2);
  });
});
