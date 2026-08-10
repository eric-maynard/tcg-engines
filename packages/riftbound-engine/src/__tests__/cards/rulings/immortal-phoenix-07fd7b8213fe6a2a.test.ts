/**
 * Ruling 07fd7b8213fe6a2a — Immortal Phoenix (OGN-037 → ogn-037-298) · 3-Might Fury unit · [3][fury]
 *   "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Order spell · [2][order] — "Each player kills one of their units."
 *   (+ Hidden Blade ogn-213-298 as the opponent's kill spell for the contrast case.)
 *
 * Q: If you kill your own Immortal Phoenix with a spell, can you then replay it (from the trash)?
 * A: Yes. The Phoenix is put into the trash while the spell resolves; its trigger condition is evaluated
 *    right after, with the Phoenix already in the trash, so it triggers even though the unit you killed was
 *    the Phoenix itself. The trigger goes on the chain only after the spell has finished resolving; you may
 *    pay [1][fury] and the Phoenix is played from the trash (entering exhausted). If an OPPONENT's spell
 *    kills your Phoenix you get nothing.
 * Rules: 383.2.c.1 (the rules' own Immortal Phoenix example), 415.1, 157.3.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMMORTAL_PHOENIX = "ogn-037-298";
const CULL_THE_WEAK = "ogn-209-298";
const HIDDEN_BLADE = "ogn-213-298"; // opponent's kill spell for the contrast case

/**
 * P1's turn. P1: Immortal Phoenix (its only unit) in base, Cull the Weak in hand, [3] + 1 order + 1 fury
 * (exactly Cull + the Phoenix's [1][fury]). P2: one 2-Might Grunt in base.
 */
function ownSpellBoard() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", IMMORTAL_PHOENIX, "phoenix")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, CULL_THE_WEAK, "cull");
}

/** Drive Cull the Weak to full resolution (P2's forced kill of its lone Grunt is answered if asked). Stops at P1's Phoenix yes/no. */
async function resolveCull(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      return; // the Phoenix opt-in — leave it for the test
    }
    if (d.kind === "action" && d.context === "main") {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P2) {
      await game.p2.pick("grunt");
    } else {
      return;
    }
  }
}

describe("Ruling 07fd7b8213fe6a2a — killing your own Immortal Phoenix with your spell lets you replay it from the trash", () => {
  test.failing("BUG: P1 casts Cull the Weak choosing its own Phoenix; when it has FULLY resolved (both kills done, Cull in trash) the Phoenix — now in the trash — triggers and asks P1 to pay [1][fury]", async () => {
    const game = await ownSpellBoard().build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks phoenix on resolution
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await resolveCull(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
    // 157.3.a / 383.2.c.1: the spell finished first; the Phoenix evaluates its trigger from the trash.
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.chain().some((c) => c.cardId === "cull")).toBe(false);
  });

  test.failing("BUG: YES: P1 pays exactly [1][fury] and the Phoenix is played from the trash onto P1's board, entering exhausted", async () => {
    const game = await ownSpellBoard().build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks phoenix on resolution
    await resolveCull(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    // A destination may be asked (base or a controlled battlefield) — take base if so.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        const base = d.options.find((o) => /base/i.test(o.label) || o.key === "base");
        await game.p1.pick(base ? base.key : d.options[0]!.key);
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("phoenix"));
    expect(game.p1.units()).toContain("phoenix");
    expect(game.p1.trash()).not.toContain("phoenix");
    expect(game.state("phoenix")).toMatchObject({ damage: 0, isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: NO: the Phoenix simply stays in the trash and nothing is paid", async () => {
    const game = await ownSpellBoard().build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks phoenix on resolution
    await resolveCull(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });

  test("nuance: an OPPONENT's spell killing your Phoenix is not 'you kill a unit with a spell' — P1 is never offered the replay", async () => {
    // P2's turn; P2 kills P1's Phoenix (at bf1) with Hidden Blade. P1 has [1][fury] ready.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .resources(P2, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
      .hand(P2, HIDDEN_BLADE, "blade")
      .build();
    await game.p2.cast("blade", { targets: "phoenix" });
    const prompts: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        prompts.push(`${d.seat}:${d.kind}:${d.prompt}`);
        if (d.kind === "yes-no") {
          await game.seat(d.seat).no();
        } else {
          break;
        }
      }
    }
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    // P1 was never asked about the Phoenix.
    expect(prompts.filter((p) => p.startsWith(P1))).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.chain()).toEqual([]);
  });
});
