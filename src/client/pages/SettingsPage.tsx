import { useEffect, useState } from "react";
import {
  App, Button, Divider, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Switch, Table, Tag, Typography,
} from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { Provider, ProviderInput, Settings as SettingsType } from "../../shared/types";

export default function SettingsPage({
  providers,
  settings,
  onProvidersChanged,
  onSettingsSaved,
}: {
  providers: Provider[];
  settings: SettingsType | null;
  onProvidersChanged: () => void;
  onSettingsSaved: () => void;
}) {
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [settingsForm] = Form.useForm<SettingsType>();

  useEffect(() => {
    if (settings) settingsForm.setFieldsValue(settings);
  }, [settings, settingsForm]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ kind: "openai-compatible", temperature: 0.2, numCtx: 8192, think: false, topK: 6, isActive: false });
    setModalOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    form.setFieldsValue({
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      apiKey: "",
      temperature: p.temperature,
      numCtx: p.numCtx,
      think: p.think,
      topK: p.topK,
      isActive: p.isActive,
    });
    setModalOpen(true);
  };

  const saveProvider = async () => {
    const values = await form.validateFields();
    const payload: ProviderInput = {
      name: values.name,
      kind: values.kind,
      baseUrl: values.baseUrl,
      model: values.model,
      apiKey: values.apiKey || undefined,
      temperature: values.temperature,
      numCtx: values.numCtx,
      think: values.think,
      topK: values.topK,
      isActive: values.isActive,
    };
    setSaving(true);
    try {
      if (editing) {
        await api.updateProvider(editing.id, payload);
        message.success("已保存");
      } else {
        await api.createProvider(payload);
        message.success("已添加");
      }
      setModalOpen(false);
      onProvidersChanged();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (id: number) => {
    try {
      await api.deleteProvider(id);
      message.success("已删除");
      onProvidersChanged();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const testProvider = async (id: number) => {
    setTestingId(id);
    try {
      const r = await api.testProvider(id);
      if (r.ok) message.success(`连接成功（${r.latencyMs}ms）`);
      else message.error("连接失败：" + (r.error ?? "未知错误"));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTestingId(null);
    }
  };

  const saveSettings = async () => {
    const values = await settingsForm.validateFields();
    try {
      await api.saveSettings(values);
      message.success("设置已保存");
      onSettingsSaved();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const columns = [
    { title: "名称", dataIndex: "name", key: "name" },
    {
      title: "类型",
      dataIndex: "kind",
      key: "kind",
      width: 130,
      render: (k: Provider["kind"]) => (k === "ollama" ? <Tag color="purple">Ollama</Tag> : <Tag color="cyan">OpenAI 兼容</Tag>),
    },
    { title: "Base URL", dataIndex: "baseUrl", key: "baseUrl", width: 260, ellipsis: true },
    { title: "模型", dataIndex: "model", key: "model", width: 150 },
    {
      title: "当前",
      dataIndex: "isActive",
      key: "isActive",
      width: 80,
      render: (v: boolean) => (v ? <Tag color="green">使用中</Tag> : null),
    },
    {
      title: "Key",
      key: "key",
      width: 110,
      render: (_: unknown, row: Provider) =>
        row.hasApiKey ? <Tag>{row.apiKeyMasked}</Tag> : <Tag color="orange">未填写</Tag>,
    },
    {
      title: "操作",
      key: "action",
      width: 240,
      render: (_: unknown, row: Provider) => (
        <Space>
          <Button size="small" icon={<ThunderboltOutlined />} loading={testingId === row.id} onClick={() => void testProvider(row.id)}>
            测试
          </Button>
          <Button size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm title="删除该模型配置？" onConfirm={() => void deleteProvider(row.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          模型 Provider
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          添加模型
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Ollama 类型连接局域网部署的本地模型（如 192.168.5.19 上的 qwen3.5:9b）；OpenAI
        兼容类型可接入 DeepSeek、通义、Moonshot 等任意兼容 OpenAI 接口的服务，需填写 API Key。
      </Typography.Paragraph>
      <Table rowKey="id" dataSource={providers} columns={columns} pagination={false} style={{ marginBottom: 24 }} />

      <Divider />
      <Typography.Title level={5}>检索与生成设置</Typography.Title>
      <Form form={settingsForm} layout="vertical" style={{ maxWidth: 640 }}>
        <Space size={24} wrap>
          <Form.Item name="retrieveTopK" label="检索返回条数 (TopK)" rules={[{ required: true }]}>
            <InputNumber min={1} max={50} />
          </Form.Item>
          <Form.Item name="scoreThreshold" label="相关度阈值" rules={[{ required: true }]}>
            <InputNumber min={-1} max={1} step={0.05} />
          </Form.Item>
          <Form.Item name="maxHistoryTurns" label="历史对话轮数" rules={[{ required: true }]}>
            <InputNumber min={0} max={30} />
          </Form.Item>
          <Form.Item name="includeCases" label="检索包含案例" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>
        <Form.Item name="systemPrompt" label="系统提示词（覆盖默认，留空使用内置规则专家提示词）">
          <Input.TextArea rows={5} />
        </Form.Item>
        <Form.Item name="welcomeMessage" label="欢迎语">
          <Input />
        </Form.Item>
        <Button type="primary" onClick={() => void saveSettings()}>
          保存设置
        </Button>
      </Form>

      <Divider />
      <Typography.Title level={5}>嵌入模型（向量化）</Typography.Title>
      <Typography.Paragraph>
        当前：{settings?.embeddingModel} @ {settings?.embeddingBaseUrl}（{settings?.embeddingDimensions} 维，批量 {settings?.embeddingBatch}）
        <br />
        <Typography.Text type="warning">
          更换嵌入模型后需到“知识库”页执行“全部重建索引”，否则旧向量与新模型不兼容。
        </Typography.Text>
      </Typography.Paragraph>

      <Modal
        open={modalOpen}
        title={editing ? "编辑模型" : "添加模型"}
        onOk={() => void saveProvider()}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="ollama">Ollama（本地）</Radio.Button>
              <Radio.Button value="openai-compatible">OpenAI 兼容（DeepSeek 等）</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如：本地 Ollama / DeepSeek" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: "请输入服务地址" }]}
            extra="Ollama 示例 http://192.168.5.19:11434；DeepSeek 示例 https://api.deepseek.com"
          >
            <Input placeholder="http://192.168.5.19:11434" />
          </Form.Item>
          <Form.Item name="model" label="模型名" rules={[{ required: true, message: "请输入模型名" }]}>
            <Input placeholder="qwen3.5:9b / deepseek-chat" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" extra={editing ? "留空则保留原 Key" : undefined}>
            <Input.Password placeholder={editing ? "留空保持不变" : "OpenAI 兼容类型必填"} />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="temperature" label="Temperature">
              <InputNumber min={0} max={2} step={0.1} />
            </Form.Item>
            <Form.Item name="numCtx" label="上下文长度 (numCtx)">
              <InputNumber min={256} max={262144} step={1024} />
            </Form.Item>
            <Form.Item name="topK" label="TopK">
              <InputNumber min={0} max={100} />
            </Form.Item>
          </Space>
          <Form.Item name="think" label="启用思维链 (think，仅 Ollama qwen 系)" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isActive" label="设为当前使用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
