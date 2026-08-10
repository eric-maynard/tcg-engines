/**
 * Ruling fbac8b0772b03430 — Tideturner (OGN-199 → ogn-199-298) · Chaos · [2] · 2 Might · "[Hidden] When you play me, you may choose a
 *     unit you control at another location. Move me to its location and it to my original location."
 *   × Kayn, Unleashed (OGN-189 → ogn-189-298) · Chaos · [6][chaos] · 6 Might · "[Ganking] If I have moved twice this turn, I don't
 *     take damage."
 *   (Hextech Ray ogn-009-298 "Deal 3 to a unit at a battlefield" is used as the damage probe.)
 *
 * Q: Does Tideturner's swap count as MOVING Kayn for his "moved twice this turn" clause?
 * A: Yes — Tideturner moves both itself and the chosen unit. Kayn swapped by Tideturner and then moved once more has moved
 *    twice and takes no damage.
 * Rules: 450 (Move: a permanent changing location on the board — by any means), Kayn's static, 465.2.c.10 / 437.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const KAYN = "ogn-189-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn. P1 controls bf1 (Kayn, ready) and bf2 (a Holder). Tideturner + Hextech Ray in hand; [2] + [1][fury].
 * P2 just holds a unit in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", KAYN, "kayn")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "by")
    .hand(P1, TIDETURNER, "tide")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Play Tideturner to bf2, accept its "you may", name Kayn (at bf1) and let the trigger resolve: they trade places. */
async function tideSwapsKayn(game: Game): Promise<void> {
  await game.p1.play("tide", { to: "bf2" });
  expect(game.zoneOf("tide")).toBe("battlefield-bf2");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tide" } });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toContain("kayn");
    expect(d.options.map((o) => o.card ?? o.key)).not.toContain("holder"); // same location as Tideturner
    await game.p1.pick("kayn");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tide", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.locationOf("tide")).toBe("bf1");
  expect(game.locationOf("kayn")).toBe("bf2");
}

async function rayKayn(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "kayn" });
  await game.settle();
  expect(game.zoneOf("ray")).toBe("trash");
}

describe("Ruling fbac8b0772b03430 — Tideturner's swap is a Move for Kayn's 'moved twice this turn'", () => {
  test("the swap relocates Kayn bf1 → bf2 without exhausting him: that is ONE move for Kayn (and one for Tideturner)", async () => {
    const game = await board().build();
    await tideSwapsKayn(game);
    expect(game.state("kayn").isReady).toBe(true); // an effect move, not his Standard Move — he can still Gank
    expect(game.state("tide")).toMatchObject({ isExhausted: true, location: "bf1" });
  });

  test("swap (move #1) + Ganking step bf2 → bf1 (move #2): Hextech Ray then deals Kayn NO damage", async () => {
    const game = await board().build();
    await tideSwapsKayn(game);
    await game.p1.gank("kayn", "bf1");
    expect(game.locationOf("kayn")).toBe("bf1");
    expect(game.state("kayn").isExhausted).toBe(true);
    await rayKayn(game);
    expect(game.state("kayn")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("control: WITHOUT the Tideturner swap a single Ganking move (bf1 → bf2) is only one move — the Ray deals its full 3", async () => {
    const game = await board().build();
    await game.p1.gank("kayn", "bf2");
    expect(game.locationOf("kayn")).toBe("bf2");
    await rayKayn(game);
    expect(game.state("kayn")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
  });

  test("control: the swap ALONE is likewise only one move — the Ray still deals 3", async () => {
    const game = await board().build();
    await tideSwapsKayn(game);
    await rayKayn(game);
    expect(game.state("kayn")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
  });
});
