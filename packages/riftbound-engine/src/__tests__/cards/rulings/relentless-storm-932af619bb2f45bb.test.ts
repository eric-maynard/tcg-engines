/**
 * Ruling 932af619bb2f45bb — Relentless Storm (Volibear legend, OGN-249 → ogn-249-298) "When you play a [Mighty] unit, you may
 *   exhaust me to channel 1 rune exhausted."
 *   × Carnivorous Snapvine (OGN-149 → ogn-149-298) · 5+[body][body] · 6 Might "When you play me, choose an enemy unit at a
 *     battlefield. We deal damage equal to our Mights to each other."
 *   (+ Smoke Screen ogn-093-298 / an inline 6-damage Reaction as the opponent's attempts to "un-Mighty" or kill it.)
 *
 * Q: When does Relentless Storm check its condition — can the opponent stop it by killing/weakening the Snapvine after it is
 *    played but before the trigger resolves?
 * A: No. The Snapvine enters (nothing can respond to the unit itself) and BOTH its own trigger and Relentless Storm's trigger
 *    go on the chain together; that is the first moment the opponent can react. The Mighty condition was checked when the unit
 *    entered and is not re-checked on resolution, so shrinking or killing the Snapvine in response does not stop the channel.
 * Rules: 383.4.a (play triggers), 383.3.d (simultaneous triggers), 383.2 (conditions checked when the event happens, not on
 *        resolution), 383.3.a/b (current CR: a leading "you may [cost]" is decided and paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_STORM = "ogn-249-298";
const SNAPVINE = "ogn-149-298";
const SMOKE_SCREEN = "ogn-093-298";
/** P2's inline [Reaction] "Deal 6 to a unit" — enough to kill the Snapvine in response. */
const SNIPE = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Snipe",
  timing: "reaction",
} as const;

/** P1 (Volibear — Relentless Storm, ready) with exactly 5+[body][body] and the Snapvine; P2's Guard (3) at bf1; P2 holds Smoke Screen + Snipe with 3 energy + [mind]. */
function board() {
  return scenario()
    .legend(P1, RELENTLESS_STORM, "storm")
    .resources(P1, { energy: 5, power: { body: 2 } })
    .resources(P2, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, SNAPVINE, "snap")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P2, SNIPE, "snipe");
}

/**
 * Play the Snapvine and walk P1's side (opt-in yes, trigger order as listed, target the Guard, pass) until P2 first holds
 * priority. Returns whether the legend opt-in was asked.
 */
async function playSnapvineUntilP2Priority(game: Game): Promise<{ asked: boolean }> {
  await game.p1.play("snap");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.zoneOf("snap")).toBe("base"); // the unit is in — nothing could respond to that
  let asked = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.seat === P2)) {
      break;
    }
    if (d.kind === "yes-no") {
      expect(d).toMatchObject({ seat: P1, source: { cardId: "storm" } });
      asked = true;
      await game.p1.yes();
    } else if (d.kind === "order") {
      expect(d.seat).toBe(P1); // both triggers are P1's — P1 orders them (383.3.d)
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick") {
      await game.p1.pick("guard");
    } else if (d.kind === "action") {
      await game.p1.passPriority();
    } else {
      break;
    }
  }
  return { asked };
}

/** Drain the rest: P1 answers yes / picks the Guard, everyone passes. */
async function drain(game: Game): Promise<boolean> {
  let asked = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      asked = true;
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options.find((o) => o.key === "guard") ? "guard" : (d.options[0]?.key as string));
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return asked;
}

describe("Ruling 932af619bb2f45bb — Relentless Storm's trigger can't be undone by shrinking or killing the Snapvine in response", () => {
  test("playing the 6-Might Snapvine: it is on the board at once and the FIRST window P2 gets already has BOTH triggers (Snapvine's and Relentless Storm's) on the chain", async () => {
    const game = await board().build();
    await playSnapvineUntilP2Priority(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["snap", "storm"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.state("snap").might).toBe(6);
    expect(game.p1.runes()).toHaveLength(0); // nothing channeled yet
  });

  test("P2 Smoke Screens the Snapvine in that window (6 → 2, no longer Mighty) — Relentless Storm still resolves: legend exhausted, 1 rune channeled EXHAUSTED; the Snapvine trigger then fights the Guard at its current 2 Might", async () => {
    const game = await board().build();
    const first = await playSnapvineUntilP2Priority(game);
    await game.p2.cast("smoke", { targets: "snap" });
    expect(game.chain().map((c) => c.cardId)).toEqual(expect.arrayContaining(["snap", "storm", "smoke"]));
    // Smoke Screen resolves first (LIFO): the Snapvine is a 2 while both triggers still wait.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("snap").might).toBe(2);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["snap", "storm"]); // the Storm item was NOT removed
    const later = await drain(game);
    expect(first.asked || later).toBe(true); // the "you may exhaust me" was P1's to answer
    expect(game.state("storm").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
    expect(game.state("guard").damage).toBe(2); // "damage equal to our Mights": the shrunken 2
    expect(game.zoneOf("snap")).toBe("trash"); // took 3 ≥ 2 back from the Guard
    expect(game.violations()).toEqual([]);
  });

  test("P2 KILLS the Snapvine in that window (Snipe, 6 damage) — the Snapvine is in the trash before either trigger resolves, yet Relentless Storm still resolves and channels the rune exhausted", async () => {
    const game = await board().build();
    await playSnapvineUntilP2Priority(game);
    await game.p2.cast("snipe", { targets: "snap" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Snipe resolves first
    expect(game.zoneOf("snap")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toContain("storm"); // still pending
    await drain(game);
    expect(game.state("storm").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, both triggers resolve — rune channeled exhausted, and the 6-Might Snapvine trades 6 ↔ 3 with the Guard (Guard dies, Snapvine keeps 3 damage)", async () => {
    const game = await board().build();
    await playSnapvineUntilP2Priority(game);
    await drain(game);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("snap")).toMatchObject({ damage: 3, might: 6, zone: "base" });
  });
});
