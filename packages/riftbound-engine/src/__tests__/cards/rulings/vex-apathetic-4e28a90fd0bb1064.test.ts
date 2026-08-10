/**
 * Ruling 4e28a90fd0bb1064 — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might
 *     "When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Reflection token (unl-t06) × Mirror Image (UNL-200 → unl-200-219) "…Play a ready Reflection unit token to your base…"
 *   × Deceiver (UNL-199 → unl-199-219, LeBlanc legend) "When you conquer or hold, you may discard 1 and exhaust me to play a ready
 *     Reflection unit token there…"
 *
 * Q: Does an enemy Vex at a battlefield stun / lock Reflection tokens made by Mirror Image or the LeBlanc legend?
 * A: Yes to both. Each effect says "PLAY a … token", so the token is played; Vex triggers wherever the unit is played (base or
 *    battlefield) as long as Vex herself is at a battlefield: the token is stunned and can't be moved this turn.
 * Rules: 187 (tokens created by a "play" instruction are played), 383/419.4.a, FAQ #8758/#9485/#9240/#9751.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const MIRROR_IMAGE = "unl-200-219";
const DECEIVER = "unl-199-219";

const isToken = (game: Game) => (id: string) => game.state(id).isToken;

describe("Ruling 4e28a90fd0bb1064 — Vex, Apathetic stuns and grounds Reflection tokens (Mirror Image and Deceiver alike)", () => {
  test("Mirror Image: the Reflection played to P1's BASE while P2's Vex stands at bf2 is stunned and cannot be moved this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", VEX, "vex")
      .unit(P1, "base", { might: 3, name: "Model" }, "model")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .build();
    await game.p1.cast("mirror", { targets: "model" });
    await game.settle();
    const tok = game.p1.base().find(isToken(game));
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isStunned: true, location: "base", might: 3, name: "Model" });
    expect(game.state(tok as string).grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect((await game.p1.try((p) => p.move(tok as string, "bf1"))).ok).toBe(false);
    expect(game.state("model").isStunned).toBe(false); // only the played unit
    expect(game.violations()).toEqual([]);
  });

  test("Deceiver: P1 conquers bf1 and plays a Reflection THERE (copy of Bravo) while P2's Vex is at bf2 — the token is stunned and cannot be moved this turn", async () => {
    const game = await scenario()
      .legend(P1, DECEIVER, "deceiver")
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", VEX, "vex")
      .unit(P2, "bf1", { might: 1, name: "Doormat" }, "doormat")
      .unit(P1, "base", { might: 5, name: "Bravo" }, "bravo")
      .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk")
      .build();
    await game.p1.move("bravo", "bf1");
    await game.settle();
    expect(game.zoneOf("doormat")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "deceiver" } });
    await game.p1.yes();
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : "bravo");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("deceiver").isExhausted).toBe(true);
    const tok = game.p1.units("bf1").find(isToken(game));
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ location: "bf1", might: 5, name: "Bravo" });
    expect(game.state(tok as string).isStunned).toBe(true);
    expect(game.state(tok as string).grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect((await game.p1.try((p) => p.move(tok as string, "base"))).ok).toBe(false);
    expect(game.state("bravo").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: with Vex in P2's BASE neither token is stunned (Mirror Image case)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", VEX, "vex")
      .unit(P1, "base", { might: 3, name: "Model" }, "model")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .build();
    await game.p1.cast("mirror", { targets: "model" });
    await game.settle();
    const tok = game.p1.base().find(isToken(game)) as string;
    expect(game.state(tok).isStunned).toBe(false);
    expect((await game.p1.try((p) => p.move(tok, "bf1"))).ok).toBe(true);
  });
});
