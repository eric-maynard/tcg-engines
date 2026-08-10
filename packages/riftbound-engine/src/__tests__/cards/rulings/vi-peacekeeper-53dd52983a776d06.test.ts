/**
 * Ruling 53dd52983a776d06 — Vi, Peacekeeper (UNL-176 → unl-176-219) · 5 Might · "[Ambush] When I attack, [Stun] an enemy unit here."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] Action "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: If Vi gets Hidden Bladed in response to her attack trigger, does she still stun?
 * A: No. Hidden Blade resolves first (LIFO) and kills Vi; when her trigger then resolves she is no longer at the battlefield, so
 *    "an enemy unit HERE" has no reference point and the ability does nothing.
 * Rules: 327/339 (LIFO), 359.3.f.2 (referents re-checked on resolution — "here" needs the source's location), FAQ #3820/#5667.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "unl-176-219";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P2 holds bf1 with a 3-Might Guard and hid Hidden Blade there on an earlier turn. P1: Vi in base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "base", VI, "vi")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Play Hidden Blade from face-down naming Vi (the kill target is asked as it is played). */
async function bladeVi(game: Game): Promise<void> {
  await game.p2.reveal("blade", { answers: ["vi"] });
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("vi");
    } else {
      break;
    }
  }
}

/** Vi attacks bf1; her attack trigger (target: Guard) ends up on the chain and P1 passes priority to P2. */
async function viAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vi", "bf1");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("guard");
    } else {
      break;
    }
  }
  expect(game.state("vi").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 53dd52983a776d06 — Hidden Blade in response to Vi's attack trigger: Vi dies, nothing is stunned", () => {
  test("control: unanswered, Vi's attack trigger stuns the Guard", async () => {
    const game = await viAttacks();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("guard");
      } else if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.state("guard").isStunned).toBe(true);
  });

  test("P2 flips the hidden Hidden Blade onto the chain above Vi's trigger, targeting Vi (for [0])", async () => {
    const game = await viAttacks();
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await bladeVi(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["vi", "blade"]);
    expect(game.chain()[1]?.targets).toEqual(["vi"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Hidden Blade resolves first and kills Vi (P1 draws 2); Vi's trigger then resolves with Vi gone from bf1 → the Guard is NOT stunned; the attack fizzles and P2 keeps bf1", async () => {
    const game = await viAttacks();
    await bladeVi(game);
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1 && d.allowDecline) {
        await game.p1.decline();
      } else if (d.kind === "pick" && d.seat === P1) {
        // If the engine still insists on a stun target here, that already contradicts the ruling (asserted below).
        await game.p1.pick(d.options[0]!.key);
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // "Its controller draws 2"
    expect(game.state("guard").isStunned).toBe(false);
    expect(game.state("guard")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
