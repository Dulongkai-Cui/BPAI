"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

type MapStatus = "loading" | "ready" | "error";

type CityPoint = {
  id: string;
  name: string;
  subtitle: string;
  position: [number, number];
  color: "#2563eb" | "#f59e0b" | "#f43f5e";
};

const changshaCenter: [number, number] = [28.2282, 112.9389];

const changshaPoints: CityPoint[] = [
  {
    id: "furong-warning",
    name: "芙蓉区",
    subtitle: "高空预警",
    position: [28.1924, 113.0324],
    color: "#f43f5e",
  },
  {
    id: "wangcheng-material",
    name: "望城区",
    subtitle: "材料车运行中",
    position: [28.3522, 112.8186],
    color: "#2563eb",
  },
  {
    id: "yuhua-pipeline",
    name: "雨花区",
    subtitle: "管道施工 75%",
    position: [28.1357, 113.0381],
    color: "#f59e0b",
  },
];

function pointLabel(point: CityPoint) {
  return `
    <div class="bpai-map-label">
      <span class="bpai-map-label__name">${point.name}</span>
      <span class="bpai-map-label__divider">/</span>
      <span class="bpai-map-label__detail">${point.subtitle}</span>
    </div>
  `;
}

export function OpenSourceMapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      const container = containerRef.current;

      if (!container || mapRef.current) {
        return;
      }

      try {
        const L = await import("leaflet");

        if (!mounted || !containerRef.current || mapRef.current) {
          return;
        }

        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        }).setView(changshaCenter, 11);

        mapRef.current = map;

        L.control
          .zoom({
            position: "bottomright",
          })
          .addTo(map);

        const tileLayer = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          },
        );

        tileLayer.on("load", () => {
          if (!mounted) {
            return;
          }

          setStatus("ready");
          setErrorMessage(null);
        });

        tileLayer.on("tileerror", () => {
          if (!mounted) {
            return;
          }

          setStatus("error");
          setErrorMessage("开源底图瓦片加载失败，请检查当前网络。");
        });

        tileLayer.addTo(map);

        changshaPoints.forEach((point) => {
          const marker = L.circleMarker(point.position, {
            radius: 10,
            color: "#ffffff",
            weight: 2,
            fillColor: point.color,
            fillOpacity: 1,
          }).addTo(map);

          marker.bindTooltip(pointLabel(point), {
            permanent: true,
            direction: "right",
            offset: [14, 0],
            className: "bpai-map-tooltip",
            opacity: 1,
          });
        });
      } catch (error) {
        if (!mounted) {
          return;
        }

        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "地图初始化失败，请稍后重试。",
        );
      }
    }

    void initMap();

    return () => {
      mounted = false;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 z-[1]"
        aria-label="长沙开源地图容器"
      />

      {status === "loading" ? (
        <div className="absolute left-8 top-32 z-20 rounded-2xl border border-blue-200 bg-white/92 px-4 py-3 text-sm text-slate-600 shadow-lg backdrop-blur">
          正在加载长沙地图底图...
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute left-8 top-32 z-20 max-w-md rounded-2xl border border-rose-200 bg-rose-50/92 px-4 py-3 text-sm leading-6 text-rose-700 shadow-lg backdrop-blur">
          {errorMessage}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-8 left-8 z-20 flex gap-3">
        <div className="rounded-2xl border border-white/70 bg-white/92 px-4 py-3 text-sm shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="text-xs font-semibold tracking-[0.14em] text-slate-400">
            当前状态
          </div>
          <div className="mt-2 font-semibold text-slate-900">
            {status === "ready" ? "开源底图已接入" : "长沙地图加载中"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/92 px-4 py-3 text-sm shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="text-xs font-semibold tracking-[0.14em] text-slate-400">
            下一步
          </div>
          <div className="mt-2 font-semibold text-slate-900">
            接工程队与预警图层
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-8 right-[22rem] z-20 rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg backdrop-blur">
        OpenStreetMap 底图
      </div>
    </>
  );
}
