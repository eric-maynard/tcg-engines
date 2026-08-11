/**
 * Ruling 19f1688a055800b1 — Irelia, Fervent (SFD-057 → sfd-057-221) · Unit · [5][calm] · 4 Might
 *   "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *    When you choose or ready me, give me +1 [Might] this turn."
 *   × Warmog's Armor (SFD-108 → sfd-108-221) · Equipment · +1 Might · "[Equip] [body] ([body]: Attach
 *     this to a unit you control.)"
 *
 * Q: Does attaching a gear to Irelia trigger her "when you choose … me" ability?
 * A: Yes. Equipping names her as the unit to attach to, and naming her that way IS choosing/targeting —
 *    her "choose" wording covers it just as "target" wording would. She gets +1 Might this turn.
 * Rules: 355.10 (choosing = targeting), 818 / 818.1.c.1 (Equip is an activated ability that targets a
 *        unit you control and uses the chain), 340.1 (LIFO), 383 (triggered abilities), 809.1.c
 *        ([Deflect] taxes OPPONENTS only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const WARMOGS = "sfd-108-221";

/** P1's turn with [3] + 2 body power. Irelia (4) and a plain 2-Might Pal in base; Warmog's Armor loose in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 2 } })
    .unit(P1, "base", IRELIA, "irelia")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .gear(P1, WARMOGS, "wm")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
}

/** Activate Warmog's [Equip], naming `unit` as the unit to attach to. */
async function equip(game: Game, unit: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "wm", unitId: unit } });
}

describe("Ruling 19f1688a055800b1 — equipping Irelia is 'choosing' her: her +1 Might trigger fires", () => {
  test("premise: Irelia is a plain 4 and the Armor is unattached", async () => {
    const game = await board().build();
    expect(game.state("irelia")).toMatchObject({ attachments: [], baseMight: 4, might: 4, mightModifier: 0 });
    expect(game.state("irelia").keywords).toContain("Deflect");
    expect(game.state("wm").attachedTo).toBeUndefined();
  });

  test("the Equip goes on the chain and Irelia's 'when you choose me' trigger goes ON TOP of it — the choosing happened as the Equip was played, not when it resolved", async () => {
    const game = await board().build();
    await equip(game, "irelia");
    expect(game.chain().map((c) => c.cardId)).toEqual(["wm", "irelia"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("irelia").might).toBe(4); // nothing has resolved yet
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } }); // the [body] Equip pip, no [rainbow]: Deflect taxes opponents only
  });

  test("LIFO: her trigger resolves first (+1 → 5, still unarmoured), then the Equip attaches the Armor (+1 → 6)", async () => {
    const game = await board().build();
    await equip(game, "irelia");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Irelia's trigger resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["wm"]);
    expect(game.state("irelia")).toMatchObject({ attachments: [], might: 5, mightModifier: 1 });
    await game.settle(); // the Equip resolves
    expect(game.state("wm").attachedTo).toBe("irelia");
    expect(game.state("irelia")).toMatchObject({ attachments: ["wm"], baseMight: 4, might: 6, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: equipping a unit that is NOT Irelia chooses that unit instead — no trigger, and Irelia stays a 4", async () => {
    const game = await board().build();
    await equip(game, "pal");
    expect(game.chain().map((c) => c.cardId)).toEqual(["wm"]); // no triggered item at all
    await game.settle();
    expect(game.state("pal")).toMatchObject({ attachments: ["wm"], might: 3 });
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0 });
  });

  test("the bonus is 'this turn' only: after the turn passes Irelia is back to 4 + the Armor's permanent +1 = 5", async () => {
    const game = await board().build();
    await equip(game, "irelia");
    await game.settle();
    expect(game.state("irelia").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("irelia")).toMatchObject({ attachments: ["wm"], might: 5, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
