import { parseBloodworkReportWithAI } from "@/utils/reportParsers/aiBloodworkParser";

describe("aiBloodworkParser", () => {
  test("does not mis-parse JSON responses into bogus metrics like 'laboratory'/'name'", async () => {
    const jsonResponse =
      '{"reportDate":"5/26/2025","laboratory":"Ulta Lab Tests","metrics":[{"name":"CHOLESTEROL, TOTAL","value":237,"unit":"mg/dL","referenceRange":"<200","flag":"high","panel":"lipid"},{"name":"T4","value":7.1,"unit":"ug/dL","referenceRange":"4.5-12.0","flag":"normal","panel":"thyroid"}]}';

    const fetchMock = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: jsonResponse } }],
        }),
      } as unknown as Response;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const report = await parseBloodworkReportWithAI("RAW_TEXT", "test.pdf");
    expect(report).not.toBeNull();
    expect(report?.laboratory).toBe("Ulta Lab Tests");
    expect(report?.metrics.length).toBe(2);

    const names = (report?.metrics ?? []).map((m) => m.name.toLowerCase());
    expect(names).toContain("cholesterol, total");
    expect(names).toContain("t4");
    expect(names).not.toContain("laboratory");
    expect(names).not.toContain("name");
  });

  test("sanitizes narrative/markdown spillover in laboratory and metric names", async () => {
    const jsonResponse =
      '{"reportDate":"5/26/2025","laboratory":"Ulta Lab Tests(ref: LLC\\\" is prominent. i will use \\"Ulta Lab Tests\\\")","metrics":[{"name":"*CHOLESTEROL, TOTAL*","value":237,"unit":"mg/dL","referenceRange":"<200","flag":"high","panel":"lipid"},{"name":"Set value = x\\\") wait","value":3,"unit":"mg/L","referenceRange":"<8.0","flag":"normal","panel":"inflammation"}]}';

    const fetchMock = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: jsonResponse } }],
        }),
      } as unknown as Response;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const report = await parseBloodworkReportWithAI("RAW_TEXT", "test.pdf");
    expect(report).not.toBeNull();
    expect(report?.laboratory).toBe("Ulta Lab Tests");

    const names = (report?.metrics ?? []).map((m) => m.name);
    expect(names).toContain("CHOLESTEROL, TOTAL");
    // narrative metric should be dropped
    expect(names.some((n) => n.toLowerCase().includes("set value"))).toBe(
      false,
    );
  });
});
