/**
 * Ruling 53c63bdba2211b80 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] 2+[chaos] · "Move a friendly unit and ready it."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298, battlefield): "When a player chooses a friendly unit here with a spell for the
 *   first time each turn, they draw 1."
 *
 * Q: Does Ride the Wind target, and does moving a unit to/from the Dreaming Tree with it trigger the Tree?
 * A: It targets (chooses) the unit it moves. Choosing a unit that is AT the Tree (to move it away) triggers the draw;
 *    choosing a unit elsewhere and moving it TO the Tree does not (it wasn't "here" when chosen).
 * Rules: 355 (choosing/targets happen as the spell is played), Dreaming Tree's "here" is where the chosen unit is at that moment.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const DREAMING_TREE = "ogn-292-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls the live Dreaming Tree (Dreamer + Anchor there, so it stays P1's when Dreamer leaves) and bf2
 * (Walker there). Ride the Wind + exactly [2][chaos]; known deck top.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "tree", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "bf2", { might: 3, name: "Walker" }, "walker", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Cast Ride the Wind on `unit`, sending it to `dest`, answering the destination whenever it is asked. */
async function ride(game: Game, unit: string, dest: string): Promise<void> {
  const targets = (game.p1.option("cast", "rtw")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(targets).toContain(unit); // Ride the Wind CHOOSES its unit at play time — it targets
  await game.p1.cast("rtw", { targets: unit });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(dest);
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
}

describe("Ruling 53c63bdba2211b80 — Ride the Wind targets; the Dreaming Tree cares where the unit is when chosen", () => {
  test("moving AWAY from the Tree: choosing Dreamer (at the Tree) puts the Tree's draw trigger on the chain; P1 draws 1 and Dreamer ends at bf2 ready", async () => {
    const game = await board().build();
    await ride(game, "dreamer", "battlefield-bf2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("battlefield-bf2");
      } else {
        await game.acting().passPriority();
      }
    }
    await game.settle();
    expect(game.locationOf("dreamer")).toBe("bf2");
    expect(game.state("dreamer").isReady).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("moving TO the Tree: choosing Walker (at bf2) triggers nothing — no Tree item on the chain, no draw — though Walker arrives at the Tree readied", async () => {
    const game = await board().build();
    await ride(game, "walker", "battlefield-tree");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("battlefield-tree");
      } else {
        await game.acting().passPriority();
      }
    }
    await game.settle();
    expect(game.locationOf("walker")).toBe("tree");
    expect(game.state("walker").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("d1");
  });
});
