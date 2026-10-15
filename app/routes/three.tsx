import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Route } from "./+types/three";
import type { PoiId } from "~/three/layout";
import type { WorldHandle } from "~/three/world";

const POI_ORDER: PoiId[] = ["projects", "about", "stack", "made", "contact"];
const SITE_URL = import.meta.env.VITE_SITE_URL ?? "https://www.nikson.dev";
const TITLE = "Amsterdam by bike · Nikson Rotondaro";
const DESCRIPTION =
  "Ride a bike through a procedural Amsterdam built with three.js and TSL — WebGPU when your browser supports it, WebGL2 otherwise.";

export function meta(_: Route.MetaArgs) {
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: `${SITE_URL}/three` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

type Status = "idle" | "loading" | "ready" | "error";

export default function ThreeRoute() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldHandle | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ label: "", value: 0 });
  const [backend, setBackend] = useState<string>("");
  const [near, setNear] = useState<PoiId | null>(null);
  const [openPoi, setOpenPoi] = useState<PoiId | null>(null);
  const [started, setStarted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  const closePoi = useCallback(() => {
    setOpenPoi(null);
    worldRef.current?.setPaused(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handle: WorldHandle | null = null;
    let cancelled = false;

    setStatus("loading");

    void (async () => {
      try {
        const { createWorld } = await import("~/three/world");
        if (cancelled) return;
        handle = createWorld({
          canvas,
          onProgress: (label, value) => setProgress({ label, value }),
          onReady: (info) => {
            setBackend(info.backend);
            setStatus("ready");
          },
          onNear: (poi) => setNear(poi),
          onOpen: (poi) => {
            setOpenPoi(poi);
            handle?.setPaused(true);
          },
          onError: (error) => {
            console.error("[three] world failed", error);
            setStatus("error");
          },
        });
        worldRef.current = handle;
      } catch (error) {
        console.error("[three] failed to load", error);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      handle?.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (openPoi) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") closePoi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPoi, closePoi]);

  const hold = (input: { steer?: number; throttle?: number; brake?: number }) => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault();
      setStarted(true);
      worldRef.current?.setVirtual(input);
    },
    onPointerUp: () => worldRef.current?.setVirtual({ steer: 0, throttle: 0, brake: 0 }),
    onPointerLeave: () => worldRef.current?.setVirtual({ steer: 0, throttle: 0, brake: 0 }),
    onPointerCancel: () => worldRef.current?.setVirtual({ steer: 0, throttle: 0, brake: 0 }),
  });

  const poi = openPoi ?? near;
  const poiTitle = poi ? t(`three.pois.${poi}.title`) : "";
  const poiBody = poi ? t(`three.pois.${poi}.body`) : "";
  const poiLabel = poi ? t(`three.pois.${poi}.label`) : "";
  const poiCta = poi ? t(`three.pois.${poi}.cta`) : "";
  const poiHref = poi ? t(`three.pois.${poi}.href`) : "";

  return (
    <main className="relative h-[100svh] w-full overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        aria-hidden="true"
        onPointerDown={() => setStarted(true)}
      />

      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgba(9,9,11,0.72)_100%)]" />

      {/* header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 md:p-6">
        <div className="pointer-events-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/70 bg-zinc-950/70 px-3 py-1.5 text-sm text-zinc-300 backdrop-blur transition hover:border-zinc-500 hover:text-zinc-100"
          >
            <span aria-hidden>←</span> {t("three.back")}
          </Link>
          <h1 className="mt-3 max-w-sm text-xl font-semibold leading-tight text-zinc-100 drop-shadow md:text-2xl">
            {t("three.title")}
          </h1>
          <p className="mt-1 max-w-sm text-sm text-zinc-400 drop-shadow">{t("three.subtitle")}</p>
        </div>
        {backend && (
          <span className="pointer-events-none rounded-lg border border-zinc-700/70 bg-zinc-950/70 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
            three.js + TSL
            <span className="mx-1.5 text-zinc-600">·</span>
            {backend}
          </span>
        )}
      </header>

      {/* loading */}
      {status !== "ready" && status !== "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/85 px-6 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">{t("three.building")}</p>
          <div className="h-1 w-56 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-zinc-100 transition-[width] duration-300"
              style={{ width: `${Math.round(progress.value * 100)}%` }}
            />
          </div>
          <p className="text-sm text-zinc-400">{t(`three.steps.${progress.label}`, { defaultValue: progress.label })}</p>
        </div>
      )}

      {/* error */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/95 px-6 text-center">
          <h2 className="text-lg font-semibold">{t("three.errorTitle")}</h2>
          <p className="max-w-md text-sm text-zinc-400">{t("three.errorBody")}</p>
          <Link
            to="/"
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            {t("three.back")}
          </Link>
        </div>
      )}

      {/* first-interaction hint */}
      {status === "ready" && !started && !near && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <p className="animate-pulse rounded-full border border-zinc-700/70 bg-zinc-950/80 px-4 py-2 text-sm text-zinc-200 backdrop-blur">
            {isTouch ? t("three.tapToRide") : t("three.pressToRide")}
          </p>
        </div>
      )}

      {/* point of interest prompt */}
      {status === "ready" && near && !openPoi && (
        <div className="absolute inset-x-0 bottom-24 flex justify-center px-4">
          <button
            type="button"
            onClick={() => {
              worldRef.current?.interact();
            }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-zinc-600/70 bg-zinc-950/85 px-4 py-3 text-left backdrop-blur transition hover:border-zinc-400"
          >
            <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-950">
              {isTouch ? t("three.tap") : "E"}
            </span>
            <span>
              <span className="block text-sm font-medium text-zinc-100">{poiTitle}</span>
              <span className="block text-xs text-zinc-400">{poiLabel}</span>
            </span>
          </button>
        </div>
      )}

      {/* poi card */}
      {openPoi && (
        <div className="absolute inset-0 flex items-end justify-center bg-zinc-950/45 p-4 pb-8 md:items-center md:pb-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={poiTitle}
            className="w-full max-w-md rounded-2xl border border-zinc-700/70 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{poiLabel}</p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-100">{poiTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{poiBody}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <a
                href={poiHref}
                className="inline-flex items-center rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
              >
                {poiCta}
              </a>
              <button
                type="button"
                onClick={closePoi}
                className="rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              >
                {t("three.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* controls */}
      {status === "ready" && !openPoi && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4">
          {isTouch ? (
            <div className="flex w-full max-w-md items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={t("three.controls.left")}
                  className="h-14 w-14 rounded-xl border border-zinc-700/70 bg-zinc-950/80 text-2xl backdrop-blur active:bg-zinc-800"
                  {...hold({ steer: -1 })}
                >
                  ◀
                </button>
                <button
                  type="button"
                  aria-label={t("three.controls.right")}
                  className="h-14 w-14 rounded-xl border border-zinc-700/70 bg-zinc-950/80 text-2xl backdrop-blur active:bg-zinc-800"
                  {...hold({ steer: 1 })}
                >
                  ▶
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={t("three.controls.brake")}
                  className="h-14 w-14 rounded-xl border border-zinc-700/70 bg-zinc-950/80 text-lg backdrop-blur active:bg-zinc-800"
                  {...hold({ brake: 1 })}
                >
                  ⏹
                </button>
                <button
                  type="button"
                  aria-label={t("three.controls.pedal")}
                  className="h-14 w-20 rounded-xl border border-zinc-600/70 bg-zinc-100/90 text-sm font-semibold text-zinc-950 backdrop-blur active:bg-zinc-300"
                  {...hold({ throttle: 1 })}
                >
                  {t("three.controls.pedal")}
                </button>
              </div>
            </div>
          ) : (
            <ul className="hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-400 md:flex">
              {(
                [
                  ["W / ↑", t("three.controls.pedal")],
                  ["S / ↓", t("three.controls.brake")],
                  ["A D / ← →", t("three.controls.steer")],
                  ["Shift", t("three.controls.boost")],
                  ["E", t("three.controls.enter")],
                  ["H", t("three.controls.bell")],
                  ["R", t("three.controls.reset")],
                  ["drag", t("three.controls.camera")],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span className="rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                    {key}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* static text version: indexable and readable without WebGL */}
      <section className="sr-only" aria-label={t("three.title")}>
        <h2>{t("three.title")}</h2>
        <ul>
          {POI_ORDER.map((id) => (
            <li key={id}>
              <h3>{t(`three.pois.${id}.title`)}</h3>
              <p>{t(`three.pois.${id}.body`)}</p>
              <a href={t(`three.pois.${id}.href`)}>{t(`three.pois.${id}.cta`)}</a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
