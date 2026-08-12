/**
 * Ruling 3d0dea91cddab36a — Sigil of the Storm (OGN-287 → ogn-287-298) · Battlefield
 *   "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *
 * Q: Can you exhaust a rune-Gear (a "Sigil") to pay Sigil of the Storm's recycle-a-rune cost?
 * A: No. Exhausting a permanent for Power and recycling a Rune are different actions that merely happen to
 *    produce the same resource. "Rune" is a card TYPE: the trigger demands that one of your RUNE cards be
 *    recycled (to your rune deck). Something that only makes Power when exhausted does not satisfy it.
 * Rules: 137 (Recycle — a Rune card goes to the Rune Deck), 135.2 (Power is a resource, produced by several
 *        different actions), 471.2.a/383.4 ("when you conquer here" is checked at THIS battlefield).
 *
 * Note: no Power-producing "Sigil" Gear exists in the current card pool, so the ruling's distinction is
 * asserted the way the engine can show it: the demand enumerates RUNE cards only — a Gear P1 controls is
 * never an eligible answer.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL_OF_THE_STORM = "ogn-287-298";
const FRIGID_JEWEL = "unl-074-219"; // any Gear P1 controls, to show gear is not on the menu
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** Walk into the (empty, uncontrolled) Sigil battlefield and close the showdown → Conquer. */
async function conquerTheSigil(runes: number): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: null, def: SIGIL_OF_THE_STORM, inert: false })
    .runes(P1, "fury", runes)
    .gear(P1, FRIGID_JEWEL, "jewel")
    .unit(P1, "base", unit(3, "Walker"), "walker")
    .unit(P2, "base", unit(1, "Bystander"), "bystander")
    .build();
  await game.p1.move("walker", "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context !== "main") {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  return game;
}

describe("Ruling 3d0dea91cddab36a — the Sigil demands a RUNE card recycled, not a Power source exhausted", () => {
  test("conquering here forces a recycle, and only P1's rune CARDS are eligible — the Gear is not offered", async () => {
    const game = await conquerTheSigil(2);
    expect(game.p1.points()).toBe(1);

    const decision = game.decision();
    expect(decision).toMatchObject({ kind: "pick", seat: P1 });
    expect((decision as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["k1", "k2"]);
    expect((decision as { options: { key: string }[] }).options.map((o) => o.key)).not.toContain("jewel");
  });

  test("answering it moves that rune CARD out of the rune pool and into the rune deck", async () => {
    const game = await conquerTheSigil(2);
    const runeDeck0 = game.p1.runeDeck().length;

    await game.p1.pick("k1");
    await game.settle();

    expect(game.p1.runes()).toEqual(["k2"]);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck0 + 1); // recycled, i.e. back into the Rune Deck
    expect(game.zoneOf("jewel")).toBe("base"); // the Gear is untouched
    expect(game.violations()).toEqual([]);
  });

  test("exhausting a rune for Energy and recycling one for Power are separate actions, and neither is the demand", async () => {
    const game = await conquerTheSigil(2);

    // While the demand is open, P1's ordinary rune actions are listed on their own — the Sigil's requirement
    // is answered by the pick, not by taking one of them.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("k2");
    await game.settle();

    expect(game.p1.energy()).toBe(0); // nothing was exhausted for Energy along the way
    expect(game.p1.power("fury")).toBe(0); // and no Power was produced either
  });

  test("with no runes at all the demand simply finds nothing — the conquer still stands", async () => {
    const game = await conquerTheSigil(0);

    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("conquering a DIFFERENT battlefield does not fire it — the trigger says 'here'", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null, def: SIGIL_OF_THE_STORM, inert: false })
      .battlefield("bf2", { controller: null })
      .runes(P1, "fury", 2)
      .unit(P1, "base", unit(3, "Walker"), "walker")
      .unit(P2, "base", unit(1, "Bystander"), "bystander")
      .build();
    const runeDeck0 = game.p1.runeDeck().length;

    await game.p1.move("walker", "bf2");
    await game.p1.passFocus();
    await game.settle();

    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes().sort()).toEqual(["k1", "k2"]);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck0);
  });
});
