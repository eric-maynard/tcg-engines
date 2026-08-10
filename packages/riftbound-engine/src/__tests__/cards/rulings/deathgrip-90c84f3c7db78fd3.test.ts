/**
 * Ruling 90c84f3c7db78fd3 — Deathgrip (SFD-163 → sfd-163-221) · Reaction [2] "Kill a friendly unit. If you do, give +[Might] equal
 *     to its Might to another friendly unit this turn. Draw 1."
 *   (Zhonya's Hourglass ogn-077-298 "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it." is
 *    the replaced-kill case mentioned at the end.)
 *
 * Q: When must Deathgrip's controller announce which friendly unit will be killed?
 * A: When the spell is PLAYED — the victim is a target, chosen (and locked) as the spell goes on the chain, before costs are paid
 *    and before anyone can respond. On resolution the locked unit is killed; if it was, the recipient of the Might is chosen then and
 *    you draw 1. If it is no longer legal / the kill is replaced (Zhonya's), no Might is given but you still draw 1.
 * Rules: 355.7–355.8 (targets chosen to put a spell on the chain), 356–358, 359.3.e.14.b ("If you do"), 355.10 (recipient chosen on
 *        resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const ZHONYAS = "ogn-077-298";

/** P1's turn with exactly [2]. Victim (3) and Fodder (1) at P1's bf1, Recipient (2) in base; P2 has a Watcher so a reaction window is real. */
function board(withZhonyas: boolean) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "bf1", { might: 1, name: "Fodder" }, "fodder")
    .unit(P1, "base", { might: 2, name: "Recipient" }, "rec")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
  if (withZhonyas) {
    s.gear(P1, ZHONYAS, "zhonyas");
  }
  return s;
}

describe("Ruling 90c84f3c7db78fd3 — Deathgrip's victim is a target announced as the spell is played", () => {
  test("the victim is a required PLAY-TIME choice: casting without naming it is ambiguous, the legal victims are exactly P1's units, and the recipient is NOT asked yet", async () => {
    const game = await board(false).build();
    const fields = game.p1.option("cast", "grip")?.fields ?? [];
    const targets = fields.find((f) => f.name === "targets");
    expect(targets?.required).toBe(true);
    const offered = [...new Set((targets?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].toSorted();
    expect(offered).toEqual(["fodder", "rec", "victim"]); // friendly units only — one slot, the unit to kill
    const bare = await game.p1.try((p) => p.cast("grip"));
    expect(bare.ok).toBe(false);
    expect((bare as { error: { code: string } }).error.code).toBe("AMBIGUOUS_ACTION");
    expect(game.zoneOf("grip")).toBe("hand"); // nothing happened without the announcement
  });

  test("on play: the named Victim is locked on the chain item and the cost is paid BEFORE P2 gets to respond; nothing has died yet", async () => {
    const game = await board(false).build();
    await game.p1.cast("grip", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", controller: P1, targets: ["victim"] })]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // opponent's window comes after the choice
    expect(game.view(P2).chain[0]?.targets).toEqual(["victim"]); // and the choice is public
  });

  test("on resolution: the locked Victim is killed; only THEN is P1 asked which other friendly unit gets +3; and P1 draws 1", async () => {
    const game = await board(false).build();
    await game.p1.cast("grip", { targets: "victim" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.zoneOf("victim")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["fodder", "rec"]); // "another friendly unit" — the dead Victim is not among them
    await game.p1.pick("rec");
    await game.settle();
    expect(game.state("rec")).toMatchObject({ might: 5, mightModifier: 3 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("kill replaced by Zhonya's Hourglass: the Victim survives (recalled, exhausted), NO Might is handed out and no recipient is asked — but P1 still draws 1", async () => {
    const game = await board(true).build();
    await game.p1.cast("grip", { targets: "victim" });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle({ policy: "first" });
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      // A recipient prompt must never appear; anything else (replacement bookkeeping) is answered with the first option.
      expect(d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "rec")).toBe(false);
    }
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("rec")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("fodder")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("grip")).toBe("trash");
  });
});
