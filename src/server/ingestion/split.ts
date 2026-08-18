import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface RuleChunk {
  content: string;
  ruleNo?: string;
  chapter?: string;
  page?: number;
}

const PAGE_MARK = /^===第\s*(\d+)\s*页===$/;
const RULE_HEAD = /^规则\s*(\d+(?:\.\d+)?)\b/;
const DEF_HEAD = /^\d{1,3}\.\s+\S/;
const TOC_LINE = /^\s*\d+\s+(第[一二三四五六七八九十]+章|规则\s|术语定义)/;
const CHAPTER_NAMES: Record<string, string> = {
  "1": "第一章 比赛目的",
  "2": "第二章 比赛场地",
  "3": "第三章 器材及比赛服",
  "4": "第四章 比赛准备",
  "5": "第五章 比赛进行",
  "6": "第六章 不恰当攻守行为、不合法的行为和不当行为",
  "7": "第七章 比赛结束",
  "8": "第八章 裁判员",
  "9": "第九章 记录规则",
};

export function chapterOf(ruleNo: string): string | undefined {
  const n = ruleNo.split(".")[0];
  return CHAPTER_NAMES[n];
}

function isNoise(line: string): boolean {
  if (/^棒球规则\s*[|·].*?·?\d+·?$/.test(line)) return true;   // 页眉 "棒球规则 | ·21·"
  if (/^·?\d+·?$/.test(line)) return true;                       // 孤立页码
  if (/^(目录|Contents)\s*$/.test(line)) return true;
  if (TOC_LINE.test(line)) return true;                           // 目录行
  return false;
}

/** 规则感知切分：按“规则 X.XX”与术语定义条目分块，再对超长块递归二次切分 */
export async function splitRulesText(text: string, maxChars = 1200): Promise<RuleChunk[]> {
  const lines = text.split("\n");
  const chunks: RuleChunk[] = [];
  let cur: RuleChunk | null = null;
  let curPage: number | undefined;
  let inDefs = false;

  const flush = () => {
    if (cur && cur.content.trim()) chunks.push(cur);
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isNoise(line)) continue;

    const pm = line.match(PAGE_MARK);
    if (pm) { curPage = Number(pm[1]); continue; }

    if (/^术语定义\s*DEFINITION OF TERMS/i.test(line) || /^术语定义$/.test(line)) {
      inDefs = true;
      flush();
      cur = { content: line, chapter: "术语定义", page: curPage };
      continue;
    }

    const rule = line.match(RULE_HEAD);
    if (rule) {
      flush();
      const ruleNo = rule[1];
      cur = { content: line, ruleNo, chapter: chapterOf(ruleNo), page: curPage };
      continue;
    }

    if (inDefs && DEF_HEAD.test(line)) {
      flush();
      cur = { content: line, ruleNo: "定义", chapter: "术语定义", page: curPage };
      continue;
    }

    if (cur) {
      cur.content += "\n" + line;
    } else {
      cur = { content: line, page: curPage };
    }
  }
  flush();

  // 超长块二次切分
  const out: RuleChunk[] = [];
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: maxChars,
    chunkOverlap: Math.min(120, Math.floor(maxChars * 0.1)),
    separators: ["\n", "。", "；", "，", "、", " "],
  });
  for (const c of chunks) {
    if (c.content.length <= maxChars) {
      out.push(c);
      continue;
    }
    const parts = await splitter.splitText(c.content);
    for (const p of parts) {
      if (p.trim()) out.push({ ...c, content: p });
    }
  }
  return out;
}
