/**
 * Ruling 501859c86f8d2b1e — Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that
 *   unit, exhaust it, and recall it." × Sett, Brawler (OGN-164 → ogn-164-298, 4 Might, "When I'm played … buff me")
 *   with Icathian Rain (ogn-248-298, "Deal 2 to a unit." ×6), The Boss (ogn-269-298, Sett legend save) and a Deathknell unit
 *   (Watchful Sentry ogn-096-298 "[Deathknell] — Draw 1").
 *
 * Q: Icathian Rain (damage in several instances) vs a unit protected by Sett's legend / Zhonya's, or a Deathknell unit — how do
 *    targeting and the saves resolve?
 * A: All six targets are fixed before any damage is dealt. Each instance then resolves in order; when an instance would kill the
 *    unit and a replacement (Boss / Zhonya's) saves it, the unit never left — it stays the same valid target and later instances
 *    keep hitting it (a buffed 5-Might Sett Brawler saved once dies to the 5th instance). If a unit really dies, its Deathknell
 *    goes on the chain after that instance and remaining instances aimed at it do nothing.
 * Rules: 355 (targets fixed up front), 359.3.e.8 (instructions execute in order, each followed by its consequences), 371–373.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const THE_BOSS = "ogn-269-298";
const SETT_BRAWLER = "ogn-164-298";
const ZHONYAS = "ogn-077-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P2's turn with exactly Icathian Rain's [7] + 3 rainbow. P1 (The Boss, 1 body for its [rainbow]) holds bf1 with a BUFFED Sett, Brawler (4+1 = 5) and a 5-Might Rock. */
function settBoard() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { body: 1 } })
    .resources(P2, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT_BRAWLER, "sett", { buffed: true })
    .unit(P1, "bf1", { might: 5, name: "Rock" }, "rock")
    .hand(P2, ICATHIAN_RAIN, "rain");
}

/** Resolve everything; P1 says YES to the Boss whenever asked; count how often it was asked. */
async function resolveSayingYes(game: Game): Promise<number> {
  let bossAsked = 0;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      bossAsked += d.source?.cardId === "boss" ? 1 : 0;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]!.key);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return bossAsked;
}

describe("Ruling 501859c86f8d2b1e — Icathian Rain's instances resolve one by one against replacement-saved units", () => {
  test("all six targets are locked in before any damage is dealt (the chain item already names them; nothing is damaged yet)", async () => {
    // (The engine takes the six choices as the spell is put on the chain; either way they are all fixed before instance #1.)
    const game = await settBoard().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    await game.p2.cast("rain", { targets: ["sett", "sett", "sett", "sett", "sett", "rock"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rain", targets: ["sett", "sett", "sett", "sett", "sett", "rock"] })]);
    expect(game.state("sett").damage).toBe(0);
    expect(game.state("rock").damage).toBe(0);
  });

  // Expected: 2+2 (4 dmg) → 3rd instance is lethal on the 5-Might Sett → the Boss replaces THAT death (heal, exhaust, recall,
  // buff spent → 4 Might) → the 4th instance still hits the same Sett in base: it ends alive in base with 2 damage.
  // Actual: the engine applies all instances first (8 damage) and runs ONE lethal check, so after the Boss save Sett has 0 damage.
  test("ruling 501859c86f8d2b1e — 4 instances at a Boss-protected 5-Might Sett: saved on the 3rd, hit again by the 4th (alive in base with 2 damage); engine batches the damage into one death", async () => {
    const game = await settBoard().build();
    await game.p2.cast("rain", { targets: ["sett", "sett", "sett", "sett", "rock", "rock"] });
    const asked = await resolveSayingYes(game);
    expect(asked).toBe(1);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ damage: 2, isBuffed: false, isExhausted: true, might: 4 });
    expect(game.state("rock")).toMatchObject({ damage: 4, location: "bf1" });
  });

  // Expected ("It takes 5 instances … if the opponent uses Sett's leader ability once"): saved on the 3rd instance, the 4th and
  // 5th put 4 damage on the now-4-Might Sett and it dies for real (no buff left for a second save).
  // Actual: one batched death, one save — Sett survives in base.
  test("ruling 501859c86f8d2b1e — 5 instances kill a once-saved Sett, Brawler; engine's single batched death lets it live", async () => {
    const game = await settBoard().build();
    await game.p2.cast("rain", { targets: ["sett", "sett", "sett", "sett", "sett", "rock"] });
    const asked = await resolveSayingYes(game);
    expect(asked).toBe(1); // the Boss can only be used once (buff spent, legend exhausted)
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.state("rock")).toMatchObject({ damage: 2, location: "bf1" });
  });

  // Expected: a 3-Might Ward with Zhonya's out: instances 1+2 are lethal → Zhonya's is killed instead, Ward healed/exhausted/
  // recalled; it "didn't die", so instances 3+4 still hit it in base (4 ≥ 3) and it dies for real. Actual: batched → saved once, alive.
  test("ruling 501859c86f8d2b1e — Zhonya's-saved unit remains the target of the remaining instances and dies to them; engine batches", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 7, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Ward" }, "ward")
      .unit(P1, "bf1", { might: 5, name: "Rock" }, "rock")
      .gear(P1, ZHONYAS, "zhonyas")
      .hand(P2, ICATHIAN_RAIN, "rain")
      .build();
    await game.p2.cast("rain", { targets: ["ward", "ward", "ward", "ward", "rock", "rock"] });
    await resolveSayingYes(game);
    expect(game.zoneOf("zhonyas")).toBe("trash"); // spent on the first death
    expect(game.zoneOf("ward")).toBe("trash"); // died to instances 3+4 after the save
    expect(game.state("rock").damage).toBe(4);
  });

  test("a unit that really dies: the 1-Might Sentry dies to its first instance, its Deathknell draws exactly 1, the second instance aimed at it does nothing, and the Rock takes its 4 instances", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 7, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "bf1", { might: 9, name: "Rock" }, "rock")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .hand(P2, ICATHIAN_RAIN, "rain")
      .build();
    await game.p2.cast("rain", { targets: ["sentry", "sentry", "rock", "rock", "rock", "rock"] });
    await resolveSayingYes(game);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]); // one Deathknell, one draw
    expect(game.state("rock")).toMatchObject({ damage: 8, location: "bf1" });
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
