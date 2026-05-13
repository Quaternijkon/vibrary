import { describe, expect, it } from "vitest";
import { desktopCopy } from "../uiCopy";

describe("desktop UI copy", () => {
  it("defaults user-facing navigation and primary actions to Chinese", () => {
    expect(desktopCopy.sections.map((section) => section.label)).toEqual([
      "服务状态",
      "资料导入",
      "上传队列",
      "索引队列",
      "搜索",
      "设备",
      "缓存",
      "模型",
      "设置"
    ]);
    expect(desktopCopy.actions.refresh).toBe("刷新");
    expect(desktopCopy.actions.chooseFiles).toBe("选择文件");
    expect(desktopCopy.actions.process).toBe("处理索引");
    expect(desktopCopy.library.indexQueued).toBe("索引入队");
  });
});
