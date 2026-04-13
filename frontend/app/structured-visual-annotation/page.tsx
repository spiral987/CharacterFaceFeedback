'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type StampType = 'いいね' | '違和感' | '注目';

interface StampItem {
  id: number;
  type: StampType;
  xPercent: number;
  yPercent: number;
}

const stampOptions: Array<{ type: StampType; emoji: string; label: string }> = [
  { type: 'いいね', emoji: '♡', label: 'いいね' },
  { type: '違和感', emoji: '？', label: '違和感' },
  { type: '注目', emoji: '◎', label: '注目' },
];

const initialImage = '/kei.png';

export default function StructuredVisualAnnotationPage() {
  const [imageSrc, setImageSrc] = useState(initialImage);
  const [imageError, setImageError] = useState(false);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [selectedStampType, setSelectedStampType] = useState<StampType>('いいね');
  const [intentScore, setIntentScore] = useState(4);
  const [dropHint, setDropHint] = useState('スタンプをドラッグして画像上にドロップしてください。');
  const [copyStatus, setCopyStatus] = useState('');

  const imageUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  const exportPayload = useMemo(() => {
    return {
      intentScore,
      stamps,
    };
  }, [intentScore, stamps]);

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

  const getCanvasPoint = (clientX: number, clientY: number) => {
    if (!canvasRef.current) {
      return null;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    const xPercent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));

    return { xPercent, yPercent };
  };

  const placeStamp = (xPercent: number, yPercent: number, type: StampType) => {
    setStamps((current) => [
      ...current,
      {
        id: Date.now() + current.length,
        type,
        xPercent,
        yPercent,
      },
    ]);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    placeStamp(point.xPercent, point.yPercent, selectedStampType);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, type: StampType) => {
    event.dataTransfer.setData('text/plain', type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain') as StampType;
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const validType = stampOptions.some((option) => option.type === type) ? type : selectedStampType;
    placeStamp(point.xPercent, point.yPercent, validType);
    setDropHint('スタンプを配置しました。必要なら別のスタンプも追加できます。');
  };

  const handleCopyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
    setCopyStatus('JSONをコピーしました');
    window.setTimeout(() => setCopyStatus(''), 1400);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#fdf2f8_0%,_#fff7ed_46%,_#eff6ff_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-6xl rounded-3xl border border-rose-200/80 bg-white/90 p-6 shadow-[0_28px_90px_rgba(190,24,93,0.16)] backdrop-blur md:p-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold tracking-wide text-rose-800">
              Iterative Canvas
            </p>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">Structured Visual Annotation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base">
              専門用語を使わず、スタンプを置く操作とスライダーだけで分析的な評価を集めます。
            </p>
          </div>
          <Link
            href="/intuitive-implicit"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
          >
            前のフェーズへ戻る
          </Link>
          <Link
            href="/constructive-suggestions"
            className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-400"
          >
            Step 4へ進む
          </Link>
        </header>

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <label className="mb-2 block text-sm font-semibold text-zinc-800">評価対象の画像を差し替える（任意）</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-rose-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-rose-700"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">1. スタンプをドラッグ＆ドロップ</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {stampOptions.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, option.type)}
                  onClick={() => setSelectedStampType(option.type)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    selectedStampType === option.type
                      ? 'border-rose-600 bg-rose-600 text-white'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                  }`}
                >
                  <span className="text-base leading-none">{option.emoji}</span>
                  {option.label}
                </button>
              ))}
            </div>

            <div
              ref={canvasRef}
              onClick={handleCanvasClick}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
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

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(244,63,94,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(244,63,94,0.08)_1px,transparent_1px)] bg-[size:25%_25%]" />

              {stamps.map((stamp) => (
                <button
                  key={stamp.id}
                  type="button"
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-2xl font-black text-zinc-900 shadow-lg backdrop-blur"
                  style={{ left: `${stamp.xPercent}%`, top: `${stamp.yPercent}%` }}
                >
                  {stampOptions.find((option) => option.type === stamp.type)?.emoji}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">画像上をクリックしても配置できます。ドラッグ操作が主、クリックは補助です。</p>
            <p className="mt-2 text-xs font-medium text-rose-700">{dropHint}</p>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">2. 意図の達成度を評価</h3>
              <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                <span>1: ほぼ伝わらない</span>
                <span>7: かなり伝わる</span>
              </div>
              <input
                type="range"
                min={1}
                max={7}
                value={intentScore}
                onChange={(event) => setIntentScore(Number(event.target.value))}
                className="w-full accent-rose-600"
              />
              <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                <span>現在のスコア</span>
                <span className="text-lg font-black text-rose-700">{intentScore}/7</span>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">3. 配置済みスタンプ</h3>
              <div className="space-y-2 text-sm text-zinc-700">
                <p>総数: {stamps.length} 個</p>
                {stamps.length === 0 ? (
                  <p className="text-zinc-500">まだスタンプはありません。</p>
                ) : (
                  <ul className="space-y-1 text-xs text-zinc-600">
                    {stamps.slice(-5).map((stamp) => (
                      <li key={stamp.id}>
                        {stamp.type} @ ({stamp.xPercent.toFixed(1)}%, {stamp.yPercent.toFixed(1)}%)
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
