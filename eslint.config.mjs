import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const filename = fileURLToPath(import.meta.url);
const directory = dirname(filename);
const compat = new FlatCompat({ baseDirectory: directory });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", ".next-*/**", ".gui-review-temp/**", "server/.pytest*/**", "node_modules/**", "prisma/generated/**", "next-env.d.ts", ".npm-cache/**", "feature-visione-palpebrale/**", "server/agent/vision/validator-worker.cjs"],
  },
];

export default eslintConfig;
