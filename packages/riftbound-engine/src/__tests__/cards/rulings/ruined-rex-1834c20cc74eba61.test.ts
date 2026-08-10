/**
 * Ruling 1834c20cc74eba61 — Ruined Rex (UNL-067 → unl-067-219) · 6 Might · "[Deathknell] Deal 4 to an enemy unit."
 *   × Ferrous Forerunner (SFD-021 → sfd-021-221) · 6 Might · "[Deathknell] — Play two 3 [Might] Mech unit tokens
 *     to your base."  (SFD-026 Rumble is listed on the ruling only as Mech context.)
 *
 * Q: Opponent's Rex and my Forerunner die in the same combat. Can the opponent aim Rex's Deathknell at the two
 *    Mech tokens my Forerunner's Deathknell makes?
 * A: No. Both Deathknells trigger at the same moment and go on the chain together; Rex's target is fixed when
 *    its trigger is put on the chain. The Mechs are only created when Forerunner's item RESOLVES, so even if
 *    that happens first, they were never legal choices for Rex — Rex hits a unit that existed when he died.
 * Rules: 808.2 / 808.1.d.2 (simultaneous deathknells → chain), 355.5 (targets chosen on finalize), 337.3, LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const FERROUS_FORERUNNER = "sfd-021-221";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P2's Rex (6) attacks P1's Forerunner (6) at bf1 → both die in one combat. */
function board(bystanders: number) {
  let s = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FERROUS_FORERUNNER, "forerunner")
    .unit(P2, "base", RUINED_REX, "rex");
  for (let i = 0; i < bystanders; i++) {
    s = s.unit(P1, "base", { might: 5, name: `Bystander ${i}` }, `bys${i}`);
  }
  return s;
}

const mechs = (game: Game) => game.p1.units("base").filter((u) => /mech/i.test(game.state(u).name));

/** Step the chain one pass at a time until `stop` holds (or the main phase reopens). */
async function passUntil(game: Game, stop: (d: Decision | null) => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (stop(d) || !d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "order") {
      await game.seat(d.seat).order(d.items.map((it) => it.key));
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Ruling 1834c20cc74eba61 — Rex's Deathknell cannot reach the Mechs Forerunner's Deathknell creates", () => {
  test("both die together; both Deathknells go on the chain at once with Rex's target already locked to the one enemy unit that exists (the Bystander) — no Mechs exist yet", async () => {
    const game = await board(1).build();
    await game.p2.move("rex", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus(); // combat: 6 vs 6 → both die
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("forerunner")).toBe("trash");
    await passUntil(game, (d) => d?.kind === "action" && d.context === "chain");
    const chain = game.chain();
    expect(chain.map((c) => `${c.cardId}:${c.controller}`).sort()).toEqual(["forerunner:player-1", "rex:player-2"]);
    expect(chain.find((c) => c.cardId === "rex")?.targets).toEqual(["bys0"]);
    expect(mechs(game)).toEqual([]);
  });

  test("Forerunner's item resolves FIRST (it sits above Rex): the two Mechs appear while Rex is still waiting on the chain — and Rex still resolves onto the Bystander (4 damage), Mechs untouched", async () => {
    const game = await board(1).build();
    await game.p2.move("rex", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    // Pass until Forerunner has resolved but Rex has not.
    await passUntil(game, () => mechs(game).length > 0);
    expect(mechs(game)).toHaveLength(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex"]);
    expect(game.chain()[0]?.targets).toEqual(["bys0"]); // not re-chosen now that Mechs exist
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("bys0").damage).toBe(4);
    for (const m of mechs(game)) {
      expect(game.state(m)).toMatchObject({ damage: 0, might: 3 });
      expect(game.zoneOf(m)).toBe("base");
    }
    expect(mechs(game)).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("with two Bystanders P2 is asked to CHOOSE Rex's target — the offer is exactly the two Bystanders, never a Mech", async () => {
    const game = await board(2).build();
    await game.p2.move("rex", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await passUntil(game, (d) => d?.kind === "pick");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = (d as PickD).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["bys0", "bys1"]);
    expect(mechs(game)).toEqual([]);
    await game.p2.pick("bys1");
    await game.settle();
    expect(game.state("bys1").damage).toBe(4);
    expect(game.state("bys0").damage).toBe(0);
    expect(mechs(game)).toHaveLength(2);
    for (const m of mechs(game)) {
      expect(game.state(m).damage).toBe(0);
    }
  });

  test("with NO other enemy unit when Rex dies, his Deathknell has nothing to hit — the Mechs that arrive afterwards are never damaged or killed", async () => {
    const game = await board(0).build();
    await game.p2.move("rex", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      // If the engine (wrongly) offers a late target pick it could only list Mechs — refuse it.
      if (d.kind === "pick") {
        expect((d as PickD).options.map((o) => game.state(o.card ?? o.key).name)).not.toContain("Mech");
        await game.seat(d.seat).decline();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    const made = mechs(game);
    expect(made).toHaveLength(2);
    for (const m of made) {
      expect(game.state(m)).toMatchObject({ damage: 0, might: 3 });
    }
    expect(game.p1.trash().filter((c) => /mech/i.test(game.state(c).name))).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
