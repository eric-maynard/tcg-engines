/**
 * Ruling 367a05cb15565799 — Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · Order · [8]+[order][order] · 6 Might
 *     "When you play me, kill an enemy unit."
 *   × Deceiver (UNL-199 → unl-199-219) · Legend · LeBlanc — "When you conquer or hold, you may discard 1 and exhaust
 *     me to play a ready Reflection unit token there. It becomes a copy of another unit there. Give it [Temporary]."
 *   × Reflection token (unl-t06) "(I become a copy of something when played. I don't get that card's play effects.)"
 *
 * Q: If LeBlanc's legend mirrors Harnessed Dragon, does the new copy count as played and fire "When you play me,
 *    kill an enemy unit"?
 * A: No. The Reflection is a created token that then copies the Dragon; it was never played from hand, so the
 *    copied "When you play me" trigger's condition is never met and nothing is killed.
 * Rules: 477 (copy effects), 383.4 (play triggers need the card to be played), 187 (tokens).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const DECEIVER = "unl-199-219";

/**
 * End of P2's turn 2. P1 (legend Deceiver) holds bf1 with Harnessed Dragon on it and one card (Fodder) in hand to
 * discard. P2 has a 2-Might Prey in base — the only enemy unit, i.e. what a real "kill an enemy unit" would hit.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", HARNESSED_DRAGON, "dragon")
    .unit(P2, "base", { might: 2, name: "Prey" }, "prey")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" }, "fodder");
}

/** P2 ends turn → P1 holds bf1 → Deceiver's optional trigger: P1 pays (discard Fodder + exhaust legend). */
async function mirrorTheDragon(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "leblanc" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("fodder");
  }
  expect(game.zoneOf("fodder")).toBe("trash");
  expect(game.state("leblanc").isExhausted).toBe(true);
  return game;
}

function reflectionAt(game: Game, bf: string): string | undefined {
  return game.p1.units(bf).find((u) => u !== "dragon" && game.state(u).isToken);
}

describe("Ruling 367a05cb15565799 — a Reflection copying Harnessed Dragon does not fire the Dragon's 'When you play me'", () => {
  test("Deceiver's hold trigger creates a ready Reflection token at bf1 that is a copy of Harnessed Dragon (name, 6 Might) with [Temporary]", async () => {
    const game = await mirrorTheDragon();
    await game.settle();
    expect(game.phase()).toBe("main");
    const refl = reflectionAt(game, "bf1");
    expect(refl).toBeDefined();
    expect(game.state(refl as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 6, name: "Harnessed Dragon" });
    expect(game.state(refl as string).keywords).toContain("Temporary");
  });

  test("no 'kill an enemy unit' ever happens: from the trigger to P1's open main phase there is no kill prompt and no Dragon/Reflection play-trigger on the chain, and P2's only unit Prey survives", async () => {
    const game = await mirrorTheDragon();
    let sawKillPrompt = false;
    let sawPlayTrigger = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (game.chain().some((c) => c.triggered && c.cardId !== "leblanc")) {
        sawPlayTrigger = true;
      }
      if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "prey")) {
        sawKillPrompt = true;
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "pick" && d.options.length === 1) {
        await game.seat(d.seat).pick(d.options[0]?.key as string); // e.g. the forced copy source (the Dragon)
      } else {
        break;
      }
    }
    expect(sawKillPrompt).toBe(false);
    expect(sawPlayTrigger).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(reflectionAt(game, "bf1")).toBeDefined();
    expect(game.zoneOf("prey")).toBe("base");
    expect(game.state("prey").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — actually PLAYING Harnessed Dragon from hand does fire the trigger and kills Prey", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .unit(P2, "base", { might: 2, name: "Prey" }, "prey")
      .hand(P1, HARNESSED_DRAGON, "dragon")
      .build();
    await game.p1.play("dragon");
    let stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("prey");
      stop = await game.settle();
    }
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("prey")).toBe("trash");
  });
});
