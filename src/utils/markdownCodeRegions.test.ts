import { describe, expect, it } from "vitest";
import {
  normalizeOutsideMarkdownCode,
  normalizeOutsideMarkdownCodeStableInlineRegions,
} from "./markdownCodeRegions";

describe("markdownCodeRegions", () => {
  it("does not replace literal token-shaped text outside inline code", () => {
    const source = "outside CCGUIINLINECODETOKEN0 `pnpm lint` tail";

    const normalized = normalizeOutsideMarkdownCode(source, (segment) =>
      segment.replace("outside", "updated"),
    );

    expect(normalized).toBe("updated CCGUIINLINECODETOKEN0 `pnpm lint` tail");
  });

  it("reuses stable placeholders for repeated inline code spans during normalization", () => {
    const source = [
      "`computer_use` 修复已提交, commit hash 是 a06c730c。",
      "我继续补 `journal record`, 然后再提测试和 `changelog`。",
      "`computer_use` 修复已提交, commit hash 是 a06c730c。",
      "我继续补 `journal record`, 然后再提测试和 `changelog`。",
    ].join(" ");

    const normalized = normalizeOutsideMarkdownCodeStableInlineRegions(source, (segment) => {
      const directRepeat = segment.match(/^([\s\S]{12,}?)\s+\1$/);
      return directRepeat?.[1]?.trim() ?? segment;
    });

    expect(normalized).toBe(
      "`computer_use` 修复已提交, commit hash 是 a06c730c。 我继续补 `journal record`, 然后再提测试和 `changelog`。",
    );
  });
});
