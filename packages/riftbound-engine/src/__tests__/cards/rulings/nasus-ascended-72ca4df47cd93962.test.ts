/**
 * Ruling 72ca4df47cd93962 — Nasus, Ascended (VEN-046a → ven-046a-166) · Unit · Calm · 8 · 8 Might
 *     "[Deflect 2] [Empower] [8] [Empowered] ▸ When I conquer, you score 1 point."
 *   × Svellsongur (SFD-059 → sfd-059-221) · Equipment "As this is attached to a unit, copy that unit's text to this
 *     Equipment's effect text for as long as this is attached to it."
 *   (Blue Sentinel UNL-087 + Svellsongur is the cited precedent.)
 *
 * Q: My Empowered Nasus, Ascended wears Svellsongur ("Song"). How many points when he conquers?
 * A: 3 — 1 for the Conquer itself, +1 from Nasus's own Empowered trigger, +1 from the Svellsongur copy: the copied
 *    text is Effect Text appended to Nasus's rules text (718.3), so he has two independent instances of the trigger.
 * Rules: 718.3 (Equipment Effect Text is the wearer's), 444/445 (conquer scores 1), 383 (both triggers fire).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NASUS_ASCENDED = "ven-046a-166";
const SVELLSONGUR = "sfd-059-221";

/** P1's turn, 0 points. Empowered Nasus in base; Svellsongur loose in base; exactly [1][calm] for the Equip; bf1 empty & uncontrolled. */
function board(withSong: boolean) {
  let b = scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", NASUS_ASCENDED, "nasus", { empowered: true })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
  if (withSong) {
    b = b.gear(P1, SVELLSONGUR, "song");
  }
  return b;
}

/** Equip Song onto Nasus through the real [Equip] activation, letting its chain item resolve. */
async function equipSong(game: Game): Promise<void> {
  await game.p1.do("equipCard", { equipmentId: "song", unitId: "nasus" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("song").attachedTo).toBe("nasus");
  expect(game.state("song").meta.copiedFromCardId).toBe("nasus"); // Svellsongur copied Nasus's text
  expect(game.state("nasus")).toMatchObject({ attachments: ["song"], isEmpowered: true });
  expect(game.chain()).toEqual([]);
}

describe("Ruling 72ca4df47cd93962 — Empowered Nasus wearing Svellsongur conquers for 3 points", () => {
  test("Nasus walks onto the empty bf1; after both pass Focus he conquers: 1 (conquer) and TWO 'When I conquer' triggers are put on the chain", async () => {
    const game = await board(true).build();
    await equipSong(game);
    await game.p1.move("nasus", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    await game.p2.passFocus();
    // Two identical items of one controller — no ordering prompt; straight to the chain priority window.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // the Conquer itself, before either trigger resolves
    const triggers = game.chain().filter((c) => c.triggered && c.controller === P1 && c.cardId === "nasus");
    expect(triggers).toHaveLength(2); // Nasus's own + the Svellsongur copy (Effect Text is Nasus's — 718.3)
  });

  test("both triggers resolve → P1 ends on 3 points", async () => {
    const game = await board(true).build();
    await equipSong(game);
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("nasus")).toBe("bf1");
    expect(game.p1.points()).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Empowered Nasus WITHOUT Svellsongur conquers for 2 (1 + his own trigger)", async () => {
    const game = await board(false).build();
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(2);
  });

  test("control: NOT empowered (even wearing Song) → neither instance's [Empowered] condition holds → just 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", NASUS_ASCENDED, "nasus")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .gear(P1, SVELLSONGUR, "song")
      .build();
    await game.p1.do("equipCard", { equipmentId: "song", unitId: "nasus" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("nasus").isEmpowered).toBe(false);
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });
});
