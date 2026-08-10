/**
 * Ruling b1a076154ab3e793 — Akshan, Mischievous (SFD-109 → sfd-109-221)
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid the
 *    additional cost, move an enemy gear to your base. You control it until I leave the board…"
 *   × Heart of Dark Ice (SFD-052 → sfd-052-221, Gear) "[Exhaust]: Give a unit +3 [Might] this turn."
 *
 * Q: My opponent's Akshan takes my EXHAUSTED Heart of Dark Ice. Is it still exhausted when they take it?
 * A: Yes. A control change only changes the controller, not the object's state — it stays exhausted. Its new
 *    controller readies it during THEIR own turn and is the one who may use its ability.
 * Rules: 108.2 / 477 (control change), 126 (exhausted state is a property of the object), 315.1 (Awaken readies
 *        the turn player's permanents), 159/429 (only the controller activates).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const HEART_OF_DARK_ICE = "sfd-052-221";

/** P1's turn. P2 owns an EXHAUSTED Heart of Dark Ice (its only gear). P1 holds Akshan with 4 + [body][body]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .battlefield("bf1", { controller: null })
    .gear(P2, HEART_OF_DARK_ICE, "heart", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, AKSHAN, "akshan");
}

async function steal(): Promise<Game> {
  const game = await board().build();
  expect(game.state("heart")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason === "unanswered" && d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("heart");
    } else {
      break;
    }
  }
  expect(game.zoneOf("akshan")).toBe("base");
  expect(game.p1.power("body")).toBe(0);
  return game;
}

describe("Ruling b1a076154ab3e793 — a stolen exhausted gear stays exhausted under its new controller", () => {
  test("after Akshan's trigger the Heart is CONTROLLED by P1, still OWNED by P2 — and still EXHAUSTED", async () => {
    const game = await steal();
    expect(game.state("heart")).toMatchObject({ controller: P1, isExhausted: true, owner: P2, zone: "base" });
    expect(game.p1.gear()).toContain("heart");
    expect(game.violations()).toEqual([]);
  });

  test("being exhausted, its [Exhaust] ability is not usable by P1 right now; P2 (no longer the controller) cannot use it either", async () => {
    const game = await steal();
    expect(game.p1.can("activate", "heart")).toBe(false);
    expect(game.p2.can("activate", "heart")).toBe(false);
  });

  test("it does NOT ready during P2's (the owner's) turn — P2's Awaken readies only what P2 controls; P2 still cannot activate it", async () => {
    const game = await steal();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("heart")).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.p2.can("activate", "heart")).toBe(false);
  });

  test("it readies at the start of P1's (the new controller's) own turn, and P1 is the one who may activate it: +3 Might to a unit this turn", async () => {
    const game = await steal();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: Awaken readies P1-controlled permanents
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("heart")).toMatchObject({ controller: P1, isReady: true });
    expect(game.p1.can("activate", "heart")).toBe(true);
    await game.p1.activate("heart", undefined, { answers: ["pal"] });
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason === "unanswered" && d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("pal");
      } else {
        break;
      }
    }
    expect(game.state("heart").isExhausted).toBe(true);
    expect(game.state("pal").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
