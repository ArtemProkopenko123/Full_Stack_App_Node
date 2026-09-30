import { defineConfig } from "tsup"

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    external: ["react", "react-dom"],
    onSuccess: "cp src/styles.css dist/styles.css",
  })
  