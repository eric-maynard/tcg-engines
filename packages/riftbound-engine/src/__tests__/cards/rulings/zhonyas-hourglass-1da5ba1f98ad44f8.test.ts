/**
 * Ruling 1da5ba1f98ad44f8 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   (+ Void Seeker ogn-024-298 "[Action] Deal 4 to a unit at a battlefield. Draw 1." ×2 as the threats.)
 *
 * Q: If Zhonya's is hidden at a battlefield, does it automatically trigger when a unit dies, or can you choose which
 *    unit to save after seeing which one is threatened?
 * A: A hidden card is never forced — you play it whenever you could play a Reaction. You may wait to see which unit is
 *    threatened and flip it then. If all units would die simultaneously (combat damage) you must flip it before damage.
 * Rules: 811 (hidden ⇒ may be played as a Reaction for [0]; never mandatory), 366/370 (replacement only while in play),
 *        465.2 (no priority during combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with two Void Seekers paid for. P1 holds bf1 with A (2) and B (2) and Zhonya's face down there. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a")
    .unit(P1, "bf1", { might: 2, name: "B" }, "b")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .hand(P2, VOID_SEEKER, "vs1")
    .hand(P2, VOID_SEEKER, "vs2")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute");
}

/** P2 Void-Seekers A; P1, holding priority with a legal reveal, chooses NOT to flip; A dies. */
async function letADie(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("vs1", { targets: "a" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "zh")).toBe(true); // could flip here …
  await game.p1.passPriority(); // … but chooses not to
  expect(game.zoneOf("a")).toBe("trash");
  return game;
}

describe("Ruling 1da5ba1f98ad44f8 — a hidden Zhonya's is never forced; flip it (Reaction) for the unit you want to save", () => {
  test("not automatic: A dies to Void Seeker while Zhonya's stays face down at bf1, untouched", async () => {
    const game = await letADie();
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
  });

  test("wait and see: when the SECOND Void Seeker targets B, P1 flips Zhonya's in response (for [0]); it enters play first, then replaces B's death — Hourglass killed, B healed/exhausted/recalled", async () => {
    const game = await letADie();
    await game.p2.cast("vs2", { targets: "b" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(0);
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.zoneOf("zh")).toBe("base");
    await game.settle();
    expect(game.zoneOf("vs2")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("or flip it for the FIRST threat instead — the choice of which unit to save is P1's: A saved, then B dies to the second Seeker with Zhonya's already spent", async () => {
    const game = await board().build();
    await game.p2.cast("vs1", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    await game.p2.cast("vs2", { targets: "b" });
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
  });

  test("simultaneous combat deaths: the flip must come during the showdown (P1 has a legal reveal while holding Focus); once both pass, damage is dealt with no window and both defenders die with Zhonya's still face down (then discarded with the lost battlefield)", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
