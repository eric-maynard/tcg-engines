/**
 * Ruling 426cea2516a47af5 — Akshan, Mischievous (SFD-109 → sfd-109-221) · 4 Might
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me.
 *    When you play me, if you paid the additional cost, move an enemy gear to your base. You control it
 *    until I leave the board. If it's an Equipment, attach it to me."
 *   × Doran's Blade (sfd-095-221) — an Equipment already attached to an enemy unit.
 *
 * Q: Can Akshan take an Equipment that is already equipped on an enemy unit?
 * A: Yes. It detaches from its current wearer, P1 gains control of it, and it attaches to Akshan.
 *    Control lasts only while Akshan is on the board — when he leaves it reverts to its owner.
 * Rules: 191.1 (control), 640 (attachments detach when they change controller/location).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const DORANS_BLADE = "sfd-095-221";
const DEATHGRIP = "sfd-163-221";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Wielder" }, "wielder")
    .gear(P2, DORANS_BLADE, "blade", { attachedTo: "wielder" })
    .unit(P1, "base", { might: 2, name: "Spare" }, "spare")
    .hand(P1, AKSHAN, "akshan");
}

describe("Ruling 426cea2516a47af5 — Akshan steals an Equipment off an enemy unit", () => {
  test("paying [body][body] detaches the Blade from its wearer, hands control to P1 and re-attaches it to Akshan", async () => {
    const game = await board().build();
    // Precondition: the Blade is P2's and worn by P2's unit.
    expect(game.state("blade")).toMatchObject({ attachedTo: "wielder", controller: P2, owner: P2 });

    await game.p1.play("akshan", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } }); // [4] + [body][body]
    await game.settle();

    expect(game.state("blade")).toMatchObject({
      attachedTo: "akshan",
      controller: P1, // stolen
      location: "base",
      owner: P2, // ownership never changes
    });
    expect(game.state("akshan").attachments).toEqual(["blade"]);
    expect(game.state("wielder").attachments).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("without paying the additional cost nothing is taken", async () => {
    const game = await board().build();
    await game.p1.play("akshan", { to: "base" });
    await game.settle();
    expect(game.state("blade")).toMatchObject({ attachedTo: "wielder", controller: P2 });
    expect(game.state("akshan").attachments).toEqual([]);
  });

  test("control lasts only while Akshan is on the board: killing him hands the Blade back to its owner", async () => {
    const game = await board().hand(P1, DEATHGRIP, "grip").build();
    await game.p1.play("akshan", { payOptional: true, to: "base" });
    await game.settle();
    expect(game.state("blade").controller).toBe(P1);

    await game.p1.cast("grip", { targets: "akshan", answers: ["spare"] });
    await game.settle();

    expect(game.zoneOf("akshan")).toBe("trash");
    expect(game.state("blade").controller).toBe(P2); // reverted
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});
