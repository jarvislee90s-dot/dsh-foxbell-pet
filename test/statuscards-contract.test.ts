// 灯点色源码契约：锁定 MAM 口径三色 + 本插件扩展的深红错误态，防止后续改版把
// 「待审批红」与「错误深红」改回同色（两红必须用户可区分）。
import { describe, it, expect } from "vitest";
import { DOT_COLOR, DOT_HALO, lightOf, taskPoseOf, type LightKind } from "../src/client/statuscards";

const card = (status: string) => ({ status, title: "t", lines: [] }) as never;

describe("status card palette contract", () => {
  it("locks the MAM palette: red=approval / yellow=running / green=done", () => {
    expect(DOT_COLOR["approval-red"]).toBe("#ef4444");
    expect(DOT_COLOR["running-yellow"]).toBe("#eab308");
    expect(DOT_COLOR["done-green"]).toBe("#22c55e");
  });

  it("error deep-red is distinct from approval red (user-visible distinction)", () => {
    expect(DOT_COLOR["error-darkred"]).not.toBe(DOT_COLOR["approval-red"]);
    const kinds = Object.keys(DOT_COLOR) as LightKind[];
    expect(new Set(Object.values(DOT_COLOR)).size).toBe(kinds.length); // 四色互不相同
    for (const k of kinds) expect(DOT_HALO[k]).toBeTruthy();
  });

  it("maps every card status to its light kind", () => {
    expect(lightOf(card("approval"))).toBe("approval-red");
    expect(lightOf(card("running"))).toBe("running-yellow");
    expect(lightOf(card("done"))).toBe("done-green");
    expect(lightOf(card("error"))).toBe("error-darkred");
  });

  it("task pose precedence: approval beats running (MAM order)", () => {
    expect(taskPoseOf([card("running"), card("approval")])).toBe("waiting");
    expect(taskPoseOf([card("running")])).toBe("running");
    expect(taskPoseOf([card("done")])).toBe(null);
  });
});
