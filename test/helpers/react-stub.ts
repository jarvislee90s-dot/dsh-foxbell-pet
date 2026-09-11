// test/helpers/react-stub.ts — react 运行时桩（vitest node 环境专用）。
// 背景：react 是构建期 external（scripts/build.mjs → require('react/jsx-runtime') 由宿主模块表应答），
// 仓库仅装 @types/react，node_modules 无 react 实体。client-logic.test.ts 直测 TrendChart.tsx 的
// 纯函数 lastN 时，jsx: react-jsx 变换会在模块顶层 import 'react/jsx-dev-runtime' → 无法解析。
// 测试只调用纯函数、从不渲染 JSX，此桩仅需让该顶层导入可解析；任何 JSX 调用即抛错（防误用）。
const refuse = (): never => {
  throw new Error("react-stub: JSX render is not supported in node tests");
};
export const jsx = refuse;
export const jsxDEV = refuse;
export const jsxs = refuse;
export const Fragment = "Fragment";
export const createElement = refuse;
export default { jsx, jsxDEV, jsxs, Fragment, createElement };
