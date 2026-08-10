/**
 * Ruling 4fe162c8b2a18940 — Atakhan (UNL-170 → unl-170-219) · 7 Might · [Ganking] · "When I attack, the defender must
 *   kill one of their units here."
 *   × Star-Crossed (UNL-128 → unl-128-219) · [Reaction] "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: If Atakhan is bounced to hand or to base in response to his attack trigger, must the defender still kill a unit?
 * A: No. "Here" is evaluated when the trigger resolves: in hand it is nowhere (nothing happens); in base it is a place
 *    where the opponent has no units (nothing to kill). Unanswered, the defender must choose and kill one of their units there.
 * Rules: 359.3 (referents like "here" read on resolution), 383.4.e (attack trigger), 359.3.e.14.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ATAKHAN = "unl-170-219";
const STAR_CROSSED = "unl-128-219";
const OVERZEALOUS_FAN = "sfd-128-221";

/**
 * P1's turn, Atakhan in P1's base. P2 holds bf1 with two 2-might defenders X and Y (plus, per case, the Fan), keeps a
 * 1-might Z in base (Star-Crossed's "friendly unit"), and holds Star-Crossed with exactly [3][chaos].
 */
function board(opts: { fan?: boolean } = {}) {
  const s = scenario()
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ATAKHAN, "atakhan")
    .unit(P2, "bf1", { might: 2, name: "Defender X" }, "X")
    .unit(P2, "bf1", { might: 2, name: "Defender Y" }, "Y")
    .unit(P2, "base", { might: 1, name: "Homebody Z" }, "Z")
    .hand(P2, STAR_CROSSED, "sc");
  return opts.fan ? s.unit(P2, "bf1", OVERZEALOUS_FAN, "fan") : s;
}

describe("Ruling 4fe162c8b2a18940 — Atakhan's 'here' is checked on resolution, so bouncing him blanks the trigger", () => {
  test("baseline: unanswered, the trigger resolves with Atakhan at bf1 — the DEFENDER (P2) must choose one of their units there and it is killed", async () => {
    const game = await board().build();
    await game.p1.move("atakhan", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atakhan", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["X", "Y"]); // P2's units HERE only — not Z in base
    expect(d.allowDecline).toBe(false); // "must"
    await game.p2.pick("X");
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.zoneOf("Y")).toBe("battlefield-bf1");
    expect(game.zoneOf("Z")).toBe("base");
  });

  test("bounced to HAND (Star-Crossed in response): the trigger resolves with no 'here' — P2 kills nothing and is never asked", async () => {
    const game = await board().build();
    await game.p1.move("atakhan", "bf1");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sc")).toBe(true);
    await game.p2.cast("sc", { targets: ["Z", "atakhan"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan", "sc"]);
    // Star-Crossed resolves first (LIFO)…
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("atakhan")).toBe("hand");
    expect(game.zoneOf("Z")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan"]); // his trigger still exists independently…
    // …but resolves doing nothing.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.zoneOf("Y")).toBe("battlefield-bf1");
    expect(game.p2.trash().filter((c) => c !== "sc")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("bounced to BASE (Overzealous Fan's defend trigger resolves first): 'here' is now P1's base where P2 has no units — nothing is killed, no prompt", async () => {
    const game = await board({ fan: true }).build();
    await game.p1.move("atakhan", "bf1");
    // Turn player's trigger goes on first, the Fan's on top; P2 is asked about the Fan's optional kill-me cost.
    expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan", "fan"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" } });
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    for (let i = 0; i < 4 && game.zoneOf("atakhan") !== "base"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("atakhan");
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.zoneOf("atakhan")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.zoneOf("Y")).toBe("battlefield-bf1");
    expect(game.zoneOf("Z")).toBe("base");
    expect(game.p2.trash()).toEqual(["fan"]); // only the Fan (its own cost) died
    expect(game.violations()).toEqual([]);
  });
});
