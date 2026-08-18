import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";

export interface ParsedFile {
  text: string;
  pages: number;
}

/** 按文件类型解析为纯文本；PDF 保留页码标记（供切分器提取页码） */
export async function parseFile(filePath: string, mime: string): Promise<ParsedFile> {
  if (mime === "application/pdf" || /.pdf$/i.test(filePath)) {
    const loader = new PDFLoader(filePath, { splitPages: true });
    const docs = await loader.load();
    if (docs.length === 0) {
      throw new Error("无法从该 PDF 中提取文字（可能是扫描件/图片型 PDF）。请上传可复制文字的 PDF 文件。");
    }
    const parts = docs.map((d) => {
      const meta = d.metadata as { loc?: { pageNumber?: number } };
      const page = meta.loc?.pageNumber ?? 0;
      return `\n===第 ${page} 页===\n${d.pageContent}`;
    });
    return { text: parts.join("\n"), pages: docs.length };
  }
  if (/.docx$/i.test(filePath)) {
    const loader = new DocxLoader(filePath);
    const docs = await loader.load();
    return { text: docs.map((d) => d.pageContent).join("\n\n"), pages: 1 };
  }
  // txt / md / 其他纯文本
  const loader = new TextLoader(filePath);
  const docs = await loader.load();
  return { text: docs.map((d) => d.pageContent).join("\n\n"), pages: 1 };
}
