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
// It compiles every TypeScript file the build reaches outside node_modules
// and the runtime, which takes in the catalog's source: the workspace links
// it, and Vite reads it where it is, as source. The catalog's
// implementations rely on it (its `reactCompiler: true`), and
// src/app/compiler.test.ts holds this config to it, and to leaving the
// runtime as its own tests run it. `pnpm check:compiler`
// holds the compiler to what this package's own components rely on.
//
// Tailwind 4 reads the classes the catalog's and the runtime's components
// use from their source; src/index.css names those folders.
//
// Tests are not compiled: they run on vitest.config.ts.
export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
      // The runtime is the bindings: written and tested uncompiled (its
      // lint bans manual memoization, as the bindings' does, and declares no
      // compiler), and its hooks set state while rendering a new app.
      exclude: [/[/\\]node_modules[/\\]/, /[/\\]packages[/\\]runtime[/\\]/],
    }),
    tailwindcss(),
  ],
});
