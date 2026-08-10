/**
 * Ruling b0fe993b8873ae5d — Janna, Savior (SFD-053 → sfd-053-221) · Champion Unit · Calm · 3+[calm] · 3 Might · [Reaction]
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   × Atakhan (UNL-170 → unl-170-219) · 10 · 7 Might · [Ganking] "When I attack, the defender must kill one of their units here."
 *
 * Q: Atakhan attacks my battlefield; can I play Janna at Reaction speed in response and move Atakhan home so I don't
 *    have to kill one of my units?
 * A: Yes. Atakhan's attack trigger goes on the chain; Janna (Reaction) is played on top, her play trigger resolves first
 *    and moves Atakhan to his base. When Atakhan's trigger then resolves, "here" is his base where the defender has no
 *    units, so nothing is killed.
 * Rules: 359.3 ("here" is read on resolution), 383.4.e (attack trigger), 340.1 (LIFO), 359.3.e.6 (impossible → skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JANNA = "sfd-053-221";
const ATAKHAN = "unl-170-219";

/** P1's turn: Atakhan ready in P1's base. P2 holds bf1 with two 2-Might defenders and Janna in hand with exactly 3+[calm]. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ATAKHAN, "atakhan")
    .unit(P2, "bf1", { might: 2, name: "Defender X" }, "X")
    .unit(P2, "bf1", { might: 2, name: "Defender Y" }, "Y")
    .hand(P2, JANNA, "janna");
}

/**
 * Atakhan attacks bf1, P1 passes, P2 plays Janna to bf1 in response and names Atakhan for her "move up to one enemy
 * unit from here to its base"; both pass until Janna's trigger has resolved. Stops with Atakhan's trigger still pending.
 */
async function jannaBouncesAtakhan(game: Game): Promise<void> {
  await game.p1.move("atakhan", "bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("play", "janna")).toBe(true);
  await game.p2.play("janna", { to: "bf1" });
  let picked = false;
  for (let i = 0; i < 12 && game.chain().some((c) => c.cardId === "janna"); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      // Janna's chooser is P2; Atakhan is the enemy unit "here".
      expect(d.source?.cardId).toBe("janna");
      expect(d.options.map((o) => o.card ?? o.key)).toContain("atakhan");
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "atakhan")?.key ?? "atakhan");
      picked = true;
    } else if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(picked).toBe(true);
}

describe("Ruling b0fe993b8873ae5d — Janna played in response to Atakhan's attack trigger sends him home; 'here' is then his base and nothing dies", () => {
  test("baseline: unanswered, Atakhan's trigger resolves at bf1 and the defender (P2) MUST pick one of X / Y to kill", async () => {
    const game = await board().build();
    await game.p1.move("atakhan", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atakhan", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d.allowDecline).toBe(false);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["X", "Y"]);
    await game.p2.pick("X");
    expect(game.zoneOf("X")).toBe("trash");
  });

  test("Atakhan attacks → trigger on the chain; P2 gets priority and plays Janna (Reaction) to its own bf1 — her play trigger lands ABOVE Atakhan's (P2 spent exactly 3+[calm])", async () => {
    const game = await board().build();
    await game.p1.move("atakhan", "bf1");
    expect(game.state("atakhan").combatRole).toBe("attacker");
    await game.p1.passPriority();
    await game.p2.play("janna", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.locationOf("janna")).toBe("bf1");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("atakhan");
    expect(ids.at(-1)).toBe("janna");
    expect(game.chain().at(-1)).toMatchObject({ cardId: "janna", controller: P2, triggered: true });
  });

  test("Janna's trigger resolves first (LIFO): Atakhan is moved to P1's base and loses Attacker; Atakhan's own trigger is STILL on the chain", async () => {
    const game = await board().build();
    await jannaBouncesAtakhan(game);
    expect(game.locationOf("atakhan")).toBe("base");
    expect(game.state("atakhan").combatRole).not.toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atakhan", controller: P1, triggered: true })]);
  });

  test("Atakhan's trigger then resolves with 'here' = P1's base, where P2 has no units: P2 is never asked to kill, X and Y survive", async () => {
    const game = await board().build();
    await jannaBouncesAtakhan(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const after = game.decision();
    expect(after?.kind === "pick" && after.seat === P2).toBe(false);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.zoneOf("Y")).toBe("battlefield-bf1");
    expect(game.locationOf("janna")).toBe("bf1");
    expect(game.locationOf("atakhan")).toBe("base");
    expect(game.p2.trash()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
