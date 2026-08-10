/**
 * Ruling 6e525606b7066294 — Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · +4 "[Equip] — [order], Kill a friendly unit (Pay the cost:
 *     Attach this to a unit you control.)"
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Is the Equip kill part of starting a chain? Can the opponent react (e.g. Star-Crossed the unit I want to equip, or the unit I want to kill)?
 * A: Activating [Equip] starts a chain. Its costs — [order] AND killing the friendly unit — are paid on activation, BEFORE the opponent gets
 *    priority, so the sacrificed unit can never be bounced in response. The opponent may Star-Crossed the intended holder: it resolves first
 *    (LIFO), the holder leaves, and the Equip ability then finds an illegal target and does nothing; the paid costs are not refunded.
 * Rules: 818.1.b–c (Equip is an activated ability with a cost), 356/357 (costs paid during activation), 340 (LIFO), 359.3.e.7 (target gone →
 *        instruction fails), 425 (no refunds).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOTRK = "sfd-178-221";
const STAR_CROSSED = "unl-128-219";

/** P1's turn with exactly [order]. P1: Heir (2) — the intended holder — and Fodder (1) in base, the Blade in base unequipped. P2: Pal (2) in base,
 *  Star-Crossed with exactly [3][chaos]. */
function board() {
  return scenario()
    .resources(P1, { power: { order: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
    .unit(P2, "base", { might: 2, name: "Pal" }, "pal")
    .gear(P1, BOTRK, "botrk")
    .hand(P2, STAR_CROSSED, "sc");
}

/** P1 activates Equip: kill Fodder, attach to Heir. */
async function equipOntoHeir(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("equipCard")).toBe(true);
  await game.p1.choose("equipCard:-", { params: { equipmentId: "botrk", sacrificeId: "fodder", unitId: "heir" } });
  return game;
}

const enemyTargetsForStarCrossed = (game: Game) =>
  (game.p2.option("cast", "sc")?.fields.find((f) => f.name === "targets")?.options ?? []).map((t) => (t as string[])[1]);

describe("Ruling 6e525606b7066294 — Equip starts a chain; its kill cost is paid up front; Star-Crossed on the holder makes the Equip whiff", () => {
  test("1) activating [Equip] STARTS A CHAIN: a Blade item is on the chain, and its costs are already paid — Fodder is in the trash and the [order] is gone — before anyone responds", async () => {
    const game = await equipOntoHeir();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "botrk", controller: P1 })]);
    expect(game.zoneOf("fodder")).toBe("trash"); // killed as a COST, on activation
    expect(game.p1.power("order")).toBe(0);
    expect(game.state("botrk").attachedTo).toBeUndefined(); // not attached yet — that is the effect, pending resolution
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("2) P1 passes → P2 receives priority and MAY play the Reaction Star-Crossed in response; 4) but the sacrificed Fodder is not among its possible enemy targets — it is already dead", async () => {
    const game = await equipOntoHeir();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sc")).toBe(true);
    expect(enemyTargetsForStarCrossed(game)).toEqual(["heir"]); // only the Heir; never "fodder"
    const atFodder = await game.p2.try((p) => p.cast("sc", { targets: ["pal", "fodder"] }));
    expect(atFodder.ok).toBe(false);
    await game.p2.cast("sc", { targets: ["pal", "heir"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["botrk", "sc"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("3) LIFO: Star-Crossed resolves first — Heir (and Pal) go back to hand — then the Equip ability resolves against an absent target and does nothing: the Blade stays in base unattached, Fodder stays dead, nothing is refunded", async () => {
    const game = await equipOntoHeir();
    await game.p1.passPriority();
    await game.p2.cast("sc", { targets: ["pal", "heir"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("heir")).toBe("hand");
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["botrk"]); // the Equip item is still there, now aimed at nothing
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("botrk")).toBe("base");
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.zoneOf("fodder")).toBe("trash"); // the cost stays paid
    expect(game.p1.power("order")).toBe(0); // no refund
    expect(game.p1.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2 just passes, the Equip resolves — Heir wears the Blade as a 6, Fodder in the trash", async () => {
    const game = await equipOntoHeir();
    await game.settle();
    expect(game.state("botrk").attachedTo).toBe("heir");
    expect(game.state("heir")).toMatchObject({ attachments: ["botrk"], might: 6 });
    expect(game.zoneOf("fodder")).toBe("trash");
  });
});
