/**
 * Ruling 55bcbb841ed538b9 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri) "When an enemy unit attacks a battlefield
 *   you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Siphon Power (OGN-266 → ogn-266-298) · [Reaction] · 2+[rainbow] "Choose a battlefield. Give friendly units there +1 [Might]
 *     this turn and enemy units there -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: 1-Might attackers get the Fox's -1 (min 1), then Siphon Power gives them +1. Final Might?
 * A: 2. The "-1, minimum 1" snapshots on resolution: against a 1-Might unit it applies -0. It does not re-evaluate when
 *    the unit later gains Might, so +1 takes them to 2.
 * Rules: 700–701 (Might arithmetic; a floored reduction fixes its applied amount when it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const SIPHON_POWER = "ogn-266-298";

/** P1's turn. P2 (Nine-Tailed Fox legend) holds bf1 with a 3-Might Guard. P1: two 1-Might Wisps in base, Siphon Power, 2+1. */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "fox")
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Wisp A" }, "wa")
    .unit(P1, "base", { might: 1, name: "Wisp B" }, "wb")
    .hand(P1, SIPHON_POWER, "siphon");
}

/** Both Wisps attack bf1; the Fox triggers once per attacker; drain the initial chain. */
async function wispsAttackAndFoxResolves(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["wa", "wb"], "bf1");
  await game.acceptTriggerOrder();
  const foxTriggers = game.chain().filter((c) => c.cardId === "fox" && c.triggered);
  expect(foxTriggers).toHaveLength(2);
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order") {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind !== "action") break;
    await game.seat(d.seat).passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 55bcbb841ed538b9 — Fox's floored -1 is a snapshot; Siphon Power's +1 then makes 2", () => {
  test("the Fox's triggers resolve against the 1-Might Wisps and leave them at 1 (an effective -0)", async () => {
    const game = await wispsAttackAndFoxResolves();
    expect(game.state("wa").might).toBe(1);
    expect(game.state("wb").might).toBe(1);
  });

  test("P1 then Siphon Powers bf1: each Wisp goes to 2 (1 + 1) — the earlier 'minimum 1' reduction does not wake up and drag them back to 1; the Guard drops 3 → 2", async () => {
    const game = await wispsAttackAndFoxResolves();
    // Attacker has Focus once the initial chain is done.
    for (let i = 0; i < 2 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("siphon", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("siphon")).toBe("trash");
    expect(game.state("wa").might).toBe(2);
    expect(game.state("wb").might).toBe(2);
    expect(game.state("guard").might).toBe(2);
  });

  test("so the combat is 4 vs 2: the Guard dies (its 2 damage takes exactly one 2-Might Wisp with it) and the surviving Wisp conquers bf1", async () => {
    const game = await wispsAttackAndFoxResolves();
    for (let i = 0; i < 2 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    await game.p1.cast("siphon", { targets: "bf1" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.units("bf1")).toHaveLength(1); // 2 damage from the Guard = lethal to one Wisp at 2 Might
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
