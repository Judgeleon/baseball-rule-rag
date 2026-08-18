import { useEffect, useState } from "react";
import { Layout, Tabs, Select, Space, Typography, Tag } from "antd";
import { MessageOutlined, DatabaseOutlined, SettingOutlined } from "@ant-design/icons";
import ChatPage from "./pages/ChatPage";
import KnowledgePage from "./pages/KnowledgePage";
import SettingsPage from "./pages/SettingsPage";
import { api } from "./api";
import type { Provider, Settings as SettingsType } from "../shared/types";

const { Header, Content } = Layout;

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);

  const refreshProviders = async () => {
    try {
      const { providers } = await api.providers();
      setProviders(providers);
      const active = providers.find((p) => p.isActive);
      setActiveProviderId((prev) => prev && providers.some((p) => p.id === prev) ? prev : (active?.id ?? providers[0]?.id ?? null));
    } catch {
      /* 忽略 */
    }
  };

  const refreshSettings = async () => {
    try {
      const { settings } = await api.settings();
      setSettings(settings);
    } catch {
      /* 忽略 */
    }
  };

  useEffect(() => {
    void refreshProviders();
    void refreshSettings();
    api.health().then((h) => setOllamaOk(Boolean((h as { ollama?: { reachable?: boolean } }).ollama?.reachable))).catch(() => setOllamaOk(false));
  }, []);

  const items = [
    {
      key: "chat",
      label: (
        <Space size={4}>
          <MessageOutlined /> 问答
        </Space>
      ),
      children: (
        <ChatPage
          providers={providers}
          activeProviderId={activeProviderId}
          onProviderChange={setActiveProviderId}
          settings={settings}
        />
      ),
    },
    {
      key: "kb",
      label: (
        <Space size={4}>
          <DatabaseOutlined /> 知识库
        </Space>
      ),
      children: <KnowledgePage />,
    },
    {
      key: "settings",
      label: (
        <Space size={4}>
          <SettingOutlined /> 模型设置
        </Space>
      ),
      children: (
        <SettingsPage
          providers={providers}
          settings={settings}
          onProvidersChanged={() => void refreshProviders()}
          onSettingsSaved={() => void refreshSettings()}
        />
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 16, background: "#001529" }}>
        <Typography.Title level={4} style={{ color: "#fff", margin: 0, whiteSpace: "nowrap" }}>
          ⚾ 棒球规则知识问答
        </Typography.Title>
        <div style={{ flex: 1 }} />
        {providers.length > 0 && (
          <Select
            value={activeProviderId ?? undefined}
            onChange={setActiveProviderId}
            style={{ width: 280 }}
            placeholder="选择当前模型"
            options={providers.map((p) => ({
              value: p.id,
              label: `${p.name}（${p.model}）${p.isActive ? " ★" : ""}`,
            }))}
          />
        )}
        <Tag color={ollamaOk === null ? "default" : ollamaOk ? "green" : "red"}>
          Ollama {ollamaOk === null ? "检测中…" : ollamaOk ? "在线" : "离线"}
        </Tag>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1100, width: "100%", margin: "0 auto" }}>
        <Tabs items={items} />
      </Content>
    </Layout>
  );
}
