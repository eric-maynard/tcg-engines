/**
 * Iter-S: Vitest 2.1.9 trips over zod 4's ESM re-export pattern
 *
 *   import * as z from "./v4/classic/external.js";
 *   export { z };
 *
 * The named `{ z }` import arrives as `undefined`. This shim re-builds `z`
 * from the namespace and re-exports the rest verbatim so any code importing
 * `import { z } from "zod"` works under vitest.
 *
 * Only used in the vitest module-resolution alias (see vite.config.ts).
 */
// Reach into zod's ESM entry directly so we don't recurse on ourselves
// Through the alias. Path is from src/__tests__/ -> web/ -> web/node_modules.
import * as z from "../../node_modules/zod/index.js";

const ns: any = z;
export { ns as z };
export default ns;
// Re-export every named export from zod so tests using `z.object` (after the
// `import { z } from "zod"` named-import returns the namespace) keep working,
// AND so tests using `import { object } from "zod"` keep working.
export * from "../../node_modules/zod/index.js";
