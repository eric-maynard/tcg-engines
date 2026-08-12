/**
 * Ruling b06462dd33444c90 — Salvage (OGN-224 → ogn-224-298) · Spell · [2][order] · [Action]
 *   "You may kill up to one gear. Draw 1."
 *   × Hexdrinker (SFD-102 → sfd-102-221) · Equipment as the targeted gear,
 *   × Deathgrip (SFD-163 → sfd-163-221) · [Reaction] [2] · "Kill a friendly unit…" as the in-response sacrifice.
 *
 * Q: My opponent Salvages a gear equipped on my unit at a battlefield and I sacrifice that unit in response. Does
 *    Salvage still do anything now the gear is at my base?
 * A: Yes. The target was legal when Salvage was played, and it is locked there; the gear detaching and being recalled
 *    to base does not make it an illegal target, so Salvage kills it and then draws.
 * Rules: 355.10 (targets are locked when the card is put on the Chain), 452.1/149.3 (unattached gear at a battlefield
 *        is recalled to its controller's base), 359.3.e.11 (the rest of the instructions still happen).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const HEXDRINKER = "sfd-102-221";
const DEATHGRIP = "sfd-163-221";

/** P2's turn. P1's Host holds bf1 wearing a Hexdrinker; P1 has Deathgrip up, P2 has Salvage. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Host" }, "host")
    .unit(P1, "base", { might: 3, name: "Other" }, "other")
    .card("hex", { def: HEXDRINKER, meta: { attachedTo: "host" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .hand(P2, SALVAGE, "salvage")
    .resources(P2, { energy: 2, power: { order: 1 } })
    .hand(P1, DEATHGRIP, "deathgrip")
    .resources(P1, { energy: 2 });
}

/** Both players pass priority once, resolving the top Chain item. */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling b06462dd33444c90 — Salvage sticks to the gear even after its host is sacrificed", () => {
  test("the gear is locked onto the Chain item while it is still attached at the battlefield", async () => {
    const game = await board().build();
    expect(game.state("hex")).toMatchObject({ attachedTo: "host", location: "bf1" });
    await game.p2.cast("salvage", { targets: "hex" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "salvage", controller: P2, targets: ["hex"], triggered: false }),
    ]);
  });

  test("P1 answers by killing the host: the unit dies, the gear detaches to P1's base, and Salvage still names it", async () => {
    const game = await board().build();
    await game.p2.cast("salvage", { targets: "hex" });
    await game.p2.passPriority();
    await game.p1.cast("deathgrip", { targets: "host" });
    await bothPass(game); // Deathgrip resolves
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(game.zoneOf("hex")).toBe("base"); // recalled, NOT killed with its host
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvage", targets: ["hex"] })]);
  });

  test("…and then Salvage resolves: the gear is killed at P1's base and P2 draws 1", async () => {
    const game = await board().build();
    const p2HandBefore = game.p2.hand().length;
    await game.p2.cast("salvage", { targets: "hex" });
    await game.p2.passPriority();
    await game.p1.cast("deathgrip", { targets: "host" });
    await bothPass(game); // Deathgrip
    await bothPass(game); // Salvage
    expect(game.zoneOf("hex")).toBe("trash");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p2.hand().length).toBe(p2HandBefore); // -1 Salvage, +1 drawn
    expect(game.violations()).toEqual([]);
  });

  test("control — with no Salvage in the picture, sacrificing the host only detaches the gear; it survives at base", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2); // pools emptied on the turn change
    await game.p1.cast("deathgrip", { targets: "host" });
    await game.settle();
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.state("hex").attachedTo).toBeUndefined();
  });
});
