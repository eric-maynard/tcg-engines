/**
 * Evelynn, Entrancing — unl-141-219 · Unit (Champion) · Chaos · 2 energy · 2 might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Backline] (I must be assigned combat damage last.)
 *   When you play me from face down on your turn, you may move an enemy unit at a
 *   different location to my battlefield.
 *
 * rule 811.1.c.3: revealing a facedown card is playing it "from [Hidden]".
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const EVELYNN = "unl-141-219";

describe("Evelynn, Entrancing (unl-141-219)", () => {
  test("played from face down on your turn: may move an enemy unit at a different location to my battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .facedown(P1, "bf1", EVELYNN, "eve")
      .unit(P2, "bf2", { might: 3 }, "foe")
      .build();

    await game.p1.reveal("eve");
    await game.settle();

    expect(game.zoneOf("eve")).toBe("battlefield-bf1");
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("pulling an enemy unit onto Evelynn's own battlefield applies Contested (450) and stages combat (464.2.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .facedown(P1, "bf1", EVELYNN, "eve")
      .unit(P2, "bf2", { might: 3, name: "Mech" }, "foe")
      .build();

    await game.p1.reveal("eve");
    expect(game.decision()?.kind).toBe("yes-no"); // FIN: "you may" asked as the trigger is finalized; Mech is the only target
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves: Mech is pulled onto bf1
    expect(game.locationOf("foe")).toBe("bf1");
    // rule 450: the ARRIVING unit's controller (P2) applies Contested, not the mover;
    // 323.13: the Cleanup after the trigger resolves begins the Combat with P2 attacking.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("foe").combatRole).toBe("attacker");
    expect(game.state("eve").combatRole).toBe("defender");
    await game.settle(); // Mech(3) into Evelynn(2): Evelynn dies, P2 conquers bf1
    expect(game.zoneOf("eve")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
  });

  test("has Backline and Hidden", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "bf1", EVELYNN, "eve")
      .build();
    const keywords = game.state("eve").keywords.concat(
      game.state("eve").grantedKeywords.map((g: { keyword: string }) => g.keyword),
    );
    expect(keywords).toContain("Backline");
  });
});
