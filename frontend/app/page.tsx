'use client';

import { readPsd } from 'ag-psd';
import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

type LayerTransform = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  skewX: number;
  skewY: number;
  perspectiveX: number;
  perspectiveY: number;
};

type Point = {
  x: number;
  y: number;
};

type ExtractedLayer = {
  id: string;
  name: string;
  width: number;
  height: number;
  left: number;
  top: number;
  canvas: HTMLCanvasElement;
  visible: boolean;
};

type SerializableLayer = {
  id: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  imageDataUrl: string;
  transform: LayerTransform;
};

type SessionRenderPayload = {
  canvasSize: {
    width: number;
    height: number;
  };
  eyeLayerIds: string[];
  baseImageDataUrl: string;
  eyeLayers: SerializableLayer[];
};

type RenderCacheWindow = Window & {
  __feedbackArtRenderCache?: Record<string, SessionRenderPayload>;
};

type PsdNode = {
  name?: string;
  hidden?: boolean;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  canvas?: HTMLCanvasElement;
  imageData?: ImageData;
  children?: PsdNode[];
};

const TARGET_LAYER_NAMES = ['eye'];
const DEFAULT_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  skewX: 0,
  skewY: 0,
  perspectiveX: 0,
  perspectiveY: 0,
};
const WARP_GRID = 8;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function toCanvasFromImageData(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context could not be created.');
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function flattenLayers(
  nodes: PsdNode[] | undefined,
  path = 'root',
  inheritedHidden = false,
): Array<{ id: string; node: PsdNode; visible: boolean }> {
  if (!nodes || nodes.length === 0) {
    return [];
  }

  return nodes.flatMap((node, index) => {
    const id = `${path}-${index}`;
    const visible = !inheritedHidden && !node.hidden;
    const current = [{ id, node, visible }];
    const children = flattenLayers(node.children, id, !visible);
    return [...current, ...children];
  });
}

function buildLayerRecord(entry: { id: string; node: PsdNode; visible: boolean }): ExtractedLayer | null {
  const { id, node, visible } = entry;
  const layerCanvas = node.canvas ?? (node.imageData ? toCanvasFromImageData(node.imageData) : undefined);
  if (!layerCanvas) {
    return null;
  }

  const left = node.left ?? 0;
  const top = node.top ?? 0;
  const width = typeof node.right === 'number' && typeof node.left === 'number' ? node.right - node.left : layerCanvas.width;
  const height = typeof node.bottom === 'number' && typeof node.top === 'number' ? node.bottom - node.top : layerCanvas.height;

  return {
    id,
    name: node.name ?? id,
    width: Math.max(1, width),
    height: Math.max(1, height),
    left,
    top,
    canvas: layerCanvas,
    visible,
  };
}

function findVisibleLayers(nodes: PsdNode[] | undefined): ExtractedLayer[] {
  return flattenLayers(nodes)
    .map(buildLayerRecord)
    .filter((layer): layer is ExtractedLayer => layer !== null)
    .filter((layer) => layer.visible);
}

function findTargetLayers(nodes: PsdNode[] | undefined): ExtractedLayer[] {
  return flattenLayers(nodes)
    .filter(({ visible, node }) => visible && !!node.name)
    .filter(({ node }) => {
      const label = normalizeLabel(node.name ?? '');
      return TARGET_LAYER_NAMES.some((target) => label === target);
    })
    .map(buildLayerRecord)
    .filter((layer): layer is ExtractedLayer => layer !== null);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function bilinearPoint(quad: Point[], u: number, v: number): Point {
  const top = lerpPoint(quad[0], quad[1], u);
  const bottom = lerpPoint(quad[3], quad[2], u);
  return lerpPoint(top, bottom, v);
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point,
) {
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denom) < 1e-6) {
    return;
  }

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denom;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denom;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  ctx.restore();
}

function buildWarpQuad(layer: ExtractedLayer, transform: LayerTransform): Point[] {
  const centerX = layer.left + layer.width / 2 + transform.x;
  const centerY = layer.top + layer.height / 2 + transform.y;
  const halfW = layer.width / 2;
  const halfH = layer.height / 2;
  const skewXRad = (transform.skewX * Math.PI) / 180;
  const skewYRad = (transform.skewY * Math.PI) / 180;
  const rotationRad = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  const corners: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];

  return corners.map((corner) => {
    const skewedX = corner.x + Math.tan(skewXRad) * corner.y;
    const skewedY = corner.y + Math.tan(skewYRad) * corner.x;
    const scaledX = skewedX * transform.scale;
    const scaledY = skewedY * transform.scale;
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;
    const ny = corner.y / Math.max(1, halfH);
    const nx = corner.x / Math.max(1, halfW);

    return {
      x: centerX + rotatedX + ny * transform.perspectiveX,
      y: centerY + rotatedY + nx * transform.perspectiveY,
    };
  });
}

function drawWarpedLayer(ctx: CanvasRenderingContext2D, layer: ExtractedLayer, transform: LayerTransform) {
  const quad = buildWarpQuad(layer, transform);

  for (let gy = 0; gy < WARP_GRID; gy += 1) {
    for (let gx = 0; gx < WARP_GRID; gx += 1) {
      const u0 = gx / WARP_GRID;
      const u1 = (gx + 1) / WARP_GRID;
      const v0 = gy / WARP_GRID;
      const v1 = (gy + 1) / WARP_GRID;

      const d00 = bilinearPoint(quad, u0, v0);
      const d10 = bilinearPoint(quad, u1, v0);
      const d11 = bilinearPoint(quad, u1, v1);
      const d01 = bilinearPoint(quad, u0, v1);

      const s00 = { x: u0 * layer.width, y: v0 * layer.height };
      const s10 = { x: u1 * layer.width, y: v0 * layer.height };
      const s11 = { x: u1 * layer.width, y: v1 * layer.height };
      const s01 = { x: u0 * layer.width, y: v1 * layer.height };

      drawTexturedTriangle(ctx, layer.canvas, s00, s10, s11, d00, d10, d11);
      drawTexturedTriangle(ctx, layer.canvas, s00, s11, s01, d00, d11, d01);
    }
  }
}

function drawLayerWithTransform(
  ctx: CanvasRenderingContext2D,
  layer: ExtractedLayer,
  transform: LayerTransform,
) {
  const hasWarp =
    Math.abs(transform.skewX) > 0.01 ||
    Math.abs(transform.skewY) > 0.01 ||
    Math.abs(transform.perspectiveX) > 0.01 ||
    Math.abs(transform.perspectiveY) > 0.01;

  if (hasWarp) {
    drawWarpedLayer(ctx, layer, transform);
    return;
  }

  const centerX = layer.left + layer.width / 2;
  const centerY = layer.top + layer.height / 2;
  ctx.save();
  ctx.translate(centerX + transform.x, centerY + transform.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(layer.canvas, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();
}

export default function HomePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
  const [psdName, setPsdName] = useState('');
  const [goalText, setGoalText] = useState('少し大人っぽく、目元の落ち着きを強めたい');
  const [sessionLink, setSessionLink] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [layers, setLayers] = useState<ExtractedLayer[]>([]);
  const [targetLayers, setTargetLayers] = useState<ExtractedLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [transforms, setTransforms] = useState<Record<string, LayerTransform>>({});
  const [referencePreview, setReferencePreview] = useState('');

  const refObjectUrl = useRef<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const canvasSize = useMemo(() => {
    if (layers.length === 0) {
      return { width: 960, height: 720 };
    }

    const maxRight = layers.reduce((max, layer) => Math.max(max, layer.left + layer.width), 0);
    const maxBottom = layers.reduce((max, layer) => Math.max(max, layer.top + layer.height), 0);
    return {
      width: Math.max(480, maxRight),
      height: Math.max(360, maxBottom),
    };
  }, [layers]);

  useEffect(() => {
    return () => {
      if (refObjectUrl.current) {
        URL.revokeObjectURL(refObjectUrl.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    layers.forEach((layer) => {
      const transform = transforms[layer.id] ?? DEFAULT_TRANSFORM;
      drawLayerWithTransform(ctx, layer, transform);
    });
  }, [canvasSize.height, canvasSize.width, layers, transforms]);

  const updateTransform = (key: keyof LayerTransform, value: number) => {
    if (!selectedLayerId) {
      return;
    }

    setTransforms((current) => ({
      ...current,
      [selectedLayerId]: {
        ...(current[selectedLayerId] ?? DEFAULT_TRANSFORM),
        [key]: value,
      },
    }));
  };

  const handleReferenceUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (refObjectUrl.current) {
      URL.revokeObjectURL(refObjectUrl.current);
    }

    const next = URL.createObjectURL(file);
    refObjectUrl.current = next;
    setReferencePreview(next);
  };

  const handlePsdUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setErrorText('');
      const buffer = await file.arrayBuffer();
      const psd = readPsd(new Uint8Array(buffer), {
        skipCompositeImageData: false,
        skipLayerImageData: false,
      }) as PsdNode;

      const visibleLayers = findVisibleLayers(psd.children);
      const extracted = findTargetLayers(psd.children);

      if (visibleLayers.length === 0) {
        setLayers([]);
        setTargetLayers([]);
        setSelectedLayerId('');
        setTransforms({});
        setErrorText('表示中のレイヤーが見つかりませんでした。hidden の状態を確認してください。');
        return;
      }

      setPsdName(file.name);
      setLayers(visibleLayers);
      setTargetLayers(extracted);
      setSelectedLayerId(extracted[0]?.id ?? visibleLayers[0].id);
      setTransforms(
        visibleLayers.reduce<Record<string, LayerTransform>>((acc, layer) => {
          acc[layer.id] = DEFAULT_TRANSFORM;
          return acc;
        }, {}),
      );
    } catch (error) {
      setErrorText('PSDの解析に失敗しました。8bit RGBAで書き出したPSDを試してください。');
      setLayers([]);
      setSelectedLayerId('');
      setTransforms({});
      console.error(error);
    }
  };

  const buildSession = async () => {
    if (!psdName || !goalText.trim()) {
      setErrorText('PSDと意図テキストを入力してください。');
      return;
    }

    try {
      setIsCreatingSession(true);
      setErrorText('');

      const response = await fetch(`${apiBaseUrl}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goal: goalText.trim(),
          metadata: {
            psd_name: psdName,
            visible_layer_count: visibleLayerCount,
            target_layer_count: targetLayerCount,
            target_layer_name: 'eye',
            target_layer_ids: targetLayers.map((layer) => layer.id),
            target_layer_display_names: targetLayers.map((layer) => layer.name),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Session create failed: ${response.status}`);
      }

      const data = (await response.json()) as { id?: string };
      if (!data.id) {
        throw new Error('Session id was not returned');
      }

      const eyeLayerIdSet = new Set(targetLayers.map((layer) => layer.id));
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = canvasSize.width;
      baseCanvas.height = canvasSize.height;
      const baseCtx = baseCanvas.getContext('2d');
      if (!baseCtx) {
        throw new Error('Base canvas context could not be created');
      }
      baseCtx.fillStyle = '#f8fafc';
      baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);

      layers
        .filter((layer) => !eyeLayerIdSet.has(layer.id))
        .forEach((layer) => {
          const transform = transforms[layer.id] ?? DEFAULT_TRANSFORM;
          drawLayerWithTransform(baseCtx, layer, transform);
        });

      const renderPayload: SessionRenderPayload = {
        canvasSize,
        eyeLayerIds: targetLayers.map((layer) => layer.id),
        baseImageDataUrl: baseCanvas.toDataURL('image/png'),
        eyeLayers: layers
          .filter((layer) => eyeLayerIdSet.has(layer.id))
          .map((layer) => ({
          id: layer.id,
          name: layer.name,
          left: layer.left,
          top: layer.top,
          width: layer.width,
          height: layer.height,
          imageDataUrl: layer.canvas.toDataURL('image/png'),
          transform: transforms[layer.id] ?? DEFAULT_TRANSFORM,
        })),
      };

      let backendStored = false;
      try {
        const payloadResponse = await fetch(`${apiBaseUrl}/sessions/${data.id}/render-payload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ payload: renderPayload }),
        });

        if (!payloadResponse.ok) {
          throw new Error(`Render payload upload failed: ${payloadResponse.status}`);
        }
        backendStored = true;
      } catch (backendError) {
        console.warn('Could not persist render payload to backend', backendError);
      }

      try {
        localStorage.setItem(
          `feedback-art:session:${data.id}:render`,
          JSON.stringify(renderPayload),
        );
      } catch (storageError) {
        console.warn('Could not persist render payload to localStorage', storageError);
        const cacheWindow = window as RenderCacheWindow;
        cacheWindow.__feedbackArtRenderCache ??= {};
        cacheWindow.__feedbackArtRenderCache[data.id] = renderPayload;
      }

      if (!backendStored) {
        const cacheWindow = window as RenderCacheWindow;
        cacheWindow.__feedbackArtRenderCache ??= {};
        cacheWindow.__feedbackArtRenderCache[data.id] = renderPayload;
      }

      const link = `${window.location.origin}/evaluate?session=${data.id}`;
      setSessionLink(link);
      await navigator.clipboard.writeText(link);
    } catch (error) {
      console.error(error);
      setSessionLink('');
      setErrorText('セッション作成に失敗しました。バックエンドが起動しているか確認してください。');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const activeTransform = selectedLayerId ? transforms[selectedLayerId] ?? DEFAULT_TRANSFORM : DEFAULT_TRANSFORM;
  const targetLayerCount = targetLayers.length;
  const visibleLayerCount = layers.length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_10%,_#dbeafe_0%,_#ecfeff_40%,_#f8fafc_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-7xl rounded-3xl border border-sky-200/70 bg-white/90 p-6 shadow-[0_30px_90px_rgba(14,116,144,0.2)] backdrop-blur md:p-9">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold tracking-wide text-sky-800">
              Phase 1 PoC
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
              PSD Layer Diagnostic Workbench
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              ブラウザ上でPSDを解析し、顔パーツレイヤーを独立アフィン変換するデバッグ用ウィジェットです。自動修正はせず、
              どのパラメータが似せ方の差分を生むかを確認できます。
            </p>
          </div>
          <Link
            href="/aggregation-dashboard"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            診断書ダッシュボードへ
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-800">1. WIP PSDをアップロード</label>
            <input
              type="file"
              accept=".psd"
              onChange={handlePsdUpload}
              className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-700"
            />

            <label className="text-sm font-semibold text-slate-800">2. 公式資料画像（任意）</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleReferenceUpload}
              className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
            />
            {referencePreview ? (
              <Image
                src={referencePreview}
                alt="Reference preview"
                width={1200}
                height={900}
                unoptimized
                className="max-h-56 w-full rounded-xl border border-slate-200 object-contain"
              />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
                参照画像を追加すると、評価フェーズへ渡す比較素材を確認できます。
              </p>
            )}

            <label htmlFor="goal" className="text-sm font-semibold text-slate-800">
              3. 意図 (Goal)
            </label>
            <textarea
              id="goal"
              rows={3}
              value={goalText}
              onChange={(event) => setGoalText(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-sky-300 focus:ring-2"
            />

            <button
              type="button"
              onClick={buildSession}
              disabled={isCreatingSession}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {isCreatingSession ? 'セッションを作成中...' : '4. 評価セッションリンクを生成'}
            </button>

            {sessionLink ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                リンクを生成し、クリップボードへコピーしました。
                <p className="mt-1 break-all font-medium">{sessionLink}</p>
              </div>
            ) : null}

            {errorText ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText}</p> : null}
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-800">レイヤーコントロール</h2>
            <p className="text-xs text-slate-500">
              表示中レイヤー: {visibleLayerCount} / BO対象(eye)レイヤー: {targetLayerCount}
            </p>

            <select
              value={selectedLayerId}
              onChange={(event) => setSelectedLayerId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {layers.length === 0 ? <option value="">レイヤー未抽出</option> : null}
              {layers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}{layer.visible ? '' : ' (hidden)'}
                </option>
              ))}
            </select>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <label className="block text-xs font-semibold text-slate-700">
                X移動: {activeTransform.x}px
                <input
                  type="range"
                  min={-120}
                  max={120}
                  value={activeTransform.x}
                  onChange={(event) => updateTransform('x', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Y移動: {activeTransform.y}px
                <input
                  type="range"
                  min={-120}
                  max={120}
                  value={activeTransform.y}
                  onChange={(event) => updateTransform('y', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                回転: {activeTransform.rotation}deg
                <input
                  type="range"
                  min={-30}
                  max={30}
                  value={activeTransform.rotation}
                  onChange={(event) => updateTransform('rotation', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                拡大縮小: {activeTransform.scale.toFixed(2)}x
                <input
                  type="range"
                  min={60}
                  max={145}
                  value={Math.round(activeTransform.scale * 100)}
                  onChange={(event) => updateTransform('scale', Number(event.target.value) / 100)}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Skew X: {activeTransform.skewX}deg
                <input
                  type="range"
                  min={-45}
                  max={45}
                  value={activeTransform.skewX}
                  onChange={(event) => updateTransform('skewX', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Skew Y: {activeTransform.skewY}deg
                <input
                  type="range"
                  min={-45}
                  max={45}
                  value={activeTransform.skewY}
                  onChange={(event) => updateTransform('skewY', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Perspective X: {activeTransform.perspectiveX}px
                <input
                  type="range"
                  min={-140}
                  max={140}
                  value={activeTransform.perspectiveX}
                  onChange={(event) => updateTransform('perspectiveX', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Perspective Y: {activeTransform.perspectiveY}px
                <input
                  type="range"
                  min={-140}
                  max={140}
                  value={activeTransform.perspectiveY}
                  onChange={(event) => updateTransform('perspectiveY', Number(event.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </label>
            </div>

            <p className="text-xs text-slate-500">
              現在のパラメータ差分は、このまま診断書の Delta 候補として利用できます。
            </p>
          </aside>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">合成プレビュー (Canvas)</h2>
          <div className="overflow-auto rounded-xl border border-slate-300 bg-slate-100 p-2">
            <canvas
              ref={canvasRef}
              className="mx-auto h-auto max-h-[70vh] w-full max-w-full rounded-lg bg-white object-contain"
              style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}
            />
          </div>
        </section>
      </section>
    </main>
  );
}
