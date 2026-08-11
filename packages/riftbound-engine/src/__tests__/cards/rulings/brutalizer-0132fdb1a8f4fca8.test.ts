/**
 * Ruling 0132fdb1a8f4fca8 — Brutalizer (SFD-042 → sfd-042-221) × Grandmaster at Arms (SFD-193 → sfd-193-221)
 *   Brutalizer: Equipment, +1 Might. "[Equip] [calm]. If this was attached to me this turn, I have an
 *   additional +2 [Might]."
 *   Grandmaster at Arms (Jax legend) #1: "[Exhaust]: Attach an attached Equipment you control to a unit you control."
 *
 * Q: I equip Brutalizer to a 2-Might unit by recycling a rune, then activate Jax to re-equip it — what Might?
 * A: 5. Equipped: 2 + 1 (bonus) + 2 (attached this turn) = 5. Re-equip: on detaching, the unit drops back to
 *    2; on re-attaching it regains +1 and +2 = 5 again. Brutalizer only ever gives +1 or +3, never stacks.
 * Rules: 434.1.d / 718.4 (Might bonus follows the attachment), 434.1.f (attach anew ⇒ detach first),
 *        435.1.e (detached ⇒ Effect Text inactive, bonuses gone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRUTALIZER = "sfd-042-221";
const JAX = "sfd-193-221";

function board() {
  return scenario()
    .legend(P1, JAX, "jax")
    .rune(P1, "calm", { alias: "calmRune" })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, BRUTALIZER, "brut");
}

/** Recycle the calm rune for [calm], Equip Brutalizer onto Squire. */
async function equipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.recycleRune("calmRune");
  expect(game.p1.power("calm")).toBe(1);
  await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "squire" } });
  await game.settle();
  expect(game.p1.power("calm")).toBe(0);
  expect(game.state("brut").attachedTo).toBe("squire");
  return game;
}

/** Activate Jax #1 (re-attach an attached Equipment), steering every prompt toward `wanted`. */
async function jaxReequip(game: Game, wanted: string[]): Promise<void> {
  const hasTargets = game.p1.option("activateAbility:jax#1")?.fields.some((f) => f.arg === "targets");
  await game.p1.activate("jax", 1, hasTargets ? { targets: wanted } : { answers: wanted });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    expect(d.seat).toBe(P1);
    const hit = d.options.find((o) => wanted.includes(o.card ?? o.key));
    await game.p1.pick(hit ? hit.key : (d.options[0]?.key as string));
  }
}

describe("Ruling 0132fdb1a8f4fca8 — Brutalizer re-equipped by Jax: 5 Might, the +2 never stacks", () => {
  test("step 1 mechanics: recycling the rune pays [calm]; Brutalizer is attached to the 2-Might Squire (rune back in the rune deck)", async () => {
    const game = await equipped();
    expect(game.zoneOf("calmRune")).toBe("runeDeck");
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], baseMight: 2 });
    expect(game.state("squire").might).toBeGreaterThanOrEqual(3); // at least the printed +1
  });

  // Expected: 2 + 1 + 2 ("attached to me this turn") = 5. Actual: Brutalizer's conditional +2 Effect Text is
  // not applied — the unit reads 3 (printed +1 only).
  test("ruling 0132fdb1a8f4fca8 — engine ignores Brutalizer's 'attached this turn' +2: freshly equipped 2-Might unit should be 5, engine says 3", async () => {
    const game = await equipped();
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 5 });
  });

  test("step 2 mechanics: Jax #1 ([Exhaust] only) resolves off the chain and Brutalizer ends up attached to the same Squire again", async () => {
    const game = await equipped();
    await jaxReequip(game, ["brut", "squire"]);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["brut"]);
    expect(game.violations()).toEqual([]);
  });

  // Expected: detach → 2, re-attach → +1 +2 = exactly 5 (never 7: the bonuses do not stack across the
  // re-equip). Actual: 3 — the +2 clause is unimplemented (see above).
  test("ruling 0132fdb1a8f4fca8 — after the same-turn Jax re-equip the unit should be exactly 5 (not 7, not 3); engine says 3", async () => {
    const game = await equipped();
    await jaxReequip(game, ["brut", "squire"]);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 5 });
  });

  // Next turn the "this turn" +2 is gone (3). RULING-CONFLICT resolved to CR 434.1.g (rulings 8146463710b7352b /
  // 8e5e17c0e8fd31f9): Jax "re-equipping" Brutalizer onto the unit it is ALREADY attached to has no effect, so the
  // +2 cannot be refreshed in place — the Squire stays 3. Only a move to a DIFFERENT unit re-arms it.
  test("ruling 0132fdb1a8f4fca8 — next turn it is 3 (+1 only); a Jax re-equip onto the SAME Squire changes nothing (434.1.g) — still 3", async () => {
    const game = await equipped();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], might: 3 });
    await jaxReequip(game, ["brut", "squire"]);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(3);
  });
});
