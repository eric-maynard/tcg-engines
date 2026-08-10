/**
 * Ruling cc697535497d33a6 — Nine-Tailed Fox (Ahri legend, OGN-255 → ogn-255-298)
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298, Battlefield) "Units here have +1 [Might]. (This includes attackers.)"
 *
 * Q: When Ahri triggers against units attacking the War Camp, does the -1 apply before or after the Camp's +1?
 * A: The War Camp is a passive: it applies the moment the units are there, BEFORE Ahri's trigger resolves. So a 1-Might
 *    attacker becomes 2 at the Camp, then Ahri's -1 makes it 1 (rather than min-1-then-+1 = 2).
 * Rules: 363 / 522 (passive abilities apply continuously, immediately), 383 (triggered abilities resolve via the chain),
 *        464.2 (attackers designated as combat begins; "when I attack" triggers on the initial combat chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const WAR_CAMP = "ogn-294-298";

/** P1's turn. P2 (Ahri legend) holds the live War Camp with a Guard (4 → 5 here). P1: Tiny (1) and Mid (3) in base. */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "ahri")
    .battlefield("camp", { controller: P2, def: WAR_CAMP, inert: false })
    .unit(P2, "camp", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Tiny" }, "tiny")
    .unit(P1, "base", { might: 3, name: "Mid" }, "mid");
}

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order") {
      await game.seat(d.seat).order([]);
      continue;
    }
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling cc697535497d33a6 — War Camp's +1 is already applied when Ahri's -1 resolves", () => {
  test("premise: the Camp's passive is live — the Guard standing there reads 5; Tiny in base reads 1", async () => {
    const game = await board().build();
    expect(game.state("guard").might).toBe(5);
    expect(game.state("tiny").might).toBe(1);
  });

  test("Tiny and Mid attack the Camp: they are attackers at 2 and 4 (Camp +1 applied immediately) while Ahri's triggers are still unresolved on the initial combat chain", async () => {
    const game = await board().build();
    await game.p1.move(["tiny", "mid"], "camp");
    await game.acceptTriggerOrder();
    expect(game.state("tiny").combatRole).toBe("attacker");
    expect(game.state("mid").combatRole).toBe("attacker");
    const ahriItems = game.chain().filter((c) => c.cardId === "ahri" && c.triggered && c.controller === P2);
    expect(ahriItems).toHaveLength(2); // one per attacking enemy unit
    expect(game.state("tiny").might).toBe(2); // 1 + Camp
    expect(game.state("mid").might).toBe(4); // 3 + Camp
  });

  test("Ahri then resolves on the buffed values: Tiny 2 → 1 and Mid 4 → 3 (had Ahri applied first, Tiny would read min-1 + 1 = 2)", async () => {
    const game = await board().build();
    await game.p1.move(["tiny", "mid"], "camp");
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("tiny").might).toBe(1);
    expect(game.state("mid").might).toBe(3);
    expect(game.state("tiny").mightModifier).toBe(-1); // Ahri's -1 actually landed (not clamped away)
    expect(game.state("guard").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
