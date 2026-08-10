/**
 * Ruling 89d623483cd4d634 — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · 3+[calm] · +0
 *     "[Equip] [1][calm] … As this is attached to a unit, copy that unit's text to this Equipment's effect text for as
 *      long as this is attached to it."
 *   × Ahri, Alluring (OGN-066 → ogn-066-298) · Champion · Calm · 5 · 4 Might "When I hold, you score 1 point."
 *
 * Q: With Svellsongur attached to Ahri, Alluring before my turn starts, do I score 3 when I hold her battlefield
 *    (1 hold + 1 Ahri + 1 copied ability)?
 * A: Yes — 3 total. The attached Svellsongur's copied text gives Ahri a second, independent instance of "When I hold, you
 *    score 1 point"; both trigger and resolve separately on top of the point for holding.
 * Rules: 718.3 (attached Equipment's effect text is appended to the bearer), 383 (each instance triggers separately),
 *        444/445 (Hold in the Beginning Phase scores 1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const AHRI_ALLURING = "ogn-066-298";

/** P1's turn 2. P1 holds bf1 with Ahri (4). Svellsongur loose in P1's base with exactly its Equip cost [1][calm]. P2 idle. */
function board() {
  return scenario()
    .victoryScore(8)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", AHRI_ALLURING, "ahri")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .gear(P1, SVELLSONGUR, "svell");
}

/** Equip Svellsongur onto Ahri (the [Equip] activation resolves) — done on P1's own turn, before P2's turn. */
async function equipOntoAhri(game: Game): Promise<void> {
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "ahri" });
  await game.settle();
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.state("svell").attachedTo).toBe("ahri");
  expect(game.state("svell").meta.copiedFromCardId).toBe("ahri"); // Ahri's text copied onto the Equipment
  expect(game.state("ahri")).toMatchObject({ attachments: ["svell"], might: 4 }); // +0 Might
}

describe("Ruling 89d623483cd4d634 — Ahri wearing Svellsongur holds for 3 points (hold + her trigger + the copied trigger)", () => {
  test("Svellsongur equipped this turn; through P2's turn into P1's Beginning Phase: holding bf1 scores 1, then TWO separate 'When I hold' items (Ahri's and Svellsongur's copy) each score 1 → P1 goes 0 → 3", async () => {
    const game = await board().build();
    await equipOntoAhri(game);
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P2's turn (nothing happens)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.state("svell").attachedTo).toBe("ahri"); // still attached when P1's Beginning Phase arrives
    // Step into P1's turn by hand to see the hold triggers on the chain.
    await game.p2.endTurn();
    let sawTwoHoldItems = false;
    for (let i = 0; i < 16; i++) {
      const items = game.chain().filter((c) => c.triggered && (c.cardId === "ahri" || c.cardId === "svell"));
      sawTwoHoldItems ||= items.length === 2 || (items.length === 1 && game.p1.points() === 2);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "order") {
        // Both triggers are P1's: P1 may order them (383.3.d) — either order gives the same total.
        expect(d.seat).toBe(P1);
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(sawTwoHoldItems).toBe(true);
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same hold WITHOUT Svellsongur attached scores only 2 (hold + Ahri's single trigger)", async () => {
    const game = await board().build();
    // Svellsongur stays loose in base.
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("svell").attachedTo).toBeUndefined();
    expect(game.p1.points()).toBe(2);
  });

  test("the copy is tied to the attachment: Svellsongur reports Ahri as its copied source only while attached, and Ahri's controller sees it listed among her attachments", async () => {
    const game = await board().build();
    expect(game.state("svell").meta.copiedFromCardId).toBeUndefined();
    await equipOntoAhri(game);
    expect(game.state("svell")).toMatchObject({ attachedTo: "ahri", controller: P1 });
  });
});
