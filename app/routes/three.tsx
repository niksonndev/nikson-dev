import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Route } from "./+types/three";
import type { PoiId } from "~/three/layout";
import { POI_ANCHORS, LAYOUT } from "~/three/layout";
import type { Quality, Telemetry, WorldHandle } from "~/three/world";

const POI_ORDER: PoiId[] = ["projects", "about", "stack", "made", "contact"];
const QUALITY_KEY = "ride-quality";
const QUALITY_MANUAL_KEY = "ride-quality-manual";

function readQuality(): Quality | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(QUALITY_KEY);
  return stored === "low" || stored === "medium" || stored === "high" ? stored : null;
}
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
  const [mapOpen, setMapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [quality, setQuality] = useState<Quality>("high");
  const qualityChosen = useRef(false);
  const [collected, setCollected] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = worldRef.current?.getTelemetry();
      if (next) setTelemetry(next);
    }, 140);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "KeyM") setMapOpen((open) => !open);
      if (event.code === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const stored = readQuality();
    qualityChosen.current = window.localStorage.getItem(QUALITY_MANUAL_KEY) === "1";
    if (stored) setQuality(stored);
  }, []);

  // pick a level for the machine that is actually running the world: the first
  // seconds after the build are full of shader compiles, so they are ignored
  useEffect(() => {
    if (status !== "ready") return;
    // the world is built after this component mounts, so the stored level has to
    // be applied here, where it exists
    worldRef.current?.setQuality(readQuality() ?? "high");
    if (qualityChosen.current) return;
    let raf = 0;
    let frames = 0;
    let measured = 0;
    let measuredFrames = 0;
    let warmup = 0;
    let decided = false;
    let last = performance.now();
    const order: Quality[] = ["low", "medium", "high"];
    const tick = () => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      frames++;
      // warm up on frames OR on time: on a machine that renders one frame per
      // second, waiting for a frame count would take half a minute
      if (warmup < 1200 && frames < 24) {
        warmup += delta;
        raf = window.requestAnimationFrame(tick);
        return;
      }
      measured += delta;
      measuredFrames++;
      if (!decided && measured < 900 && measuredFrames < 30) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      decided = true;
      const fps = measuredFrames > 0 ? 1000 / (measured / measuredFrames) : 0;
      const current = order.indexOf(readQuality() ?? "high");
      const next = order[fps < 30 ? 0 : fps < 48 ? Math.min(current, 1) : current];
      if (next !== order[current]) {
        window.localStorage.setItem(QUALITY_KEY, next);
        setQuality(next);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [status]);

  useEffect(() => {
    worldRef.current?.setQuality(quality);
  }, [quality]);

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
          light: readQuality() === "low",
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
          onCollect: (count, all) => {
            setCollected(count);
            setTotal(all);
            if (all > 0 && count >= all) setDone(true);
          },
          onMute: (value) => setMuted(value),
          onError: (error) => {
            console.error("[three] world failed", error);
            setStatus("error");
          },
        });
        worldRef.current = handle;
        if (import.meta.env.DEV) {
          (window as unknown as { __world?: WorldHandle }).__world = handle;
        }
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
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {total > 0 && (
              <span className="rounded-lg border border-zinc-700/70 bg-zinc-950/70 px-2.5 py-1.5 text-xs text-zinc-200 backdrop-blur">
                🌷 {collected}/{total}
              </span>
            )}
            <button
              type="button"
              onClick={() => setMuted(worldRef.current?.toggleMute() ?? false)}
              aria-label={t("three.sound")}
              className="rounded-lg border border-zinc-700/70 bg-zinc-950/70 px-2.5 py-1.5 text-sm backdrop-blur transition hover:border-zinc-500"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={() => setMapOpen((open) => !open)}
              aria-label={t("three.mapTitle")}
              aria-pressed={mapOpen}
              className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur transition ${
                mapOpen
                  ? "border-zinc-300 bg-zinc-100 text-zinc-950"
                  : "border-zinc-700/70 bg-zinc-950/70 hover:border-zinc-500"
              }`}
            >
              🗺
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label={t("three.quality.title")}
              aria-expanded={settingsOpen}
              className="rounded-lg border border-zinc-700/70 bg-zinc-950/70 px-2.5 py-1.5 text-sm backdrop-blur transition hover:border-zinc-500"
            >
              ⚙
            </button>
            {backend && (
              <span className="hidden rounded-lg border border-zinc-700/70 bg-zinc-950/70 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur sm:inline">
                three.js + TSL
                <span className="mx-1.5 text-zinc-600">·</span>
                {backend}
              </span>
            )}
          </div>

          {settingsOpen && (
            <div className="w-60 rounded-xl border border-zinc-700/70 bg-zinc-950/90 p-3 text-left backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                {t("three.quality.title")}
              </p>
              <div className="mt-2 flex gap-1.5">
                {(["low", "medium", "high"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      qualityChosen.current = true;
                      window.localStorage.setItem(QUALITY_MANUAL_KEY, "1");
                      window.localStorage.setItem(QUALITY_KEY, level);
                      setQuality(level);
                    }}
                    className={`flex-1 rounded-md px-2 py-1 text-xs transition ${
                      quality === level
                        ? "bg-zinc-100 text-zinc-950"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {t(`three.quality.${level}`)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => worldRef.current?.reset()}
                className="mt-3 w-full rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
              >
                {t("three.controls.reset")} · R
              </button>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{t("three.quality.hint")}</p>
            </div>
          )}

          {mapOpen && telemetry && <Minimap telemetry={telemetry} label={t("three.mapTitle")} />}
        </div>
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

      {/* title card before the first input */}
      {status === "ready" && !started && !near && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-start p-6 md:items-center">
          <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-zinc-700/60 bg-zinc-950/70 p-6 text-center shadow-2xl backdrop-blur-md md:text-left">
            <p className="text-[11px] uppercase tracking-[0.34em] text-zinc-400">
              {backend && backend === "WebGPU" ? "WebGPU · three.js + TSL" : "three.js + TSL"}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-zinc-50">{t("three.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{t("three.intro")}</p>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-white"
            >
              <span aria-hidden>🚲</span>
              {t("three.start")}
            </button>
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-zinc-400 md:justify-start">
              {(
                [
                  ["W / ↑", t("three.controls.pedal")],
                  ["A D", t("three.controls.steer")],
                  ["Shift", t("three.controls.boost")],
                  ["E", t("three.controls.enter")],
                  ["H", t("three.controls.bell")],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span className="rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {key}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
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
                  aria-label={t("three.controls.jump")}
                  className="h-14 w-14 rounded-xl border border-zinc-700/70 bg-zinc-950/80 text-lg backdrop-blur active:bg-zinc-800"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setStarted(true);
                    worldRef.current?.jump();
                  }}
                >
                  ⤴
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
                  ["Space", t("three.controls.jump")],
                  ["E", t("three.controls.enter")],
                  ["H", t("three.controls.bell")],
                  ["L", t("three.sound")],
                  ["M", t("three.mapTitle")],
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

      {/* all tulips found */}
      {done && !openPoi && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-5 py-3 text-center backdrop-blur">
            <p className="text-sm font-semibold text-emerald-50">{t("three.allFound")}</p>
            <p className="mt-0.5 text-xs text-emerald-100/80">{t("three.allFoundHint")}</p>
          </div>
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

/** Strip map of the two quays, the canal, bridges, secrets and the rider. */
function Minimap({ telemetry, label }: { telemetry: Telemetry; label: string }) {
  const width = 264;
  const height = 96;
  const stepX = 0.9;
  const toX = (x: number) => (x + LAYOUT.worldX) * stepX + 4;
  const toY = (z: number) => (z + 22) * 2;
  const heading =
    (Math.atan2(-2 * Math.sin(telemetry.yaw), Math.cos(telemetry.yaw)) * 180) / Math.PI;

  return (
    <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/90 p-2 backdrop-blur">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-[10px] normal-case tracking-normal text-zinc-400">
          M
        </span>
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className="rounded-lg bg-zinc-900"
      >
        {/* canal */}
        <rect x={0} y={toY(-6)} width={width} height={24} fill="#2f8fa3" />
        {/* quays */}
        <rect x={0} y={toY(6)} width={width} height={20} fill="#574f45" />
        <rect x={0} y={toY(-16)} width={width} height={20} fill="#574f45" />
        {/* houses */}
        <rect x={0} y={toY(16)} width={width} height={12} fill="#8a4c38" />
        <rect x={0} y={toY(-22)} width={width} height={12} fill="#8a4c38" />
        {/* bridges */}
        {LAYOUT.bridges.map((bx) => (
          <rect
            key={bx}
            x={toX(bx) - 2.5}
            y={toY(-15.5)}
            width={5}
            height={31}
            fill="#e0d5c0"
          />
        ))}
        {/* points of interest */}
        {(Object.keys(POI_ANCHORS) as PoiId[]).map((id) => {
          const anchor = POI_ANCHORS[id];
          return (
            <circle
              key={id}
              cx={toX(anchor.x)}
              cy={toY(anchor.z)}
              r={3.2}
              fill="#ffd79a"
              stroke="#3a2f22"
              strokeWidth={0.8}
            />
          );
        })}
        {/* uncollected tulips */}
        {telemetry.items.map((item, index) =>
          item.taken ? null : (
            <rect
              key={index}
              x={toX(item.x) - 1.8}
              y={toY(item.z) - 1.8}
              width={3.6}
              height={3.6}
              fill="#e0544f"
              transform={`rotate(45 ${toX(item.x)} ${toY(item.z)})`}
            />
          ),
        )}
        {/* the rider */}
        <polygon
          points="7,0 -4,4.5 -4,-4.5"
          fill="#ffffff"
          stroke="#111114"
          strokeWidth={0.8}
          transform={`translate(${toX(telemetry.x)} ${toY(telemetry.z)}) rotate(${heading})`}
        />
      </svg>
      <p className="mt-1 text-[10px] text-zinc-500">
        {Math.round(Math.abs(telemetry.speed) * 3.6)} km/h
      </p>
    </div>
  );
}
