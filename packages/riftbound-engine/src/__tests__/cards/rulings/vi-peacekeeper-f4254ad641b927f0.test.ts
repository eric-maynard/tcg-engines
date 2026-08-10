/**
 * Ruling f4254ad641b927f0 — Vi, Peacekeeper (UNL-176 → unl-176-219) · Unit · Order · [5][order] · 5 Might · [Ambush]
 *     "When I attack, [Stun] an enemy unit here."
 *   × Janna, Savior (SFD-053 → sfd-053-221) · Unit · Calm · [3][calm] · 3 Might · [Reaction]
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *
 * Q: Vi attacks and tries to stun my unit; I react with Janna to push Vi back to base. Does the stun still apply?
 * A: No. Vi's attack trigger goes on the chain; Janna (Reaction) is played on top and her play trigger resolves first
 *    (heal, move Vi to base). When Vi's trigger resolves, "here" is checked from Vi's current location — she is no
 *    longer at the battlefield, so the instruction fails and nothing is stunned.
 * Rules: 383.4.e (attack trigger), 340 (LIFO), 359.3.f.2 / 359.3.f.4 ("here" read from the source on execution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "unl-176-219";
const JANNA = "sfd-053-221";

/** P1's turn. Vi ready in P1's base. P2 holds bf1 with a Grunt (3) carrying 1 damage; P2 has Janna in hand and exactly [3][calm]. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt", { damage: 1 })
    .unit(P1, "base", VI, "vi")
    .hand(P2, JANNA, "janna");
}

/** Vi attacks bf1; her trigger (only Grunt is choosable) lands on the chain; P1 passes priority to P2. */
async function viAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vi", "bf1");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("grunt");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.state("vi").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** P2 plays Janna to bf1 in response and names Vi for "move up to one enemy unit from here to its base". */
async function jannaAnswers(game: Game): Promise<void> {
  expect(game.p2.can("play", "janna")).toBe(true);
  await game.p2.play("janna", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      expect(d.source?.cardId).toBe("janna");
      expect(d.options.map((o) => o.card ?? o.key)).toContain("vi");
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "vi")?.key ?? "vi");
    } else if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
}

describe("Ruling f4254ad641b927f0 — Janna, Savior bounces the attacking Vi; Vi's 'stun an enemy unit here' then does nothing", () => {
  test("Vi attacks: her trigger is on the chain; P2 plays Janna (Reaction) to bf1 in response — chain = [Vi trigger, Janna trigger], nothing stunned yet", async () => {
    const game = await viAttacks();
    await jannaAnswers(game);
    expect(game.locationOf("janna")).toBe("bf1");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("vi");
    expect(ids.at(-1)).toBe("janna");
    expect(game.chain().at(-1)).toMatchObject({ cardId: "janna", controller: P2, triggered: true });
    expect(game.state("grunt").isStunned).toBe(false);
  });

  test("LIFO: Janna's trigger resolves first — P2's units there are healed and Vi is moved to P1's base (no longer an attacker) — while Vi's trigger still waits", async () => {
    const game = await viAttacks();
    await jannaAnswers(game);
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("grunt").damage).toBe(0); // healed
    expect(game.locationOf("vi")).toBe("base");
    expect(game.state("vi").combatRole).not.toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
    expect(game.state("grunt").isStunned).toBe(false);
  });

  test("Vi's trigger then resolves with its source no longer 'here': the Grunt is NOT stunned; bf1 stays P2's with Grunt + Janna, Vi sits in P1's base", async () => {
    const game = await viAttacks();
    await jannaAnswers(game);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").isStunned).toBe(false);
    await game.settle();
    expect(game.state("grunt").isStunned).toBe(false);
    expect(game.state("janna").isStunned).toBe(false);
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1");
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no response: Vi's trigger resolves at bf1 and the Grunt IS stunned", async () => {
    const game = await viAttacks();
    await game.p2.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("grunt").isStunned).toBe(true);
    expect(game.locationOf("vi")).toBe("bf1");
  });
});
