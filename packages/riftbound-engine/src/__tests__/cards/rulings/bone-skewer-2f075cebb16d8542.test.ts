/**
 * Ruling 2f075cebb16d8542 — Bone Skewer (UNL-139 → unl-139-219) · Action spell · [2][chaos] · Hidden
 *   "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that
 *    unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might · "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can Bone Skewer choose a Ruin Runner from the opponent's hand?
 * A: Yes. Ruin Runner's "can't be chosen" protection is only active while it is on the board; in hand
 *    the ability is not active, so it is a legal choice — the opponent plays it to the chosen
 *    battlefield for free and it is stunned.
 * Rules: 153.3 / 757 (abilities function only on the board unless stated), 355.9.b, 419.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const RUIN_RUNNER = "sfd-105-221";

/** P1's turn with exactly [2][chaos]. P1 holds bf1. P2's hand: Ruin Runner + a decoy spell; P2 has no resources. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P2, RUIN_RUNNER, "runner")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Decoy Spell", timing: "action" }, "decoy")
    .hand(P1, BONE_SKEWER, "skewer");
}

/** Cast Bone Skewer naming bf1 (at play or on resolution — whichever the engine asks) and pass to resolution. */
async function castSkewerAtBf1(game: Game): Promise<void> {
  const opt = game.p1.option("cast", "skewer");
  expect(opt).toBeDefined();
  if (opt?.fields.some((f) => f.name === "targets" && (f.options ?? []).flat().includes("bf1"))) {
    await game.p1.cast("skewer", { targets: "bf1" });
  } else {
    await game.p1.cast("skewer");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "bf1") && !d.options.some((o) => o.card === "runner")) {
    await game.p1.pick("bf1");
  }
}

describe("Ruling 2f075cebb16d8542 — Bone Skewer may choose a Ruin Runner from the opponent's hand", () => {
  test("control: on the board, Ruin Runner IS protected — an enemy spell cannot choose it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "runner")
      .unit(P2, "bf1", { might: 5, name: "Plain Five" }, "plain")
      .hand(P1, { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Bolt", timing: "action" }, "bolt")
      .build();
    const offered = (game.p1.option("cast", "bolt")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("plain");
    expect(offered).not.toContain("runner");
  });

  test("in hand the protection is inactive: after the reveal P1 is offered Ruin Runner (a unit) and not the decoy spell", async () => {
    const game = await board().build();
    await castSkewerAtBf1(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("runner");
    expect(offered).not.toContain("decoy");
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(true); // "you may choose"
  });

  test("P1 chooses Ruin Runner → P2 plays it to bf1 for free, and it arrives stunned", async () => {
    const game = await board().build();
    await castSkewerAtBf1(game);
    await game.p1.pick("runner");
    // Drain the instructed play (destination is fixed; tolerate forced prompts) but stop at any open/showdown state.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) break;
      if (d.kind === "action") {
        if (d.context !== "chain") break;
        await game.seat(d.seat).passPriority();
      } else {
        const r = await game.settle({ maxSteps: 1 });
        if (r.reason === "unanswered") break;
      }
    }
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").controller).toBe(P2);
    expect(game.state("runner").isStunned).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // "ignoring any and all costs"
    expect(game.zoneOf("skewer")).toBe("trash");
  });
});
