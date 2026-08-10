/**
 * Ruling d2c49b838e6670ec — Reflection token (UNL-T06 → unl-t06) "(I become a copy of something when played…)" here a Temporary
 *   copy of Glasc Mixologist (SFD-165 → sfd-165-221) · 5 Might "[Deathknell] — You may play a unit with cost no more than [3] and no
 *   more than [rainbow] from your trash, ignoring its cost."   (token made by Mirror Image unl-200-219: "…copy of that unit. Give it
 *   [Temporary].")
 *
 * Q: My Reflection-of-Mixologist alone holds a battlefield. My Beginning Phase starts, Temporary kills it, and its Deathknell plays a
 *    unit from my trash onto that battlefield. Do I score the hold?
 * A: Yes. While the Deathknell item is on the chain you cannot lose control of the battlefield (nothing is checked in a Closed
 *    state), the replacement unit arrives there, and control is maintained through the Beginning Phase → the Hold scores.
 * Rules: 816 (Temporary, before scoring), 808 (Deathknell), 187.4.c / 323.6 (control only lapses in an Open-state cleanup),
 *        464.2 / 315 (Hold scored in the Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const MIRROR_IMAGE = "unl-200-219";
const REVIVED = { cardType: "unit", energyCost: 2, might: 2, name: "Revived Help" };

/** P1's turn. P1: Glasc in base (copy model), Mirror Image + [3]+2 rainbow, a 2-cost unit in trash. bf1 empty/uncontrolled; P2 holds bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", GLASC, "glasc")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .trash(P1, REVIVED, "revived");
}

/** Make the Temporary Reflection-of-Mixologist, walk it onto bf1 (conquer, 1 pt), pass P2's turn; return at P1's Beginning Phase. */
async function reflectionHoldingIntoBeginning(): Promise<{ game: Game; token: string }> {
  const game = await board().build();
  await game.p1.cast("mirror", { targets: "glasc" });
  await game.settle();
  const token = game.p1.units("base").find((u) => game.state(u).isToken);
  expect(token).toBeDefined();
  expect(game.state(token as string)).toMatchObject({ isReady: true, isToken: true, might: 5, name: "Glasc Mixologist" });
  expect(game.state(token as string).keywords).toEqual(expect.arrayContaining(["Temporary", "Deathknell"]));
  await game.p1.move(token as string, "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1); // the conquer this turn
  await game.p1.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.zoneOf(token as string)).toBe("battlefield-bf1"); // Temporary waits for its CONTROLLER's Beginning Phase
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return { game, token: token as string };
}

describe("Ruling d2c49b838e6670ec — Temporary Reflection dies at turn start, its Deathknell re-mans the battlefield, and the Hold still scores", () => {
  test("step by step: Temporary trigger → token gone, Deathknell on the chain with bf1 STILL P1's → P1 chooses Revived Help and bf1 as destination → it lands there → Hold scored (1 → 2)", async () => {
    const { game, token } = await reflectionHoldingIntoBeginning();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: token, controller: P1, triggered: true })]); // Temporary's kill
    expect(game.p1.points()).toBe(1); // scoring has not happened yet ("before scoring")
    let sawDeathknellWithControl = false;
    let destinationKeys: string[] = [];
    for (let i = 0; i < 24 && game.phase() === "beginning"; i++) {
      const d: Decision | null = game.decision();
      if (!d) {
        break;
      }
      if (game.zoneOf(token) === "gone" && game.chain().length > 0) {
        // The token has died; while its Deathknell (or the replayed unit) is on the chain, control of bf1 has NOT lapsed.
        expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
        sawDeathknellWithControl = true;
      }
      if (d.kind === "yes-no") {
        expect(d).toMatchObject({ seat: P1, source: { cardId: token } }); // the Deathknell "you may"
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        const keys = d.options.map((o) => o.key);
        if (keys.includes("revived")) {
          await game.p1.pick("revived");
        } else {
          destinationKeys = keys;
          expect(keys).toContain("battlefield-bf1");
          await game.p1.pick("battlefield-bf1");
        }
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(sawDeathknellWithControl).toBe(true);
    expect(destinationKeys).toContain("battlefield-bf1");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf(token)).toBe("gone");
    expect(game.zoneOf("revived")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2); // +1 for holding bf1 this Beginning Phase
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual(["bf1"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining the Deathknell leaves bf1 empty — control lapses once the chain is gone and NO hold point is scored", async () => {
    const { game, token } = await reflectionHoldingIntoBeginning();
    for (let i = 0; i < 24 && game.phase() === "beginning"; i++) {
      const d: Decision | null = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.no();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf(token)).toBe("gone");
    expect(game.zoneOf("revived")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
  });
});
