import { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Typography, Alert } from "antd";
import { PlusOutlined, SendOutlined } from "@ant-design/icons";
import { api, streamChat } from "../api";
import { MarkdownMessage, SourceCards } from "../components/MarkdownMessage";
import type { Provider, Settings as SettingsType, SourceRef } from "../../shared/types";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
  lowConfidence?: boolean;
  streaming?: boolean;
  error?: string;
}

const CONV_KEY = "bbwiki.conversationId";

export default function ChatPage({
  providers,
  activeProviderId,
  onProviderChange,
  settings,
}: {
  providers: Provider[];
  activeProviderId: number | null;
  onProviderChange: (id: number | null) => void;
  settings: SettingsType | null;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string>(localStorage.getItem(CONV_KEY) || crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(CONV_KEY, conversationId.current);
    // 恢复历史
    api.messages(conversationId.current)
      .then(({ messages }) => {
        if (messages.length > 0) {
          setMessages(
            messages.map((m) => ({
              role: m.role,
              content: m.content,
              sources: m.sources,
              lowConfidence: false,
            }))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const userMsg: UiMessage = { role: "user", content: q };
    const aiMsg: UiMessage = { role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    const abort = new AbortController();
    abortRef.current = abort;
    await streamChat(
      { question: q, conversationId: conversationId.current, providerId: activeProviderId ?? undefined },
      {
        onStatus: () => undefined,
        onSources: (sources, lowConfidence) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              last.sources = sources;
              last.lowConfidence = lowConfidence;
            }
            return next;
          });
        },
        onDelta: (text) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") last.content += text;
            return next;
          });
        },
        onDone: () => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") last.streaming = false;
            return next;
          });
          setBusy(false);
        },
        onError: (message) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              last.streaming = false;
              last.error = message;
            }
            return next;
          });
          setBusy(false);
        },
      },
      abort.signal
    );
    // 兜底：异常退出时结束 loading
    setBusy(false);
  };

  const newConversation = () => {
    abortRef.current?.abort();
    conversationId.current = crypto.randomUUID();
    localStorage.setItem(CONV_KEY, conversationId.current);
    setMessages([]);
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  return (
    <div className="chat-page">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Typography.Text type="secondary">{settings?.welcomeMessage}</Typography.Text>
        <Button icon={<PlusOutlined />} onClick={newConversation}>
          新建对话
        </Button>
      </div>
      <div ref={listRef} style={{ height: "calc(100vh - 260px)", minHeight: 360, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div className="welcome">
            <Typography.Title level={3}>⚾ 棒球规则知识问答</Typography.Title>
            <Typography.Paragraph type="secondary">
              基于《棒球规则 2022 版》与知识库中上传的规则/案例，检索增强回答。
              <br />
              示例问题：二出局满垒时击出内野高飞球如何处理？接手妨碍击球员如何判罚？
            </Typography.Paragraph>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={"msg-row " + m.role}>
            <div className="msg-bubble">
              <div className="msg-meta">{m.role === "user" ? "你" : "规则助手"}</div>
              {m.role === "assistant" ? (
                <>
                  <MarkdownMessage content={m.content} streaming={m.streaming} />
                  {m.sources && m.sources.length > 0 && <SourceCards sources={m.sources} />}
                  {m.lowConfidence && (
                    <Typography.Text type="warning" style={{ fontSize: 12 }}>
                      ⚠ 未检索到高相关度规则依据，以下回答可能不确定，请以规则原文为准。
                    </Typography.Text>
                  )}
                  {m.error && <Alert type="error" showIcon message={m.error} style={{ marginTop: 8 }} />}
                </>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Space.Compact style={{ width: "100%", marginTop: 12 }}>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入棒球规则问题，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 1, maxRows: 4 }}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {busy ? (
          <Button onClick={stop} danger>
            停止
          </Button>
        ) : (
          <Button type="primary" icon={<SendOutlined />} onClick={() => void send()} disabled={!input.trim()}>
            发送
          </Button>
        )}
      </Space.Compact>
    </div>
  );
}
