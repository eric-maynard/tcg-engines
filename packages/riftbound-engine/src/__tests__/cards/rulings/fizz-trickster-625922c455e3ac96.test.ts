/**
 * Ruling 625922c455e3ac96 — Fizz, Trickster (SFD-140 → sfd-140-221) · Unit · Chaos · [3][chaos] · 3 Might
 *   "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy
 *    cost. Recycle that spell after you play it."
 *   (Kai'Sa, Evolutionary ogn-112-298 has the same "Then recycle it" rider.)
 *   × Hextech Ray (ogn-009-298, [1][fury] "Deal 3 to a unit at a battlefield") as the replayed spell; Wind Wall
 *     (ogn-064-298, "Counter a spell") as the thing that makes it leave the chain another way.
 *
 * Q: Is the "recycle it" a delayed replacement effect or a delayed triggered ability?
 * A: A delayed REPLACEMENT effect — "if that spell would leave the chain for any reason, recycle it instead". So the
 *    spell is recycled whether it resolves or is countered; it never hits the trash.
 * Rules: 369–372 (replacement effects), 425 (a countered spell would normally go to trash).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const HEXTECH_RAY = "ogn-009-298";
const WIND_WALL = "ogn-064-298";

/** P1's turn. P2's Wall (5) at P2's bf1. P1: Fizz in hand, Hextech Ray in trash, [3] + chaos + fury. P2: Wind Wall + [3] + 2 calm. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, HEXTECH_RAY, "ray")
    .resources(P1, { energy: 3, power: { chaos: 1, fury: 1 } })
    .hand(P2, WIND_WALL, "windwall")
    .resources(P2, { energy: 3, power: { calm: 2 } });
}

/** Play Fizz, accept the trigger choosing the Ray; let the trigger resolve so the Ray is played onto the chain; stop at P2's priority on the Ray. */
async function fizzReplaysRay(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const o = d.options.find((x) => (x.card ?? x.key) === "ray") ?? d.options.find((x) => (x.card ?? x.key) === "wall") ?? d.options[0]!;
      await game.p1.pick(o.card ?? o.key);
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, targets: ["ray"], triggered: true })]);
  // Resolve Fizz's trigger → the Ray is PLAYED from trash (a new spell on the chain, aimed at the Wall).
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "ray") && d.seat === P2) {
      break;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d?.kind === "pick" && d.seat === P1) {
      const o = d.options.find((x) => (x.card ?? x.key) === "wall") ?? d.options[0]!;
      await game.p1.pick(o.card ?? o.key);
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["wall"], triggered: false })]);
  expect(game.zoneOf("ray")).toBe("chain");
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 625922c455e3ac96 — Fizz's 'recycle it' is a replacement: the replayed spell is recycled however it leaves the chain", () => {
  test("resolves normally: the Ray deals 3 to the Wall and is RECYCLED (bottom of P1's deck), not trashed", async () => {
    const game = await fizzReplaysRay();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ray");
    expect(game.p1.trash()).not.toContain("ray");
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("countered by Wind Wall (leaves the chain 'for another reason'): no damage, and the Ray is STILL recycled instead of going to the trash", async () => {
    const game = await fizzReplaysRay();
    expect(game.p2.can("cast", "windwall")).toBe(true);
    await game.p2.cast("windwall", { targets: "ray" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "windwall"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(0); // countered
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("mainDeck"); // replacement: recycled, not trashed
    expect(game.p1.deck().at(-1)).toBe("ray");
    expect(game.p1.trash()).not.toContain("ray");
    expect(game.violations()).toEqual([]);
  });
});
