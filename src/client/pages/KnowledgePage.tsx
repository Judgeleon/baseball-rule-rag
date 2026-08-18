import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, App, Button, Popconfirm, Progress, Space, Table, Tag, Typography, Upload,
} from "antd";
import { DeleteOutlined, ReloadOutlined, InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { api } from "../api";
import type { DocumentMeta, DocType } from "../../shared/types";

const ACTIVE_STATUSES = new Set(["pending", "parsing", "indexing"]);

export default function KnowledgePage() {
  const { message } = App.useApp();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typeOverride, setTypeOverride] = useState<DocType | "auto">("auto");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const { documents } = await api.documents();
      setDocs(documents);
      const hasActive = documents.some((d) => ACTIVE_STATUSES.has(d.status));
      if (hasActive && !timer.current) {
        timer.current = setInterval(() => void load(), 2000);
      } else if (!hasActive && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const uploadProps: UploadProps = {
    multiple: true,
    accept: ".pdf,.txt,.md,.docx",
    showUploadList: false,
    customRequest: async (options) => {
      const file = options.file as File;
      const form = new FormData();
      form.append("files", file);
      if (typeOverride !== "auto") form.append("type", typeOverride);
      setUploading(true);
      try {
        const res = await api.upload(form);
        if (res.accepted.length > 0) {
          message.success(`${res.accepted.length} 个文件已开始索引`);
        }
        res.skipped.forEach((s) => message.info(`${s.name}：${s.reason}`));
        res.failed.forEach((s) => message.error(`${s.name}：${s.reason}`));
        await load();
      } catch (e) {
        message.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
  };

  const doDelete = async (id: number, name: string) => {
    try {
      await api.deleteDocument(id);
      message.success(`已删除 ${name}`);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const doReindex = async (id: number, name: string) => {
    try {
      await api.reindex(id);
      message.success(`${name} 已开始重建索引`);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "重建失败");
    }
  };

  const doReindexAll = async () => {
    try {
      await api.reindexAll();
      message.success("已开始全部重建");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "重建失败");
    }
  };

  const columns = [
    { title: "文档", dataIndex: "name", key: "name", ellipsis: true },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (t: DocType) =>
        t === "rules" ? <Tag color="blue">规则</Tag> : t === "case" ? <Tag color="orange">案例</Tag> : <Tag>其他</Tag>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 180,
      render: (s: DocumentMeta["status"]) =>
        s === "indexed" ? <Tag color="green">已索引</Tag>
        : s === "failed" ? <Tag color="red">失败</Tag>
        : s === "parsing" ? <Tag color="processing">解析中…</Tag>
        : s === "indexing" ? <Tag color="processing">索引中…</Tag>
        : <Tag>等待中</Tag>,
    },
    {
      title: "分块",
      dataIndex: "chunkCount",
      key: "chunkCount",
      width: 80,
      render: (c: number) => c || "-",
    },
    {
      title: "大小",
      dataIndex: "sizeBytes",
      key: "sizeBytes",
      width: 100,
      render: (s: number) => (s ? (s / 1024 / 1024).toFixed(2) + " MB" : "-"),
    },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (t: string) => new Date(t).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      render: (_: unknown, row: DocumentMeta) => (
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void doReindex(row.id, row.name)}>
            重建
          </Button>
          <Popconfirm title={`确定删除「${row.name}」？`} onConfirm={() => void doDelete(row.id, row.name)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Upload.Dragger {...uploadProps} style={{ width: 420 }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件上传（支持 PDF / TXT / MD / DOCX，≤50MB）</p>
          <p className="ant-upload-hint">
            <label style={{ marginRight: 8 }}>
              类型：
              <select value={typeOverride} onChange={(e) => setTypeOverride(e.target.value as DocType | "auto")}>
                <option value="auto">自动判断</option>
                <option value="rules">规则文件</option>
                <option value="case">案例</option>
              </select>
            </label>
            {uploading && <Progress size="small" style={{ width: 120 }} percent={100} status="active" />}
          </p>
        </Upload.Dragger>
        <div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void doReindexAll()}>
            全部重建索引
          </Button>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, maxWidth: 420 }}>
            上传后自动解析并向量化入库；删除文档会同步移除其分块。若更换了嵌入模型，请执行“全部重建索引”。
          </Typography.Paragraph>
        </div>
      </Space>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="默认知识源：《棒球规则 2022 版-中国棒球协会.pdf》（首次启动自动索引）。上传的案例文件（.pdf/.txt/.md/.docx）同样参与检索，来源会标注“案例”。"
      />
      <Table rowKey="id" loading={loading} columns={columns} dataSource={docs} pagination={{ pageSize: 10 }} />
    </div>
  );
}
