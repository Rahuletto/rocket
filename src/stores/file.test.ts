import { describe, expect, it } from "vitest";
import {
  getFileStoreVersion,
  saveFileObject,
  subscribeFileStore,
} from "./file";

describe("file store subscriptions", () => {
  it("notifies subscribers when an entry becomes available", () => {
    const versions: number[] = [];
    const unsubscribe = subscribeFileStore(() => {
      versions.push(getFileStoreVersion());
    });

    saveFileObject("subscription-test", {
      id: "subscription-test",
      kind: "file",
      name: "test.ts",
      path: "/tmp/test.ts",
    });
    unsubscribe();

    expect(versions).toHaveLength(1);
    expect(versions[0]).toBeGreaterThan(0);
  });
});
