/**
 * Ruling 8835d14e8a5669dc — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · 2 + [order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *   × Fight or Flight (OGN-168 → ogn-168-298) "[Hidden][Action] Move a unit from a battlefield to its base."
 *
 * Q: Hidden Blade targets a unit; its controller uses Sett's legend to recall it instead of letting it die — do they
 *    still draw 2?
 * A: Yes. The draw does not depend on the kill succeeding; Hidden Blade resolved on a legal target and can look
 *    back at its controller. Nuances: bounced to hand or moved to BASE (Fight or Flight) before resolution → target
 *    illegal, no draw; moved to ANOTHER battlefield → still "a unit at a battlefield", draw still happens.
 * Rules: 371.2 (optional replacement), 359.3.e.14.b (look-back), 359.3.e.2/.4/.14.a (illegal target → nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const RETREAT = "ogn-104-298";
/** Test-only Reaction that moves a friendly unit anywhere (no printed Reaction-speed battlefield→battlefield mover exists). */
const SIDESTEP = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, to: "choose", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Sidestep",
  rulesText: "[Reaction] Move a friendly unit at a battlefield.",
  timing: "reaction",
} as const;

/**
 * Turn 3, P1 active with 2 + [order] and Hidden Blade in hand. P2: The Boss (ready), 1 [body] for its [rainbow],
 * a BUFFED Brawler (3) at P2's bf1 plus a Holder there; bf2 is P2's too (empty). Known P2 deck top.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { body: 1 } })
    .legend(P2, THE_BOSS, "boss")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Brawler" }, "brawler", { buffed: true })
    .unit(P2, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 casts Hidden Blade at Brawler and passes → P2 holds priority. */
async function bladeOnBrawler(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "brawler" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["brawler"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 8835d14e8a5669dc — Sett saving Hidden Blade's target does not stop the draw; removing the target does", () => {
  test("P2 passes; as the kill executes The Boss's 'you may' surfaces to P2 (the unit's controller) before anything is drawn", async () => {
    const game = await board().build();
    await bladeOnBrawler(game);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    expect(game.zoneOf("brawler")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual([]);
  });

  test("ruling 8835d14e8a5669dc — YES: Brawler is healed, exhausted, un-buffed and recalled instead of dying (Boss exhausted, [rainbow] paid) — and P2 STILL draws 2", async () => {
    const game = await board().build();
    await bladeOnBrawler(game);
    await game.p2.passPriority();
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.p2.trash()).not.toContain("brawler");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power("body")).toBe(0);
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.hand()).toEqual([]); // the TARGET's controller draws, not the caster
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — bounced to hand first (P2 Retreats Brawler in response): Hidden Blade's target is illegal → nobody draws, Boss never asked", async () => {
    const game = await board().hand(P2, RETREAT, "retreat").build();
    await bladeOnBrawler(game);
    await game.p2.cast("retreat", { targets: "brawler" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("hand");
    expect(game.p2.hand()).toEqual(["brawler"]); // no d1/d2
    expect(game.p2.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.state("boss").isReady).toBe(true);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("nuance — moved to BASE first (P2 flips a facedown Fight or Flight on Brawler): no longer 'at a battlefield' → no kill, no draw", async () => {
    const game = await board().facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof").build();
    await bladeOnBrawler(game);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("brawler");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "fof"]);
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler").isBuffed).toBe(true); // never died, Boss never used
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("nuance — moved to ANOTHER battlefield first: still a legal target (Blade was played from hand) → the kill/Sett save happens at bf2 and P2 still draws 2", async () => {
    const game = await board().hand(P2, SIDESTEP, "sidestep").build();
    await bladeOnBrawler(game);
    expect(game.p2.can("cast", "sidestep")).toBe(true);
    await game.p2.cast("sidestep", { targets: "brawler" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf2");
    }
    // Resolve Sidestep (top), then let Hidden Blade resolve; accept the Boss when asked.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P2 && d.options.some((o) => o.key === "battlefield-bf2")) {
        await game.p2.pick("battlefield-bf2");
      } else if (d.kind === "yes-no" && d.seat === P2) {
        expect(game.zoneOf("brawler")).toBe("battlefield-bf2"); // it did move before the Blade resolved
        await game.p2.yes();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("base"); // saved by the Boss
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
  });
});
