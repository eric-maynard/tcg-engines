/**
 * Ruling 118840b622c600d0 — Ember Monk (OGN-167 → ogn-167-298) · 4 Might "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Mask of Foresight (ogn-060-298, Gear) "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Teemo, Scout (ogn-197-298) · [Hidden] 1 Might "When you play me, give me +3 [Might] this turn." — the hidden card at the Monk's battlefield
 *
 * Q: Monk alone at a battlefield, Mask in base, Teemo hidden there; the opponent attacks. Does the Monk keep Mask's +1 after revealing Teemo?
 * A: Yes. Mask's "defends alone" trigger goes on the initial combat chain and resolves +1 (Monk 5); revealing Teemo is a new play-from-hidden
 *    that triggers the Monk's +2 → 7 total. The +1 is not lost when Teemo joins. Nuance: moving to an EMPTY battlefield opens a showdown but
 *    no combat — no attacker/defender designation, so Mask does not trigger.
 * Rules: 464.2 (designations + initial chain when a combat showdown opens), 740.2.a ("alone" checked at designation), 811 (play from hidden),
 *        344/345 (showdown at an empty battlefield is not a combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMBER_MONK = "ogn-167-298";
const MASK_OF_FORESIGHT = "ogn-060-298";
const TEEMO_SCOUT = "ogn-197-298";

/** Turn 3, P2's turn. P1 holds bf1 with a lone Ember Monk (4) and Teemo facedown there (hidden earlier); Mask of Foresight in P1's base. P2's Raider (6). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", EMBER_MONK, "monk")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider");
}

/** Raider attacks bf1; the Mask trigger resolves; P2 passes Focus so P1 may act. */
async function attackedAndMasked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("monk").might).toBe(4);
  await game.p2.move("raider", "bf1");
  expect(game.state("monk").combatRole).toBe("defender");
  expect(game.state("raider").combatRole).toBe("attacker");
  // Mask: "defends alone" → on the initial chain as P1's triggered item.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.state("monk")).toMatchObject({ might: 5, mightModifier: 1 });
  // Focus: attacker first; P2 passes so P1 can flip Teemo.
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 118840b622c600d0 — Ember Monk keeps Mask's +1 and adds +2 when Teemo is revealed: 4 → 5 → 7", () => {
  test("the attack opens a COMBAT showdown: designations are set, Mask's 'defends alone' trigger is on the initial chain and resolves first — Monk 5", async () => {
    await attackedAndMasked();
  });

  test("P1 then reveals the hidden Teemo here (a card played from [Hidden]): the Monk's own trigger gives +2 on top — Monk ends at 7 (the Mask +1 is kept even though he is no longer alone)", async () => {
    const game = await attackedAndMasked();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.locationOf("teemo")).toBe("bf1");
    // Drain the resulting chain (Monk +2, Teemo's own +3) without closing the showdown.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["monk", "teemo"]);
    expect(game.state("monk")).toMatchObject({ might: 7, mightModifier: 3 });
    expect(game.state("teemo").might).toBe(4); // 1 + 3 from its own play trigger
    expect(game.violations()).toEqual([]);
  });

  test("outcome: Monk 7 + Teemo 4 defend against the Raider's 6 — the Raider dies and P1 keeps bf1", async () => {
    const game = await attackedAndMasked();
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("monk")).toBe("bf1");
  });

  test("nuance: moving the Monk onto an EMPTY battlefield opens a showdown but NOT a combat — no defender/attacker designation, so Mask does not trigger and the Monk stays 4", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
      .unit(P1, "base", EMBER_MONK, "monk")
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .build();
    await game.p1.move("monk", "bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("monk").combatRole).toBeFalsy();
    expect(game.chain()).toEqual([]);
    expect(game.state("monk")).toMatchObject({ might: 4, mightModifier: 0 });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("monk").might).toBe(4);
  });
});
