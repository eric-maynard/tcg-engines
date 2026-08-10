/**
 * Ruling 4b4e969a17943fe8 — Thermo Beam (OGN-022 → ogn-022-298) · Spell · Fury · 5+[fury][fury] · [Action] "Kill all gear."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden] "If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." as the lethal spell being answered)
 *
 * Q: My Zhonya's is hidden at a battlefield; I reveal it before my unit dies. Can the opponent Thermo Beam it away?
 * A: No. A revealed hidden permanent finalizes and resolves immediately — there is no window between the reveal and it
 *    being in play (recalled to base, since gear can't stay at a battlefield). And Thermo Beam is an [Action]: while the
 *    lethal spell's chain is open (Closed state) only Reactions are legal, so by the time an Action could be played the
 *    Hourglass has already done its job.
 * Rules: 811 (Hidden → play as a Reaction for 0), 337.2 (permanents resolve on finalization), 336 (Closed state:
 *        Reactions only), 806.1.b (Action timing), 372 (replacement effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THERMO_BEAM = "ogn-022-298";
const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with 8 energy + 3 fury (Void Seeker AND Thermo Beam affordable). P1 holds bf1: Ward (2) + facedown Zhonya's. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8, power: { fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ward" }, "ward")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .hand(P2, VOID_SEEKER, "vs")
    .hand(P2, THERMO_BEAM, "thermo");
}

/** P2 Void Seekers the Ward (lethal); P2 passes; P1 — holding priority — flips the hidden Zhonya's. */
async function seekerThenReveal(): Promise<Game> {
  const game = await board().build();
  expect(game.p2.can("cast", "thermo")).toBe(true); // affordable and legal in P2's open main phase (nothing to hit yet)
  await game.p2.cast("vs", { targets: "ward" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "zh")).toBe(true);
  await game.p1.reveal("zh");
  return game;
}

describe("Ruling 4b4e969a17943fe8 — no Thermo Beam window against a Zhonya's revealed in response to lethal", () => {
  test.failing("BUG: the reveal resolves on the spot: Zhonya's is face-up in P1's BASE (gear is recalled off the battlefield), it never sits on the chain, and priority did not pass to P2 in between", async () => {
    const game = await seekerThenReveal();
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]); // only the Void Seeker — no Hourglass item to respond to
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("while Void Seeker's chain is open P2 only ever gets Reaction timing: Thermo Beam ([Action]) is not legal at any priority stop before the chain empties", async () => {
    const game = await seekerThenReveal();
    let thermoLegalDuringChain = false;
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") break;
      if (d.seat === P2 && game.p2.can("cast", "thermo")) thermoLegalDuringChain = true;
      await game.seat(d.seat).passPriority();
    }
    expect(thermoLegalDuringChain).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("so the Hourglass does its job first: Void Seeker's 4 would kill Ward → Zhonya's is killed instead, Ward healed/exhausted/recalled; only NOW (open state, P2's turn) is Thermo Beam playable — with the Hourglass already in the trash", async () => {
    const game = await seekerThenReveal();
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "thermo")).toBe(true);
    expect(game.p1.gear()).toEqual([]); // nothing left for it to kill
    expect(game.violations()).toEqual([]);
  });
});
