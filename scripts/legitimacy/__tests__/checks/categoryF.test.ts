import { score } from "../../src/checks/categoryF";
import { DEFAULT_CONFIG } from "../../src/config";
import type { CheckResult } from "../../src/types";

function pass(id: string, category: "B" | "C" | "D" | "E", weight = 1): CheckResult {
  return { id, category, name: id, status: "pass", message: "ok", weight };
}
function fail(id: string, category: "B" | "C" | "D" | "E", weight = 1): CheckResult {
  return { id, category, name: id, status: "fail", message: "nope", weight };
}

describe("Category F — scoring", () => {
  test("forces score to 0 when Category A failed", () => {
    const out = score(
      [pass("B.1.steps", "B"), pass("C.1", "C"), pass("D.1", "D"), pass("E.1", "E")],
      DEFAULT_CONFIG,
      true
    );
    expect(out.score).toBe(0);
    expect(out.recommendation).toBe("fail");
    expect(out.notes.some((n) => n.includes("Category A failed"))).toBe(true);
  });

  test("returns 1.0 when every check passes", () => {
    const out = score(
      [pass("B.1.steps", "B"), pass("C.1", "C"), pass("D.1", "D"), pass("E.1", "E")],
      DEFAULT_CONFIG,
      false
    );
    expect(out.score).toBeCloseTo(1.0);
    expect(out.recommendation).toBe("pass");
  });

  test("applies the diagnostic-failure penalty", () => {
    const out = score(
      [
        pass("B.1.steps", "B"),
        fail("C.1", "C"), // diagnostic — 0.6× penalty
        pass("D.1", "D"),
        pass("E.1", "E")
      ],
      DEFAULT_CONFIG,
      false
    );
    // raw aggregate: B=1, C≈0, D=1, E=1 → 0.2*1 + 0.35*0 + 0.25*1 + 0.2*1 = 0.65
    // After × 0.6: 0.39. (Renormalised across the four categories that each
    // contribute, so the unweighted aggregate is 0.65.)
    expect(out.score).toBeLessThan(0.5);
    expect(out.recommendation).toBe("fail");
  });

  test("compounds penalties for multiple diagnostic failures", () => {
    const out = score(
      [
        pass("B.1.steps", "B"),
        fail("C.1", "C"),
        fail("D.5", "D"),
        fail("E.3", "E")
      ],
      DEFAULT_CONFIG,
      false
    );
    expect(out.score).toBeLessThan(0.2);
    expect(out.recommendation).toBe("fail");
  });

  test("warns are weighted at 0.6, not zero", () => {
    const passes = [pass("B.1.steps", "B")];
    const warns: CheckResult[] = [
      { id: "C.1", category: "C", name: "C.1", status: "warn", message: "w", weight: 1 }
    ];
    const out = score([...passes, ...warns], DEFAULT_CONFIG, false);
    expect(out.score).toBeLessThan(1.0);
    expect(out.score).toBeGreaterThan(0.7);
  });

  test("F category appended to results contains F.1, F.2, F.3", () => {
    const out = score(
      [pass("B.1.steps", "B"), pass("C.1", "C"), pass("D.1", "D"), pass("E.1", "E")],
      DEFAULT_CONFIG,
      false
    );
    const f = out.categories.find((c) => c.category === "F")!;
    expect(f.checks.map((c) => c.id)).toEqual(["F.1", "F.2", "F.3"]);
  });

  test("respects a custom score threshold", () => {
    const conf = { ...DEFAULT_CONFIG, scoreThreshold: 0.95 };
    // Score will be ~0.7 from a single C fail (with diag penalty); threshold 0.95 → fail.
    const checks: CheckResult[] = [
      pass("B.1.steps", "B"),
      fail("C.1", "C"),
      pass("D.1", "D"),
      pass("E.1", "E")
    ];
    const out = score(checks, conf, false);
    expect(out.recommendation).toBe("fail");
  });

  test("notes include the formula when not gated by Category A", () => {
    const out = score([pass("B.1.steps", "B")], DEFAULT_CONFIG, false);
    expect(out.notes.join("\n")).toMatch(/0\.20·B/);
  });
});
