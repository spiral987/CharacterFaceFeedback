'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type HeatSource = 'first-notice' | 'stamp' | 'sketch';

type Point = {
  xPercent: number;
  yPercent: number;
};

interface StampEntry {
  type: 'いいね' | '違和感' | '注目';
  point: Point;
}

interface SessionSummary {
  id: string;
  userLabel: string;
  suspicious: boolean;
  qualityScore: number;
  completionRate: number;
  firstNotice: Point;
  stamps: StampEntry[];
  sketchPath: Point[];
}

interface HeatSample {
  id: string;
  sessionId: string;
  userLabel: string;
  suspicious: boolean;
  source: HeatSource;
  point: Point;
  weight: number;
}

const initialImage = '/kei.png';

const demoSessions: SessionSummary[] = [
  {
    id: 'session-a1',
    userLabel: 'viewer-01',
    suspicious: false,
    qualityScore: 92,
    completionRate: 100,
    firstNotice: { xPercent: 46, yPercent: 28 },
    stamps: [
      { type: 'いいね', point: { xPercent: 42, yPercent: 58 } },
      { type: '注目', point: { xPercent: 63, yPercent: 36 } },
    ],
    sketchPath: [
      { xPercent: 30, yPercent: 70 },
      { xPercent: 40, yPercent: 63 },
      { xPercent: 53, yPercent: 52 },
      { xPercent: 68, yPercent: 48 },
    ],
  },
  {
    id: 'session-a2',
    userLabel: 'viewer-02',
    suspicious: false,
    qualityScore: 84,
    completionRate: 96,
    firstNotice: { xPercent: 58, yPercent: 42 },
    stamps: [
      { type: '違和感', point: { xPercent: 61, yPercent: 56 } },
      { type: '注目', point: { xPercent: 29, yPercent: 40 } },
      { type: 'いいね', point: { xPercent: 47, yPercent: 22 } },
    ],
    sketchPath: [
      { xPercent: 70, yPercent: 24 },
      { xPercent: 64, yPercent: 33 },
      { xPercent: 58, yPercent: 40 },
      { xPercent: 49, yPercent: 46 },
      { xPercent: 41, yPercent: 51 },
    ],
  },
  {
    id: 'session-a3',
    userLabel: 'viewer-03',
    suspicious: false,
    qualityScore: 75,
    completionRate: 88,
    firstNotice: { xPercent: 36, yPercent: 35 },
    stamps: [
      { type: '違和感', point: { xPercent: 33, yPercent: 64 } },
      { type: '注目', point: { xPercent: 72, yPercent: 27 } },
    ],
    sketchPath: [
      { xPercent: 24, yPercent: 60 },
      { xPercent: 34, yPercent: 55 },
      { xPercent: 46, yPercent: 50 },
      { xPercent: 57, yPercent: 44 },
      { xPercent: 69, yPercent: 36 },
    ],
  },
  {
    id: 'session-a4',
    userLabel: 'viewer-spam',
    suspicious: true,
    qualityScore: 18,
    completionRate: 21,
    firstNotice: { xPercent: 12, yPercent: 12 },
    stamps: [
      { type: 'いいね', point: { xPercent: 12, yPercent: 12 } },
      { type: '違和感', point: { xPercent: 12, yPercent: 12 } },
    ],
    sketchPath: [
      { xPercent: 10, yPercent: 10 },
      { xPercent: 10, yPercent: 10 },
      { xPercent: 10, yPercent: 10 },
    ],
  },
];

function buildHeatSamples(sessions: SessionSummary[], includeFirstNotice: boolean, includeStamps: boolean, includeSketch: boolean) {
  const samples: HeatSample[] = [];

  sessions.forEach((session) => {
    if (includeFirstNotice) {
      samples.push({
        id: `${session.id}-first`,
        sessionId: session.id,
        userLabel: session.userLabel,
        suspicious: session.suspicious,
        source: 'first-notice',
        point: session.firstNotice,
        weight: 1.45,
      });
    }

    if (includeStamps) {
      session.stamps.forEach((stamp, index) => {
        samples.push({
          id: `${session.id}-stamp-${index}`,
          sessionId: session.id,
          userLabel: session.userLabel,
          suspicious: session.suspicious,
          source: 'stamp',
          point: stamp.point,
          weight: stamp.type === '違和感' ? 1.25 : 1.05,
        });
      });
    }

    if (includeSketch) {
      session.sketchPath.forEach((point, index) => {
        samples.push({
          id: `${session.id}-sketch-${index}`,
          sessionId: session.id,
          userLabel: session.userLabel,
          suspicious: session.suspicious,
          source: 'sketch',
          point,
          weight: 0.92,
        });
      });
    }
  });

  return samples;
}

function sourceLabel(source: HeatSource) {
  switch (source) {
    case 'first-notice':
      return 'First Notice';
    case 'stamp':
      return 'Stamp';
    case 'sketch':
      return 'Sketch';
    default:
      return source;
  }
}

function sourceColor(source: HeatSource) {
  switch (source) {
    case 'first-notice':
      return 'rgba(244, 63, 94, 0.58)';
    case 'stamp':
      return 'rgba(14, 165, 233, 0.54)';
    case 'sketch':
      return 'rgba(168, 85, 247, 0.46)';
    default:
      return 'rgba(15, 23, 42, 0.48)';
  }
}

export default function AggregationDashboardPage() {
  const [imageSrc, setImageSrc] = useState(initialImage);
  const [imageError, setImageError] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>(demoSessions);
  const [includeSuspicious, setIncludeSuspicious] = useState(false);
  const [includeFirstNotice, setIncludeFirstNotice] = useState(true);
  const [includeStamps, setIncludeStamps] = useState(true);
  const [includeSketch, setIncludeSketch] = useState(true);
  const [minimumQuality, setMinimumQuality] = useState(60);
  const [copyStatus, setCopyStatus] = useState('');
  const [jsonText, setJsonText] = useState(JSON.stringify(demoSessions, null, 2));

  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (!includeSuspicious && session.suspicious) {
        return false;
      }

      return session.qualityScore >= minimumQuality;
    });
  }, [includeSuspicious, minimumQuality, sessions]);

  const excludedCount = sessions.length - filteredSessions.length;
  const heatSamples = useMemo(
    () => buildHeatSamples(filteredSessions, includeFirstNotice, includeStamps, includeSketch),
    [filteredSessions, includeFirstNotice, includeSketch, includeStamps],
  );

  const heatSummary = useMemo(() => {
    const counts = heatSamples.reduce(
      (accumulator, sample) => {
        accumulator[sample.source] += 1;
        return accumulator;
      },
      { 'first-notice': 0, stamp: 0, sketch: 0 } as Record<HeatSource, number>,
    );

    return counts;
  }, [heatSamples]);

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

  const handleLoadJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as SessionSummary[];
      setSessions(parsed);
      setCopyStatus('JSONを読み込みました');
      window.setTimeout(() => setCopyStatus(''), 1400);
    } catch {
      setCopyStatus('JSONの形式を確認してください');
      window.setTimeout(() => setCopyStatus(''), 1800);
    }
  };

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(filteredSessions, null, 2));
    setCopyStatus('フィルタ後データをコピーしました');
    window.setTimeout(() => setCopyStatus(''), 1400);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fefce8_0%,_#f8fafc_45%,_#e0f2fe_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-7xl rounded-3xl border border-sky-200/80 bg-white/90 p-6 shadow-[0_28px_100px_rgba(14,165,233,0.18)] backdrop-blur md:p-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold tracking-wide text-sky-800">
              Iterative Canvas
            </p>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">Aggregation Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base">
              First Notice、スタンプ、スケッチを元画像の上に重ねて集約し、適当回答をフィルタしたうえで可視化します。
            </p>
          </div>
          <Link
            href="/constructive-suggestions"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
          >
            前のフェーズへ戻る
          </Link>
        </header>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="mb-2 block text-sm font-semibold text-zinc-800">デモデータを置き換えるJSON</label>
            <textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              rows={8}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-800 outline-none ring-sky-400 transition focus:ring-2"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleLoadJson}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                JSONを読み込む
              </button>
              <button
                type="button"
                onClick={handleCopyJson}
                className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:border-sky-400"
              >
                フィルタ後JSONをコピー
              </button>
            </div>
            {copyStatus ? <p className="mt-2 text-xs font-semibold text-emerald-700">{copyStatus}</p> : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="mb-2 block text-sm font-semibold text-zinc-800">画像を差し替える（任意）</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-700"
            />
            <div className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeSuspicious} onChange={(event) => setIncludeSuspicious(event.target.checked)} />
                疑わしいユーザーを含める
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeFirstNotice} onChange={(event) => setIncludeFirstNotice(event.target.checked)} />
                First Notice
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeStamps} onChange={(event) => setIncludeStamps(event.target.checked)} />
                スタンプ
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeSketch} onChange={(event) => setIncludeSketch(event.target.checked)} />
                スケッチ
              </label>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm text-zinc-700">
                <span>最低品質スコア</span>
                <span className="font-semibold text-sky-700">{minimumQuality}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={minimumQuality}
                onChange={(event) => setMinimumQuality(Number(event.target.value))}
                className="w-full accent-sky-600"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <section>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-semibold text-rose-700">有効セッション</p>
                <p className="mt-1 text-2xl font-black text-rose-900">{filteredSessions.length}</p>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs font-semibold text-sky-700">除外セッション</p>
                <p className="mt-1 text-2xl font-black text-sky-900">{excludedCount}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold text-emerald-700">可視化サンプル数</p>
                <p className="mt-1 text-2xl font-black text-emerald-900">{heatSamples.length}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-300 bg-white overflow-hidden">
              <div className="relative aspect-[4/3] w-full bg-zinc-50">
                {!imageError ? (
                  <Image
                    src={imageSrc}
                    alt="集計対象イラスト"
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

                <div className="pointer-events-none absolute inset-0">
                  {heatSamples.map((sample) => (
                    <div
                      key={sample.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-[1px]"
                      style={{
                        left: `${sample.point.xPercent}%`,
                        top: `${sample.point.yPercent}%`,
                        width: `${Math.max(18, sample.weight * 30)}px`,
                        height: `${Math.max(18, sample.weight * 30)}px`,
                        background: `radial-gradient(circle, ${sourceColor(sample.source)} 0%, rgba(255,255,255,0) 72%)`,
                        opacity: sample.suspicious ? 0.56 : 1,
                        mixBlendMode: 'screen',
                      }}
                      title={`${sample.userLabel} / ${sourceLabel(sample.source)}${sample.suspicious ? ' / suspicious' : ''}`}
                    />
                  ))}

                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {filteredSessions.map((session) => {
                      if (!includeSketch || session.sketchPath.length < 2) {
                        return null;
                      }

                      const path = session.sketchPath
                        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.xPercent} ${point.yPercent}`)
                        .join(' ');

                      return (
                        <path
                          key={`${session.id}-path`}
                          d={path}
                          fill="none"
                          stroke={session.suspicious ? 'rgba(107,114,128,0.45)' : 'rgba(147,51,234,0.55)'}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </svg>
                </div>

                <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur">
                  Heatmap overlay
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">凡例</h3>
              <div className="grid gap-2 sm:grid-cols-3 text-sm text-zinc-700">
                <p>赤: First Notice</p>
                <p>青: Stamp</p>
                <p>紫: Sketch</p>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-3">
                <p>
                  <span className="font-semibold">First Notice:</span> {heatSummary['first-notice']}
                </p>
                <p>
                  <span className="font-semibold">Stamp:</span> {heatSummary.stamp}
                </p>
                <p>
                  <span className="font-semibold">Sketch:</span> {heatSummary.sketch}
                </p>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">品質フィルタリング</h3>
              <ul className="space-y-2 text-sm text-zinc-700">
                <li>・品質スコアが閾値未満のユーザーを除外</li>
                <li>・疑わしいユーザーは手動で含める/除外する</li>
                <li>・表示対象は First Notice / Stamp / Sketch を個別に制御</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800">セッション一覧</h3>
              <div className="space-y-3">
                {sessions.map((session) => {
                  const visible = filteredSessions.some((item) => item.id === session.id);
                  return (
                    <div
                      key={session.id}
                      className={`rounded-xl border p-3 text-sm ${
                        visible ? 'border-zinc-200 bg-white' : 'border-zinc-200 bg-zinc-100 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-zinc-900">{session.userLabel}</p>
                          <p className="text-xs text-zinc-500">{session.id}</p>
                        </div>
                        <div className="text-right text-xs">
                          <p className={session.suspicious ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>
                            {session.suspicious ? '疑わしい' : '有効'}
                          </p>
                          <p className="text-zinc-500">品質 {session.qualityScore} / 完了 {session.completionRate}%</p>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-600">
                        <p>FN {session.firstNotice.xPercent.toFixed(0)}%</p>
                        <p>Stamp {session.stamps.length}</p>
                        <p>Sketch {session.sketchPath.length}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
