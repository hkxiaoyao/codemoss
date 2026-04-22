import { describe, expect, it } from "vitest";
import { mergeCompletedAgentText } from "./threadReducerTextMerge";

describe("threadReducerTextMerge", () => {
  it("strips synthetic Claude approval resume text from completed assistant payloads", () => {
    const completed = [
      "文件已经创建完成。",
      "",
      "Completed approved operations:",
      "- Created aaa.txt",
      "- Updated bbb.txt",
      "Please continue from the current workspace state and finish the original task.",
      "",
      "No response requested.",
    ].join("\n");

    expect(mergeCompletedAgentText("", completed)).toBe("文件已经创建完成。");
  });

  it("collapses near-duplicate completed paragraph blocks into one readable result", () => {
    const firstPass = [
      "先按仓库规范做一次基线扫描。",
      "我会检查项目内的 `.claude/`、`.codex/`、`openspec/`，再看目录结构和技术栈。",
      "最后给你一个简明项目分析。",
    ].join("\n\n");
    const secondPass = [
      "先按仓库规范做一次基线扫描。",
      "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
      "最后给你一个简明的项目分析。",
    ].join("\n\n");

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n\n${secondPass}`)).toBe(secondPass);
  });

  it("collapses repeated markdown sections when duplicate copies are only separated by a single newline", () => {
    const firstPass = [
      "我是你当前这个工作区里的 AI 联合架构师兼 coding agent。",
      "",
      "更准确点说：",
      "",
      "- 角色上，我按“虚拟 CTO 合作伙伴”方式协作",
      "- 工作上，我负责读代码、定方案、改实现、跑验证、做 review",
      "- 流程上，我会先给 `PLAN`，等你确认后再改文件",
      "- 风格上，我默认中文交流，直接、简洁，不讲废话",
      "",
      "你给我需求，我来拆解并推进。",
    ].join("\n");
    const secondPass = [
      "我是你当前这个工作区里的 AI 联合架构师兼 coding agent。",
      "",
      "更准确点说：",
      "",
      "- 角色上，我按“虚拟 CTO 合作伙伴”方式协作",
      "- 工作上，我负责读代码、定方案、改实现、跑验证，也做 review",
      "- 流程上，我会先给 `PLAN`，等你确认后再改文件",
      "- 风格上，我默认中文交流，直接、简洁，不讲废话",
      "",
      "你给我需求，我来拆解并推进。",
    ].join("\n");

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n${secondPass}`)).toBe(secondPass);
  });
});
