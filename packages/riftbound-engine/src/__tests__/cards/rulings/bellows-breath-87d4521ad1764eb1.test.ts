/**
 * Ruling 87d4521ad1764eb1 — Bellows Breath (SFD-080 → sfd-080-221) · Action [1][mind] "[Repeat] [1][mind] … Deal 1 to up to
 *     three units at the same location."
 *   × Guardian Angel (SFD-051 → sfd-051-221, Equipment) / Zhonya's Hourglass (ogn-077-298, Gear): "If (this unit) would die,
 *     kill (me) instead. Heal it, exhaust it, and recall it."
 *
 * Q: Bellows Breath with Repeat targets the same 1-Might unit twice — does Zhonya's / Guardian Angel proc between the two
 *    hits (and so get used up, letting the second hit kill the unit)?
 * A: No. Lethal damage is only checked in a Cleanup, and no Cleanup happens in the middle of a resolving spell. Both hits
 *    land (2 damage on a 1-Might unit), the spell finishes, THEN the Cleanup sees a dying unit and the replacement saves it
 *    once: the protector is killed instead and the unit is healed, exhausted and recalled.
 * Rules: 820 (Repeat = one spell executed twice), 322/323 (Cleanup after a chain item resolves), 428 (lethal damage checked in
 *        Cleanup), 369–373 (die-replacement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P2's turn with exactly base + repeat ([2] + mind×2). P1's 1-Might Wisp holds P1's bf1. */
function board(protector: "zhonyas" | "ga" | "none") {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P2, BELLOWS_BREATH, "bb");
  if (protector === "ga") {
    // 1 + Guardian Angel's +1 = 2 Might, already carrying 1 damage — so (as in the ruling) the FIRST hit is already lethal.
    s.unit(P1, "bf1", { might: 1, name: "Wisp" }, "wisp", { damage: 1, equippedWith: ["ga"] } as Record<string, unknown>).card("ga", {
      def: GUARDIAN_ANGEL,
      meta: { attachedTo: "wisp" } as Record<string, unknown>,
      owner: P1,
      zone: "bf1",
    });
  } else {
    s.unit(P1, "bf1", { might: 1, name: "Wisp" }, "wisp");
    if (protector === "zhonyas") {
      s.gear(P1, ZHONYAS, "zhonyas");
    }
  }
  return s;
}

describe("Ruling 87d4521ad1764eb1 — a Repeated Bellows Breath on one unit: the die-replacement procs once, in the Cleanup AFTER the spell", () => {
  test("control (no protector): both executions hit the same Wisp — 2 damage on a 1-Might unit — and it dies in the Cleanup after the spell", async () => {
    const game = await board("none").build();
    await game.p2.cast("bb", { repeat: 1, targets: ["wisp"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1); // one spell, not two
    await game.settle();
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("wisp")).toBe("trash");
  });

  // Expected: both hits land, one Cleanup after the spell, Zhonya's dies instead, Wisp survives in base (healed, exhausted).
  // Actual: the engine checks lethal damage between the two Repeat executions — Zhonya's fires after the FIRST hit (Wisp
  // recalled), then the second hit kills the now-unprotected Wisp: both Zhonya's and the Wisp end in the trash.
  test("ruling 87d4521ad1764eb1 — no death check between the Repeat executions: one post-spell Cleanup, Zhonya's dies instead and the Wisp survives (820, 428, 369)", async () => {
    const game = await board("zhonyas").build();
    await game.p2.cast("bb", { repeat: 1, targets: ["wisp"] });
    await game.settle({ policy: "first" }); // accept a replacement prompt if one is surfaced
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    // Had Zhonya's fired between the hits, the second point of damage would have found an unprotected 1-Might Wisp and killed it.
    expect(game.zoneOf("wisp")).toBe("base");
    expect(game.state("wisp")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // Same engine behaviour with Guardian Angel: GA is consumed after the first (already lethal) hit and the second hit kills the Wisp.
  test("ruling 87d4521ad1764eb1 — Guardian Angel is likewise consulted only in the single post-spell Cleanup: GA is killed instead and the Wisp stays in base", async () => {
    const game = await board("ga").build();
    expect(game.state("wisp")).toMatchObject({ attachments: ["ga"], damage: 1, might: 2 });
    await game.p2.cast("bb", { repeat: 1, targets: ["wisp"] });
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("wisp")).toBe("base");
    expect(game.state("wisp")).toMatchObject({ attachments: [], damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });
});
