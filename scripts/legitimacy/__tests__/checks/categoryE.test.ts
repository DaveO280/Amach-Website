import { runCategoryE } from "../../src/checks/categoryE";
import { DEFAULT_CONFIG } from "../../src/config";
import { buildLeafV2 } from "../../src/leaf";

describe("Category E — continuity", () => {
  test("flags an empty leaf set", () => {
    const r = runCategoryE([], DEFAULT_CONFIG);
    expect(r[0].status).toBe("fail");
  });

  test("E.1 passes for contiguous days", () => {
    const leaves = Array.from({ length: 10 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryE(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "E.1")!.status).toBe("pass");
  });

  test("E.1 fails when a gap exceeds the configured threshold", () => {
    const leaves = [
      buildLeafV2({ dayId: 19000, dataFlags: 0xff_07ff }),
      buildLeafV2({ dayId: 19001, dataFlags: 0xff_07ff }),
      buildLeafV2({ dayId: 19010, dataFlags: 0xff_07ff }) // 9-day gap
    ];
    const r = runCategoryE(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "E.1")!.status).toBe("fail");
  });

  test("E.2 warns when a metric is below its coverage floor", () => {
    // 30 days, but only 5 of them have steps presence flag set.
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        // Bit 0 = steps; only set on first 5 days.
        dataFlags: i < 5 ? 1 : 0
      })
    );
    const r = runCategoryE(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "E.2.steps")!.status).toBe("warn");
  });

  test("E.3 fails when device source is inconsistent", () => {
    const sourceA = Buffer.alloc(32, 0xaa);
    const sourceB = Buffer.alloc(32, 0xbb);
    const sourceC = Buffer.alloc(32, 0xcc);
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        sourceHash: i < 10 ? sourceA : i < 20 ? sourceB : sourceC,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryE(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "E.3")!.status).toBe("fail");
  });

  test("E.3 passes when one source dominates 95%+", () => {
    const sourceA = Buffer.alloc(32, 0xaa);
    const sourceB = Buffer.alloc(32, 0xbb);
    const leaves = Array.from({ length: 100 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        sourceHash: i < 96 ? sourceA : sourceB,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryE(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "E.3")!.status).toBe("pass");
  });
});
