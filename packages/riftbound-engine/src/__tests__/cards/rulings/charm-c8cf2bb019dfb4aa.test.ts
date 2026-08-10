/**
 * Ruling c8cf2bb019dfb4aa — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1 · "Move an enemy unit."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "[Hidden] If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it."
 *   × a Deathknell unit (Watchful Sentry, ogn-096-298: "[Deathknell] — Draw 1.")
 *
 * Q: My Deathknell unit is Charmed off the battlefield where my Zhonya's is hidden, into a battlefield where it dies
 *    in combat. Can I flip Zhonya's in response to the Deathknell trigger just to save the Hourglass to base while
 *    still letting the unit die?
 * A: No — you can't have both. Don't flip: Charm resolves, the battlefield empties, control lapses and the hidden
 *    Hourglass is discarded in cleanup (the unit then dies and Deathknell fires). Flip in response to Charm: the
 *    Hourglass goes to base and its MANDATORY replacement saves the unit in combat — no Deathknell.
 *    Nuance: if the combat is at the SAME battlefield as the hidden Hourglass, you keep control through combat and
 *    may flip it after the death (in response to the Deathknell item) — it reaches base without saving anything.
 * Rules: 323 (cleanup trashes a hidden card at a battlefield you no longer control), 811 (reveal Hidden as a Reaction),
 *        369–373 (mandatory replacement), 187.4.b (control fixed during combat), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const ZHONYAS = "ogn-077-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const FILLER = "ogn-175-298";

/**
 * P2's turn. P1 controls bfA with a Watchful Sentry (1, Deathknell: draw 1) and a facedown Zhonya's there.
 * P2 controls bfB with a Brute (4) and has a Raider (4) in base; Charm + [1][calm]. P1's deck top is d1.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", WATCHFUL_SENTRY, "sentry")
    .facedown(P1, "bfA", ZHONYAS, "zh")
    .unit(P2, "bfB", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .hand(P2, CHARM, "charm");
}

/** P2 Charms the Sentry into bfB and passes; P1 now holds priority with Charm on the chain. */
async function charmSentryIntoBrute(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "sentry" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("battlefield-bfB");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2, targets: ["sentry"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling c8cf2bb019dfb4aa — case 1: P1 does NOT flip the hidden Zhonya's in response to Charm", () => {
  test("Charm resolves → Sentry leaves bfA → bfA uncontrolled → the hidden Hourglass is trashed in cleanup; from then on it can never be revealed", async () => {
    const game = await charmSentryIntoBrute();
    expect(game.p1.can("reveal", "zh")).toBe(true); // last chance was here
    await game.p1.passPriority(); // Charm resolves
    expect(game.zoneOf("sentry")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.zoneOf("zh")).toBe("trash");
    // Through the showdown and the Deathknell chain, "reveal zh" is never legal again.
    let sawDeathknellItem = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.kind).toBe("action");
      if (game.chain().some((c) => c.cardId === "sentry" && c.triggered)) {
        sawDeathknellItem = true;
      }
      expect(game.seat(d.seat).can("reveal", "zh")).toBe(false);
      await game.seat(d.seat).pass();
    }
    // The Sentry died in combat (nothing saved it) and its Deathknell drew d1.
    expect(sawDeathknellItem).toBe(true);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling c8cf2bb019dfb4aa — case 2: P1 flips Zhonya's in response to Charm", () => {
  test("the revealed Hourglass lands in P1's base; Charm resolves; in the bfB combat the Sentry 'would die' and the Hourglass MANDATORILY saves it (no prompt) — Hourglass killed instead, Sentry healed/exhausted/recalled, NO Deathknell draw", async () => {
    const game = await charmSentryIntoBrute();
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      // Never a yes/no about applying Zhonya's: it is not optional.
      expect(d.kind).toBe("action");
      await game.seat(d.seat).pass();
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead of the Sentry
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toEqual([]); // Deathknell never triggered
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.zoneOf("brute")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling c8cf2bb019dfb4aa — nuance: combat at the SAME battlefield as the hidden Hourglass", () => {
  test("P2's Raider attacks bfA: P1 keeps control through combat, the Sentry dies, and P1 can flip Zhonya's in response to the Deathknell item — it goes to base, saves nothing (the death already happened), and Deathknell still draws", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfA");
    let revealed = false;
    for (let i = 0; i < 14; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.kind).toBe("action");
      const deathknellOnChain = game.chain().some((c) => c.cardId === "sentry" && c.triggered);
      if (!revealed && d.seat === P1 && deathknellOnChain) {
        // The Sentry is already dead; P1 still controls bfA mid-combat and may reveal.
        expect(game.zoneOf("sentry")).toBe("trash");
        expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
        expect(game.p1.can("reveal", "zh")).toBe(true);
        await game.p1.reveal("zh");
        revealed = true;
        expect(game.zoneOf("zh")).toBe("base");
        continue;
      }
      await game.seat(d.seat).pass();
    }
    expect(revealed).toBe(true);
    expect(game.zoneOf("sentry")).toBe("trash"); // not saved — Zhonya's was not active when it died
    expect(game.zoneOf("zh")).toBe("base"); // but the Hourglass survived to base
    expect(game.p1.gear()).toContain("zh");
    expect(game.p1.hand()).toEqual(["d1"]); // Deathknell drew
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2); // conquered only after combat ended
    expect(game.violations()).toEqual([]);
  });
});
