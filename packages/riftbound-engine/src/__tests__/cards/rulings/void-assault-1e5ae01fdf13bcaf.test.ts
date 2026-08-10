/**
 * Ruling 1e5ae01fdf13bcaf — Void Assault (UNL-202 → unl-202-219) · Spell · 2 + [rainbow]
 *   "Move a friendly unit, then move an enemy unit."
 *   × Vex, Apathetic (UNL-150 → unl-150-219) "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it.
 *     They can't move it this turn."
 *
 * Q: Can Void Assault target a friendly unit that Vex stunned and locked ("can't move it this turn")?
 * A: Yes — it is still "a friendly unit", so it is a legal target. On resolution the first move simply fails (the unit
 *    can't be moved), but the second, independent instruction still moves the enemy unit (do as much as you can).
 * Rules: 359.3.e (do as much as you can), 359.3.e.14 (the two moves are not linked instructions), 355 (targeting).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const VEX = "unl-150-219";
const NEWBIE = { cardType: "unit", energyCost: 1, might: 2, name: "Newbie" } as const;

/** P1's turn. P2's Vex holds bf1; P2's Minion idles in P2's base; bf2 is empty. P1: Newbie + Void Assault in hand, 3 + 2 chaos. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", VEX, "vex")
    .unit(P2, "base", { might: 2, name: "Minion" }, "minion")
    .hand(P1, NEWBIE, "newbie")
    .hand(P1, VOID_ASSAULT, "va");
}

/** P1 plays Newbie; Vex's trigger stuns it and forbids moving it this turn. */
async function playNewbieIntoVex(game: Game): Promise<void> {
  await game.p1.play("newbie");
  await game.settle();
  expect(game.zoneOf("newbie")).toBe("base");
  expect(game.state("newbie").isStunned).toBe(true);
}

const pairsOffered = (game: Game) =>
  (game.p1.option("cast", "va")?.fields.find((f) => f.name === "targets")?.options ?? []).map((o) => (o as string[]).join("→"));

describe("Ruling 1e5ae01fdf13bcaf — Void Assault may target a Vex-locked friendly unit; only the enemy move happens", () => {
  test("premise: the freshly played Newbie is stunned by Vex and cannot be moved this turn (no standard move offered for it)", async () => {
    const game = await board().build();
    await playNewbieIntoVex(game);
    const movable = game.p1
      .legal()
      .filter((o) => o.moveId === "standardMove")
      .flatMap((o) => o.variants.flatMap((v) => v.params.unitIds as string[]));
    expect(movable).not.toContain("newbie");
  });

  test("the locked Newbie is still a LEGAL friendly target: Void Assault offers [newbie, minion] (and [newbie, vex]) and can be cast", async () => {
    const game = await board().build();
    await playNewbieIntoVex(game);
    expect(game.p1.can("cast", "va")).toBe(true);
    expect(pairsOffered(game)).toContain("newbie→minion");
    await game.p1.cast("va", { answers: ["battlefield-bf2", "battlefield-bf2"], targets: ["newbie", "minion"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "va", targets: ["newbie", "minion"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } }); // 1 (Newbie) + 2 + [rainbow]
  });

  test("on resolution the first move is skipped (Newbie stays in base) but the independent second move still sends the enemy Minion to bf2", async () => {
    const game = await board().build();
    await playNewbieIntoVex(game);
    await game.p1.cast("va", { answers: ["battlefield-bf2", "battlefield-bf2"], targets: ["newbie", "minion"] });
    // Answer any destination prompts with bf2, pass everything else.
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        const bf2 = d.options.find((o) => o.key.includes("bf2"))?.key ?? (d.options[0]?.key as string);
        await game.seat(d.seat).pick(bf2);
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.locationOf("newbie")).toBe("base"); // can't be moved — instruction ignored
    expect(game.state("newbie").isStunned).toBe(true);
    expect(game.locationOf("minion")).toBe("bf2"); // independent instruction still executed
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
