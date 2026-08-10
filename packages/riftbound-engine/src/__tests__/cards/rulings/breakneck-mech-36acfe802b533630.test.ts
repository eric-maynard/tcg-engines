/**
 * Ruling 36acfe802b533630 — Breakneck Mech (SFD-071 → sfd-071-221) 8+[mind][mind], 7 Might, MECH
 *   "Your Mechs have [Deflect] and [Ganking]. I enter ready if you control another Mech."
 *   × 3-Might Mech unit tokens (as made by Rumble/Assembly Rig etc.; sfd-026-221 Rumble, Hotheaded is the listed Mech lord).
 *
 * Q: Breakneck Mech enters ready because I already have two Mech tokens at a battlefield. Can I move Breakneck Mech
 *    AND one or two of those tokens together, in one move, to attack the enemy-held battlefield?
 * A: Yes — one Standard Move may move several units at once to the SAME destination from DIFFERENT origins, exhausting
 *    each as the cost. The tokens may go battlefield→battlefield because Breakneck Mech grants them Ganking. Moving into
 *    the occupied enemy battlefield opens a showdown/combat.
 * Rules: 144.3 / 144.3.a–c (multi-unit Standard Move: same destination, any origins, exhaust all), 144.4.c.1 (Ganking),
 *        447.1 (moving in starts a Showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BREAKNECK_MECH = "sfd-071-221";
/** A 3-Might Mech unit token, as printed on the SFD token. */
const MECH_TOKEN = { cardType: "unit", isToken: true, might: 3, name: "Mech", tags: ["Mech"] } as const;

/** P1's turn. P1 holds bf1 with two ready Mech tokens; P2 holds bf2 with a 5-Might Guard. P1: Breakneck Mech in hand + exactly 8 + [mind][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", MECH_TOKEN, "m1")
    .unit(P1, "bf1", MECH_TOKEN, "m2")
    .unit(P2, "bf2", { might: 5, name: "Guard" }, "guard")
    .hand(P1, BREAKNECK_MECH, "bnm");
}

async function breakneckPlayed(): Promise<Game> {
  const game = await board().build();
  // Before: the tokens have no Ganking, so they cannot leave bf1 for bf2.
  expect(game.state("m1").keywords).not.toContain("Ganking");
  expect(game.p1.can("gank", "m1")).toBe(false);
  await game.p1.play("bnm", { to: "base" });
  await game.settle();
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  return game;
}

describe("Ruling 36acfe802b533630 — Breakneck Mech and Ganking Mech tokens can attack together in one Standard Move", () => {
  test("Breakneck Mech enters READY in base (P1 controls other Mechs) and the tokens at bf1 now have Deflect + Ganking", async () => {
    const game = await breakneckPlayed();
    expect(game.state("bnm")).toMatchObject({ isReady: true, zone: "base" });
    for (const m of ["m1", "m2"]) {
      expect(game.state(m).keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    }
    expect(game.p1.can("gank", "m1")).toBe(true);
  });

  test("the single Standard Move to bf2 offers any combination of {Breakneck (from base), m1, m2 (from bf1)} — different origins, same destination", async () => {
    const game = await breakneckPlayed();
    const toBf2 = game.p1.legal().find((o) => o.verb === "move" && o.fields.some((f) => f.arg === "units") && /bf2/.test(o.key));
    expect(toBf2).toBeDefined();
    const combos = (toBf2!.fields.find((f) => f.arg === "units")?.options ?? []).map((c) => [...(c as string[])].sort().join("+")).sort();
    expect(combos).toContain("bnm+m1+m2");
    expect(combos).toContain("bnm+m1");
    expect(combos).toContain("m1+m2");
  });

  test("moving Breakneck Mech + both tokens to the Guard's bf2 at once: all three arrive exhausted (cost paid per unit), bf2 becomes contested by P1 and a combat showdown opens with P1 holding Focus", async () => {
    const game = await breakneckPlayed();
    await game.p1.move(["bnm", "m1", "m2"], "bf2");
    for (const u of ["bnm", "m1", "m2"]) {
      expect(game.state(u)).toMatchObject({ isExhausted: true, zone: "battlefield-bf2" });
    }
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // And it is a real attack: 7+3+3 = 13 vs 5 → the Guard dies and P1 conquers bf2.
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("variant: Breakneck Mech plus just ONE token is equally legal (the other token stays holding bf1)", async () => {
    const game = await breakneckPlayed();
    await game.p1.move(["bnm", "m1"], "bf2");
    expect(game.state("bnm").zone).toBe("battlefield-bf2");
    expect(game.state("m1").zone).toBe("battlefield-bf2");
    expect(game.state("m2")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("timing: the multi-unit move is a Main-Phase Open-State action — once the showdown at bf2 is under way, no further Standard Move is offered", async () => {
    const game = await breakneckPlayed();
    await game.p1.move(["bnm"], "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    const r = await game.p1.try((p) => p.move(["m1", "m2"], "bf2"));
    expect(r.ok).toBe(false);
  });
});
