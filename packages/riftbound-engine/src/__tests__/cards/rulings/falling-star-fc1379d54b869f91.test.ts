/**
 * Ruling fc1379d54b869f91 — Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · [2][fury][fury]
 *     "Deal 3 to a unit. Deal 3 to a unit."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: An enemy Falling Stars my 3-Might unit wearing Guardian Angel with both instances. Does the first 3 pop GA and the
 *    second kill it, or is it 6 and GA?
 * A: The unit survives. The two 3s are simply dealt during resolution; the unit reaching lethal damage would die ONCE
 *    and Guardian Angel replaces that single death: GA is killed instead, the unit is healed, exhausted and recalled to
 *    base. There is no second death — the unit is safe in base with no damage.
 * Rules: 366–373 (replacement effects; 373 one replacement per event), 359.3 (spell resolves in full), 428 (death on
 *        lethal damage at Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn with exactly [2][fury][fury]. P2 holds bf1 with the Ward (3, wearing Guardian Angel → 4). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Ward" }, "ward", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "ward" }, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, FALLING_STAR, "star");
}

async function starBothOnWard(): Promise<Game> {
  const game = await board().build();
  expect(game.state("ward")).toMatchObject({ attachments: ["ga"], might: 4 });
  await game.p1.cast("star", { targets: ["ward", "ward"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1, targets: ["ward", "ward"] })]);
  return game;
}

describe("Ruling fc1379d54b869f91 — both halves of Falling Star on a Guardian-Angel unit: one death event, replaced once; the unit lives", () => {
  test("the spell resolves in full (6 damage worth) and the Ward would die ONCE: Guardian Angel is killed instead, the Ward is healed (0 damage), exhausted and recalled to P2's base — NOT in the trash", async () => {
    const game = await starBothOnWard();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash"); // "kill Guardian Angel instead"
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.p2.trash()).not.toContain("ward");
    expect(game.state("ward")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, location: "base", might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("no 'second death': P2 is never asked anything (a single replacement handles the single event) and only ONE Guardian Angel was consumed for the whole spell", async () => {
    const game = await starBothOnWard();
    let p2Asked = 0;
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.seat === P2) {
        p2Asked += 1;
      }
      break;
    }
    expect(p2Asked).toBe(0);
    expect(game.p2.trash()).toEqual(["ga"]);
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.state("ward").damage).toBe(0); // the "other 3" did not stick around either
  });

  test("contrast — the same Ward WITHOUT Guardian Angel just dies to 3 + 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Ward" }, "ward")
      .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, FALLING_STAR, "star")
      .build();
    await game.p1.cast("star", { targets: ["ward", "ward"] });
    await game.settle();
    expect(game.zoneOf("ward")).toBe("trash");
  });

  test("contrast — splitting the halves [Ward, Holder]: the Ward (4 with GA) takes 3 and survives undisturbed (GA untouched), the 2-Might Holder dies", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["ward", "holder"] });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("battlefield-bf1");
    expect(game.state("ward")).toMatchObject({ attachments: ["ga"], damage: 3, might: 4 });
    expect(game.zoneOf("ga")).not.toBe("trash");
  });
});
