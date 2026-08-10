/**
 * Ruling 32c75628cc7dd6f3 — Trinity Force (sfd-115-221) × Skyfall of Areion (sfd-030-221) [× Svellsongur noted as the exception]
 *   Trinity Force: "[Equip] [body]. When I hold, score 1 point." (+2)
 *   Skyfall of Areion: "[Equip] [1][fury]. My hold effects are also conquer effects, and vice versa." (+2)
 *
 * Q: Does attached equipment transfer its Effect Text to the unit — so that a unit wearing BOTH Trinity Force
 *    and Skyfall of Areion scores TF's point on conquer as well as on hold?
 * A: Yes. Equipment confers its effect text on the wearer; with Skyfall the wearer's hold effect (from TF) is
 *    also a conquer effect, so it fires on both.
 * Rules: 136.2 / 719.1 (attached Equipment's effect text is appended to the unit's text), 446/450 (conquer/hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRINITY_FORCE = "sfd-115-221";
const SKYFALL = "sfd-030-221";

async function equip(game: Game, equipmentId: string, unitId: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId, unitId } });
  await game.settle();
}

/** P1: a vanilla Bearer in base, both equipment loose in base, resources for both Equip costs ([body] + [1][fury]). */
function board() {
  return scenario()
    .victoryScore(8)
    .resources(P1, { energy: 1, power: { body: 1, fury: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Bearer" }, "bearer")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .gear(P1, TRINITY_FORCE, "tf")
    .gear(P1, SKYFALL, "sky");
}

describe("Ruling 32c75628cc7dd6f3 — equipment effect text transfers to the wearer; TF + Skyfall scores on conquer AND hold", () => {
  test("both attached: the Bearer is 2 + 2 + 2 = 6 Might and carries both attachments", async () => {
    const game = await board().build();
    await equip(game, "tf", "bearer");
    await equip(game, "sky", "bearer");
    expect(game.state("bearer").attachments.toSorted()).toEqual(["sky", "tf"]);
    expect(game.state("bearer").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
  });

  test("ruling 32c75628cc7dd6f3 — CONQUER with TF + Skyfall scores 2: Skyfall makes TF's hold effect a conquer effect too", async () => {
    // Expected: CONQUER with TF + Skyfall scores 2 (1 Conquer + 1 from TF's hold effect, which Skyfall makes a conquer effect too).
    // Actual: Skyfall's effect text parses to nothing (only its [Equip] keyword), so the conquer is worth 1.
    const game = await board().build();
    await equip(game, "tf", "bearer");
    await equip(game, "sky", "bearer");
    await game.p1.move("bearer", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("bearer")).toBe("bf1");
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("control — CONQUER with TF alone (no Skyfall): only the Conquer point (TF's effect is a hold effect only)", async () => {
    const game = await board().build();
    await equip(game, "tf", "bearer");
    await game.p1.move("bearer", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("HOLD with TF + Skyfall: holding bf2 at the start of P1's next turn scores 2 (1 Hold + 1 TF) — 'vice versa' does not remove the hold effect", async () => {
    const game = await scenario()
      .victoryScore(8)
      .resources(P1, { energy: 1, power: { body: 1, fury: 1 } })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Bearer" }, "bearer")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .gear(P1, TRINITY_FORCE, "tf")
      .gear(P1, SKYFALL, "sky")
      .build();
    await equip(game, "tf", "bearer");
    await equip(game, "sky", "bearer");
    expect(game.state("bearer").attachments.toSorted()).toEqual(["sky", "tf"]);
    await game.advanceTurn(); // → P2
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P1 (Hold)
    expect(game.p1.points()).toBe(2);
  });
});
