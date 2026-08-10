/**
 * Ruling 0aa580e563018785 — Star Spring (UNL-215 → unl-215-219) × Determined Sentry (UNL-111 → unl-111-219)
 *   Star Spring (battlefield): "The first time a player plays a non-token unit here each turn, they may move
 *   another unit they control here to its base."
 *   Determined Sentry: 1-cost, 1 Might — "I can't move to base."
 *
 * Q: Can Star Spring bounce Determined Sentry back to base?
 * A: No. "I can't move to base" is a restriction and Can't beats Can (rule 054): Star Spring's move-to-base
 *    is simply an impossible instruction for the Sentry and is ignored.
 * Rules: 054 (can't beats can), 144.4.b / 410.1.b.3 (move restrictions), 359.3.e (impossible instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_SPRING = "unl-215-219";
const DETERMINED_SENTRY = "unl-111-219";
const ROOKIE = { cardType: "unit", energyCost: 2, might: 2, name: "Rookie" } as const;

/** P1 controls the live Star Spring (bf1). Determined Sentry (P1) stands there; optionally a plain Scout too. */
function board(withScout: boolean) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1, def: STAR_SPRING, inert: false, owner: P2 })
    .unit(P1, "bf1", DETERMINED_SENTRY, "sentry")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, ROOKIE, "rookie");
  return withScout ? b.unit(P1, "bf1", { might: 2, name: "Scout" }, "scout") : b;
}

/** Walk the Spring's prompts for P1: say yes; on a pick, record what is offered and try `want`. */
async function acceptSpring(game: Game, want: string): Promise<{ asked: boolean; offered: string[]; picked: boolean }> {
  let asked = false;
  let offered: string[] = [];
  let picked = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      asked = true;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      asked = true;
      offered = d.options.map((o) => String(o.card ?? o.key));
      if (offered.includes(want)) {
        await game.p1.pick(want);
        picked = true;
      } else if (d.allowDecline) {
        await game.p1.decline();
      } else {
        await game.p1.pick(offered[0] as string);
      }
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  await game.settle();
  return { asked, offered, picked };
}

describe("Ruling 0aa580e563018785 — Star Spring cannot send Determined Sentry to base (Can't beats Can)", () => {
  test("control: the Spring works on an ordinary unit — playing Rookie here lets P1 send the Scout home", async () => {
    const game = await board(true).build();
    await game.p1.play("rookie", { to: "bf1" });
    const r = await acceptSpring(game, "scout");
    expect(r.asked).toBe(true);
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
  });

  test("Determined Sentry carries its 'can't move to base' restriction on the board", async () => {
    const game = await board(false).build();
    expect(game.state("sentry").keywords).toContain("NoMoveToBase");
    expect(game.state("sentry")).toMatchObject({ location: "bf1", might: 1 });
  });

  test("with the Sentry as the ONLY other unit here: whatever P1 answers, the Sentry does not move to base — the instruction is impossible and ignored (054)", async () => {
    const game = await board(false).build();
    await game.p1.play("rookie", { to: "bf1" });
    expect(game.p1.energy()).toBe(0);
    const r = await acceptSpring(game, "sentry");
    // Either the Sentry is never offered, or choosing it does nothing — both satisfy the ruling.
    if (r.picked) {
      expect(r.offered).toContain("sentry");
    }
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("with Scout AND Sentry here: steering the Spring at the Sentry still moves nothing — the Sentry stays, and the Scout (not chosen) stays too; 'another unit' never offers the Rookie itself", async () => {
    const game = await board(true).build();
    await game.p1.play("rookie", { to: "bf1" });
    const r = await acceptSpring(game, "sentry");
    expect(r.asked).toBe(true);
    expect(r.offered).not.toContain("rookie"); // "another unit" — never the one just played
    expect(r.offered).toContain("scout");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
