/**
 * Ruling 25b00b80ac336276 — Flash (OGS-011 → ogs-011-024, Reaction, 2) "Move up to 2 friendly units to base."
 *   × Dragon's Rage (ogn-258-298, 4 + [rainbow]) "Move an enemy unit. Then do this: Choose another enemy unit at its
 *     destination. They deal damage equal to their Mights to each other."
 *
 * Q: Can Flash be used to stop Dragon's Rage from making my units strike each other?
 * A: Yes, in response — but note only the TARGET unit is declared when Dragon's Rage is played; its destination is chosen
 *    when the spell resolves. If Flash first gathers ALL your units in one location, the target cannot be "moved" to where
 *    it already is, so no other unit is at its destination and no strike happens. If your units are still split across
 *    locations, the caster simply sends the target to one of them and the strike happens.
 * Rules: 355.4 (choices made at play vs. at resolution), 387/388 (reflexive "Then do this"), 140 (a move changes location).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const DRAGONS_RAGE = "ogn-258-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P2: A (3) at P2's bf1, B (4) at P2's bf2, Flash + 2 energy. P1: Dragon's Rage with exactly 4 + [rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "A" }, "a")
    .unit(P2, "bf2", { might: 4, name: "B" }, "b")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "mine")
    .hand(P1, DRAGONS_RAGE, "dr")
    .hand(P2, FLASH, "flash");
}

const isDestination = (d: Decision | null): d is Pick =>
  d?.kind === "pick" && d.seat === P1 && /destination/i.test(d.prompt);

/** Answer any P1 prompt of Dragon's Rage: destination → first of `prefer` that is offered; "another enemy unit" → B. */
async function answerRage(game: Game, prefer: readonly string[]): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (isDestination(d)) {
      const key = prefer.find((p) =>
        d.options.some((o) => o.key === p || o.key === `battlefield-${p}`),
      );
      expect(key).toBeDefined();
      await game.p1.pick(
        d.options.find((o) => o.key === key || o.key === `battlefield-${key}`)!.key,
      );
    } else if (
      d?.kind === "pick" &&
      d.seat === P1 &&
      d.options.some((o) => (o.card ?? o.key) === "b")
    ) {
      await game.p1.pick("b");
    } else {
      return;
    }
  }
}

/** Cast Dragon's Rage on A; drive to P2's first priority window (answering a play-time destination prompt if the engine raises one). */
async function rageOnA(game: Game, prefer: readonly string[]): Promise<void> {
  await game.p1.cast("dr", { targets: "a" });
  await answerRage(game, prefer);
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "dr", controller: P1, targets: ["a"] }),
  ]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** Pass/answer until the chain is empty and P1's main phase is open. */
async function finish(game: Game, prefer: readonly string[]): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await answerRage(game, prefer);
    const d = game.decision();
    if (d?.kind === "action" && d.context === "main") {
      return;
    }
    if (d?.kind === "action") {
      await game.seat(d.seat).pass();
    }
  }
}

describe("Ruling 25b00b80ac336276 — Flash in response to Dragon's Rage", () => {
  test("control (no Flash): A is sent to bf2 where B stands → they strike each other: A (3) takes 4 and dies, B takes 3", async () => {
    const game = await board().build();
    await rageOnA(game, ["bf2"]);
    await finish(game, ["bf2"]);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    expect(game.zoneOf("dr")).toBe("trash");
  });

  test("Flash is a legal response while Dragon's Rage waits on the chain, and it resolves first (LIFO)", async () => {
    const game = await board().build();
    await rageOnA(game, ["bf2"]);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["a", "b"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dr", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dr"]); // Rage still to resolve
  });

  // Expected: playing Dragon's Rage declares only the target unit; the destination is asked when the spell RESOLVES
  // (so it can react to where the enemy units are by then). Actual: the engine asks P1 for A's destination at play
  // time (a FIN prompt right after the cast) and locks it onto the chain item.
  test(
    "ruling 25b00b80ac336276 — the destination is asked when Dragon's Rage RESOLVES, not when it is played",
    async () => {
      const game = await board().build();
      await game.p1.cast("dr", { targets: "a" });
      expect(isDestination(game.decision())).toBe(false); // only the target is declared now
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
      await game.p1.passPriority();
      await game.p2.passPriority(); // resolves → NOW the destination is asked
      const d = game.decision();
      expect(isDestination(d)).toBe(true);
      expect((d as Pick).timing).toBe("RES");
    },
  );

  test("Flash gathers ALL of P2's units (A and B) in base before Rage resolves → A can't be 'moved' to where it is, nothing else is at any destination → no strike: A and B both undamaged", async () => {
    const game = await board().build();
    await rageOnA(game, ["bf2", "bf1"]);
    await game.p2.cast("flash", { targets: ["a", "b"] });
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (isDestination(d)) {
        // A stands in base now: base must not be offered as its destination.
        expect(d.options.map((o) => o.key)).not.toContain("base");
      }
      await answerRage(game, ["bf2", "bf1"]);
      const now = game.decision();
      if (now?.kind === "action" && now.context === "main") {
        break;
      }
      if (now?.kind === "action") {
        await game.seat(now.seat).pass();
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dr")).toBe("trash");
    expect(game.zoneOf("a")).not.toBe("trash");
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // Expected: with P2's units still in DIFFERENT locations after Flash (only B flashed home: A at bf1, B in base), the
  // caster picks the destination at resolution, sends A to base, and A and B strike (A dies to 4, B takes 3).
  // Actual: the destination was locked to bf2 at play time, A is moved to the now-empty bf2 and no strike occurs.
  test(
    "ruling 25b00b80ac336276 — units left in different locations should still be made to strike (destination chosen on resolution)",
    async () => {
      const game = await board().build();
      await rageOnA(game, ["bf2"]);
      await game.p2.cast("flash", { targets: ["b"] }); // only B goes home; A stays at bf1
      await finish(game, ["base", "bf2"]);
      expect(game.zoneOf("b")).toBe("base");
      expect(game.zoneOf("a")).toBe("trash"); // moved to base, struck by B (4 ≥ 3)
      expect(game.state("b").damage).toBe(3);
    },
  );
});
