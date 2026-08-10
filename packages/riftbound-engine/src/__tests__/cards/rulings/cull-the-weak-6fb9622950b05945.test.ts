/**
 * Ruling 6fb9622950b05945 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2+[order] "Each player kills one of their units."
 *   × Wages of Pain (SFD-070 → sfd-070-221) · [Hidden] [Action] "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *
 * Q: The opponent plays Cull the Weak, then flips their hidden Wages of Pain to deal 3 to the unit they meant to give up
 *    to Cull. Legal? And do they then have to kill a different unit for Cull?
 * A: Yes. Cull does not target (nothing chosen on play). Wages from hidden is a Reaction, goes on top and resolves first,
 *    killing that unit. When Cull then resolves each player chooses among the units they STILL have: if the Wages player
 *    has another unit they must kill one of those; if none remain they kill nothing (do as much as you can). The other
 *    player must still kill one of their units either way — each player's instruction is independent.
 * Rules: 811 (Hidden → Reaction for [0]; targets at that battlefield), 340 (LIFO), 355 (no target on play), 359.3.e.11.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const WAGES_OF_PAIN = "sfd-070-221";

/**
 * P2's turn. P2 holds bf1 with Runt (3) and a facedown Wages of Pain [+ optionally Brute (5) in base]; exactly 2 + [order]
 * for Cull. P1 (the "you" of the ruling) has Keeper (2) and Squire (1) in base.
 */
function board(p2HasSecondUnit: boolean) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runt" }, "runt")
    .facedown(P2, "bf1", WAGES_OF_PAIN, "wages")
    .hand(P2, CULL_THE_WEAK, "cull")
    .unit(P1, "base", { might: 2, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire");
  return p2HasSecondUnit ? s.unit(P2, "base", { might: 5, name: "Brute" }, "brute") : s;
}

/** P2 casts Cull (names nothing), then flips Wages at its own Runt; both pass → Wages resolves; Cull is left alone on the chain. */
async function cullThenWagesKillsRunt(p2HasSecondUnit: boolean): Promise<Game> {
  const game = await board(p2HasSecondUnit).build();
  await game.p2.cast("cull", { targets: [] }); // nothing is named on play — the kill choices happen on resolution
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P2 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]);
  expect(game.zoneOf("runt")).toBe("battlefield-bf1");
  // Playing from hidden is a Reaction: legal on top of the pending Cull.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "wages")).toBe(true);
  await game.p2.reveal("wages", { answers: ["runt"] });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // the target is chosen as Wages is played
    await game.p2.pick("runt");
  }
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } }); // from hidden for [0]
  expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "wages"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["runt"] });
  // LIFO: Wages of Pain resolves first.
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("wages")).toBe("trash");
  expect(game.zoneOf("runt")).toBe("trash"); // 3 damage on a 3-Might unit
  expect(game.chain().map((c) => c.cardId)).toEqual(["cull"]);
  return game;
}

/** Answer every Cull pick using `prefer`; report which picks were surfaced (seat → offered cards). */
async function resolveCull(game: Game, prefer: Record<string, string>): Promise<{ seat: string; offered: string[]; allowDecline: boolean }[]> {
  const asked: { seat: string; offered: string[]; allowDecline: boolean }[] = [];
  for (let i = 0; i < 8; i++) {
    const stop = await game.settle();
    if (stop.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.kind !== "pick") {
      break;
    }
    const offered = d.options.map((o) => o.card ?? o.key).toSorted();
    asked.push({ allowDecline: d.allowDecline, offered, seat: d.seat });
    const want = prefer[d.seat];
    await game.seat(d.seat).pick(want && offered.includes(want) ? want : (offered[0] as string));
  }
  return asked;
}

describe("Ruling 6fb9622950b05945 — a hidden Wages of Pain flipped onto Cull the Weak kills first; Cull then chooses among what is left", () => {
  test("Wages of Pain (Reaction from hidden) sits above Cull and resolves first: Runt dies and P2 gets an exhausted Gold token while Cull still waits", async () => {
    const game = await cullThenWagesKillsRunt(true);
    const gold = game.p2.gear().filter((g) => game.state(g).isToken);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ isExhausted: true, name: "Gold" });
    expect(game.zoneOf("cull")).toBe("chain");
    expect(game.zoneOf("brute")).toBe("base");
  });

  test("P2 had another unit (Brute): when Cull resolves Runt is no longer available, so P2 must kill Brute; P1 independently chooses and kills one of theirs", async () => {
    const game = await cullThenWagesKillsRunt(true);
    const asked = await resolveCull(game, { [P1]: "squire", [P2]: "brute" });
    // Runt (already in the trash) is never offered to P2; if P2 is asked at all, Brute is the only candidate.
    for (const a of asked.filter((x) => x.seat === P2)) {
      expect(a.offered).toEqual(["brute"]);
    }
    // P1 has two units → P1 is genuinely asked to choose one of ITS units and may not decline.
    const p1Ask = asked.find((x) => x.seat === P1);
    expect(p1Ask).toBeDefined();
    expect(p1Ask?.offered).toEqual(["keeper", "squire"]);
    expect(p1Ask?.allowDecline).toBe(false);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("P2 had NO other unit: Cull does as much as it can — P2 kills nothing (never asked), but P1 must still kill one of their own", async () => {
    const game = await cullThenWagesKillsRunt(false);
    expect(game.p2.units()).toEqual([]);
    const asked = await resolveCull(game, { [P1]: "squire" });
    expect(asked.some((a) => a.seat === P2)).toBe(false);
    const p1Ask = asked.find((x) => x.seat === P1);
    expect(p1Ask?.offered).toEqual(["keeper", "squire"]);
    expect(p1Ask?.allowDecline).toBe(false);
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["runt", "cull", "wages"]));
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
