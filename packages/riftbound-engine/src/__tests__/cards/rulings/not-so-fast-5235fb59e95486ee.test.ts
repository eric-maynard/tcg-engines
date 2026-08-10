/**
 * Ruling 5235fb59e95486ee — Not So Fast (SFD-045 → sfd-045-221) · [Reaction] 2+[calm] · "Counter an enemy spell or ability
 *   that chooses a friendly unit or gear."
 *   × Elder Dragon (UNL-118 → unl-118-219) · 10 Might · "Any amount of your damage is enough to kill enemy units. When you
 *   play me, choose up to one enemy unit at each location. Deal 1 to them."
 *
 * Q: Does Not So Fast counter Elder Dragon's whole "When you play me" trigger, or only the part aimed at one unit?
 * A: The whole triggered ability — it is one chain item however many units it chose. Countered, it does nothing and is
 *    removed from the chain: no unit takes damage.
 * Rules: 425.1.a (a countered ability does nothing and is cleared), 331 ff. (one ability = one chain item), 155.2.b.3.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const ELDER_DRAGON = "unl-118-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly [12] + 4 body and Elder Dragon in hand. P2 has one 3-might unit at each of three locations
 * (base, bf1, bf2) and Not So Fast with exactly [2][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "base", { might: 3, name: "Base Dweller" }, "atBase")
    .unit(P2, "bf1", { might: 3, name: "Bf1 Guard" }, "atBf1")
    .unit(P2, "bf2", { might: 3, name: "Bf2 Guard" }, "atBf2")
    .hand(P1, ELDER_DRAGON, "elder")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** Play Elder Dragon and choose one enemy unit at each of the three locations for its trigger. */
async function playDragonChoosingAllThree(game: Game): Promise<void> {
  await game.p1.play("elder", { to: "base" });
  expect(game.zoneOf("elder")).toBe("base");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "elder" } });
    if (d?.kind === "pick") {
      await game.p1.pick(d.options[0]?.key as string);
    }
  }
  const item = game.chain()[0];
  expect(item).toMatchObject({ cardId: "elder", controller: P1, triggered: true });
  expect([...(item?.targets ?? [])].sort()).toEqual(["atBase", "atBf1", "atBf2"]); // ONE chain item, three chosen units
  expect(game.chain()).toHaveLength(1);
}

describe("Ruling 5235fb59e95486ee — Not So Fast counters Elder Dragon's entire play trigger", () => {
  test("baseline: unanswered, the trigger deals 1 to each chosen unit — lethal under the Dragon's passive, all three die", async () => {
    const game = await board().build();
    await playDragonChoosingAllThree(game);
    await game.settle();
    expect(game.zoneOf("atBase")).toBe("trash");
    expect(game.zoneOf("atBf1")).toBe("trash");
    expect(game.zoneOf("atBf2")).toBe("trash");
  });

  test("P2 answers with Not So Fast targeting the trigger (it chose P2's units): it resolves first and counters the WHOLE ability — removed from the chain, no unit anywhere takes damage", async () => {
    const game = await board().build();
    await playDragonChoosingAllThree(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const offered = (game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["elder"]); // the ability as a single object — not one entry per chosen unit
    await game.p2.cast("nsf", { targets: "elder" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "nsf"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Not So Fast resolves → the trigger is countered and cleared
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    await game.settle();
    for (const u of ["atBase", "atBf1", "atBf2"]) {
      expect(game.zoneOf(u)).not.toBe("trash");
      expect(game.state(u).damage).toBe(0);
    }
    expect(game.zoneOf("elder")).toBe("base"); // the Dragon itself is unaffected — only its ability was countered
    expect(game.violations()).toEqual([]);
  });
});
