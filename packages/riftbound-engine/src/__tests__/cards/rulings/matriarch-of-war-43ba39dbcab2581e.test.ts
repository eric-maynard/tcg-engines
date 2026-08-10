/**
 * Ruling 43ba39dbcab2581e — Matriarch of War (VEN-153 → ven-153-166, legend): "When you empower something else,
 *   empower me. (I become Empowered if I'm not already.) …"
 *   × Kayle, Justified (VEN-134 → ven-134-166) · 3 Might · "[Empower] [3]. I can be [Empowered] up to three times. I have
 *   +2 [Might] for each time I'm [Empowered]. While I'm [Empowered] three times, I have [Deflect 3] and [Ganking]."
 *
 * Q: May I use Kayle's second and third Empower with Matriarch of War as my legend?
 * A: Yes — Kayle's permission overrides the "already Empowered" restriction, so activations 2 and 3 are legal, and
 *    Matriarch's trigger fires EACH time; but only the first does anything to her (Empowered is binary — no stacks on
 *    the Matriarch; only Kayle counts hers).
 * Rules: 441.1.a–c (Empowered is a binary state), 441.1.c.1 (can't empower the already-empowered, unless permitted), 383.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MATRIARCH_OF_WAR = "ven-153-166";
const KAYLE_JUSTIFIED = "ven-134-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn: legend Matriarch of War (not empowered), Kayle in base, exactly [9] = three Empowers. */
function board() {
  return scenario().resources(P1, { energy: 9 }).legend(P1, MATRIARCH_OF_WAR, "matriarch").unit(P1, "base", KAYLE_JUSTIFIED, "kayle");
}

/** Activate Kayle's Empower and pass priority until her ability (only) has resolved. */
async function empowerKayle(game: Game): Promise<void> {
  expect(game.p1.can("activate", "kayle")).toBe(true);
  await game.p1.activate("kayle");
  expect(game.chain().map((c) => c.cardId)).toEqual(["kayle"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 43ba39dbcab2581e — Kayle may Empower thrice; Matriarch triggers each time but only becomes Empowered once", () => {
  test("1st Empower: Kayle becomes Empowered (+2 → 5); Matriarch's 'empower something else' trigger goes on the chain and, on resolution, empowers the Matriarch", async () => {
    const game = await board().build();
    expect(game.state("kayle")).toMatchObject({ isEmpowered: false, might: 3 });
    expect(game.state("matriarch").isEmpowered).toBe(false);
    await empowerKayle(game);
    expect(game.p1.energy()).toBe(6);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "matriarch", controller: P1, triggered: true })]);
    expect(game.state("matriarch").isEmpowered).toBe(false); // not until her trigger resolves
    await game.settle();
    expect(game.state("matriarch").isEmpowered).toBe(true);
  });

  test("2nd and 3rd Empower are LEGAL despite Kayle already being Empowered: 7 then 9 Might, and at three she has Deflect 3 + Ganking; the Matriarch stays (singly) Empowered throughout", async () => {
    const game = await board().build();
    await empowerKayle(game);
    await game.settle();
    await empowerKayle(game);
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.state("kayle").keywords).not.toContain("Ganking");
    expect(game.state("matriarch").isEmpowered).toBe(true);
    await empowerKayle(game);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 9 });
    expect(game.state("kayle").keywords).toContain("Ganking");
    expect(game.state("kayle").grantedKeywords).toContainEqual(expect.objectContaining({ keyword: "Deflect", value: 3 }));
    expect(game.state("matriarch").isEmpowered).toBe(true); // binary — no "extra" empowerment to show
    expect(game.p1.can("activate", "kayle")).toBe(false); // capped at three (and out of energy)
    expect(game.violations()).toEqual([]);
  });

  // Expected: every Kayle Empower is an "empower something else" event, so Matriarch's trigger is put on the chain on the
  // 2nd (and 3rd) activation too — it just resolves doing nothing because she is already Empowered.
  // Actual: the engine never queues Matriarch's trigger after the first time (chain is empty once Kayle's ability resolves).
  test("ruling 43ba39dbcab2581e — Matriarch's trigger is not put on the chain for Kayle's 2nd Empower (engine suppresses it instead of letting it resolve as a no-op)", async () => {
    const game = await board().build();
    await empowerKayle(game);
    await game.settle();
    expect(game.state("matriarch").isEmpowered).toBe(true);
    await empowerKayle(game);
    expect(game.state("kayle").might).toBe(7);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "matriarch", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("matriarch").isEmpowered).toBe(true); // still just Empowered — the trigger did nothing
  });
});
