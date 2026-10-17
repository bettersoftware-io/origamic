import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The React Compiler memoizes components and hooks at build time, which is
// why this package and the catalog write no `useMemo`, `useCallback` or
// `memo` (the lint bans them). The React plugin has no Babel step of its own,
// so the compiler runs through the Babel plugin, with the preset the React
// plugin exports for it.
//
// It compiles every TypeScript file the build reaches outside node_modules,
// which takes in the catalog's and the runtime's source: the workspace links
// them, and Vite reads them where they are, as source. The catalog's
// implementations rely on it (its `reactCompiler: true`), and
// src/app/compiler.test.ts holds this config to it. `pnpm check:compiler`
// holds the compiler to what this package's own components rely on.
//
// Tailwind 4 reads the classes the catalog's and the runtime's components
// use from their source; src/index.css names those folders.
//
// Tests are not compiled: they run on vitest.config.ts.
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
});
