/**
 * Ruling 2b11236847667326 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · 2
 *     "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · 2 + [chaos] · [Action] "Move a friendly unit and ready it."
 *
 * Q: Player A moves Unit 1 to an OPEN battlefield (open showdown). During it Player B Rides the Wind Unit 2 into the same
 *    battlefield, contesting it. When does Mask of Foresight trigger?
 * A: Not until the COMBAT showdown starts — which is only after the open showdown fully ends (both players pass Focus
 *    without starting a chain). Then combat begins: the attacker is whoever made the battlefield contested (Player A), and
 *    Mask triggers, +1. If both players have a Mask, both lone units get +1 (not a net-zero).
 * Rules: 344 / 344.1 (a showdown already ongoing becomes a Combat Showdown once it ends contested), 345, 464.2.c.1–3
 *        (attacker = who applied Contested; designations gained as combat begins), 383.4.e/f (attack/defend triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1 (Player A)'s turn. bf1 is open (no controller, no units). Each player has a Mask and one 3-Might unit in base; P2 holds Ride the Wind + 2 + [chaos]. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, MASK_OF_FORESIGHT, "maskA")
    .gear(P2, MASK_OF_FORESIGHT, "maskB")
    .unit(P1, "base", { might: 3, name: "Unit 1" }, "u1")
    .unit(P2, "base", { might: 3, name: "Unit 2" }, "u2")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** A moves Unit 1 to bf1 (open showdown), passes Focus; B Rides the Wind Unit 2 into bf1 and the spell resolves. */
async function unit2RidesIn(game: Game): Promise<void> {
  await game.p1.move("u1", "bf1");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "u2" });
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      const key = d.options.find((o) => /bf1/.test(o.key) || /bf1/.test(o.zone ?? "") || /bf1/.test(o.label))?.key;
      await game.p2.pick(key ?? "bf1");
    } else if (d?.kind === "action" && d.context === "chain" && chainIds(game).includes("rtw")) {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("u2")).toBe("bf1");
  expect(game.state("u2").isReady).toBe(true); // "...and ready it"
}

describe("Ruling 2b11236847667326 — Mask of Foresight waits for the combat showdown that follows the open showdown", () => {
  test("Unit 1 onto the OPEN battlefield starts a non-combat showdown with A holding Focus: no attacker/defender, Mask does NOT trigger, Unit 1 stays 3", async () => {
    const game = await board().build();
    await game.p1.move("u1", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: false });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("u1").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.state("u1").might).toBe(3);
  });

  test("B may Ride the Wind Unit 2 into that battlefield during the open showdown; once combat is under way A (who contested) is the ATTACKER, B the defender, and BOTH Masks give their lone unit +1 (4 vs 4 — not a net zero)", async () => {
    const game = await board().build();
    await unit2RidesIn(game);
    // Drive to the point where both Mask triggers have resolved but combat damage has not been dealt.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else if (d?.kind === "action" && d.context === "showdown" && game.state("u1").combatRole === null) {
        await game.acting().passFocus(); // still the open showdown — end it
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("u1").combatRole).toBe("attacker");
    expect(game.state("u2").combatRole).toBe("defender");
    expect(game.state("u1").might).toBe(4);
    expect(game.state("u2").might).toBe(4);
    // Finish: 4 vs 4 — both lone units die, nobody takes bf1.
    await game.settle();
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.zoneOf("u2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: the ruling says the open showdown must first END (both players pass Focus) before combat starts and
  // Mask triggers. CR 344.1 says otherwise — "If a Showdown is already ongoing at that Battlefield, it will become a
  // Combat Showdown and a Combat will initiate there" — the moment Control is Contested between two players, i.e. as soon
  // as Unit 2 arrives. The engine follows CR 344.1 (as do the green rulings ride-the-wind-02c7fc7281f5b1b4 and
  // vilemaw-10a5e8f8befd1db0); the ruling's substance — attacker = whoever contested, and BOTH lone units get +1 — still
  // holds and is asserted above. This facet pins the engine's (CR) timing.
  // rule 344.1: an ongoing showdown becomes a Combat Showdown as soon as both sides have units there.
  test("CR 344.1 (contra the ruling) — Unit 2 arriving upgrades the ongoing showdown to combat at once: designations and both Mask triggers land with no Focus passes in between", async () => {
    const game = await board().build();
    await unit2RidesIn(game);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, isCombatShowdown: true });
    expect(game.state("u1").combatRole).toBe("attacker");
    expect(game.state("u2").combatRole).toBe("defender");
    expect(new Set(chainIds(game))).toEqual(new Set(["maskA", "maskB"]));
  });
});
