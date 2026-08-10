/**
 * Ruling 1a248b03ce5bc53e — Ezreal, Dashing (SFD-082 → sfd-082-221) · Champion Unit · Mind · 4 + [mind] · 3 Might
 *     "When I attack or defend, deal damage equal to my Might to an enemy unit here. I don't deal combat damage. …"
 *   × Janna, Savior (SFD-053 → sfd-053-221) · Champion Unit · Calm · 3 + [calm] · [Reaction]
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   (Atakhan unl-170-219 is only cited as the analogous precedent.)
 *
 * Q: Does Ezreal's attack trigger still deal its damage if Janna moves him to base first?
 * A: No. Ezreal's "When I attack" trigger is on the chain; Janna is played as a Reaction to that battlefield, her
 *    play trigger resolves first (LIFO) and moves Ezreal home. When Ezreal's trigger resolves, "here" is now his
 *    base — no enemy unit there — so it has no valid target and whiffs.
 * Rules: 336/340 (LIFO), 359.3.f.2 ("here" evaluated on resolution), FAQ "moving away shifts 'here'".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const JANNA = "sfd-053-221";

/** P1's turn. Ezreal (3) ready in base. P2 holds bf1 with a 2-Might Guard and has Janna + exactly 3 + [calm]. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", EZREAL, "ez")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P2, JANNA, "janna");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Ezreal attacks bf1; his trigger (aimed at the Guard) is pending and priority is with P2. */
async function ezrealAttacks(game: Game): Promise<void> {
  await game.p1.move("ez", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("guard");
  }
  expect(chainIds(game)).toEqual(["ez"]);
  expect(game.chain()[0]).toMatchObject({ controller: P1, targets: ["guard"], triggered: true });
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** P2 plays Janna to bf1 in response and everyone passes; P2 picks Ezreal for "move up to one enemy unit". */
async function jannaSavesTheDay(game: Game): Promise<void> {
  await game.p2.play("janna", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.key)).toContain("ez");
      await game.p2.pick("ez");
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId !== "ez")) {
      await game.acting().passPriority(); // let Janna (and her trigger) resolve — stop once only Ezreal's item is left
      continue;
    }
    break;
  }
}

describe("Ruling 1a248b03ce5bc53e — Janna bounces the attacking Ezreal home; his 'here' damage trigger whiffs", () => {
  test("Ezreal attacks: his 'When I attack' trigger goes on the chain targeting the Guard, and P2 may respond by playing Janna (a Reaction) to that battlefield", async () => {
    const game = await board().build();
    await ezrealAttacks(game);
    expect(game.p2.can("play", "janna")).toBe(true);
    const to = game.p2.option("playUnit", "janna")?.fields.find((f) => f.arg === "to");
    expect(to?.options).toContain("battlefield-bf1"); // "including to a battlefield you control"
    await game.p2.play("janna", { to: "bf1" });
    expect(chainIds(game).slice(0, 2)).toEqual(["ez", "janna"]); // above Ezreal's trigger
  });

  test("LIFO: Janna's play trigger resolves first and moves Ezreal to his base while his trigger is still pending", async () => {
    const game = await board().build();
    await ezrealAttacks(game);
    await jannaSavesTheDay(game);
    expect(game.locationOf("janna")).toBe("bf1");
    expect(game.locationOf("ez")).toBe("base");
    expect(chainIds(game)).toEqual(["ez"]); // Ezreal's trigger has not resolved yet
    expect(game.state("guard").damage).toBe(0);
  });

  test("Ezreal's trigger then resolves with 'here' = his base: no enemy unit there → no damage to the Guard (or anyone); the attack fizzles out and P2 keeps bf1", async () => {
    const game = await board().build();
    await ezrealAttacks(game);
    await jannaSavesTheDay(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("janna").damage).toBe(0);
    expect(game.state("ez").damage).toBe(0);
    expect(game.locationOf("ez")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Janna, the trigger resolves 'here' = bf1 and deals Ezreal's Might (3) to the Guard, killing it", async () => {
    const game = await board().build();
    await ezrealAttacks(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("ez")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
