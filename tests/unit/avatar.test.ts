import { describe, it, expect, vi } from "vitest";
import { resizeAvatar, dataUrlToBuffer, AVATAR_SIZE } from "@/lib/avatar";

// ── Sharp is mocked to avoid native bindings in unit tests ────────

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png-data")),
  }));
  // Named export for `sharp.kernel`
  (mockSharp as unknown as { kernel: { lanczos3: string } }).kernel = {
    lanczos3: "lanczos3",
  };
  return { default: mockSharp };
});

describe("resizeAvatar", () => {
  it("returns a PNG buffer with the correct dimensions", async () => {
    const input = Buffer.from("fake-image-data");
    const result = await resizeAvatar(input);

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(AVATAR_SIZE);
    expect(result.height).toBe(AVATAR_SIZE);
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("calls sharp with lanczos3 kernel and 500×500 size", async () => {
    const { default: sharp } = await import("sharp");
    const input = Buffer.from("fake-image-data");

    await resizeAvatar(input);

    expect(sharp).toHaveBeenCalledWith(input);
    const instance = (sharp as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(instance.resize).toHaveBeenCalledWith(
      AVATAR_SIZE,
      AVATAR_SIZE,
      expect.objectContaining({ kernel: "lanczos3" })
    );
  });
});

describe("dataUrlToBuffer", () => {
  it("converts a base64 data URL to a Buffer", () => {
    const data = "hello world";
    const base64 = Buffer.from(data).toString("base64");
    const dataUrl = `data:text/plain;base64,${base64}`;

    const result = dataUrlToBuffer(dataUrl);
    expect(result.toString()).toBe(data);
  });

  it("throws on an invalid data URL", () => {
    expect(() => dataUrlToBuffer("not-a-data-url")).toThrow("Invalid data URL");
  });
});
