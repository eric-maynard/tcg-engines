/**
 * Ruling 1bc17e9b525ad0c3 — Hidden Blade (OGN-213 → ogn-213-298, Action, 2 + [order]) "Kill a unit at a battlefield.
 *   Its controller draws 2."
 *   × Sun Disc (OGN-021 → ogn-021-298, Gear) "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) "When you kill a unit with a spell, you may pay [1][fury] to play me
 *     from your trash."
 *
 * Q: Can I activate Sun Disc after Hidden Blade (kills a unit) but before the Phoenix comes back from the trash?
 * A: No. Sun Disc's activated ability needs an Open state in your Main Phase; from the moment Hidden Blade is played
 *    until the Phoenix trigger has resolved there is a chain (Closed state), so there is no window. Correct order:
 *    play another card (Legion), exhaust Sun Disc, THEN cast Hidden Blade — the revived Phoenix enters ready.
 * Rules: 145.2 / 402 (activated abilities only in an Open state on your turn), 330–337 (chain = Closed state),
 *        376.2.c.1 (the Phoenix trigger is added after the spell resolves), 813 (Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const SUN_DISC = "ogn-021-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P1's turn. P1: Sun Disc (ready) in base, Immortal Phoenix in trash, Hidden Blade + a 1-cost Junk unit in hand,
 * 2 + [order] for the Blade, [1][fury] for the Phoenix, 1 more for Junk. P2's Victim (2) stands at P2's bf1.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .gear(P1, SUN_DISC, "disc")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk");
}

/** Drive from "Hidden Blade on the chain" to "Phoenix on the board", asserting Sun Disc is NEVER activatable meanwhile. */
async function resolveBladeAndPhoenixCheckingDisc(game: Game): Promise<{ sawOptIn: boolean }> {
  let sawOptIn = false;
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "main") {
      break; // back to an Open state
    }
    // Closed state throughout: Sun Disc cannot be activated.
    expect(game.p1.can("activate", "disc")).toBe(false);
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      sawOptIn = true;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const base = d.options.find((o) => /base/.test(`${o.key} ${o.zone ?? ""} ${o.label}`));
      await game.p1.pick((base ?? d.options[0])?.key as string);
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return { sawOptIn };
}

describe("Ruling 1bc17e9b525ad0c3 — no Sun Disc window between Hidden Blade and the Immortal Phoenix trigger", () => {
  /** P1 first plays Junk (another card this turn → Legion is satisfied from here on). */
  async function junkPlayed(): Promise<Game> {
    const game = await board().build();
    await game.p1.play("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("base");
    return game;
  }

  test("premise: in the Open state (main phase, empty chain, Legion met) Sun Disc IS activatable", async () => {
    const game = await junkPlayed();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(true);
  });

  test("once Hidden Blade is played the state is Closed: Sun Disc is not activatable while the Blade is on the chain, while it resolves, nor while the Phoenix trigger is pending/resolving — the Phoenix (paid for) therefore enters EXHAUSTED", async () => {
    const game = await junkPlayed();
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(false);
    const { sawOptIn } = await resolveBladeAndPhoenixCheckingDisc(game);
    expect(sawOptIn).toBe(true);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(2); // its controller drew 2
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } }); // 4 − 1 (Junk) − 2 (Blade) − 1 (Phoenix)
    expect(game.state("phoenix").isExhausted).toBe(true); // Sun Disc never got used
    expect(game.state("disc").isReady).toBe(true);
    // Only now, chain empty in the main phase, is the Disc activatable again.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("correct sequence: play another card first (Legion), exhaust Sun Disc in the Open state, THEN Hidden Blade — the Phoenix revived off the kill enters READY", async () => {
    const game = await junkPlayed();
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await game.p1.cast("blade", { targets: "victim" });
    const { sawOptIn } = await resolveBladeAndPhoenixCheckingDisc(game);
    expect(sawOptIn).toBe(true);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.state("phoenix").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
