import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Collapse, Tag, Space, Typography } from "antd";
import type { SourceRef } from "../../shared/types";

export function SourceCards({ sources }: { sources: SourceRef[] }) {
  if (!sources || sources.length === 0) return null;
  const items = sources.map((s, i) => ({
    key: String(i),
    label: (
      <Space size={6} wrap>
        <Tag color={s.type === "rules" ? "blue" : s.type === "case" ? "orange" : "default"}>
          {s.type === "rules" ? "规则" : s.type === "case" ? "案例" : "其他"}
        </Tag>
        <span>《{s.docName}》</span>
        {s.ruleNo && <Tag color="geekblue">规则 {s.ruleNo}</Tag>}
        {s.chapter && <span style={{ color: "#888" }}>{s.chapter}</span>}
        {s.page && <span style={{ color: "#888" }}>第{s.page}页</span>}
        <span style={{ color: "#aaa" }}>相关度 {(s.score * 100).toFixed(1)}%</span>
      </Space>
    ),
    children: <Typography.Paragraph style={{ margin: 0, whiteSpace: "pre-wrap" }}>{s.excerpt}</Typography.Paragraph>,
  }));
  return (
    <div className="source-list">
      <Collapse size="small" items={items} />
    </div>
  );
}

export function MarkdownMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className={streaming ? "stream-caret" : undefined}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || (streaming ? "思考中…" : "")}</ReactMarkdown>
    </div>
  );
}
