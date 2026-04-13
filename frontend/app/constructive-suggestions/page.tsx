'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Tool = 'pen' | 'circle' | 'arrow';
type StrokeColor = '#ef4444' | '#f59e0b' | '#2563eb';

type Point = {
  x: number;
  y: number;
};

type PenAnnotation = {
  id: number;
  tool: 'pen';
  color: StrokeColor;
  width: number;
  points: Point[];
};

type ShapeAnnotation = {
  id: number;
  tool: 'circle' | 'arrow';
  color: StrokeColor;
  width: number;
  start: Point;
  end: Point;
};

type Annotation = PenAnnotation | ShapeAnnotation;

type DraftAnnotation =
  | {
      tool: 'pen';
      color: StrokeColor;
      width: number;
      points: Point[];
    }
  | {
      tool: 'circle' | 'arrow';
      color: StrokeColor;
      width: number;
      start: Point;
      current: Point;
    }
  | null;

type PenDrawable = {
  color: StrokeColor;
  width: number;
  points: Point[];
};

type ShapeDrawable = {
  color: StrokeColor;
  width: number;
  start: Point;
  end: Point;
};

const colorOptions: StrokeColor[] = ['#ef4444', '#f59e0b', '#2563eb'];
const toolLabels: Record<Tool, string> = {
  pen: 'フリーハンド',
  circle: '丸',
  arrow: '矢印',
};
const initialImage = '/kei.png';

function drawPenAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: PenDrawable,
  scaleX: number,
  scaleY: number,
  alpha: number,
) {
  if (annotation.points.length < 2) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = annotation.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(annotation.points[0].x * scaleX, annotation.points[0].y * scaleY);
  annotation.points.slice(1).forEach((point: Point) => {
    ctx.lineTo(point.x * scaleX, point.y * scaleY);
  });
  ctx.stroke();
  ctx.restore();
}

function drawCircleAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: ShapeDrawable,
  scaleX: number,
  scaleY: number,
  alpha: number,
) {
  const x1 = annotation.start.x * scaleX;
  const y1 = annotation.start.y * scaleY;
  const x2 = annotation.end.x * scaleX;
  const y2 = annotation.end.y * scaleY;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.max(4, Math.abs(x2 - x1));
  const height = Math.max(4, Math.abs(y2 - y1));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = annotation.width;
  ctx.beginPath();
  ctx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawArrowAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: ShapeDrawable,
  scaleX: number,
  scaleY: number,
  alpha: number,
) {
  const startX = annotation.start.x * scaleX;
  const startY = annotation.start.y * scaleY;
  const endX = annotation.end.x * scaleX;
  const endY = annotation.end.y * scaleY;
  const angle = Math.atan2(endY - startY, endX - startX);
  const headSize = Math.max(10, annotation.width * 2.5);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = annotation.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headSize * Math.cos(angle - Math.PI / 6), endY - headSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(endX - headSize * Math.cos(angle + Math.PI / 6), endY - headSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation | DraftAnnotation,
  scaleX: number,
  scaleY: number,
  alpha: number,
) {
  if (!annotation) {
    return;
  }

  if (annotation.tool === 'pen') {
    drawPenAnnotation(ctx, annotation, scaleX, scaleY, alpha);
    return;
  }

  if (annotation.tool === 'circle') {
    drawCircleAnnotation(
      ctx,
      {
        color: annotation.color,
        width: annotation.width,
        start: annotation.start,
        end: 'current' in annotation ? annotation.current : annotation.end,
      },
      scaleX,
      scaleY,
      alpha,
    );
    return;
  }

  drawArrowAnnotation(
    ctx,
    {
      color: annotation.color,
      width: annotation.width,
      start: annotation.start,
      end: 'current' in annotation ? annotation.current : annotation.end,
    },
    scaleX,
    scaleY,
    alpha,
  );
}

export default function ConstructiveSuggestionsPage() {
  const [imageSrc, setImageSrc] = useState(initialImage);
  const [imageError, setImageError] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<StrokeColor>('#ef4444');
  const [width, setWidth] = useState(4);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<DraftAnnotation>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const updateSize = () => {
      const rect = surface.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(surface);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvasSize.width * dpr);
    canvas.height = Math.floor(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const scaleX = canvasSize.width / 100;
    const scaleY = canvasSize.height / 100;

    annotations.forEach((annotation) => drawAnnotation(ctx, annotation, scaleX, scaleY, 0.95));
    drawAnnotation(ctx, draft, scaleX, scaleY, 0.6);
  }, [annotations, draft, canvasSize]);

  const exportPayload = useMemo(() => {
    return {
      tool,
      color,
      width,
      annotations,
    };
  }, [annotations, color, tool, width]);

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(file);
    imageUrlRef.current = nextUrl;
    setImageSrc(nextUrl);
    setImageError(false);
  };

  const getRelativePoint = (clientX: number, clientY: number) => {
    if (!surfaceRef.current) {
      return null;
    }

    const rect = surfaceRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getRelativePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'pen') {
      setDraft({
        tool,
        color,
        width,
        points: [point],
      });
      return;
    }

    setDraft({
      tool,
      color,
      width,
      start: point,
      current: point,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const point = getRelativePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setDraft((current) => {
      if (!current) {
        return current;
      }

      if (current.tool === 'pen') {
        return {
          ...current,
          points: [...current.points, point],
        };
      }

      return {
        ...current,
        current: point,
      };
    });
  };

  const commitDraft = () => {
    setDraft((current) => {
      if (!current) {
        return null;
      }

      if (current.tool === 'pen') {
        if (current.points.length < 2) {
          return null;
        }

        setAnnotations((existing) => [
          ...existing,
          {
            id: Date.now() + existing.length,
            tool: 'pen',
            color: current.color,
            width: current.width,
            points: current.points,
          },
        ]);
        return null;
      }

      setAnnotations((existing) => [
        ...existing,
        {
          id: Date.now() + existing.length,
          tool: current.tool,
          color: current.color,
          width: current.width,
          start: current.start,
          end: current.current,
        },
      ]);
      return null;
    });

    drawingRef.current = false;
  };

  const handlePointerUp = () => {
    commitDraft();
  };

  const handlePointerCancel = () => {
    drawingRef.current = false;
    setDraft(null);
  };

  const handleUndo = () => {
    setAnnotations((existing) => existing.slice(0, -1));
  };

  const handleClear = () => {
    setAnnotations([]);
    setDraft(null);
  };

  const handleCopyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
    setCopyStatus('JSONをコピーしました');
    window.setTimeout(() => setCopyStatus(''), 1400);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe_0%,_#f8fafc_48%,_#fef3c7_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-7xl rounded-3xl border border-sky-200/80 bg-white/90 p-6 shadow-[0_28px_100px_rgba(14,165,233,0.16)] backdrop-blur md:p-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold tracking-wide text-sky-800">
              Iterative Canvas
            </p>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">Constructive Suggestions</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base">
              半透明のCanvasレイヤーに、丸・矢印・フリーハンド線を重ねて改善案を描きます。言葉の代わりに、視覚的な代替案を返せる画面です。
            </p>
          </div>
          <Link
            href="/structured-visual-annotation"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
          >
            前のフェーズへ戻る
          </Link>
          <Link
            href="/aggregation-dashboard"
            className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:border-sky-400"
          >
            Step 5へ進む
          </Link>
        </header>

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <label className="mb-2 block text-sm font-semibold text-zinc-800">評価対象の画像を差し替える（任意）</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-700"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
          <section>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-800">1. 描画ツールを選ぶ</h2>
                <p className="text-xs text-zinc-500">色と太さは最低限だけ選べるようにしています。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(toolLabels) as Tool[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTool(item)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      tool === item
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {toolLabels[item]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-800">色</span>
                {colorOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setColor(item)}
                    className={`h-8 w-8 rounded-full border-2 ${color === item ? 'border-zinc-900' : 'border-white'}`}
                    style={{ backgroundColor: item }}
                    aria-label={`色 ${item}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-800">太さ</span>
                {[2, 4, 8].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setWidth(item)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      width === item
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {item}px
                  </button>
                ))}
              </div>

              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
                >
                  1つ戻す
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-full border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:border-rose-400"
                >
                  全消去
                </button>
              </div>
            </div>

            <div
              ref={surfaceRef}
              className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-300 bg-white"
            >
              {!imageError ? (
                <Image
                  src={imageSrc}
                  alt="評価対象イラスト"
                  fill
                  unoptimized
                  className="object-contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-500">
                  /public/kei.png が見つかりません。上のアップロード欄から画像を選択してください。
                </div>
              )}

              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerUp}
              />

              <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/60 bg-white/75 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur">
                {toolLabels[tool]} / {width}px
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">2. 使い方</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-zinc-700">
                <li>・フリーハンドで気になる箇所を囲む</li>
                <li>・丸で注目点を示す</li>
                <li>・矢印で流れや視線誘導を提案する</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">3. 注釈の概要</h3>
              <div className="space-y-2 text-sm text-zinc-700">
                <p>注釈数: {annotations.length} 件</p>
                {annotations.length === 0 ? (
                  <p className="text-zinc-500">まだ描画はありません。</p>
                ) : (
                  <ul className="space-y-1 text-xs text-zinc-600">
                    {annotations.slice(-5).map((annotation) => (
                      <li key={annotation.id}>
                        {annotation.tool} / {annotation.color} / {annotation.width}px
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                取得JSONをコピー
              </button>
              {copyStatus ? <p className="mt-2 text-center text-xs font-semibold text-emerald-700">{copyStatus}</p> : null}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
