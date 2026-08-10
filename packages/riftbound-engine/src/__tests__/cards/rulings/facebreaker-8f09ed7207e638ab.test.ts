/**
 * Ruling 8f09ed7207e638ab — Facebreaker (OGN-220 → ogn-220-298) · [Hidden] Action [2] "Stun a friendly unit and an enemy unit at
 *     the same battlefield."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield "When a player chooses a friendly unit here with a spell for the first
 *     time each turn, they draw 1."   (+ Flash ogs-011-024 for the "loses its target" nuance.)
 *
 * Q: I flip a hidden Facebreaker during a showdown at The Dreaming Tree — do I draw?
 * A: Yes. Facebreaker chooses a friendly unit there (that it also chooses an enemy is irrelevant). The Tree's trigger goes on the
 *    chain as soon as the spell is cast, resolves first (draw 1), then Facebreaker resolves. Because it keys on the CAST, the
 *    draw stands even if Facebreaker later loses a target / fizzles.
 * Rules: 383.4.b.2 (targeting triggers fire on finalization), 340 (LIFO), 811 (hidden ⇒ Reaction, targets "here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const DREAMING_TREE = "ogn-292-298";
const FLASH = "ogs-011-024";

/**
 * Turn 3, P2's turn. P1 controls the LIVE Dreaming Tree with Guard (4) — and optionally a second unit, Page (1) — and has
 * Facebreaker facedown there. P2's Raider (5) attacks from base; P2 also holds Flash + [2]. P1's deck top: d1, d2.
 */
function board(friendlyUnits: 1 | 2) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "tree", { might: 4, name: "Guard" }, "guard")
    .facedown(P1, "tree", FACEBREAKER, "fb")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, FLASH, "flash")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
  if (friendlyUnits === 2) {
    s.unit(P1, "tree", { might: 1, name: "Page" }, "page");
  }
  return s;
}

/** Raider attacks the Tree; P2 passes Focus; P1 flips Facebreaker choosing [Guard, Raider]. */
async function flipFacebreaker(friendlyUnits: 1 | 2): Promise<Game> {
  const game = await board(friendlyUnits).build();
  await game.p2.move("raider", "tree");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fb")).toBe(true);
  await game.p1.reveal("fb");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    const hit = d.options.find((o) => (o.card ?? o.key) === "guard") ?? d.options.find((o) => (o.card ?? o.key) === "raider");
    await game.p1.pick((hit as { key: string }).key);
  }
  expect(game.chain()[0]).toMatchObject({ cardId: "fb", controller: P1, targets: ["guard", "raider"] });
  expect(game.p1.energy()).toBe(0); // played from hidden for [0]
  return game;
}

describe("Ruling 8f09ed7207e638ab — flipping a hidden Facebreaker at The Dreaming Tree draws a card", () => {
  test("the Tree's trigger goes on the chain IMMEDIATELY when Facebreaker is cast (above it), before anything resolves — P1 hasn't drawn yet, nobody is stunned yet", async () => {
    const game = await flipFacebreaker(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("guard").isStunned).toBe(false);
  });

  test("LIFO: the Tree trigger resolves first (P1 draws d1) while Facebreaker still waits; then Facebreaker resolves and stuns Guard + Raider", async () => {
    const game = await flipFacebreaker(2);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb"]);
    expect(game.state("guard").isStunned).toBe(false);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]); // exactly one draw
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the draw keys on the CAST — if P2 Flashes the Raider home in response (Facebreaker loses its enemy target), P1 still drew", async () => {
    const game = await flipFacebreaker(2);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "raider" });
    // (Flash itself chooses a unit friendly to P2 at the Tree, so the symmetric Tree triggers for P2 too.)
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "tree", "flash", "tree"]);
    expect(game.chain()[3]).toMatchObject({ controller: P2, triggered: true });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("raider")).toBe("base");
    expect(game.state("raider").isStunned).toBe(false); // no longer at the battlefield when Facebreaker resolved
    expect(game.p1.hand()).toEqual(["d1"]); // the Tree draw happened regardless
    expect(game.zoneOf("fb")).toBe("trash");
  });

  // Expected: exactly as above when Guard is P1's ONLY unit at the Tree — the friendly choice is forced but it is still a
  // choice made "with a spell", so the Tree triggers and P1 draws.
  // Actual: when the hidden Facebreaker's friendly target is auto-locked (single candidate here), the engine never raises the
  // Tree's "chooses a friendly unit here" trigger: chain is just [fb] and P1 draws nothing.
  test("ruling 8f09ed7207e638ab — with a single (auto-locked) friendly unit the flipped Facebreaker does not trigger The Dreaming Tree; expected the trigger on the chain and a draw", async () => {
    const game = await flipFacebreaker(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "tree"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.state("raider").isStunned).toBe(true);
  });
});
