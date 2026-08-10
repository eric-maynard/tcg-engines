/**
 * Ruling 6b71d53406111d38 — Defy (OGN-045 → ogn-045-298) · Reaction · Calm · [1][calm]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Action · Fury · [1][fury] — "Deal 3 to a unit at a battlefield."
 *   × Kai'Sa's legend Daughter of the Void (ogn-247-298): "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *   (Malzahar, Fanatic ogn-113-298 is only a nuance about [Add] abilities.)
 *
 * Q: Can you Defy a Hextech Ray that was paid for with Kai'Sa's power-generating ability?
 * A: Yes. Only the PRINTED cost matters for Defy ([1] + one power — within [4]/[rainbow]); the [Add] ability resolves
 *    immediately (never on the chain with the Ray), the Ray is then played with those resources and sits on the chain
 *    like any spell, where Defy can counter it.
 * Rules: [Add] abilities resolve instantly / can't be reacted to; 425 (counter); Defy checks printed cost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298";
const DAUGHTER_OF_THE_VOID = "ogn-247-298";

/** P1's turn. P2's Wall (4) at P2's bf1; P2: Defy + [1][calm]. P1: Kai'Sa legend ready, Hextech Ray, [1] and NO power. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .hand(P2, DEFY, "defy")
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
    .hand(P1, HEXTECH_RAY, "ray")
    .resources(P1, { energy: 1 });
}

/** Kai'Sa adds [rainbow]; P1 plays the Ray at Wall with it; P1 passes → P2 has priority. */
async function rayPaidByKaisaP2ToRespond(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("cast", "ray")).toBe(false); // can't afford the [fury] pip yet
  await game.p1.activate("kaisa");
  // The [Add] ability resolved instantly: nothing on the chain, legend exhausted, a rainbow power in the pool.
  expect(game.chain()).toEqual([]);
  expect(game.state("kaisa").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "ray")).toBe(true);
  await game.p1.cast("ray", { targets: "wall" });
  expect(game.p1.energy()).toBe(0);
  expect(game.p1.power()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["wall"] })]); // the Ray alone — Kai'Sa's ability was never on the chain with it
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6b71d53406111d38 — a Hextech Ray paid for via Kai'Sa's [Add] ability is still just a [1]+[fury] spell: Defy counters it", () => {
  test("Defy is legal against the Ray on the chain (printed cost [1] + one power) and P2 casts it", async () => {
    const game = await rayPaidByKaisaP2ToRespond();
    expect(game.p2.can("cast", "defy")).toBe(true);
    const offered = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["ray"]);
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("Defy resolves and counters the Ray: Wall takes no damage, both spells end in the trash, and P1's spent resources are gone", async () => {
    const game = await rayPaidByKaisaP2ToRespond();
    await game.p2.cast("defy", { targets: "ray" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — un-Defied, the Ray deals 3 to the Wall", async () => {
    const game = await rayPaidByKaisaP2ToRespond();
    await game.p2.passPriority();
    await game.settle();
    expect(game.state("wall").damage).toBe(3);
  });
});
