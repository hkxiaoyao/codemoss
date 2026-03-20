import { describe, expect, it } from "vitest";
import { resolveStructuredPreviewKind } from "./FileStructuredPreview";

describe("resolveStructuredPreviewKind", () => {
  it("recognizes shell script group with compatibility variants", () => {
    expect(resolveStructuredPreviewKind("scripts/dev.sh")).toBe("shell");
    expect(resolveStructuredPreviewKind("scripts/release.zsh")).toBe("shell");
    expect(resolveStructuredPreviewKind("scripts/bootstrap.command")).toBe("shell");
    expect(resolveStructuredPreviewKind(".envrc")).toBe("shell");
    expect(resolveStructuredPreviewKind(".bashrc")).toBe("shell");
    expect(resolveStructuredPreviewKind("profile")).toBe("shell");
  });

  it("keeps dockerfile priority and handles boundary fallback", () => {
    expect(resolveStructuredPreviewKind("Dockerfile")).toBe("dockerfile");
    expect(resolveStructuredPreviewKind("dockerfile.prod")).toBe("dockerfile");
    expect(resolveStructuredPreviewKind("")).toBeNull();
    expect(resolveStructuredPreviewKind("README")).toBeNull();
    expect(resolveStructuredPreviewKind("note.unknown")).toBeNull();
  });
});
