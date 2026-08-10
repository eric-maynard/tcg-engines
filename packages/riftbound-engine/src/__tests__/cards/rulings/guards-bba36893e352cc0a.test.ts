/**
 * Ruling bba36893e352cc0a — Guards! (SFD-154 → sfd-154-221) · Spell · Order · [3] · [Hidden]
 *   "Play a 2 [Might] Sand Soldier unit token. You may pay [order] to ready it."
 *
 * Q: If I REVEAL Guards! (play it from face down), can I play the Sand Soldier to my base?
 * A: No. A hidden spell played from its battlefield that plays a unit must play that unit AT THAT battlefield
 *    (737.1.d.3 / 811.1.d.3). The token cannot go to base.
 * Rules: 811.1.b (played from face down for [0]), 811.1.d.3 (units it plays must be played here), 185.2 (playing a token).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDS = "sfd-154-221";

const soldiers = (game: Game) =>
  game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.zoneOf(id) === "base" || game.zoneOf(id).startsWith("battlefield-"));

/** P1's turn 3, empty pools. P1 holds bf1 with a Holder (3) and Guards! face down there (hidden on an earlier turn); also holds bf2. */
function facedownBoard() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 3, name: "Other Holder" }, "holder2")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .facedown(P1, "bf1", GUARDS, "guards");
}

/** Drive the revealed spell to completion, recording every location prompt P1 is shown; decline the [order] payment. */
async function resolveRecordingLocations(game: Game): Promise<string[][]> {
  const offered: string[][] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) break;
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.key);
      if (keys.some((k) => k === "base" || k.startsWith("battlefield-"))) offered.push(keys);
      await game.p1.pick(keys.find((k) => k === "battlefield-bf1") ?? (keys[0] as string));
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.no();
    } else {
      break;
    }
  }
  return offered;
}

describe("Ruling bba36893e352cc0a — a revealed Guards! must play its Sand Soldier at the battlefield it was hidden at", () => {
  test("revealed from bf1 for [0]: the Sand Soldier token lands AT bf1 — never in base — and P1 is not even offered 'base' (nor bf2) as a location", async () => {
    const game = await facedownBoard().build();
    expect(game.p1.can("reveal", "guards")).toBe(true);
    await game.p1.reveal("guards");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // 811.1.b: played for 0
    const offered = await resolveRecordingLocations(game);
    for (const keys of offered) {
      expect(keys).toEqual(["battlefield-bf1"]); // if asked at all, only "here"
    }
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bf1");
    expect(game.state(made[0] as string)).toMatchObject({ isToken: true, might: 2 });
    expect(game.p1.units("base")).toEqual([]);
    expect(game.zoneOf("guards")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — cast normally from HAND ([3]) with the same board, base IS a legal home for the token (so the restriction above comes from being played from face down)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, GUARDS, "guards")
      .build();
    await game.p1.cast("guards");
    expect(game.p1.energy()).toBe(0);
    let sawBase = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) break;
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        const keys = d.options.map((o) => o.key);
        if (keys.includes("base")) sawBase = true;
        await game.p1.pick(keys.includes("base") ? "base" : (keys[0] as string));
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else {
        break;
      }
    }
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("base");
    // Either base was explicitly offered, or it was the default home — both show base is legal from hand.
    expect(sawBase || game.zoneOf(made[0] as string) === "base").toBe(true);
  });
});
