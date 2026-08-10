/**
 * Ruling 4a7e1b0269702463 — Fading Memories (OGN-180 → ogn-180-298) · Spell · Chaos · [4][chaos]
 *   "Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of its controller's Beginning
 *    Phase, before scoring.)"
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might · [Assault 2] · "When you kill a unit with a spell, you
 *     may pay [1][fury] to play me from your trash."
 *
 * Q: If Fading Memories is played on Immortal Phoenix, can the Phoenix be played back from the trash — is it
 *    "killed by a spell"?
 * A: No. Fading Memories is not a kill spell; the unit dies to the [Temporary] keyword later, not to the spell's
 *    effect, so the Phoenix's "kill a unit with a spell" trigger does not fire.
 * Rules: 800-series Temporary keyword (kill at start of Beginning Phase), 383 (trigger conditions must be met
 *        by the actual event source).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FADING_MEMORIES = "ogn-180-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn 2 with exactly [4][chaos]; P1 holds bf1 with the Phoenix and a Keeper (so bf1 stays held later). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
    .unit(P1, "bf1", { might: 2, name: "Keeper" }, "keeper")
    .hand(P1, FADING_MEMORIES, "fm");
}

describe("Ruling 4a7e1b0269702463 — Fading Memories does not 'kill with a spell'; the Phoenix cannot come back off it", () => {
  test("Fading Memories resolves: the Phoenix is NOT killed by the spell — it stays on bf1, now carrying [Temporary]", async () => {
    const game = await board().build();
    await game.p1.cast("fm", { targets: "phoenix" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("fm")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("battlefield-bf1");
    expect(game.state("phoenix").keywords).toContain("Temporary");
    expect(game.chain()).toEqual([]); // no Phoenix trigger: nothing was killed
  });

  test("at the start of P1's next Beginning Phase the Phoenix dies to Temporary (before scoring); it lands in the trash and P1 is never offered 'pay [1][fury] to play me' — no spell killed it", async () => {
    const game = await board().runes(P1, "fury", 2).build();
    await game.p1.cast("fm", { targets: "phoenix" });
    await game.settle();
    await game.advanceTurn(); // → P2's turn; the Phoenix is still around
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("phoenix")).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's Beginning Phase
    expect(game.phase()).toBe("beginning");
    // The Temporary kill is the only thing that happens; drive it and watch for any Phoenix opt-in.
    let sawPhoenixOptIn = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.source?.cardId === "phoenix") {
        sawPhoenixOptIn = true;
        await game.seat(d.seat).no();
        continue;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(sawPhoenixOptIn).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(1); // "before scoring": Keeper still held bf1 afterwards
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a real kill spell does trigger it: Hextech Ray kills a unit while the Phoenix is in the trash → P1 is asked to pay [1][fury] and the Phoenix returns to the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
      .trash(P1, IMMORTAL_PHOENIX, "phoenix")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("victim")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId).toBe("phoenix");
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // Ray 1+fury, Phoenix 1+fury
  });
});
