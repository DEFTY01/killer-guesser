import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockCreateTokenRequest } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCreateTokenRequest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/ably", () => ({
  ablyServer: { auth: { createTokenRequest: mockCreateTokenRequest } },
}));

import { GET } from "@/app/api/ably/token/route";

describe("GET /api/ably/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ABLY_API_KEY = "test-key";
  });

  it("unauthenticated → 401, no token issued", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockCreateTokenRequest).not.toHaveBeenCalled();
  });

  it("signed-in user → subscribe-only capability", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockCreateTokenRequest.mockResolvedValue({ keyName: "k" });
    const res = await GET();
    expect(res.status).toBe(200);
    const arg = mockCreateTokenRequest.mock.calls[0][0];
    expect(arg.capability).toEqual({
      "game-*": ["subscribe"],
      "vote-*": ["subscribe"],
    });
  });
});
