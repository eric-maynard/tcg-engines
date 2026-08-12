/**
 * Ruling 76187f26da40c936 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] · "Move an enemy unit."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can a hidden Zhonya's be revealed as a reaction to save a unit that is being moved around / pulled off a
 *    battlefield?
 * A: Yes — hidden cards have Reaction speed, so they can be revealed in answer to any action, including a Charm on
 *    the chain; and a gear revealed at a battlefield goes to your base. Once it is out it protects your units:
 *    a Zhonya's hidden at ONE battlefield can be revealed during a showdown at a DIFFERENT battlefield and still
 *    save the unit there (killed instead → healed, exhausted, recalled home).
 * Rules: 811.1.d ([Hidden] cards are played at Reaction speed), 723.3 (a revealed gear at a battlefield goes to
 *        base), 370–373 (die replacement), 461 (combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn. P2 holds bf1 (Holder) and bf2 (a 3-Might Defender), with Zhonya's hidden at bf1. P1: Crusher (9) + Charm. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 9, name: "Crusher" }, "crusher")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .hand(P1, CHARM, "charm");
}

/** P1 Charms the Defender toward bf1 and passes priority, leaving the Charm on the chain. */
async function charmOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "def", answers: ["bf1"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 76187f26da40c936 — a hidden Zhonya's answers at Reaction speed and lands in base", () => {
  test("with a Charm sitting on the chain P2 may reveal the hidden Zhonya's — [Hidden] gives it Reaction speed", async () => {
    const game = await charmOnChain();
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p2.can("reveal", "zh")).toBe(true);
    await game.p2.reveal("zh");
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]); // the Charm is untouched
  });

  test("revealing the gear at a battlefield sends it to P2's BASE, not to bf1", async () => {
    const game = await charmOnChain();
    await game.p2.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.locationOf("zh")).toBe("base");
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p2.facedown("bf1")).toEqual([]);
  });

  // Zhonya's protects against DYING, not against being moved: the Charm still relocates the Defender. What the
  // reveal buys P2 is the standing die-replacement, exercised in the combat cases below.
  test("the Charm still resolves and moves the Defender — the reveal did not counter it", async () => {
    const game = await charmOnChain();
    await game.p2.reveal("zh");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.zoneOf("zh")).toBe("base");
  });

  test("cross-battlefield save: Zhonya's hidden at bf1 is revealed during a showdown at bf2 and rescues the unit dying THERE", async () => {
    const game = await board().build();
    await game.p1.move("crusher", "bf2"); // 9 vs a 3-Might Defender: lethal
    expect(game.state("def").combatRole).toBe("defender");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "zh")).toBe(true);
    await game.p2.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base");
    await game.settle();
    // "kill this instead. Heal that unit, exhaust it, and recall it."
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("def")).not.toBe("trash");
    expect(game.state("def")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("control — no reveal: the same combat simply kills the Defender", async () => {
    const game = await board().build();
    await game.p1.move("crusher", "bf2");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("zh")).not.toBe("base");
  });
});
