/**
 * MCP resources: the harness design doc, the card-test guide, and the
 * per-move parameter schema.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ResourceSpec } from "./mcp-lite";
import { movesSchemaDocument } from "./move-schemas";

const HERE = import.meta.dir;
const REPO_ROOT = resolve(HERE, "../../..");

export const RESOURCE_PATHS = {
  cardsReadme: resolve(REPO_ROOT, "packages/riftbound-engine/src/__tests__/cards/README.md"),
  design: resolve(REPO_ROOT, "docs/harness/HARNESS-DESIGN.md"),
};

function readOr(path: string, fallback: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : fallback;
}

export function defineResources(): ResourceSpec[] {
  return [
    {
      description:
        "Riftbound agent-harness design: layering, Decision/Answer protocol, PlayArgs, error model, MCP tool mapping.",
      mimeType: "text/markdown",
      name: "Harness design (docs/harness/HARNESS-DESIGN.md)",
      read: () => readOr(RESOURCE_PATHS.design, "# HARNESS-DESIGN.md not found in this checkout"),
      uri: "riftbound://design",
    },
    {
      description:
        "Guide to the harness vocabulary used by card tests (scenario builder, seat verbs, how each decision kind is answered).",
      mimeType: "text/markdown",
      name: "Card test guide (riftbound-engine/src/__tests__/cards/README.md)",
      read: () =>
        readOr(RESOURCE_PATHS.cardsReadme, "# cards/README.md not found in this checkout"),
      uri: "riftbound://cards/README",
    },
    {
      description:
        "JSON: per-move engine parameter schemas, how each move is reached via MCP tools, internal (non-decision) moves, and the PlayArgs schema.",
      mimeType: "application/json",
      name: "Engine move schemas",
      read: () => JSON.stringify(movesSchemaDocument(), null, 2),
      uri: "riftbound://schema/moves",
    },
  ];
}
