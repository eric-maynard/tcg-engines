/**
 * Ruling e4c4118a708ec679 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Void Seeker (ogn-024-298) [3][fury] "Deal 4 to a unit at a battlefield. Draw 1." — the lethal spell.
 *
 * Q: If Zhonya's is in my base, MUST it apply when a unit dies? If it is hidden, may I leave it hidden until I want it?
 * A: In base (face up): yes, mandatory — it is a replacement effect, not a "may"; you cannot let the unit die to keep it.
 *    Hidden: it is not in play; revealing it is always optional (you may let the unit die and keep it face down; you can
 *    flip it whenever you could play a Reaction). Gotcha: if the dying unit was your only unit there, you lose the
 *    battlefield at the next cleanup and the still-hidden card is trashed.
 * Rules: 370–373 (replacement effects are not optional), 811 (hidden cards: private, played as a Reaction at will),
 *        323.6/323.7 (empty battlefield lapses; facedown cards there are trashed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn 3 with [3][fury] and Void Seeker. P1 holds bf1 with Ward (2) (+ optionally a 5-Might Anchor). */
function base(withAnchor: boolean) {
  const b = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .unit(P1, "bf1", { might: 2, name: "Ward" }, "ward")
    .hand(P2, VOID_SEEKER, "seeker");
  if (withAnchor) b.unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor");
  return b;
}

/** P2 Void Seekers the Ward and passes; P1 now holds priority with the spell pending. */
async function seekerOnWard(game: Game): Promise<void> {
  await game.p2.cast("seeker", { targets: "ward" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling e4c4118a708ec679 — face-up Zhonya's is mandatory; a hidden one is yours to flip or not", () => {
  test("(1) face up in base: the lethal 4 on Ward is replaced AUTOMATICALLY — no yes/no is ever offered to P1; Hourglass killed, Ward healed/exhausted/recalled", async () => {
    const game = await base(true).gear(P1, ZHONYAS, "zh").build();
    await seekerOnWard(game);
    let offeredChoice = false;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) break;
      if (d.kind === "yes-no") {
        offeredChoice = true;
        break;
      }
      if (d.kind === "action" && d.passKey) await game.seat(d.seat).pass();
      else break;
    }
    expect(offeredChoice).toBe(false);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(2) hidden at bf1: with the lethal spell pending P1 holds priority and MAY flip it (reveal is legal) — but simply passing is legal too; the Ward dies and the Hourglass stays face down (Anchor still holds bf1)", async () => {
    const game = await base(true).facedown(P1, "bf1", ZHONYAS, "zh").build();
    await seekerOnWard(game);
    expect(game.p1.can("reveal", "zh")).toBe(true); // optional to play …
    expect(game.p1.can("passPriority")).toBe(true); // … and optional NOT to
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("ward")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("facedown-bf1"); // kept for later
    expect(game.state("zh").isHidden).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("(2) flipping it instead: revealed for [0] in response, it is in play when Void Seeker resolves and saves the Ward", async () => {
    const game = await base(true).facedown(P1, "bf1", ZHONYAS, "zh").build();
    await seekerOnWard(game);
    await game.p1.reveal("zh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("(2) the gotcha: Ward was P1's ONLY unit at bf1 and P1 keeps the Hourglass hidden — Ward dies, bf1's control lapses at the next cleanup and the still-facedown Zhonya's is TRASHED", async () => {
    const game = await base(false).facedown(P1, "bf1", ZHONYAS, "zh").build();
    await seekerOnWard(game);
    await game.p1.passPriority(); // decline to flip
    await game.settle();
    expect(game.zoneOf("ward")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.trash()).toContain("zh");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(2) timing: on P2's quiet main phase (no chain, no showdown) P1 has no priority and cannot flip it; the window opens once a chain exists", async () => {
    const game = await base(true).facedown(P1, "bf1", ZHONYAS, "zh").build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "zh")).toBe(false);
    await game.p2.cast("seeker", { targets: "anchor" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zh")).toBe(true);
  });
});
