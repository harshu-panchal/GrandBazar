import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { optimizeProofImage } from "../core/utils/imageCompression.js";

const originalDocument = globalThis.document;
const originalCreateImageBitmap = globalThis.createImageBitmap;

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.createImageBitmap = originalCreateImageBitmap;
});

describe("optimizeProofImage", () => {
  test("leaves an already-small proof image untouched", async () => {
    const file = new File([new Uint8Array(200_000)], "proof.jpg", {
      type: "image/jpeg",
    });

    await expect(optimizeProofImage(file)).resolves.toBe(file);
  });

  test("resizes and compresses a large camera image before upload", async () => {
    const close = jest.fn();
    const drawImage = jest.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({
        drawImage,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      })),
      toBlob: jest.fn((callback) => {
        callback(new Blob([new Uint8Array(500_000)], { type: "image/jpeg" }));
      }),
    };

    globalThis.createImageBitmap = jest.fn(async () => ({
      width: 4000,
      height: 3000,
      close,
    }));
    globalThis.document = {
      createElement: jest.fn(() => canvas),
    };

    const original = new File([new Uint8Array(5_000_000)], "camera.png", {
      type: "image/png",
    });
    const optimized = await optimizeProofImage(original);

    expect(optimized).not.toBe(original);
    expect(optimized.name).toBe("camera.jpg");
    expect(optimized.type).toBe("image/jpeg");
    expect(optimized.size).toBe(500_000);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 1600, 1200);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

