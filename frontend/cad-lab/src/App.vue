<template>
  <div :class="['shell', { 'shell--embed': isEmbed }]">
    <template v-if="!isEmbed">
      <div class="topbar">
        <div>
          <div class="eyebrow">BPAI CAD LAB</div>
          <div class="title">MLightCAD 实验室</div>
          <div class="subtitle">
            先验证 DWG / DXF 在官方推荐的 Vue + Vite 环境里能否稳定加载，
            再决定如何继续把它集成进 BPAI。
          </div>
        </div>
        <div class="actions">
          <button class="ghost" @click="openDocs">返回文档空间</button>
        </div>
      </div>
      <div class="tips">
        <div class="tip">
          当前 CAD 文件:
          <strong>{{ resolvedFileUrl ? fileLabel : "未指定" }}</strong>
        </div>
        <div class="tip">也可以直接使用 MLightCAD 菜单打开本地 DWG / DXF。</div>
      </div>
    </template>
    <div class="viewer">
      <MlCadViewer
        locale="zh"
        theme="dark"
        :background="0x0f172a"
        :url="resolvedFileUrl || undefined"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MlCadViewer } from "@mlightcad/cad-viewer";
import { AcApSettingManager } from "@mlightcad/cad-simple-viewer";

const currentUrl = new URL(window.location.href);
const isEmbed = currentUrl.searchParams.get("embed") === "1";

AcApSettingManager.instance.isShowCommandLine = false;
AcApSettingManager.instance.isShowStats = false;
AcApSettingManager.instance.isShowEntityInfo = false;
AcApSettingManager.instance.isShowToolbar = !isEmbed;
AcApSettingManager.instance.isShowCoordinate = !isEmbed;
AcApSettingManager.instance.isShowMainMenu = !isEmbed;
AcApSettingManager.instance.isShowLanguageSelector = !isEmbed;

const rawFileUrl = computed(() => currentUrl.searchParams.get("url"));

const resolvedFileUrl = computed(() => {
  if (!rawFileUrl.value) {
    return null;
  }

  try {
    return new URL(rawFileUrl.value, window.location.origin).toString();
  } catch {
    return rawFileUrl.value;
  }
});

const fileLabel = computed(() => {
  const explicitName = currentUrl.searchParams.get("name");

  if (explicitName) {
    return explicitName;
  }

  if (!resolvedFileUrl.value) {
    return "未指定";
  }

  try {
    const remoteUrl = new URL(resolvedFileUrl.value);
    const lastSegment = remoteUrl.pathname.split("/").pop() ?? "指定文件";
    return decodeURIComponent(lastSegment);
  } catch {
    return "指定文件";
  }
});

function openDocs() {
  window.location.href = "/docs/documents";
}
</script>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 24%),
    linear-gradient(180deg, #020617 0%, #0f172a 44%, #111827 100%);
  color: #fff;
}

.shell--embed {
  background: #0f172a;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px 16px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: rgba(191, 219, 254, 0.92);
}

.title {
  margin-top: 10px;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.78);
}

.actions {
  display: flex;
  align-items: flex-start;
}

.ghost {
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: rgba(15, 23, 42, 0.68);
  border-radius: 16px;
  padding: 10px 14px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.tips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0 28px 16px;
}

.tip {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.56);
  border-radius: 999px;
  padding: 8px 12px;
  color: rgba(226, 232, 240, 0.86);
  font-size: 12px;
}

.viewer {
  flex: 1;
  overflow: hidden;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.shell--embed .viewer {
  border-top: none;
}
</style>
