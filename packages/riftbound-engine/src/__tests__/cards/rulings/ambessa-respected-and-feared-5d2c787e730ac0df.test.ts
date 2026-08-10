/**
 * Ruling 5d2c787e730ac0df — Ambessa, Respected and Feared (VEN-136 → ven-136-166) · 5 Might
 *     "[Empowered] I have [Assault 2]. [Empowered] When I attack, kill an enemy unit here with less Might than me."
 *   × Wind and Ghosts (VEN-106 → ven-106-166) · [Action] "Choose a unit at a battlefield. If it has 3 [Might] or less,
 *     banish it. Otherwise, return it to its owner's hand."
 *
 * Q: Does Empowered Ambessa's attack trigger go through before the opponent can Wind-and-Ghosts her back to hand?
 * A: Yes. The "When I attack" trigger goes on the chain as soon as she becomes an attacker, closing the state; Wind and
 *    Ghosts is an Action (not a Reaction) so it can't be played until the chain empties. The trigger resolves and kills
 *    first; only afterwards, in the open showdown, can the opponent play Wind and Ghosts on her.
 * Rules: 383.4.e.2 (attack triggers), 309 / 354.1 (closed state: Reactions only), 340.2 (back to open state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AMBESSA = "ven-136-166";
const WIND_AND_GHOSTS = "ven-106-166";

/** P1's turn. P1's EMPOWERED Ambessa in base; P2 holds bf1 with Victim (3) and Wall (8); P2 has Wind and Ghosts + [3]+chaos. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AMBESSA, "ambessa", { empowered: true })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .hand(P2, WIND_AND_GHOSTS, "wag");
}

async function attack(game: Game): Promise<void> {
  expect(game.state("ambessa").isEmpowered).toBe(true);
  await game.p1.move("ambessa", "bf1");
  // She is an attacker now; her Empowered attack trigger is a chain item → Closed State.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ambessa", controller: P1, triggered: true })]);
}

describe("Ruling 5d2c787e730ac0df — Ambessa's attack trigger resolves before Wind and Ghosts (an Action) can touch her", () => {
  test("while the attack trigger is on the chain P2 gets priority but CANNOT play Wind and Ghosts (Action speed in a Closed State)", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "wag")).toBe(false);
    const r = await game.p2.try((p) => p.cast("wag", { targets: "ambessa" }));
    expect(r.ok).toBe(false);
    // Nothing was added; the trigger is still the only item and Victim is still alive.
    expect(game.chain().map((c) => c.cardId)).toEqual(["ambessa"]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  test("both pass → the trigger resolves and kills Victim (3 < Ambessa's 7 with Assault 2); Ambessa is still on the battlefield", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("victim"); // Wall (8) is never a legal object; Victim is the only smaller enemy here
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("ambessa")).toBe("battlefield-bf1");
    expect(game.state("ambessa").might).toBe(7);
  });

  test("only AFTER the chain empties (open showdown) does P2 get a window for Wind and Ghosts — Ambessa (5+ Might) returns to hand, but Victim is already dead", async () => {
    const game = await board().build();
    await attack(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("victim");
    }
    expect(game.zoneOf("victim")).toBe("trash");
    // Showdown is open again; walk focus to P2.
    for (let i = 0; i < 3 && !(game.actingSeat() === P2 && game.p2.can("cast", "wag")); i++) {
      await game.acting().pass();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "wag")).toBe(true);
    await game.p2.cast("wag", { targets: "ambessa" });
    await game.settle();
    expect(game.zoneOf("wag")).toBe("trash");
    expect(game.zoneOf("ambessa")).toBe("hand");
    expect(game.zoneOf("victim")).toBe("trash"); // the kill already happened and is not undone
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
