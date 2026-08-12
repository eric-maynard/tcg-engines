/**
 * Ruling 98a6b782fd7b44bc — Shen, Kinkou (OGN-241 → ogn-241-298) · Unit · 3 + [order] · 3 [Might]
 *   "[Reaction] (Play any time, even before spells and abilities resolve, INCLUDING TO A BATTLEFIELD
 *    YOU CONTROL.) [Shield 2] (+2 [Might] while I'm a defender.) [Tank]"
 *
 * Q: If Shen is played as a reaction to an opponent walking into an EMPTY battlefield, what is his
 *    Might, and does his controller score a conquest point if they win?
 * A: He cannot be played there at all — his Reaction permission only reaches battlefields you control.
 *    Where it does apply: [Shield 2] is worth nothing until he is a defender (3 outside combat, 5 as a
 *    defender), and a DEFENDER who takes an uncontrolled battlefield does Conquer it and score, even
 *    on the opponent's turn.
 * Rules: 822.3.a (a card's own play-location permission), 813.4 ([Reaction] speed), 810 ([Shield] —
 *    only while defending), 344.2 (empty uncontrolled battlefield ⇒ Non-Combat Showdown),
 *    466.5 / 466.5.d (combat resolution establishes control; taking it is a Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHEN_KINKOU = "ogn-241-298";

const ACTION_DRAW: InlineCardDef = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Draw",
  rulesText: "[Action] Draw 1.",
  timing: "action",
};

const REACTION_MARCH: InlineCardDef = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler March",
  rulesText: "[Reaction] Move a friendly unit to a battlefield.",
  timing: "reaction",
};

/** P2's turn. bf1 is empty and uncontrolled; bf2 is P1's, held by a small unit. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 6, name: "Rescuer" }, "rescuer")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, SHEN_KINKOU, "shen")
    .hand(P1, REACTION_MARCH, "march")
    .hand(P2, ACTION_DRAW, "act")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
}

/** P2 walks into the empty bf1 and opens a chain there so P1 gets a Reaction window. */
async function windowInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  const sd = (game.gameState.interaction?.showdownStack ?? []).at(-1);
  expect(sd).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false }); // Non-Combat Showdown
  await game.p2.cast("act");
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

describe("Ruling 98a6b782fd7b44bc — Shen only reaches battlefields you control", () => {
  test("Shen cannot be played to the battlefield the opponent just walked into — it is not P1's", async () => {
    const game = await windowInShowdown();
    const opt = game.p1.option("play", "shen");
    const dests = opt?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).not.toContain("battlefield-bf1");
    const denied = await game.p1.try((p) => p.play("shen", { to: "bf1" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("shen")).toBe("hand");
  });

  test("he CAN be played as a Reaction to a battlefield P1 does control", async () => {
    const game = await windowInShowdown();
    const dests = game.p1.option("play", "shen")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).toContain("battlefield-bf2");
    await game.p1.play("shen", { to: "bf2" });
    expect(game.locationOf("shen")).toBe("bf2");
  });

  test("[Shield 2] is dead weight until he defends: 3 Might at a quiet battlefield", async () => {
    const game = await windowInShowdown();
    await game.p1.play("shen", { to: "bf2" });
    expect(game.state("shen")).toMatchObject({ baseMight: 3, might: 3, combatRole: null });
  });

  test("…and 5 Might once he is a defender in a combat showdown", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", SHEN_KINKOU, "shen")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    expect(game.state("shen").might).toBe(3);
    await game.p2.move("raider", "bf2");
    expect(game.state("shen").combatRole).toBe("defender");
    expect(game.state("shen").might).toBe(5); // 3 + [Shield 2]
  });

  test("a DEFENDER at an uncontrolled battlefield does conquer and score — on the opponent's turn", async () => {
    const game = await windowInShowdown();
    // P1 marches a 6-Might unit into the contested, UNCONTROLLED bf1: combat opens, P1 defends.
    await game.p1.cast("march", { answers: ["battlefield-bf1"], targets: "rescuer" });
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("rescuer")).toBe("bf1");
    expect(game.state("rescuer").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null); // still nobody's
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // establishing control at a battlefield you did not hold = Conquer
    expect(game.violations()).toEqual([]);
  });
});
