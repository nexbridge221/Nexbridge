// Empaquette l'API pour Netlify Server : le code de l'API et le paquet partagé (TypeScript du dépôt) sont regroupés
// dans netlify/server/index.mjs ; les dépendances npm restent externes (Netlify les embarque depuis node_modules).
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => n !== "@nexbridge/shared");

await build({
  entryPoints: ["netlify/server-entry.ts"],
  outfile: "netlify/server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
