/**
 * Ruling 60df5c14539185ca — Solari Chief (OGN-225 → ogn-225-298) · Unit · [5][order] · 4 Might · "When you play me, choose an enemy
 *     unit. If it is stunned, kill it. Otherwise, stun it."
 *   × Singularity (OGN-105 → ogn-105-298) · Spell (no timing keyword) · [6][mind][mind] · "Deal 6 to each of up to two units."
 *   × Defy (ogn-045-298) "Counter a spell that costs no more than [4] and no more than [rainbow]."  × Wind Wall (ogn-064-298) "Counter a spell."
 *   Reaction used to respond: Discipline (ogn-058-298) "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Can you react to abilities with no Action/Reaction keyword — Solari Chief's triggered ability, or a plain spell like Singularity?
 * A: Yes. Once anything is on the chain both players get priority to respond, whatever its speed. The Chief himself (a permanent)
 *    lands at once with no window; his "When you play me" trigger then goes on the chain (target chosen now); his controller has
 *    priority first, then the opponent may add Reactions; LIFO. Abilities aren't spells, so Defy / Wind Wall can't counter the trigger.
 * Rules: 331–337 (chain & priority), 419.4 (permanents resolve immediately), 383 (triggered ability → chain), 412 (Counter: spells only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOLARI_CHIEF = "ogn-225-298";
const SINGULARITY = "ogn-105-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn: Solari Chief + Singularity in hand with [11] + order + mind×2. P2: two enemy units (Fresh 5 at bf1, Other 3 in base) and
 * Defy, Wind Wall, Discipline in hand with [6] + calm×3.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { mind: 2, order: 1 } })
    .resources(P2, { energy: 6, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Fresh" }, "fresh")
    .unit(P2, "base", { might: 3, name: "Other" }, "other")
    .hand(P1, SOLARI_CHIEF, "chief")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, DISCIPLINE, "disc");
}

/** Play the Chief and choose Fresh for the trigger; returns with the trigger on the chain and P1 holding priority. */
async function chiefChoosingFresh(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("chief");
  expect(game.p1.resources()).toEqual({ energy: 6, power: { mind: 2, order: 0 } });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // "choices are made at this point"
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["fresh", "other"]);
  await game.p1.pick("fresh");
  return game;
}

describe("Ruling 60df5c14539185ca — any chain item can be responded to; Solari Chief's trigger is reactable but not counterable", () => {
  test("the Chief (a permanent) is on the board immediately while his 'When you play me' trigger sits on the chain targeting Fresh; P1 — who played him — holds priority first", async () => {
    const game = await chiefChoosingFresh();
    expect(game.zoneOf("chief")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chief", controller: P1, targets: ["fresh"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("fresh").isStunned).toBe(false); // nothing resolved yet
  });

  test("after P1 passes, P2 gets priority and MAY react to the keyword-less trigger with a Reaction (Discipline) — but Defy / Wind Wall have nothing to counter: an ability is not a spell", async () => {
    const game = await chiefChoosingFresh();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.can("cast", "windwall")).toBe(false);
    await game.p2.cast("disc", { targets: "fresh" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["chief", "disc"]);
  });

  test("both pass → the TOP item (Discipline) resolves first, priority comes round again, then the trigger resolves and stuns Fresh; chain empty, back to P1's main phase", async () => {
    const game = await chiefChoosingFresh();
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "fresh" });
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["chief"]);
    expect(game.state("fresh")).toMatchObject({ isStunned: false, might: 7 });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // "priority passes again"
    for (let i = 0; i < 2 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("fresh")).toMatchObject({ isStunned: true, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Singularity (a spell with no Action/Reaction keyword) is likewise reactable once on the chain — and, being a SPELL, it is a legal Wind Wall target (Defy: no, it costs 6)", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["fresh"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.can("cast", "windwall")).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(false); // 6 > 4
    await game.p2.cast("windwall", { targets: "sing" });
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.state("fresh")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // countered
  });
});
