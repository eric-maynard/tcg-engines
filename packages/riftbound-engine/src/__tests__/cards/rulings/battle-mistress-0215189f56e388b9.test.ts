/**
 * Ruling 0215189f56e388b9 — Battle Mistress (SFD-203 → sfd-203-221, Legend · Sivir)
 *   "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted. When one or more enemy
 *    units die, ready me."
 *   × Flame Chompers (ogn-006-298) "When you discard me, you may pay [fury] to play me."
 *
 * Q: When a rune's Recycle ([Add]) ability triggers Sivir's legend, does priority pass to put the trigger on
 *    the chain, or does it stay pending until priority is passed?
 * A: Neither — the [Add] rune ability finalizes/resolves immediately without passing priority; the Sivir
 *    trigger goes pending and is finalized in the Cleanup that follows, and priority is NOT passed when
 *    finalizing items. You keep priority throughout. Nuance: if the rune is recycled while paying a cost for
 *    another ability (e.g. Flame Chompers), the trigger is finalized in the following cleanup and the
 *    controller of the most recent chain item then has priority.
 * Rules: 400.2 ([Add] resolves immediately), 383.3.a (opt-in at finalization), 319–323 (Cleanup), 332 (priority).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BATTLE_MISTRESS = "sfd-203-221";
const FLAME_CHOMPERS = "ogn-006-298";
const CHEMTECH_ENFORCER = "ogn-003-298"; // 2 · "When you play me, discard 1." — produces the discard

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Every decision surfaced between two points, so we can prove P2 was never asked anything. */
async function step(game: Game, log: Decision[], fn: () => Promise<unknown>): Promise<void> {
  await fn();
  const d = game.decision();
  if (d) {
    log.push(d);
  }
}

describe("Ruling 0215189f56e388b9 — recycling a rune into Battle Mistress: the trigger is finalized without priority ever passing", () => {
  test("open state: P1 recycles a rune → Sivir's opt-in is asked of P1 at FINALIZATION, the trigger sits on the chain, and P1 (not P2) holds priority; it resolves into an exhausted Gold token", async () => {
    const game = await scenario()
      .legend(P1, BATTLE_MISTRESS, "sivir")
      .rune(P1, "fury", { alias: "r1" })
      .rune(P1, "chaos", { alias: "r2" })
      .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
      .build();
    const seen: Decision[] = [];
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    // The Recycle [Add] ability resolves immediately (400.2): the power is already in the pool …
    await step(game, seen, () => game.p1.recycleRune("r1"));
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("r1")).toBe("runeDeck");
    // … and the Sivir trigger is being FINALIZED: its "you may exhaust me" is decided now, by P1 (383.3.a).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sivir" }, timing: "FIN" });
    expect(game.chain().map((i) => [i.cardId, i.triggered])).toEqual([["sivir", true]]);

    await step(game, seen, () => game.p1.yes());
    expect(game.state("sivir").isExhausted).toBe(true); // cost paid at finalization
    // P1 still has priority — the first priority holder on this chain is P1, P2 has not been asked anything.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(seen.every((d) => d.seat === P1)).toBe(true);
    // P1 may keep acting with priority (e.g. the other rune is still offered).
    expect(game.p1.can("recycleRune", "r2")).toBe(true);

    await game.settle();
    const gold = game.p1.gear();
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining at finalization removes the trigger (383.3.a.2): nothing on the chain, legend stays ready, straight back to P1's open main phase", async () => {
    const game = await scenario()
      .legend(P1, BATTLE_MISTRESS, "sivir")
      .rune(P1, "fury", { alias: "r1" })
      .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
      .build();
    await game.p1.recycleRune("r1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("sivir").isExhausted).toBe(false);
    expect(game.p1.gear()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("nuance — rune recycled WHILE PAYING Flame Chompers' [fury]: the Sivir trigger is finalized in the following cleanup and the controller of the most recent chain item (P1) has priority; P2 is never asked in between", async () => {
    const game = await scenario()
      .legend(P1, BATTLE_MISTRESS, "sivir")
      .resources(P1, { energy: 2 })
      .rune(P1, "fury", { alias: "r1" })
      .hand(P1, CHEMTECH_ENFORCER, "enforcer")
      .hand(P1, FLAME_CHOMPERS, "chompers")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
      .build();
    await game.p1.play("enforcer", { to: "base" });
    // Drive Enforcer's "discard 1" to the point where Chompers' "you may pay [fury]" is being asked.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || d.kind === "yes-no") {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.zoneOf("chompers")).toBe("trash");
    const pay = game.decision();
    expect(pay).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
    // No fury yet ⇒ can't accept; the rune's Recycle stays legal during the payment (429.3.a).
    expect(pay?.kind === "yes-no" ? pay.canAccept : undefined).toBe(false);
    expect((pay?.kind === "yes-no" ? (pay.actions ?? []) : []).map((a) => a.key)).toContain("recycleRune:r1");

    const seen: Decision[] = [];
    await step(game, seen, () => game.p1.recycleRune("r1"));
    expect(game.p1.power("fury")).toBe(1);
    // Still paying for Chompers; Sivir's trigger is pending/behind it.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
    await step(game, seen, () => game.p1.yes()); // pay [fury]
    expect(game.p1.power("fury")).toBe(0);
    // Now the Sivir trigger is finalized — P1 decides its opt-in …
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sivir" }, timing: "FIN" });
    await step(game, seen, () => game.p1.yes());
    expect(game.state("sivir").isExhausted).toBe(true);
    // … and the controller of the most recent chain item (Battle Mistress → P1) has priority.
    const top = game.chain().at(-1);
    expect(top).toMatchObject({ cardId: "sivir", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(seen.every((d) => d.seat === P1)).toBe(true);

    await game.settle();
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.gear().map((g) => game.state(g).name)).toEqual(["Gold"]);
    expect(game.violations()).toEqual([]);
  });
});
