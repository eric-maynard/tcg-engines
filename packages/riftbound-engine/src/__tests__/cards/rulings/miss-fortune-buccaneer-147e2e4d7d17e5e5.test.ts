/**
 * Ruling 147e2e4d7d17e5e5 — Miss Fortune, Buccaneer (OGN-193 → ogn-193-298) 4 Might "You may play me to an
 *   open battlefield. Friendly units may be played to open battlefields."
 *   × Yone, Blademaster (SFD-116 → sfd-116-221) 5 Might "[Weaponmaster] (When you play me, you may [Equip] one
 *     of your Equipment to me for [rainbow] less…) When I conquer a battlefield that was uncontrolled, deal
 *     damage equal to my Might to an enemy unit in a base."   (+ Doran's Blade sfd-095-221 as the Equipment)
 *
 * Q: With Miss Fortune out I play Yone to an open battlefield — does Weaponmaster resolve before or after his
 *    conquer damage?
 * A: Before. Weaponmaster is a "when you play me" trigger: it goes on the chain and resolves as part of playing
 *    him. Playing him to the open battlefield then starts a showdown; only after it ends and he actually
 *    conquers does the conquer trigger go on the chain — so it uses his equipped Might.
 * Rules: 821 (Weaponmaster), 383 (play triggers), 344/345 (showdown at an open battlefield), 469.1 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE = "ogn-193-298";
const YONE = "sfd-116-221";
const DORANS_BLADE = "sfd-095-221"; // Equipment · Equip [body] · +2 Might

/** P1's turn: Miss Fortune in base, Doran's Blade (unattached) in base, Yone in hand with exactly 5 + [body]. bf1 open. P2: a 7-Might Colossus at home. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .gear(P1, DORANS_BLADE, "blade")
    .hand(P1, YONE, "yone")
    .unit(P2, "base", { might: 7, name: "Colossus" }, "colossus")
    .unit(P2, "bf2", { might: 2, name: "Outpost" }, "outpost");
}

type ShowdownView = { battlefieldId: string; active: boolean; isCombatShowdown?: boolean; focusPlayer?: string };
/** Pass priority while a chain is pending; stop at anything else (e.g. the showdown). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

function openShowdown(game: Game): ShowdownView | undefined {
  const stack = (game.gameState.interaction as { showdownStack?: ShowdownView[] } | undefined)?.showdownStack ?? [];
  const top = stack.at(-1);
  return top?.active ? top : undefined;
}

describe("Ruling 147e2e4d7d17e5e5 — Yone played to an open battlefield via Miss Fortune: Weaponmaster first, conquer trigger only after the showdown", () => {
  test("Miss Fortune lets Yone be PLAYED straight to the open bf1 (base and bf1 offered; the enemy-held bf2 is not)", async () => {
    const game = await board().build();
    const to = game.p1.option("play", "yone")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toContain("battlefield-bf1");
    expect(to).toContain("base");
    expect(to).not.toContain("battlefield-bf2");
  });

  test("step 1 — Weaponmaster: right after the play Yone stands at bf1 and P1 is asked to Equip (Doran's Blade offered, declinable) BEFORE any conquer/damage prompt exists; taking it makes him 7 for free", async () => {
    const game = await board().build();
    await game.p1.play("yone", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("yone")).toBe("bf1");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("blade");
    // Nothing about conquering yet: no point, bf1 not P1's, Colossus untouched.
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.state("colossus").damage).toBe(0);
    await game.p1.pick("blade");
    await drainChain(game); // the Weaponmaster item resolves
    expect(game.state("blade").attachedTo).toBe("yone");
    expect(game.state("yone").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // [body] − [rainbow] = free
    // Still nothing about conquering.
    expect(game.p1.points()).toBe(0);
    expect(game.state("colossus").damage).toBe(0);
  });

  test("step 2 — then a (non-combat) showdown opens at bf1; still no conquer: 0 points, no damage prompt, Colossus at 0 damage", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.play("yone", { to: "bf1" });
    await game.p1.pick("blade");
    await drainChain(game);
    expect(game.state("yone").might).toBe(7); // Weaponmaster already done
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.state("colossus").damage).toBe(0);
    expect(game.chain().some((c) => c.cardId === "yone" && c.triggered)).toBe(false); // no conquer trigger yet
  });

  test("step 3 — after both pass the showdown Yone conquers the uncontrolled bf1 (+1) and ONLY NOW his conquer trigger resolves, using his equipped Might: 7 kills the 7-Might Colossus in P2's base", async () => {
    const game = await board().build();
    await game.p1.play("yone", { to: "bf1" });
    await game.p1.pick("blade");
    await game.settle(); // showdown passes → conquer → trigger (Colossus is the only enemy unit in a base → forced)
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("colossus");
      await game.settle();
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("colossus")).toBe("trash"); // 7 ≥ 7 — only possible because Weaponmaster resolved first
    expect(game.state("outpost").damage).toBe(0); // "in a base" only
    expect(game.locationOf("yone")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining Weaponmaster leaves Yone at 5 — the later conquer trigger deals only 5 and the Colossus survives", async () => {
    const game = await board().build();
    await game.p1.play("yone", { to: "bf1" });
    await game.p1.decline();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("colossus");
      await game.settle();
    }
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("colossus")).toBe("base");
    expect(game.state("colossus").damage).toBe(5);
    expect(game.state("blade").attachedTo).toBeUndefined();
  });
});
