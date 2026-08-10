/**
 * Ruling 1d61d906779ef9f3 — Stupefy (OGN-095 → ogn-095-298) · Spell · Mind · 1 · [Reaction]
 *     "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Fiora, Victorious (ogn-232-298) · 4 Might "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]."
 *   × Discipline (ogn-058-298) · [Reaction] "+2 [Might] this turn. Draw 1." — the response that makes Fiora Mighty.
 *   (Mystic Reversal ogn-080-298 is only cited in a nuance about copies.)
 *
 * Q: Stupefy targets Fiora; before it resolves Fiora gains [Deflect]. Does Stupefy fizzle / must the caster now pay
 *    the Deflect [rainbow]?
 * A: No. Deflect is an additional COST, and costs are paid when the spell is put on the chain. Gaining Deflect later
 *    changes nothing already paid; the spell resolves normally with no further payment.
 * Rules: 355/356 (costs paid on finalize), 727 Deflect (cost to choose), 359 (no retroactive re-costing on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const FIORA_VICTORIOUS = "ogn-232-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn with EXACTLY 1 energy and no power (could never afford a Deflect pip). P2: Fiora (4, not Mighty) at bf1, Discipline + 2 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FIORA_VICTORIOUS, "fiora")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, DISCIPLINE, "discipline");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Stupefy → Fiora; P2 answers with Discipline → Fiora; Discipline resolves (Stupefy still pending). */
async function stupefyThenDiscipline(game: Game): Promise<void> {
  await game.p1.cast("stupefy", { targets: "fiora" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // paid 1, no Deflect pip (Fiora had none)
  await game.p1.passPriority();
  await game.p2.cast("discipline", { targets: "fiora" });
  expect(chainIds(game)).toEqual(["stupefy", "discipline"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Discipline (top) resolves
}

describe("Ruling 1d61d906779ef9f3 — a target gaining Deflect after Stupefy is on the chain costs nothing extra; Stupefy resolves", () => {
  test("premise: a 4-Might Fiora has no Deflect, so Stupefy is cast on her for just its 1 energy", async () => {
    const game = await board().build();
    expect(game.state("fiora").might).toBe(4);
    expect(game.state("fiora").keywords).not.toContain("Deflect");
    await game.p1.cast("stupefy", { targets: "fiora" });
    expect(chainIds(game)).toEqual(["stupefy"]);
    expect(game.chain()[0]?.targets).toEqual(["fiora"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Discipline resolves first: Fiora is now 6 Might, Mighty, and HAS Deflect while Stupefy is still pending — and P1 is asked for nothing (just priority)", async () => {
    const game = await board().build();
    await stupefyThenDiscipline(game);
    expect(chainIds(game)).toEqual(["stupefy"]);
    expect(game.state("fiora").might).toBe(6);
    expect(game.state("fiora").keywords).toContain("Deflect");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Stupefy then resolves NORMALLY with no Deflect payment: Fiora 6 → 5, P1 draws 1, Stupefy to trash, P1's pool untouched", async () => {
    const game = await board().build();
    const p1Hand0 = game.p1.hand().length; // stupefy
    await stupefyThenDiscipline(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.chain().some((c) => c.countered)).toBe(false);
    expect(game.state("fiora").might).toBe(5); // 4 + 2 − 1
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1); // cast Stupefy, drew 1
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: choosing an ALREADY-Deflect Fiora (5 Might) does require the [rainbow] up front — unaffordable with 1 energy and no power, castable (and charged) once a rainbow is available", async () => {
    const poor = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", FIORA_VICTORIOUS, "fiora", { mightModifier: 1 })
      .hand(P1, STUPEFY, "stupefy")
      .build();
    expect(poor.state("fiora").keywords).toContain("Deflect");
    expect(poor.p1.can("cast", "stupefy")).toBe(false);

    const rich = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", FIORA_VICTORIOUS, "fiora", { mightModifier: 1 })
      .hand(P1, STUPEFY, "stupefy")
      .build();
    await rich.p1.cast("stupefy", { targets: "fiora" });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // Deflect pip paid on finalize
  });
});
