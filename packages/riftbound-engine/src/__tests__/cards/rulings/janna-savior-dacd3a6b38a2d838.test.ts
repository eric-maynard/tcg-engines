/**
 * Ruling dacd3a6b38a2d838 — Janna, Savior (SFD-053 → sfd-053-221) · Champion Unit · Calm · 3+[calm] · 3 Might · [Reaction]
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1."   × Falling Star (ogn-029-298) "Deal 3 … Deal 3 …"
 *   × Elder Dragon (unl-118-219) "Any amount of your damage is enough to kill enemy units. …"
 *
 * Q: Can Janna heal back damage from "-4"-style damage cards?
 * A: Yes for damage ALREADY marked (418: healing clears marked damage). But played as a Reaction to a damage spell her
 *    heal resolves FIRST (LIFO) and cannot prevent the incoming damage. Negative Might is not damage and is not healed;
 *    with Elder Dragon out, any damage that does land is lethal, so healing beforehand saves nothing.
 * Rules: 418.1 (heal), 383.4.a (play effect on the chain), 336/339 (LIFO), Elder Dragon static.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JANNA = "sfd-053-221";
const VOID_SEEKER = "ogn-024-298";
const ELDER_DRAGON = "unl-118-219";

/**
 * P1's turn. P2 holds bf1 with a 5-Might Guard already carrying 2 damage from earlier this turn, and Janna in hand with
 * exactly 3+[calm]. P1 holds Void Seeker with exactly 3+[fury].
 */
function board(opts: { guardDamage?: number; guardMightMod?: number; elder?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard", { damage: opts.guardDamage ?? 2, mightModifier: opts.guardMightMod ?? 0 })
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, JANNA, "janna");
  return opts.elder ? s.unit(P1, "base", ELDER_DRAGON, "elder") : s;
}

/** Drive the chain: pass priority for whoever holds it, decline Janna's optional enemy move (none is here anyway). */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P2 && d.allowDecline) {
      await game.p2.decline();
    } else if (d.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else {
      break;
    }
  }
}

describe("Ruling dacd3a6b38a2d838 — Janna heals marked damage, but as a Reaction her heal resolves before the spell's damage", () => {
  test("Reaction line: P1 casts Void Seeker on the 2-damaged Guard, P2 answers with Janna to bf1 — her play effect sits ABOVE Void Seeker on the chain", async () => {
    const game = await board().build();
    expect(game.state("guard").damage).toBe(2);
    await game.p1.cast("seeker", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("play", "janna")).toBe(true);
    await game.p2.play("janna", { to: "bf1" });
    expect(game.locationOf("janna")).toBe("bf1");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("seeker");
    expect(ids.at(-1)).toBe("janna");
    expect(game.chain().at(-1)).toMatchObject({ controller: P2, triggered: true });
  });

  test("LIFO: Janna's heal resolves first (Guard 2 → 0 damage) while Void Seeker still waits; then Void Seeker deals its 4 — the Guard ends with 4 damage (alive at 5 Might): the heal did not prevent the incoming damage", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.play("janna", { to: "bf1" });
    // Resolve only Janna's item.
    for (let i = 0; i < 10 && game.chain().some((c) => c.cardId === "janna"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2 && d.allowDecline) {
        await game.p2.decline();
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    expect(game.state("guard").damage).toBe(0); // healed the OLD damage
    await drain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("seeker")).toBe("trash");
    // Without the heal 2 + 4 = 6 ≥ 5 would have killed it; heal-after would leave 0. Heal-before ⇒ exactly 4.
    expect(game.state("guard")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("after the fact, on P2's own turn: Guard carries 4 damage; P2 simply plays Janna to bf1 and the Guard is fully healed", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard", { damage: 4 })
      .hand(P2, JANNA, "janna")
      .build();
    expect(game.state("guard").damage).toBe(4);
    await game.p2.play("janna", { to: "bf1" });
    await drain(game);
    await game.settle();
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.locationOf("janna")).toBe("bf1");
  });

  test("exception 1 — negative Might is not damage: a Guard at -2 Might this turn (5 → 3) is still 3 Might after Janna's heal", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard", { damage: 1, mightModifier: -2 })
      .hand(P2, JANNA, "janna")
      .build();
    expect(game.state("guard")).toMatchObject({ damage: 1, might: 3, mightModifier: -2 });
    await game.p2.play("janna", { to: "bf1" });
    await drain(game);
    await game.settle();
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 3, mightModifier: -2 });
  });

  test("exception 2 — Elder Dragon: with P1's Elder Dragon on the board, Janna heals first but Void Seeker's 4 on the 5-Might Guard is lethal anyway (any amount of P1's damage kills)", async () => {
    const game = await board({ elder: true, guardDamage: 2 }).build();
    await game.p1.cast("seeker", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.play("janna", { to: "bf1" });
    await drain(game);
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
