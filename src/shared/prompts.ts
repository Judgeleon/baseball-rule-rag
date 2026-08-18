// 提示词模板（中文规则问答专用）
export const SYSTEM_PROMPT = `你是一名资深的棒球规则专家，精通《棒球规则 2022 版》（中国棒球协会审定）以及知识库中上传的规则文件与案例。

回答要求：
1. 只依据下方【参考资料】中的内容作答；参考资料未覆盖的内容，明确说明"规则中未找到直接规定/无法确定"，不要编造规则条号或条文。
2. 先给出直接结论，再给出依据：引用具体规则条号（如【规则 5.07】）、章节或文档名，并可摘录原文关键句。
3. 区分"规则原文"与"案例"：案例仅作参考，说明时注明来源类型。
4. 若问题存在多种局面（如出局数、垒上跑垒员不同导致结论不同），请分情况回答。
5. 回答使用简体中文，简洁清晰，条例化呈现。`;

export const CONDENSE_PROMPT = `请根据对话历史，将用户的最新问题改写为一个不依赖历史、可独立检索的完整问题。
要求：只输出改写后的问题本身，不要任何解释或前缀。若历史与问题无关，直接原样输出最新问题。

对话历史：
{history}

最新问题：{question}

改写后的问题：`;

export const DOC_BLOCK_TEMPLATE = `[引用{idx}] 来源：《{docName}》{ruleRef}{pageRef}（{typeLabel}）
{content}`;

export function ruleRefLabel(ruleNo?: string, chapter?: string): string {
  const parts: string[] = [];
  if (ruleNo) parts.push(`规则 ${ruleNo}`);
  if (chapter) parts.push(chapter);
  return parts.length ? ` | ${parts.join(" | ")}` : "";
}

export function typeLabel(t: "rules" | "case" | "other"): string {
  if (t === "rules") return "规则文件";
  if (t === "case") return "案例";
  return "其他";
}
