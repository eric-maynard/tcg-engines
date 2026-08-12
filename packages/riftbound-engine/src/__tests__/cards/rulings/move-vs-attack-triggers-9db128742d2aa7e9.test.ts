/**
 * Ruling 9db128742d2aa7e9 — (general move/attack trigger order; exercised with)
 *   Ribbon Dancer (SFD-038 → sfd-038-221) · 3 Might · "When I move to a battlefield, give another friendly unit
 *     +1 [Might] this turn."
 *   × Lucian, Gunslinger (SFD-028 → sfd-028-221) · 2 Might · "[Assault] When I attack, deal damage equal to my
 *     [Assault] to an enemy unit here."
 *
 * Q: Moving units with "When I move" triggers in to attack — what resolves when?
 * A: The move triggers go on the chain FIRST and must resolve completely before the showdown opens. Only then
 *    are the units designated attackers and the "When I attack" triggers go on the chain. While the move
 *    triggers are pending nobody is an attacker yet, so [Assault] adds nothing — and the opponent may answer
 *    them with reactions before combat has even started.
 * Rules: 464.2 / 464.2.c.3 (a showdown becomes combat, and designations are stamped, when it opens),
 *        383.3 (triggered abilities go on the chain and are resolved before play continues),
 *        807.1.d.1 ([Assault] applies only while designated an attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIBBON = "sfd-038-221";
const LUCIAN = "sfd-028-221";

/** P1's turn: Ribbon Dancer and Lucian in base, P2 defending bf1 with a 2-Might Defender. */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", RIBBON, "ribbon")
    .unit(P1, "base", LUCIAN, "lucian");
}

/** Both units march into bf1 together. */
async function marchIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["ribbon", "lucian"], "bf1");
  return game;
}

describe("Ruling 9db128742d2aa7e9 — 'when I move' resolves first, then the showdown opens and 'when I attack' triggers", () => {
  test("the move trigger is the FIRST thing on the chain, and it is a chain window — not a showdown yet", async () => {
    const game = await marchIn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ribbon"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("nobody is designated yet, so Lucian's [Assault] adds nothing while the move trigger is pending", async () => {
    const game = await marchIn();
    expect(game.state("lucian").combatRole ?? "none").toBe("none");
    expect(game.state("lucian").might).toBe(2); // printed 2, no [Assault] bonus
    expect(game.chain().some((c) => c.cardId === "lucian")).toBe(false); // no attack trigger yet
  });

  test("once the move trigger resolves the showdown opens: Lucian is an attacker, his [Assault] applies and his 'when I attack' trigger is now the chain item", async () => {
    const game = await marchIn();
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Ribbon Dancer's move trigger resolves (+1 to Lucian)
    expect(game.state("lucian").combatRole).toBe("attacker");
    expect(game.state("lucian").might).toBe(4); // 2 printed + 1 from the Dancer + 1 [Assault]
    expect(game.chain().map((c) => c.cardId)).toEqual(["lucian"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true, controller: P1 });
  });

  test("the opponent gets a window on the move trigger BEFORE combat — a reaction there kills the mover before it ever attacks", async () => {
    const SNIPE = {
      abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "chaos",
      energyCost: 1,
      name: "Test Snipe",
      powerCost: [],
      rulesText: "[Reaction] Kill a unit.",
      timing: "reaction",
    } as const;
    const game = await board().hand(P2, SNIPE, "snipe").build();
    await game.p1.move(["ribbon", "lucian"], "bf1");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "snipe")).toBe(true); // still just a chain, no combat
    await game.p2.cast("snipe", { targets: "lucian" });
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("end to end: after both trigger layers the combat runs and P1 takes the battlefield", async () => {
    const game = await marchIn();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
