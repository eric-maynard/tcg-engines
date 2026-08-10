/**
 * Ruling 6448a823cdd149ad — Mask of Foresight (OGN-060 → ogn-060-298, Gear) "When a friendly unit attacks or defends alone, give it +1
 *     [Might] this turn."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221, 4 Might) "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Does Mask of Foresight "target" Irelia, so she gets her own +1 on top?
 * A: No. The Mask's trigger does not use targeting — it automatically applies to the unit that attacked/defended alone — so nobody
 *    "chose" Irelia and her ability does not trigger. She gets only the Mask's +1. (Her ability needs YOU to choose or ready her.)
 * Rules: 355.10 (what constitutes choosing/targeting), 383.4.e (attack triggers), 740.2.a ("alone").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const IRELIA = "sfd-057-221";
const DISCIPLINE = "ogn-058-298"; // "[Reaction] Give a unit +2 [Might] this turn. Draw 1." — a spell that DOES choose her (contrast)

/** P1's turn with [2] (for Discipline). P1: Mask of Foresight in base, Irelia (4) in base. P2 holds bf1 with a 7-Might Wall. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", IRELIA, "irelia")
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .hand(P1, DISCIPLINE, "disc");
}

/** Irelia attacks bf1 alone; resolve the Mask's trigger (both pass), leaving the showdown open with P1 on Focus. */
async function ireliaAttacksAlone(): Promise<Game> {
  const game = await board().build();
  expect(game.state("irelia").might).toBe(4);
  await game.p1.move("irelia", "bf1");
  return game;
}

describe("Ruling 6448a823cdd149ad — Mask of Foresight doesn't choose Irelia: +1 from the Mask, no +1 from her own ability", () => {
  test("attacking alone puts exactly ONE trigger on the chain — the Mask's — with no target chosen and no Irelia 'chosen' trigger beside it", async () => {
    const game = await ireliaAttacksAlone();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]); // automatic: "give IT" — nothing was chosen
    expect(game.chain().some((c) => c.cardId === "irelia")).toBe(false);
    // No choice was ever put to P1 for the Mask (it is not a "choose a unit" effect).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the Mask resolves: Irelia is 4 + 1 = 5 — NOT 6 — and still no Irelia trigger appears afterwards", async () => {
    const game = await ireliaAttacksAlone();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia").mightModifier).toBe(1);
    expect(game.state("irelia").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a spell that DOES choose her: P1 Disciplines Irelia in the same showdown → her 'when you choose me' trigger joins the chain and she ends at 5 + 2 + 1 = 8", async () => {
    const game = await ireliaAttacksAlone();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("irelia").might).toBe(5);
    await game.p1.cast("disc", { targets: "irelia" });
    expect(game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`)).toEqual(["disc", "irelia*"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Irelia's trigger resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia").might).toBe(8);
  });

  test("end to end with only the Mask: the 5-Might Irelia loses to the 7-Might Wall (a 6 would have too) — Wall takes 5 and keeps bf1", async () => {
    const game = await ireliaAttacksAlone();
    await game.settle();
    expect(game.zoneOf("irelia")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
