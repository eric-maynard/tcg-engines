/**
 * Ruling 435b2673c756c489 — Reflection token (UNL-T06 → unl-t06) "(I become a copy of something when played. I don't get
 *   that card's play effects.)"
 *   × Deceiver / LeBlanc legend (UNL-199 → unl-199-219) "When you conquer or hold, you may discard 1 and exhaust me to play a
 *     ready Reflection unit token there. It becomes a copy of another unit there. Give it [Temporary]."
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · 6 Might · "When you play me, kill an enemy unit."
 *
 * Q: Does "When you play me" trigger when LeBlanc's Reflection copies a Harnessed Dragon?
 * A: No. The token is created by Deceiver's ability, and the copy happens after the token is on the board — it never has
 *    the Dragon's "When you play me" text at the moment it enters, so nothing is killed.
 * Rules: 187.6 (Reflection token), 477 (copy), 383/419.4 (play triggers evaluate on entering), FAQ #10386.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const HARNESSED_DRAGON = "ogn-234-298";

/**
 * P1 (LeBlanc) has Harnessed Dragon in base and conquers P2's bf1 (1-Might Doormat) with it. P2 keeps a Bystander in base
 * (the only enemy unit left — the would-be victim of a Dragon play trigger). P1 holds a Junk card to discard.
 */
function board() {
  return scenario()
    .legend(P1, DECEIVER, "deceiver")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Doormat" }, "doormat")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .unit(P1, "base", HARNESSED_DRAGON, "dragon")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk");
}

async function conquerAndCopyDragon(): Promise<{ game: Game; token: string }> {
  const game = await board().build();
  await game.p1.move("dragon", "bf1");
  await game.settle();
  expect(game.zoneOf("doormat")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  // Deceiver's "you may discard 1 and exhaust me" offer.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "deceiver" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && /discard/i.test(game.decision()?.prompt ?? "")) {
    await game.p1.pick("junk");
  }
  expect(game.zoneOf("junk")).toBe("trash");
  expect(game.state("deceiver").isExhausted).toBe(true);
  // Drive the trigger: pass priorities; name the Dragon as the copy source whenever asked.
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "dragon")) {
      await game.p1.pick("dragon");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  const token = game.p1.units("bf1").find((u) => game.state(u).isToken);
  expect(token).toBeDefined();
  return { game, token: token as string };
}

describe("Ruling 435b2673c756c489 — a Deceiver Reflection copying Harnessed Dragon does NOT fire 'When you play me, kill an enemy unit'", () => {
  test("the Reflection lands at bf1 as a 6-Might 'Harnessed Dragon' copy with Temporary", async () => {
    const { game, token } = await conquerAndCopyDragon();
    expect(game.state(token)).toMatchObject({ isToken: true, location: "bf1", might: 6, name: "Harnessed Dragon" });
    expect(game.state(token).keywords).toContain("Temporary");
  });

  test("no play trigger: nothing of the token goes on the chain, P1 is never asked to pick a kill target, and the enemy Bystander survives", async () => {
    const { game, token } = await conquerAndCopyDragon();
    // No "kill an enemy unit" item / prompt sourced from the token.
    expect(game.chain().some((c) => c.cardId === token)).toBe(false);
    const d = game.decision();
    const asksBystander = d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "bystander");
    expect(asksBystander).toBe(false);
    await game.settle();
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.p2.units()).toEqual(["bystander"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the REAL Harnessed Dragon played from hand does trigger and kills the enemy Bystander", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, HARNESSED_DRAGON, "dragon")
      .build();
    await game.p1.play("dragon");
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("bystander");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("bystander")).toBe("trash");
  });
});
