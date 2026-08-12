/**
 * Ruling f0d35891a18ec602 — Akshan, Mischievous (SFD-109 → sfd-109-221) · 4 Might
 *   "[Weaponmaster] / You may pay [body][body] as an additional cost to play me. /
 *    When you play me, if you paid the additional cost, move an enemy gear to your base. You control
 *    it until I leave the board. If it's an Equipment, attach it to me."
 *   × Veteran Poro (sfd-099-221) · [Weaponmaster]; Doran's Blade (sfd-095-221), an Equipment.
 *
 * Q: Can I Weaponmaster a piece of gear back to my unit after an enemy Akshan has stolen it and
 *    equipped it to their own unit?
 * A: No. [Weaponmaster] lets you equip "an Equipment YOU CONTROL". While Akshan is on the board its
 *    controller controls the stolen Equipment, so it is not among your Weaponmaster's choices.
 * Rules: 821.1.b ([Weaponmaster] equips an Equipment you control), 340.x/take-control (control, not
 *        ownership, is what the permission reads).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const VETERAN_PORO = "sfd-099-221";
const DORANS_BLADE = "sfd-095-221";

/** P2's turn first, so P2 can play Akshan; P1's Blade starts on P1's side. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 6, power: { body: 2 } })
    .unit(P1, "base", { might: 3, name: "Holder" }, "holder")
    .gear(P1, DORANS_BLADE, "blade")
    .hand(P2, AKSHAN, "akshan")
    .hand(P1, VETERAN_PORO, "poro");
}

/** Hand the turn to P1 and give them the 2 Energy the Poro costs. */
async function toP1Turn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.tapRunes(2);
}

describe("Ruling f0d35891a18ec602 — a Weaponmaster cannot reclaim an Equipment an enemy Akshan controls", () => {
  test("baseline: with the Blade still P1's, playing a [Weaponmaster] Poro raises the equip offer naming it", async () => {
    const game = await board().build();
    await toP1Turn(game);
    expect(game.state("blade").controller).toBe(P1);
    await game.p1.play("poro");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card)).toContain("blade");
  });

  test("Akshan played for its additional cost takes the Blade to P2's base, under P2's control, attached to Akshan", async () => {
    const game = await board().build();
    await game.p2.play("akshan", { payOptional: true });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade").owner).toBe(P1); // still owned by P1…
    expect(game.state("blade").controller).toBe(P2); // …but controlled by P2
    expect(game.state("blade").attachedTo).toBe("akshan");
  });

  test("THE RULING: P1's Weaponmaster is offered nothing — the stolen Blade is not an Equipment P1 controls", async () => {
    const game = await board().build();
    await game.p2.play("akshan", { payOptional: true });
    await game.settle();
    await toP1Turn(game);
    await game.p1.play("poro");
    // No equip prompt at all (the Blade was the only Equipment on the board).
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("blade").controller).toBe(P2);
    expect(game.state("blade").attachedTo).toBe("akshan");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("P1 can still Weaponmaster an Equipment they DO control — only the stolen one is out of reach", async () => {
    const game = await board().gear(P1, DORANS_BLADE, "spare").build();
    await game.p2.play("akshan", { payOptional: true });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("blade"); // two enemy gear ⇒ Akshan's controller names the victim
    }
    await game.settle();
    await toP1Turn(game);
    await game.p1.play("poro");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (d as { options: { card?: string }[] }).options.map((o) => o.card);
    expect(offered).toContain("spare");
    expect(offered).not.toContain("blade");
  });
});
