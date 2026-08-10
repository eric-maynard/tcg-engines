/**
 * Ruling 8eb25354ba66b233 — Dragon's Rage (OGN-258 → ogn-258-298) · 4 + [rainbow]
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their
 *      Mights to each other."
 *   × Wizened Elder (OGN-065 → ogn-065-298) · 4 Might   (+ an enemy "Lee Sin" already sharing the Elder's battlefield)
 *
 * Q: Can Dragon's Rage target Lee Sin "moving" him to where he already is (next to Wizened Elder) to make them fight?
 * A: No. You cannot move a unit to its current location; with no destination there is no move and the reflexive
 *    "Then do this" never happens. The unit's own location is simply not a destination.
 * Rules: 446 / 447.2 (a move needs a different, valid destination), 387–388 (reflexive trigger follows the move).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";
const WIZENED_ELDER = "ogn-065-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn with 4 + [rainbow]. P2 holds bf1 with Lee Sin (5) AND Wizened Elder (4); bf2 (P2's) has a Sentry (2). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Lee Sin" }, "lee")
    .unit(P2, "bf1", WIZENED_ELDER, "elder")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, DRAGONS_RAGE, "rage");
}

/** Cast Dragon's Rage on Lee Sin and step to the destination prompt. */
async function toDestinationPrompt(): Promise<{ game: Game; d: PickD }> {
  const game = await board().build();
  await game.p1.cast("rage", { targets: "lee" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  return { d: d as PickD, game };
}

describe("Ruling 8eb25354ba66b233 — Dragon's Rage cannot 'move' a unit to where it already is", () => {
  test("ruling 8eb25354ba66b233 — Lee Sin's destinations do NOT include bf1 (where he and the Elder already are); real destinations (base, bf2) are offered", async () => {
    const { d } = await toDestinationPrompt();
    const dests = d.options.map((o) => o.zone ?? o.key);
    expect(dests).not.toContain("battlefield-bf1");
    expect(dests).toContain("battlefield-bf2");
    expect(dests).toContain("base");
    // and it cannot be forced either
    expect(d.options.some((o) => o.key === "battlefield-bf1")).toBe(false);
  });

  test("so Lee Sin can never be made to fight the Elder in place: whatever legal destination is taken, the Elder is untouched", async () => {
    const { game } = await toDestinationPrompt();
    const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(false);
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.state("elder")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("control: a real move works as printed — Lee Sin → bf2, then the reflexive fight with the other enemy there: Sentry (2) dies, Lee Sin takes 2", async () => {
    const { game } = await toDestinationPrompt();
    await game.p1.pick("battlefield-bf2");
    // The reflexive "Then do this" is a new pending item; Sentry is the only other enemy at the destination.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("sentry");
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.locationOf("lee")).toBe("bf2");
    expect(game.state("lee").damage).toBe(2);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
