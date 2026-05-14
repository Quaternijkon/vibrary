import { describe, expect, it } from "vitest";
import { desktopCopy } from "../uiCopy";

describe("desktop UI copy", () => {
  it("defaults user-facing navigation and primary actions to Chinese", () => {
    expect(desktopCopy.pages.map((section) => section.label)).toEqual([
      "首页",
      "资料中心",
      "导入",
      "搜索",
      "传输",
      "设备",
      "设置"
    ]);
    expect(desktopCopy.actions.refresh).toBe("刷新");
    expect(desktopCopy.actions.chooseFiles).toBe("选择文件");
    expect(desktopCopy.actions.process).toBe("处理索引");
    expect(desktopCopy.library.indexQueued).toBe("索引入队");
    expect(desktopCopy.libraryCenter.title).toBe("资料中心");
  });
});
