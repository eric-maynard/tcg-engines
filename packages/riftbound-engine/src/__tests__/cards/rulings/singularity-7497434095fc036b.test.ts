/**
 * Ruling 7497434095fc036b — Singularity (OGN-105 → ogn-105-298) · [6][mind][mind] "Deal 6 to each of up to two units."
 *   × Janna, Savior (SFD-053 → sfd-053-221) · [3][calm] · 3 Might "[Reaction] (… including to a battlefield you control.)
 *     When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *
 * Q: Can I legally respond to a Singularity by playing Janna to a battlefield?
 * A: Yes. Singularity on the chain = Closed state; Janna has [Reaction] so she may be played now, even to a battlefield
 *    you control. She enters play immediately; her "When you play me" trigger goes on top of Singularity. LIFO: Janna's
 *    trigger resolves first, Singularity second (and it still resolves regardless).
 * Rules: 309.1/.1.a (Closed state → Reactions only), 356.2 (units finalize immediately), 356.3.c (play trigger on top), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const JANNA = "sfd-053-221";

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/** P1's turn. P2 controls bf1 with a damaged Vet (5, 2 damage) and a Grunt (3). P1: Singularity + [6][mind][mind]. P2: Janna + [3][calm], plus a vanilla unit in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Vet" }, "vet", { damage: 2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, JANNA, "janna")
    .hand(P2, { might: 2, name: "Plain Recruit", energyCost: 1 }, "plain");
}

async function singularityOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sing", { targets: ["vet", "grunt"] });
  expect(chainIds(game)).toEqual(["sing"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 7497434095fc036b — Janna, Savior can be played (to a battlefield) in response to Singularity", () => {
  test("1–2. Singularity on the chain closes the state: P2's non-Reaction unit is NOT playable, but [Reaction] Janna IS — including to bf1, which P2 controls", async () => {
    const game = await singularityOnChain();
    expect(game.p2.can("play", "plain")).toBe(false);
    expect(game.p2.can("play", "janna")).toBe(true);
    const to = game.p2.option("play", "janna")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toContain("battlefield-bf1");
  });

  test("3–4. Janna enters bf1 immediately (not a chain item herself); her 'When you play me' trigger sits on TOP of Singularity", async () => {
    const game = await singularityOnChain();
    await game.p2.play("janna", { to: "bf1" });
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.p2.energy()).toBe(0);
    expect(chainIds(game)).toEqual(["sing", "janna*"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "sing", controller: P1, countered: false });
  });

  test("5. LIFO: Janna's trigger resolves first (heals the Vet's 2 damage), THEN Singularity resolves — 6 to each: Vet (5) and Grunt (3) both die; Janna stays", async () => {
    const game = await singularityOnChain();
    await game.p2.play("janna", { to: "bf1" });
    // Resolve Janna's trigger only.
    for (let i = 0; i < 6 && game.chain().length === 2; i++) {
      const d = game.decision();
      if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.decline(); // "up to one enemy unit from here" — none / not needed
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.decline();
    }
    expect(chainIds(game)).toEqual(["sing"]);
    expect(game.state("vet").damage).toBe(0); // healed by Janna first
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1"); // Singularity has not resolved yet
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("vet")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
