import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockSignIn, mockPush } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signIn: mockSignIn }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import LoginScreen from "@/components/auth/LoginScreen";

const gamePayload = {
  success: true,
  data: {
    gameName: "Ski Trip",
    players: [
      { id: "1", nickname: "Alice", avatarUrl: "/alice.png", hasPin: true },
      { id: "2", nickname: "Bob", avatarUrl: null, hasPin: false },
    ],
  },
};

const withHasPin = (id: string, hasPin: boolean) => ({
  ...gamePayload,
  data: {
    ...gamePayload.data,
    players: gamePayload.data.players.map((p) => (p.id === id ? { ...p, hasPin } : p)),
  },
});

/** Each call returns the next payload; the last one repeats. */
function mockGameLookup(ok = true, ...later: unknown[]) {
  const queue = [ok ? gamePayload : { success: false }, ...later];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      const body = queue.length > 1 ? queue.shift() : queue[0];
      return { ok: ok || queue.length > 0, json: async () => body };
    }),
  );
}

async function openAndEnterCode(code = "ABC234") {
  fireEvent.click(screen.getByText("Play Now"));
  fireEvent.change(screen.getByLabelText(/game code/i), { target: { value: code } });
  fireEvent.click(screen.getByText("Find my game"));
}

describe("LoginScreen (game code + PIN)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("'Play Now' opens the panel asking for a game code", () => {
    mockGameLookup();
    render(<LoginScreen />);
    fireEvent.click(screen.getByText("Play Now"));
    expect(screen.getByRole("dialog").className).toContain("panel-open");
    expect(screen.getByLabelText(/game code/i)).toBeInTheDocument();
  });

  it("'Find my game' stays disabled until a full code is typed", () => {
    mockGameLookup();
    render(<LoginScreen />);
    fireEvent.click(screen.getByText("Play Now"));
    const btn = screen.getByText("Find my game").closest("button")!;
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/game code/i), { target: { value: "abc234" } });
    expect(btn).not.toBeDisabled();
  });

  it("unknown code shows an inline error and stays on the code step", async () => {
    mockGameLookup(false);
    render(<LoginScreen />);
    await openAndEnterCode("ZZZZZZ");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("couldn't find"));
    expect(screen.queryByLabelText("Select Alice")).toBeNull();
  });

  it("valid code lists the game's players only", async () => {
    mockGameLookup();
    render(<LoginScreen />);
    await openAndEnterCode();
    expect(await screen.findByLabelText("Select Alice")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Bob")).toBeInTheDocument();
  });

  it("wrong PIN shows an error and clears the PIN", async () => {
    mockGameLookup();
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginScreen />);
    await openAndEnterCode();
    fireEvent.click(await screen.findByLabelText("Select Alice"));
    const pin = screen.getByLabelText("PIN") as HTMLInputElement;
    fireEvent.change(pin, { target: { value: "1234" } });
    fireEvent.click(screen.getByText("Sign In").closest("button")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Wrong PIN"));
    expect((screen.getByLabelText("PIN") as HTMLInputElement).value).toBe("");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("full flow: code → avatar → PIN → signIn with all three → /lobby", async () => {
    mockGameLookup();
    mockSignIn.mockResolvedValue({ ok: true });
    render(<LoginScreen />);
    await openAndEnterCode();
    fireEvent.click(await screen.findByLabelText("Select Alice"));
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "0420" } });
    fireEvent.click(screen.getByText("Sign In").closest("button")!);
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("player", {
        gameCode: "ABC234",
        userId: "1",
        pin: "0420",
        redirect: false,
      }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/lobby"));
  });

  it("clicking the backdrop closes the panel without signing in", async () => {
    mockGameLookup();
    render(<LoginScreen />);
    fireEvent.click(screen.getByText("Play Now"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(document.querySelector(".login-backdrop")!);
    expect(dialog.className).not.toContain("panel-open");
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("a player without a PIN is asked to choose one (twice), and signs in with setPin", async () => {
    mockGameLookup();
    mockSignIn.mockResolvedValue({ ok: true });
    render(<LoginScreen />);
    await openAndEnterCode();
    fireEvent.click(await screen.findByLabelText("Select Bob"));
    expect(screen.queryByLabelText("PIN")).toBeNull();

    fireEvent.change(screen.getByLabelText("New PIN"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "4822" } });
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(screen.getByText("Save PIN and sign in").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "4821" } });
    fireEvent.click(screen.getByText("Save PIN and sign in").closest("button")!);
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("player", {
        gameCode: "ABC234",
        userId: "2",
        pin: "4821",
        setPin: "1",
        redirect: false,
      }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/lobby"));
  });

  it("a player with a PIN gets the normal PIN entry, never the choose screen", async () => {
    mockGameLookup();
    render(<LoginScreen />);
    await openAndEnterCode();
    fireEvent.click(await screen.findByLabelText("Select Alice"));
    expect(screen.getByLabelText("PIN")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm PIN")).toBeNull();
  });

  it("admin reset while the player is typing: the failed attempt moves them to choosing a new PIN", async () => {
    mockGameLookup(true, withHasPin("1", false));
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginScreen />);
    await openAndEnterCode();
    fireEvent.click(await screen.findByLabelText("Select Alice"));
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByText("Sign In").closest("button")!);
    await waitFor(() => expect(screen.getByLabelText("New PIN")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain("reset");
  });

  it("someone else chose the PIN first: the player is sent to normal PIN entry", async () => {
    mockGameLookup(true, withHasPin("2", true));
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginScreen />);
    await openAndEnterCode();
    fireEvent.click(await screen.findByLabelText("Select Bob"));
    fireEvent.change(screen.getByLabelText("New PIN"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "4821" } });
    fireEvent.click(screen.getByText("Save PIN and sign in").closest("button")!);
    await waitFor(() => expect(screen.getByLabelText("PIN")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain("already chose");
  });
});
