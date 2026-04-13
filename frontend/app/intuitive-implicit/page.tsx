'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Impression = '明るい' | '暗い' | '楽しい' | '切ない' | '緊張感がある' | '落ち着く';

interface FirstNoticeLog {
  xPercent: number;
  yPercent: number;
  timeMs: number;
}

interface ZoomLog {
  id: number;
  xPercent: number;
  yPercent: number;
  delta: number;
  scale: number;
  timeMs: number;
}

const impressions: Impression[] = ['明るい', '暗い', '楽しい', '切ない', '緊張感がある', '落ち着く'];
const initialRegionDurations: Record<string, number> = {
  r1c1: 0,
  r1c2: 0,
  r1c3: 0,
  r2c1: 0,
  r2c2: 0,
  r2c3: 0,
  r3c1: 0,
  r3c2: 0,
  r3c3: 0,
};

export default function IntuitiveImplicitPage() {
  const [imageSrc, setImageSrc] = useState('/kei.png');
  const [imageError, setImageError] = useState(false);
  const [firstNotice, setFirstNotice] = useState<FirstNoticeLog | null>(null);
  const [selectedImpression, setSelectedImpression] = useState<Impression | null>(null);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState('50% 50%');
  const [zoomLogs, setZoomLogs] = useState<ZoomLog[]>([]);
  const [regionDurations, setRegionDurations] = useState<Record<string, number>>(initialRegionDurations);
  const [copyStatus, setCopyStatus] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const objectUrlRef = useRef<string | null>(null);
  const activeRegionRef = useRef<string | null>(null);
  const regionStartRef = useRef<number | null>(null);
  const regionDurationsRef = useRef<Record<string, number>>(initialRegionDurations);

  useEffect(() => {
    startTimeRef.current = Date.now();
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const totalDwellMs = useMemo(() => {
    return Object.values(regionDurations).reduce((sum, value) => sum + value, 0);
  }, [regionDurations]);

  const getRelativePoint = (clientX: number, clientY: number) => {
    if (!containerRef.current) {
      return null;
    }
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const xPercent = Math.min(100, Math.max(0, (x / rect.width) * 100));
    const yPercent = Math.min(100, Math.max(0, (y / rect.height) * 100));

    return { xPercent, yPercent };
  };

  const getRegionKey = (xPercent: number, yPercent: number) => {
    const col = Math.min(2, Math.floor(xPercent / (100 / 3)));
    const row = Math.min(2, Math.floor(yPercent / (100 / 3)));
    return `r${row + 1}c${col + 1}`;
  };

  const accumulateActiveRegion = (now: number) => {
    const key = activeRegionRef.current;
    const startedAt = regionStartRef.current;
    if (!key || startedAt === null) {
      return;
    }

    const elapsed = now - startedAt;
    if (elapsed <= 0) {
      return;
    }

    const next = {
      ...regionDurationsRef.current,
      [key]: regionDurationsRef.current[key] + elapsed,
    };
    regionDurationsRef.current = next;
    setRegionDurations(next);
    regionStartRef.current = now;
  };

  const switchActiveRegion = (nextRegion: string, now: number) => {
    if (activeRegionRef.current === nextRegion) {
      return;
    }
    accumulateActiveRegion(now);
    activeRegionRef.current = nextRegion;
    regionStartRef.current = now;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getRelativePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    switchActiveRegion(getRegionKey(point.xPercent, point.yPercent), Date.now());
  };

  const handlePointerLeave = () => {
    accumulateActiveRegion(Date.now());
    activeRegionRef.current = null;
    regionStartRef.current = null;
  };

  const handleImageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (firstNotice) {
      return;
    }

    const point = getRelativePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setFirstNotice({
      xPercent: point.xPercent,
      yPercent: point.yPercent,
      timeMs: Date.now() - startTimeRef.current,
    });
  };

  const handleWheelZoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = getRelativePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const direction = event.deltaY > 0 ? -1 : 1;
    const nextScale = Number(Math.min(3, Math.max(1, scale + direction * 0.15)).toFixed(2));
    if (nextScale === scale) {
      return;
    }

    setOrigin(`${point.xPercent}% ${point.yPercent}%`);
    setScale(nextScale);
    setZoomLogs((prev) => [
      ...prev,
      {
        id: Date.now() + prev.length,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
        delta: event.deltaY,
        scale: nextScale,
        timeMs: Date.now() - startTimeRef.current,
      },
    ]);
  };

  const handleUploadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextObjectUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextObjectUrl;
    setImageSrc(nextObjectUrl);
    setImageError(false);
  };

  const exportPayload = useMemo(() => {
    return {
      firstNotice,
      selectedImpression,
      implicitLogs: {
        zoomEvents: zoomLogs,
        regionDwellMs: regionDurations,
      },
      totalDwellMs,
    };
  }, [firstNotice, selectedImpression, zoomLogs, regionDurations, totalDwellMs]);

  const handleCopyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
    setCopyStatus('JSONをコピーしました');
    window.setTimeout(() => setCopyStatus(''), 1400);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,_#cffafe_0%,_#f8fafc_44%,_#ecfccb_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-6xl rounded-3xl border border-cyan-200 bg-white/85 p-6 shadow-[0_26px_80px_rgba(8,145,178,0.18)] backdrop-blur md:p-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-800">
              Iterative Canvas
            </p>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">Intuitive & Implicit Phase</h1>
            <p className="mt-2 text-sm text-zinc-600">
              直感的な反応を先に取得し、同時に滞在・ズームの暗黙ログを記録します。
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
          >
            Context Sharingへ戻る
          </Link>
          <Link
            href="/structured-visual-annotation"
            className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-400"
          >
            Step 3へ進む
          </Link>
        </header>

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <label className="mb-2 block text-sm font-semibold text-zinc-800">テスト用に画像を差し替える（任意）</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleUploadImage}
            className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">1. First Notice: 最初に目が行った箇所を1回だけクリック</h2>
            <div
              ref={containerRef}
              className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-300 bg-white"
              onClick={handleImageClick}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onWheel={handleWheelZoom}
            >
              {!imageError ? (
                <div style={{ transform: `scale(${scale})`, transformOrigin: origin }} className="h-full w-full transition-transform">
                  <Image
                    src={imageSrc}
                    alt="評価対象イラスト"
                    fill
                    unoptimized
                    className="object-contain"
                    onError={() => setImageError(true)}
                  />
                </div>
              ) : (
                <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-500">
                  /public/kei.png が見つかりません。上のアップロード欄から画像を選択してください。
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="border border-cyan-200" />
                ))}
              </div>

              {firstNotice ? (
                <div
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-500 bg-rose-500/30 px-2 py-1 text-xs font-semibold text-rose-800"
                  style={{ left: `${firstNotice.xPercent}%`, top: `${firstNotice.yPercent}%` }}
                >
                  First Notice
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              ホイール操作でズーム可能（倍率 {scale.toFixed(2)}x）。クリックは最初の1回のみ記録されます。
            </p>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">2. 第一印象を選ぶ（テキスト入力なし）</h3>
              <div className="flex flex-wrap gap-2">
                {impressions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSelectedImpression(item)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      selectedImpression === item
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">3. 取得ログ概要</h3>
              <div className="space-y-2 text-sm text-zinc-700">
                <p>
                  First Notice: {firstNotice ? `(${firstNotice.xPercent.toFixed(1)}%, ${firstNotice.yPercent.toFixed(1)}%)` : '未取得'}
                </p>
                <p>第一印象: {selectedImpression ?? '未選択'}</p>
                <p>ズーム回数: {zoomLogs.length} 回</p>
                <p>暗黙ログ総滞在時間: {(totalDwellMs / 1000).toFixed(1)} 秒</p>
              </div>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
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
