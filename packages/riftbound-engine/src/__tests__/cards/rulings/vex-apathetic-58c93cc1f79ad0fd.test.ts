/**
 * Ruling 58c93cc1f79ad0fd — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · [Deflect]
 *     "When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Mirror Image (UNL-200 → unl-200-219) "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy…"
 *   × Reflection token (unl-t06)
 *
 * Q: Vex, Apathetic is at a battlefield and the opponent plays Mirror Image — is the Reflection token stunned?
 * A: Yes. Mirror Image says "PLAY a … token", so the token is played; that satisfies Vex's trigger (Vex is at a
 *    battlefield), the trigger goes on the chain and on resolution the token is Stunned and can't move this turn.
 *    The selection is programmatic (not a choice), so protections against being chosen would not help.
 * Rules: 187 (tokens created by a "play" instruction are played), 383 / 419.4.a (play triggers), 355.10.d.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const MIRROR_IMAGE = "unl-200-219";

const isToken = (game: Game) => (id: string) => game.state(id).isToken;

function board(vexAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, vexAt, VEX, "vex")
    .unit(P2, "base", { might: 3, name: "Model" }, "model")
    .hand(P2, MIRROR_IMAGE, "mirror");
}

describe("Ruling 58c93cc1f79ad0fd — Vex, Apathetic at a battlefield stuns the Reflection token Mirror Image plays", () => {
  test("Mirror Image resolves, the token is PLAYED to P2's base, Vex's trigger goes on the chain and stuns + grounds it", async () => {
    const game = await board("bf1").build();
    await game.p2.cast("mirror", { targets: "model" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mirror"]);

    // Resolve Mirror Image only (both pass once each) and look at what is on the chain next.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "mirror"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("mirror")).toBe("trash");
    const tok = game.p2.base().find(isToken(game));
    expect(tok).toBeDefined();
    // Intermediate fact: the token counts as played ⇒ Vex's triggered ability is now a chain item controlled by P1.
    await game.acceptTriggerOrder();
    const vexItem = game.chain().find((c) => c.cardId === "vex");
    expect(vexItem).toMatchObject({ controller: P1, triggered: true });
    // Not stunned yet — the trigger has not resolved.
    expect(game.state(tok as string).isStunned).toBe(false);

    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state(tok as string)).toMatchObject({ isStunned: true, location: "base", might: 3, name: "Model" });
    expect(game.state(tok as string).grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect((await game.p2.try((p) => p.move(tok as string, "bf1"))).ok).toBe(false);
    // Only the played unit is affected.
    expect(game.state("model").isStunned).toBe(false);
    expect(game.state("vex").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: with Vex in base her trigger never fires and the token is neither stunned nor grounded", async () => {
    const game = await board("base").build();
    await game.p2.cast("mirror", { targets: "model" });
    await game.settle();
    const tok = game.p2.base().find(isToken(game));
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isStunned).toBe(false);
    expect(game.state(tok as string).grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
    expect(game.violations()).toEqual([]);
  });
});
