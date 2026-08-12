/**
 * Ruling 9c4bc6734075adf1 — Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · 6 · 5 [Might]
 *   "When you play me, opponents can't play cards this turn."
 *
 * Q: Can the opponent answer Thundersong with reactions?
 * A: Yes. A unit itself cannot be responded to (a permanent resolves as it is finalized), but the
 *    "when you play me" TRIGGER is a chain item the opponent may react to. Nuance: Brynhir counters
 *    nothing — items already finalized on the chain still resolve even after her ban lands.
 * Rules: 337.2 (permanents resolve on finalize), 383 (play triggers are chain items), 359.3.c
 *    (others may react before an item resolves), 425 (only a counter removes an item).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";

const reactionPing = (name: string): InlineCardDef => ({
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name,
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
});

/** P1's turn with Brynhir in hand; P2 holds two identical Reactions and a 6-Might unit to shoot at. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .resources(P2, { energy: 4 })
    .unit(P2, "base", { might: 6, name: "Target" }, "target")
    .hand(P1, BRYNHIR, "brynhir")
    .hand(P2, reactionPing("Filler Snap Ping A"), "pingA")
    .hand(P2, reactionPing("Filler Snap Ping B"), "pingB");
}

/** P1 plays Brynhir: she lands immediately, her trigger goes on the chain. */
async function playBrynhir(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("brynhir");
  expect(game.zoneOf("brynhir")).toBe("base"); // 337.2 — the permanent is already on the board
  expect(game.chain().map((c) => c.cardId)).toEqual(["brynhir"]);
  expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
  return game;
}

describe("Ruling 9c4bc6734075adf1 — Thundersong's trigger is respondable; the unit itself is not", () => {
  test("the unit is on the board before anyone gets priority — only the TRIGGER can be answered", async () => {
    const game = await playBrynhir();
    expect(game.zoneOf("brynhir")).toBe("base");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "pingA")).toBe(true); // the ban has not resolved yet
  });

  test("P2's reaction goes on top of the trigger and resolves first, before the ban exists", async () => {
    const game = await playBrynhir();
    await game.p1.passPriority();
    await game.p2.cast("pingA", { targets: "target" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["brynhir", "pingA"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("pingA")).toBe("trash");
    expect(game.state("target").damage).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["brynhir"]);
  });

  test("the ban only bites once the trigger has RESOLVED — after that P2 cannot play cards this turn", async () => {
    const game = await playBrynhir();
    await game.p1.passPriority();
    await game.p2.cast("pingA", { targets: "target" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "pingB")).toBe(false);
    const denied = await game.p2.try((p) => p.cast("pingB", { targets: "target" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("pingB")).toBe("hand");
  });

  test("nuance: Brynhir counters nothing — a reaction finalized before her trigger resolved still resolves in full", async () => {
    const game = await playBrynhir();
    await game.p1.passPriority();
    await game.p2.cast("pingA", { targets: "target" });
    await game.p2.cast("pingB", { targets: "target" }); // P2 stacks a second one while holding priority
    expect(game.chain().map((c) => c.cardId)).toEqual(["brynhir", "pingA", "pingB"]);
    await game.settle();
    expect(game.zoneOf("pingA")).toBe("trash");
    expect(game.zoneOf("pingB")).toBe("trash");
    expect(game.state("target").damage).toBe(4); // BOTH resolved
  });

  test("the ban is 'this turn' only: on P2's own turn they may play cards again", async () => {
    const game = await playBrynhir();
    await game.settle();
    expect(game.p2.can("cast", "pingA")).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.can("cast", "pingA")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
