import { describe, expect, it } from "vitest";
import { resolveDataPaths } from "../dataPaths";

describe("resolveDataPaths", () => {
  it("uses portable-data next to the executable when portable.flag exists", () => {
    const paths = resolveDataPaths({
      productName: "Vibrary",
      execPath: "C:\\Tools\\Vibrary\\Vibrary.exe",
      env: { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
      exists: (candidate) => candidate === "C:\\Tools\\Vibrary\\portable.flag"
    });

    expect(paths.mode).toBe("portable");
    expect(paths.root).toBe("C:\\Tools\\Vibrary\\portable-data");
    expect(paths.qdrantStorage).toBe("C:\\Tools\\Vibrary\\portable-data\\data\\qdrant\\storage");
    expect(paths.libraryFiles).toBe("C:\\Tools\\Vibrary\\portable-data\\data\\library\\files");
  });

  it("uses LOCALAPPDATA/ProductName when portable.flag is absent", () => {
    const paths = resolveDataPaths({
      productName: "Vibrary",
      execPath: "C:\\Program Files\\Vibrary\\Vibrary.exe",
      env: { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
      exists: () => false
    });

    expect(paths.mode).toBe("local");
    expect(paths.root).toBe("C:\\Users\\Ada\\AppData\\Local\\Vibrary");
    expect(paths.config).toBe("C:\\Users\\Ada\\AppData\\Local\\Vibrary\\config");
    expect(paths.models).toBe("C:\\Users\\Ada\\AppData\\Local\\Vibrary\\data\\models");
  });

  it("throws a useful error when neither portable mode nor LOCALAPPDATA is available", () => {
    expect(() =>
      resolveDataPaths({
        productName: "Vibrary",
        execPath: "C:\\Program Files\\Vibrary\\Vibrary.exe",
        env: {},
        exists: () => false
      })
    ).toThrow("LOCALAPPDATA");
  });
});
