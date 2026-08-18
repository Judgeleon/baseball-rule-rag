import { describe, expect, it } from "vitest";
import { splitRulesText } from "./split";

const SAMPLE = [
  "===第 1 页===",
  "棒球规则 | ·1·",
  "1 第一章 比赛目的 OBJECTIVES OF THE GAME",
  "规则 1.01",
  "棒球运动是在封闭的场地依照本规则的规定，两队各 9 名队员由主教练指挥的比赛。",
  "规则 1.02",
  "进攻球队的目标在于使击球员成为跑垒员，并使跑垒员进垒。",
  "===第 2 页===",
  "规则 5.07 投球（Pitching）",
  "（a）合法的投球姿势（Legal Pitching Delivery）",
  "合法的投球有正面投球姿势与侧身投球姿势两种，投手可按自己的意愿采用任何一种投球姿势。",
  "（b）投手必须踏触在投手板上接受接手的指示暗号（Signal）。",
  "术语定义 DEFINITION OF TERMS",
  "1. 触击球（Bunt）",
  "击球员不挥动球棒，而有意用球棒轻触来球，使球缓慢滚动于内野的击球叫“触击球”。",
  "2. 高飞球（Fly Ball）",
  "被击出成高空飞行状态的球叫“高飞球”。",
].join("\n");

describe("splitRulesText", () => {
  it("按规则条号切分并提取页码与章节", async () => {
    const chunks = await splitRulesText(SAMPLE);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    const r101 = chunks.find((c) => c.ruleNo === "1.01");
    expect(r101).toBeDefined();
    expect(r101!.chapter).toBe("第一章 比赛目的");
    expect(r101!.page).toBe(1);
    const r507 = chunks.find((c) => c.ruleNo === "5.07");
    expect(r507).toBeDefined();
    expect(r507!.chapter).toBe("第五章 比赛进行");
    expect(r507!.page).toBe(2);
    expect(r507!.content).toContain("合法的投球有正面投球姿势");
  });

  it("术语定义条目单独成块", async () => {
    const chunks = await splitRulesText(SAMPLE);
    const def1 = chunks.find((c) => c.content.includes("触击球（Bunt）"));
    expect(def1).toBeDefined();
    expect(def1!.chapter).toBe("术语定义");
    const def2 = chunks.find((c) => c.content.includes("高飞球（Fly Ball）"));
    expect(def2).toBeDefined();
    expect(def2!.content).not.toContain("触击球");
  });

  it("剔除目录行与页眉噪音，内容不含页码标记", async () => {
    const chunks = await splitRulesText(SAMPLE);
    const all = chunks.map((c) => c.content).join("\n");
    expect(all).not.toContain("===第");
    expect(all).not.toContain("棒球规则 | ·1·");
    expect(all).not.toContain("目录");
  });

  it("超长块会被二次切分为不超过 maxChars 的块", async () => {
    const longText =
      "规则 6.01 妨碍（Interference）\n" +
      "这是一段超长的规则说明。".repeat(200);
    const chunks = await splitRulesText(longText, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(300 + 100);
    }
    expect(chunks[0].ruleNo).toBe("6.01");
  });

  it("无规则结构的普通文本也能切分", async () => {
    const chunks = await splitRulesText("这是一个案例文件的内容。".repeat(500), 200);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
