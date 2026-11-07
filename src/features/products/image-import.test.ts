import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { allowedProductImageUrl, isPublicAddress } from "./image-import";

describe("catalog image source boundary", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.2",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
    "2002:7f00:1::1",
  ])("rejects non-public address %s", (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );
  it("allows public resolution only within the fixed provider host set", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(
      allowedProductImageUrl(
        "https://encrypted-tbn0.gstatic.com/shopping/image.png",
      ).hostname,
    ).toBe("encrypted-tbn0.gstatic.com");
    for (const url of [
      "http://serpapi.com/images/a",
      "https://serpapi.com/search.json?api_key=x",
      "https://gstatic.com.attacker.example/image.png",
      "https://user:password@gstatic.com/image.png",
      "https://127.0.0.1/image.png",
    ])
      expect(() => allowedProductImageUrl(url)).toThrow();
  });
});
