import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../api/client"
import type { ApiError } from "../api/client"

// Helper to build a mock Response
function mockResponse(
  status: number,
  body: string,
  ok?: boolean,
): Response {
  const isOk = ok ?? (status >= 200 && status < 300)
  return {
    status,
    ok: isOk,
    statusText: `Status ${status}`,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns undefined for 204 No Content", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce({
      status: 204,
      ok: true,
      statusText: "No Content",
      text: () => Promise.resolve(""),
    } as unknown as Response)

    const result = await api("/api/something")
    expect(result).toBeUndefined()
  })

  it("returns parsed JSON for 200 with JSON body", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, JSON.stringify({ id: 1, name: "test" })),
    )

    const result = await api<{ id: number; name: string }>("/api/resource")
    expect(result).toEqual({ id: 1, name: "test" })
  })

  it("returns undefined for 200 with empty body", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(mockResponse(200, ""))

    const result = await api("/api/resource")
    expect(result).toBeUndefined()
  })

  it("throws ApiError with parsed error field for 404 with JSON body", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      mockResponse(404, JSON.stringify({ error: "not found" })),
    )

    await expect(api("/api/missing")).rejects.toMatchObject({
      error: "not found",
      status: 404,
    } satisfies ApiError)
  })

  it("throws ApiError with HTTP {status} for 500 with non-JSON body", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      mockResponse(500, "internal error"),
    )

    await expect(api("/api/broken")).rejects.toMatchObject({
      error: "HTTP 500",
      status: 500,
    } satisfies ApiError)
  })

  it("throws ApiError for 401 with JSON error field", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      mockResponse(401, JSON.stringify({ error: "unauthorized" })),
    )

    await expect(api("/api/protected")).rejects.toMatchObject({
      error: "unauthorized",
      status: 401,
    } satisfies ApiError)
  })

  it("passes credentials: include and cache: no-store to fetch", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(mockResponse(200, "{}"))

    await api("/api/test")

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe("include")
    expect(init.cache).toBe("no-store")
  })

  it("merges custom headers with Content-Type when no headers in init", async () => {
    // When init has no 'headers' key, the spread does not override the headers
    // object that contains Content-Type, so Content-Type is preserved.
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(mockResponse(200, "{}"))

    await api("/api/test")

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("custom headers in init are merged with Content-Type", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(mockResponse(200, "{}"))

    await api("/api/test", {
      headers: { "X-Custom-Header": "custom-value" },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers["X-Custom-Header"]).toBe("custom-value")
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("throws ApiError with HTTP {status} for error response with empty body", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(mockResponse(503, ""))

    await expect(api("/api/down")).rejects.toMatchObject({
      error: "HTTP 503",
      status: 503,
    } satisfies ApiError)
  })

  it("throws ApiError with HTTP {status} for error response with JSON lacking 'error' field", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, JSON.stringify({ message: "bad input" })),
    )

    await expect(api("/api/bad")).rejects.toMatchObject({
      error: "HTTP 400",
      status: 400,
    } satisfies ApiError)
  })
})
