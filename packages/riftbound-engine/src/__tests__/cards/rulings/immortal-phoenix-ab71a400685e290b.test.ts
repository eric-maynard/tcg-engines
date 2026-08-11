/**
 * Ruling ab71a400685e290b — Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might · [3][fury]
 *     "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · [2][order] · "Each player kills one of their units."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [2][order] · "Kill a unit at a battlefield. Its controller draws 2."
 *   (SFD-134 "Cull" is an unrelated Equipment that shares the name.)
 *
 * Q: Can Immortal Phoenix be played from the trash if it is killed by my OWN Cull the Weak?
 * A: Yes — you killed a unit (the Phoenix itself) with a spell, so once the spell has resolved the Phoenix, now in the
 *    trash, triggers; pay [1][fury] and play it. Same with other own kill spells such as Hidden Blade.
 * Rules: 383.2.c.1 (the CR's own Immortal Phoenix example: trigger evaluated with the Phoenix already in the trash),
 *        157.3.a (looks back to the kill), 415.1 (play from trash; enters exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMMORTAL_PHOENIX = "ogn-037-298";
const CULL_THE_WEAK = "ogn-209-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P1: Phoenix (only unit) in base, Cull the Weak in hand, exactly [2][order] + [1][fury]. P2: a Grunt (2) in base. */
function cullBoard() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", IMMORTAL_PHOENIX, "phoenix")
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, CULL_THE_WEAK, "cull");
}

/** Pass/answer until P1's Phoenix opt-in (yes/no) or the open main phase. P2 names its Grunt if asked; P1 names the Phoenix if asked. */
async function untilPhoenixAsk(game: Game): Promise<void> {
  for (let i = 0; i < 14; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main") || (d.kind === "yes-no" && d.seat === P1)) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const mine = d.seat === P1 ? "phoenix" : "grunt";
      const o = d.options.find((x) => (x.card ?? x.key) === mine) ?? d.options[0]!;
      await game.seat(d.seat).pick(o.card ?? o.key);
    } else {
      return;
    }
  }
}

/** After YES: take "base" for any destination ask, pass anything else, settle. */
async function landIt(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
      await game.p1.pick(base ? base.key : d.options[0]!.key);
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  await game.settle();
}

describe("Ruling ab71a400685e290b — your own Cull the Weak killing your Immortal Phoenix lets you replay it", () => {
  test("Cull the Weak resolves (Phoenix and Grunt both dead, spell in trash); THEN the Phoenix — from the trash — asks P1 'pay [1][fury] to play me?'", async () => {
    const game = await cullBoard().build();
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await untilPhoenixAsk(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
  });

  test("YES: exactly [1][fury] is paid and the Phoenix is played from the trash back onto P1's board (exhausted, undamaged)", async () => {
    const game = await cullBoard().build();
    await game.p1.cast("cull");
    await untilPhoenixAsk(game);
    await game.p1.yes();
    await landIt(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.units()).toEqual(["phoenix"]);
    expect(game.p1.trash()).toEqual(["cull"]);
    expect(game.state("phoenix")).toMatchObject({ damage: 0, isExhausted: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — 'similar to Hidden Blade': my own Hidden Blade killing my own Phoenix at a battlefield also triggers it (and I, its controller, draw 2); paying brings it back", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.cast("blade", { targets: "phoenix" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await untilPhoenixAsk(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2); // Blade spent, drew 2
    await game.p1.yes();
    await landIt(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.p1.units()).toContain("phoenix");
    expect(game.zoneOf("phoenix")).not.toBe("trash");
  });

  test("declining leaves it in the trash with the [1][fury] unspent", async () => {
    const game = await cullBoard().build();
    await game.p1.cast("cull");
    await untilPhoenixAsk(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });
});
