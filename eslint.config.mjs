import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Flat config: ESLint 10 no longer reads .eslintrc, and Next 16 removed the
// `next lint` wrapper, so `eslint .` drives these configs directly.
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
