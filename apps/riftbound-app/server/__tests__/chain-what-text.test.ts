/**
 * Chain-overlay "what this item will do" text and the sidebar action-group
 * accordion (public/js/gameplay/render/actions.js). The browser script is a
 * classic script with no DOM work at load time, so it is evaluated in a
 * sandbox via `new Function` and its pure helpers are exercised directly.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface Actions {
  chainWhatText(effect: unknown, names: string[], modeText: string): string;
  expandedMoveGroups: Set<string>;
  findEffectReference(e: unknown): unknown;
  humanizeEffect(e: unknown): string;
  splitChainTargets(effect: unknown, names: string[]): { reference: string | null; targets: string[] };
  toggleMoveGroup(moveId: string): void;
}

/** Minimal `document` stand-in: one element per move-group id, class list only. */
function fakeDocument() {
  const els = new Map<string, { hidden: boolean }>();
  return {
    els,
    getElementById(id: string) {
      const el = els.get(id);
      if (!el) return null;
      return {
        classList: {
          toggle(name: string) {
            if (name !== "hidden") throw new Error(`unexpected class ${name}`);
            el.hidden = !el.hidden;
            return el.hidden;
          },
        },
      };
    },
  };
}

function loadActions(doc: unknown): Actions {
  const src = readFileSync(path.resolve(import.meta.dir, "../../public/js/gameplay/render/actions.js"), "utf8");
  const mod: { exports?: Actions } = { exports: {} as Actions };
  const fn = new Function("module", "document", `${src}\nreturn module.exports;`);
  return fn(mod, doc) as Actions;
}

// ven-154-166 Public Execution: "Choose a friendly unit. Kill an enemy unit
// with less Might than it." — the engine locks targets as [reference, victim].
const publicExecution = {
  reference: { type: "unit" },
  target: { controller: "enemy", filter: { mightLessThanReference: true }, type: "unit" },
  type: "kill",
};

describe("chain item text — reference-pair spells (rule 355.8)", () => {
  const A = loadActions(fakeDocument());

  test("the Might yardstick is not listed among the victims", () => {
    const what = A.chainWhatText(publicExecution, ["Vanguard Attendant", "Shadow Order Disciple"], A.humanizeEffect(publicExecution));
    expect(what).toContain("Shadow Order Disciple");
    expect(what).not.toMatch(/→[^(]*Vanguard Attendant/);
    expect(what).toContain("compared to Vanguard Attendant");
  });

  test("splitChainTargets peels the reference off the front", () => {
    expect(A.splitChainTargets(publicExecution, ["Ref", "Victim"])).toEqual({ reference: "Ref", targets: ["Victim"] });
  });

  test("humanizeEffect names the comparison instead of a bare Kill", () => {
    expect(A.humanizeEffect(publicExecution)).toBe("Kill an enemy unit with less Might than a friendly unit");
  });

  test("a plain kill is unchanged and keeps all its targets", () => {
    const plain = { target: { controller: "enemy", quantity: 2, type: "unit" }, type: "kill" };
    expect(A.humanizeEffect(plain)).toBe("Kill 2 enemy units");
    expect(A.chainWhatText(plain, ["A", "B"], A.humanizeEffect(plain))).toBe("Kill 2 enemy units → A, B");
  });

  test("a reference nested inside a sequence is still found", () => {
    expect(A.findEffectReference({ effects: [{ type: "draw" }, publicExecution], type: "sequence" })).toEqual({ type: "unit" });
  });
});

describe("chain item text — multi-slot effects (rule 355.5)", () => {
  const A = loadActions(fakeDocument());

  test("divided damage says the amount is split, not dealt to each", () => {
    const eff = { amount: 3, split: true, target: { controller: "enemy", quantity: "any", type: "unit" }, type: "damage" };
    expect(A.humanizeEffect(eff)).toBe("Deal 3 split among any number of enemy units");
    expect(A.chainWhatText(eff, ["A", "B"], A.humanizeEffect(eff))).toBe("Deal 3 split among any number of enemy units split: A, B");
  });

  test("undivided damage keeps the plain arrow list", () => {
    const eff = { amount: 3, target: { controller: "enemy", type: "unit" }, type: "damage" };
    expect(A.chainWhatText(eff, ["A"], A.humanizeEffect(eff))).toBe("Deal 3 to an enemy unit → A");
  });

  test("splash damage names the other units it also hits", () => {
    const eff = { amount: 4, splashOthers: 1, target: { controller: "enemy", type: "unit" }, type: "damage" };
    expect(A.humanizeEffect(eff)).toBe("Deal 4 to an enemy unit, then 1 to each other enemy unit there");
  });

  test("a move names its destination instead of falling back to the raw type", () => {
    expect(A.humanizeEffect({ target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" }))
      .toBe("Move a friendly unit to base or a battlefield");
    expect(A.humanizeEffect({ target: { controller: "friendly", type: "unit" }, to: "target-battlefield", type: "move" }))
      .toBe("Move a friendly unit to that unit's battlefield");
    expect(A.humanizeEffect({ target: { type: "self" }, to: "choose", toOrFromBase: true, type: "move" }))
      .toBe("Move this to or from its base");
  });

  test("a swap move names both sides", () => {
    expect(A.humanizeEffect({ partner: { controller: "enemy", type: "unit" }, swap: true, target: { type: "self" }, to: "choose", type: "move" }))
      .toBe("Swap this with an enemy unit");
  });

  test("recall says where the unit goes", () => {
    expect(A.humanizeEffect({ exhausted: true, target: { controller: "enemy", type: "unit" }, type: "recall" }))
      .toBe("Recall an enemy unit to base exhausted");
  });
});

describe("action-group accordion survives re-renders", () => {
  test("a hand-opened group stays open until it is clicked shut", () => {
    const doc = fakeDocument();
    doc.els.set("move-group-exhaustRune", { hidden: true });
    const A = loadActions(doc);

    A.toggleMoveGroup("exhaustRune");
    // A trailing sandboxAutoPlay state_update re-renders the list; the group's
    // expansion is read back from here, so it must still be open.
    expect(A.expandedMoveGroups.has("exhaustRune")).toBe(true);

    A.toggleMoveGroup("exhaustRune");
    expect(A.expandedMoveGroups.has("exhaustRune")).toBe(false);
  });
});

describe("chain item text — conditional whose target sits on the node (rule 355.5)", () => {
  const A = loadActions(fakeDocument());

  // ven-037-166 Tomb-Raider Barbara: the enemy GEAR is named on the conditional
  // node, so both branches are targetless and used to fall back to "a unit".
  test("both branches name the node's card type, not the generic unit fallback", () => {
    const eff = {
      condition: { type: "target-empowered" },
      else: { type: "kill" },
      target: { controller: "enemy", type: "gear" },
      then: { type: "disempower" },
      type: "conditional",
    };
    expect(A.humanizeEffect(eff)).toBe("Disempower an enemy gear, otherwise Kill an enemy gear");
  });

  test("a branch with its own target keeps it", () => {
    const eff = {
      else: { target: { controller: "friendly", type: "unit" }, type: "kill" },
      target: { controller: "enemy", type: "gear" },
      then: { type: "disempower" },
      type: "conditional",
    };
    expect(A.humanizeEffect(eff)).toBe("Disempower an enemy gear, otherwise Kill a friendly unit");
  });
});
