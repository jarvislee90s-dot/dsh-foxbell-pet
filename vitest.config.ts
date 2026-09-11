import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // react 是构建期 external（scripts/build.mjs），仓库仅装 @types/react；node 测试直测 .tsx
    // 纯函数（Task 11 client-logic → TrendChart.lastN）时 jsx 变换的顶层 runtime 导入用此桩解析。
    alias: [
      { find: /^react(\/jsx-dev-runtime|\/jsx-runtime)?$/, replacement: fileURLToPath(new URL("./test/helpers/react-stub.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.{js,mjs,ts}"],
    testTimeout: 20000,
  },
});
