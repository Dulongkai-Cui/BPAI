"use client";

import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => {
        destroyEditor?: () => void;
      };
    };
  }
}

type OnlyOfficeDocEditorProps = {
  documentTitle: string;
  documentKey: string;
  documentUrl: string;
  fileType?: string;
  minimal?: boolean;
};

function resolveFileType(documentTitle: string, explicitType?: string) {
  if (explicitType) {
    return explicitType;
  }

  const extension = documentTitle.split(".").pop()?.toLowerCase();
  return extension || "docx";
}

export function OnlyOfficeDocEditor({
  documentTitle,
  documentKey,
  documentUrl,
  fileType,
  minimal = false,
}: OnlyOfficeDocEditorProps) {
  const editorInstanceRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const mountedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const documentServerUrl =
    process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL ?? "http://localhost:8080";
  const callbackUrl =
    process.env.NEXT_PUBLIC_ONLYOFFICE_CALLBACK_URL ??
    "http://host.docker.internal:3001/api/onlyoffice/callback";
  const jwtToken = process.env.NEXT_PUBLIC_ONLYOFFICE_JWT_TOKEN;

  const scriptSrc = `${documentServerUrl}/web-apps/apps/api/documents/api.js`;
  const resolvedFileType = resolveFileType(documentTitle, fileType);

  const editorConfig = useMemo(
    () => ({
      documentType: "word",
      type: "desktop",
      document: {
        fileType: resolvedFileType,
        key: documentKey,
        title: documentTitle,
        url: documentUrl,
      },
      editorConfig: {
        callbackUrl,
        lang: "zh-CN",
        mode: "edit",
        customization: {
          compactHeader: false,
          compactToolbar: false,
          toolbarHideFileName: false,
          toolbarNoTabs: false,
        },
      },
      ...(jwtToken ? { token: jwtToken } : {}),
    }),
    [callbackUrl, documentKey, documentTitle, documentUrl, jwtToken, resolvedFileType],
  );

  useEffect(() => {
    mountedRef.current = true;

    const mountEditor = () => {
      if (!mountedRef.current || !window.DocsAPI) {
        return;
      }

      editorInstanceRef.current?.destroyEditor?.();
      editorInstanceRef.current = null;

      try {
        editorInstanceRef.current = new window.DocsAPI.DocEditor(
          "bpai-onlyoffice-doc-editor",
          editorConfig,
        );
        setLoadError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "ONLYOFFICE 编辑器初始化失败";
        setLoadError(message);
      }
    };

    const handleScriptError = () => {
      setLoadError("ONLYOFFICE API 脚本加载失败，请确认 8080 服务可访问。");
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptSrc}"]`,
    );

    if (window.DocsAPI) {
      mountEditor();
    } else if (existingScript) {
      existingScript.addEventListener("load", mountEditor);
      existingScript.addEventListener("error", handleScriptError);
    } else {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      script.onload = mountEditor;
      script.onerror = handleScriptError;
      document.body.appendChild(script);
    }

    return () => {
      mountedRef.current = false;
      editorInstanceRef.current?.destroyEditor?.();
      editorInstanceRef.current = null;
      existingScript?.removeEventListener("load", mountEditor);
      existingScript?.removeEventListener("error", handleScriptError);
    };
  }, [editorConfig, scriptSrc]);

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${minimal ? "bg-white" : "rounded-[28px] border border-slate-200 bg-[#edf2fb] p-3 shadow-inner"}`}>
      {minimal ? null : (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">BPAI Docs</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">ONLYOFFICE 在线文档编辑器</div>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Word-like Workspace</div>
        </div>
      )}
      <div className={`min-h-0 flex-1 overflow-hidden ${minimal ? "bg-white" : "rounded-[24px] border border-slate-200 bg-[#f8fafc] p-3 shadow-[0_24px_60px_rgba(15,23,42,0.08)]"}`}>
        <div className={minimal ? "h-full overflow-hidden bg-white" : "h-full overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]"}>
          {loadError ? (
            <div className="flex h-full items-center justify-center bg-white p-6 text-center text-sm text-slate-600">
              <div>
                <div className="font-semibold text-slate-900">ONLYOFFICE 暂未成功加载</div>
                <p className="mt-2 leading-6">{loadError}</p>
                <p className="mt-2 leading-6 text-slate-500">
                  请确认 Document Server 已启动，并可访问：{scriptSrc}
                </p>
                <p className="mt-2 break-all text-xs leading-5 text-slate-400">当前文档地址：{documentUrl}</p>
              </div>
            </div>
          ) : null}
          <div
            id="bpai-onlyoffice-doc-editor"
            className={loadError ? "hidden h-full w-full" : "h-full w-full"}
          />
        </div>
      </div>
    </div>
  );
}
