/**
 * Ruling 283ea0735ae3a4f9 — Reflection token (UNL-T06 → unl-t06)
 *     "(I become a copy of something when played. I don't get that card's play effects.)"
 *   × Mirror Image (UNL-200 → unl-200-219) · [3][rainbow][rainbow]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · [Shield]
 *
 * Q: If I make a Reflection of a unit that has +Might buffs on it, does the copy inherit them?
 * A: No. A copy effect only takes the COPIABLE traits — the printed (or copied) characteristics including
 *    the rules text. Buffs and other granted/appended modifiers are not copiable, so the Reflection is a
 *    plain printed Stalwart Poro (2 Might, [Shield]) with no buff.
 * Rules: 605 (copiable values), 745 (buffs are granted, not printed).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const STALWART_PORO = "ogn-052-298";

/** P1's main phase with a BUFFED Stalwart Poro (2 printed + 1 buff = 3) at home and Mirror Image in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .unit(P1, "base", STALWART_PORO, "poro", { buffed: true })
    .hand(P1, MIRROR_IMAGE, "mirror");
}

describe("Ruling 283ea0735ae3a4f9 — a Reflection copies printed traits only, never the buffs", () => {
  test("premise: the original Poro is buffed and shows 3 Might", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 3, isBuffed: true });
  });

  test("ruling: the Reflection enters as a printed Stalwart Poro — 2 Might, not buffed", async () => {
    const game = await board().build();
    const before = new Set(game.p1.base());
    await game.p1.cast("mirror", { targets: "poro" });
    await game.settle();
    const token = game.p1.base().find((c) => !before.has(c));
    expect(token).toBeDefined();
    const copy = game.state(token as string);
    expect(copy.isToken).toBe(true);
    expect(copy.name).toContain("Stalwart Poro");
    expect(copy.baseMight).toBe(2);
    expect(copy.might).toBe(2);
    expect(copy.isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the copiable rules text DOES come across — the Reflection has [Shield]", async () => {
    const game = await board().build();
    const before = new Set(game.p1.base());
    await game.p1.cast("mirror", { targets: "poro" });
    await game.settle();
    const token = game.p1.base().find((c) => !before.has(c)) as string;
    expect(game.state(token).keywords).toContain("Shield");
  });

  test("the original keeps its buff — copying takes nothing away", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "poro" });
    await game.settle();
    expect(game.state("poro")).toMatchObject({ might: 3, isBuffed: true });
    expect(game.zoneOf("mirror")).toBe("trash");
  });
});
