/**
 * Ruling 3570e75fe839f3de — En Garde (OGN-046 → ogn-046-298) · Reaction [1]
 *   "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: En Garde on Irelia, Fervent while she is alone at a battlefield — +3 or +4?
 * A: +3. Choosing her triggers her own +1; En Garde then gives +1 and the "alone" bonus +1 (= +2). 1 + 2 = +3 → 7 Might.
 * Rules: 383 (Irelia's "when you choose me" trigger), 336/337 (her trigger resolves above En Garde, LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const IRELIA_FERVENT = "sfd-057-221";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", IRELIA_FERVENT, "irelia")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, EN_GARDE, "engarde")
    .resources(P1, { energy: 1 });
}

async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 3570e75fe839f3de — En Garde on a lone Irelia, Fervent is +3 total (4 → 7), not +4", () => {
  test("1. targeting: casting En Garde on Irelia puts her 'chosen' trigger on the chain above the spell", async () => {
    const game = await board().build();
    expect(game.p1.units("bf1")).toEqual(["irelia"]);
    expect(game.state("irelia").might).toBe(4);
    await game.p1.cast("engarde", { targets: "irelia" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "irelia"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("irelia").might).toBe(4);
  });

  test("2–3. her trigger resolves first (+1 → 5), then En Garde gives +1 and the alone bonus +1 (→ 7): total +3", async () => {
    const game = await board().build();
    await game.p1.cast("engarde", { targets: "irelia" });
    await bothPass(game); // Irelia's trigger
    expect(game.state("irelia").might).toBe(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde"]);
    await bothPass(game); // En Garde
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia").might).toBe(7);
    expect(game.state("irelia").mightModifier).toBe(3); // +3, not +4
    expect(game.violations()).toEqual([]);
  });

  test("the +3 is 'this turn': after the turn passes she is back to 4", async () => {
    const game = await board().build();
    await game.p1.cast("engarde", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });

  test("contrast — not alone (a second friendly unit there): +1 (chosen) +1 (En Garde base) = +2 → 6", async () => {
    const game = await board().unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy").build();
    await game.p1.cast("engarde", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(6);
    expect(game.state("buddy").might).toBe(1);
  });
});
