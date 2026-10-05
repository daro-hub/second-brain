import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig usa jsx "preserve" (lo compila Next): nei test serve la trasformazione automatica
  oxc: { jsx: { runtime: "automatic" } },
});
