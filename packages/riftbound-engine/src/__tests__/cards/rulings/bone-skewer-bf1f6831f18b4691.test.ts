/**
 * Ruling bf1f6831f18b4691 — Bone Skewer (UNL-139 → unl-139-219) [2][chaos] "[Hidden] Choose a battlefield. An opponent reveals their
 *   hand. You may choose a unit from it. They play that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Ruin Runner (SFD-105 → sfd-105-221) 5 Might "I can't be chosen by enemy spells and abilities."
 *
 * Q: If I Bone Skewer a Ruin Runner, does it come in stunned?
 * A: Yes. "Can't be chosen" only works while the Runner is on the board; in hand it is a legal choice. The opponent plays it to the
 *    chosen battlefield as part of Bone Skewer's resolution and "then [Stun] it" applies as it enters — its protection turning on
 *    afterwards is too late.
 * Rules: 365.1 / 366.1 (passives function on the board), 355.10.a (hand cards aren't targets), Bone Skewer's linked stun.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const RUIN_RUNNER = "sfd-105-221";

/** P1's turn with [2][chaos]. P1 holds bf1 with a Guard (2). P2's hand: Ruin Runner + a Grunt; P2 has no resources. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, RUIN_RUNNER, "runner")
    .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" }, "grunt");
}

/** Cast Bone Skewer at bf1 and advance to P1's "choose a unit from the revealed hand" pick. */
async function skewerAtBf1(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  const field = game.p1.option("cast", "skewer")?.fields.find((f) => f.name === "targets");
  await (field ? game.p1.cast("skewer", { targets: "bf1" }) : game.p1.cast("skewer"));
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 4; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "bf1")) {
      await game.p1.pick("bf1");
      continue;
    }
    break;
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Ruling bf1f6831f18b4691 — Bone Skewer can pull a Ruin Runner from hand, and it enters stunned", () => {
  test("P2's hand is revealed and P1 may choose the Ruin Runner from it — 'can't be chosen' is inactive in hand (the Grunt is offered too; 'may' ⇒ declinable)", async () => {
    const game = await board().build();
    const d = await skewerAtBf1(game);
    const offered = d.options.map((o) => o.card ?? o.key);
    expect(offered).toContain("runner");
    expect(offered).toContain("grunt");
    expect(d.allowDecline).toBe(true);
    expect(d.options.find((o) => (o.card ?? o.key) === "runner")?.deflect ?? 0).toBe(0); // no surcharge either
  });

  test("choosing it: P2 PLAYS the Ruin Runner to bf1 ignoring all costs (P2 has 0/0) and it arrives STUNNED under P2's control; Skewer → trash", async () => {
    const game = await board().build();
    await skewerAtBf1(game);
    await game.p1.pick("runner");
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.state("runner")).toMatchObject({ controller: P2, isStunned: true });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.zoneOf("skewer")).toBe("trash");
  });

  test("once on the board its protection IS live (an enemy targeted spell can't choose it) — but the stun already stuck: it deals no combat damage, so P1's 2-Might Guard survives the ensuing combat", async () => {
    const game = await board().hand(P1, "ogn-229-298", "venge").build(); // Vengeance "Kill a unit."
    await skewerAtBf1(game);
    await game.p1.pick("runner");
    expect(game.state("runner").keywords).toContain("Untargetable");
    await game.p1.do("addResources", { energy: 4, power: { order: 2 } });
    const targets = (game.p1.option("cast", "venge")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("runner");
    await game.settle(); // the Runner's arrival contested bf1 → combat: stunned Runner (5) deals 0, Guard deals 2
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
