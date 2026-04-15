'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Candidate = {
  id: string;
  vector: {
    eye_x: number;
    eye_y: number;
    eye_scale: number;
  };
  acquisition: number | null;
};

type SessionResponse = {
  id: string;
  goal: string;
};

type BONextResponse = {
  session_id: string;
  round_index: number;
  strategy: string;
  training_size: number;
  candidates: Candidate[];
};

type LayerSnapshot = {
  id: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  imageDataUrl: string;
  transform: LayerTransform;
};

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

type RenderPayload = {
  canvasSize: {
    width: number;
    height: number;
  };
  eyeLayerIds: string[];
  baseImageDataUrl: string;
  eyeLayers: LayerSnapshot[];
};

type RenderPayloadResponse = {
  session_id: string;
  payload: RenderPayload;
};

type RenderCacheWindow = Window & {
  __feedbackArtRenderCache?: Record<string, RenderPayload>;
};

type CandidatePreviewProps = {
  candidate: Candidate;
  renderPayload: RenderPayload;
};

function CandidatePreview({ candidate, renderPayload }: CandidatePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { width, height } = renderPayload.canvasSize;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    let alive = true;

    const draw = async () => {
      const baseImage = new Image();
      baseImage.src = renderPayload.baseImageDataUrl;
      await baseImage.decode();
      if (!alive) {
        return;
      }
      ctx.drawImage(baseImage, 0, 0, width, height);

      for (const layer of renderPayload.eyeLayers) {
        const image = new Image();
        image.src = layer.imageDataUrl;
        await image.decode();

        if (!alive) {
          return;
        }

        const base = layer.transform ?? {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          skewX: 0,
          skewY: 0,
          perspectiveX: 0,
          perspectiveY: 0,
        };

        const applied = {
          ...base,
          x: base.x + candidate.vector.eye_x,
          y: base.y + candidate.vector.eye_y,
          scale: base.scale * (1 + candidate.vector.eye_scale / 100),
        };

        const centerX = layer.left + layer.width / 2;
        const centerY = layer.top + layer.height / 2;

        ctx.save();
        ctx.translate(centerX + applied.x, centerY + applied.y);
        ctx.rotate((applied.rotation * Math.PI) / 180);
        ctx.scale(applied.scale, applied.scale);
        ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
        ctx.restore();
      }
    };

    void draw();

    return () => {
      alive = false;
    };
  }, [candidate, renderPayload]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg border border-white/80 bg-white/60 object-contain"
      style={{ aspectRatio: `${renderPayload.canvasSize.width} / ${renderPayload.canvasSize.height}` }}
    />
  );
}

const MAX_ROUNDS = 12;

export default function EvaluatePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session')?.trim() ?? '';

  const [round, setRound] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [sessionGoal, setSessionGoal] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [sessionError, setSessionError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [boStrategy, setBoStrategy] = useState('');
  const [trainingSize, setTrainingSize] = useState(0);
  const [boStatus, setBoStatus] = useState<'idle' | 'loading' | 'submitting' | 'error'>('idle');
  const [boError, setBoError] = useState('');
  const [renderPayload, setRenderPayload] = useState<RenderPayload | null>(null);
  const [showMetaPanels, setShowMetaPanels] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setSessionStatus('error');
      setSessionError('session パラメータがありません。');
      return;
    }

    const controller = new AbortController();

    const loadSession = async () => {
      try {
        setSessionStatus('loading');
        setSessionError('');

        const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}`, {
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Session fetch failed: ${response.status}`);
        }

        const data = (await response.json()) as SessionResponse;
        setSessionGoal(data.goal);
        setSessionStatus('loaded');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error(error);
        setSessionStatus('error');
        setSessionError('セッション情報の取得に失敗しました。');
      }
    };

    void loadSession();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setRenderPayload(null);
      return;
    }

    const loadRenderPayload = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/render-payload`, {
          method: 'GET',
        });

        if (response.ok) {
          const remote = (await response.json()) as RenderPayloadResponse;
          setRenderPayload(remote.payload);
          return;
        }
      } catch (error) {
        console.warn('Could not fetch render payload from backend', error);
      }

      try {
        const cacheWindow = window as RenderCacheWindow;
        const fromMemory = cacheWindow.__feedbackArtRenderCache?.[sessionId];
        if (fromMemory) {
          setRenderPayload(fromMemory);
          return;
        }

        const raw = localStorage.getItem(`feedback-art:session:${sessionId}:render`);
        if (!raw) {
          setRenderPayload(null);
          return;
        }

        const parsed = JSON.parse(raw) as RenderPayload;
        setRenderPayload(parsed);
      } catch (error) {
        console.error(error);
        setRenderPayload(null);
      }
    };

    void loadRenderPayload();
  }, [apiBaseUrl, sessionId]);

  const loadCandidates = useCallback(async (roundIndex: number) => {
    const response = await fetch(
      `${apiBaseUrl}/sessions/${sessionId}/bo/next?round_index=${roundIndex}&k=4`,
      { method: 'GET' },
    );

    if (!response.ok) {
      throw new Error(`BO candidate fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as BONextResponse;
    setCandidates(data.candidates);
    setBoStrategy(data.strategy);
    setTrainingSize(data.training_size);
  }, [apiBaseUrl, sessionId]);

  useEffect(() => {
    if (sessionStatus !== 'loaded' || !sessionId) {
      return;
    }

    const boot = async () => {
      try {
        setBoStatus('loading');
        setBoError('');
        await loadCandidates(1);
        setRound(1);
        setBoStatus('idle');
      } catch (error) {
        console.error(error);
        setBoStatus('error');
        setBoError('BO候補の取得に失敗しました。');
      }
    };

    void boot();
  }, [loadCandidates, sessionId, sessionStatus]);

  const variants = useMemo(() => {
    return candidates;
  }, [candidates]);

  const handlePick = async (id: string) => {
    if (boStatus === 'loading' || boStatus === 'submitting' || !sessionId) {
      return;
    }

    try {
      setBoStatus('submitting');
      setBoError('');

      const feedbackResponse = await fetch(`${apiBaseUrl}/sessions/${sessionId}/bo/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          round_index: round,
          chosen_id: id,
          candidates: variants,
        }),
      });

      if (!feedbackResponse.ok) {
        throw new Error(`BO feedback failed: ${feedbackResponse.status}`);
      }

      setSelected((current) => [...current, `${round}:${id}`]);
      const nextRound = Math.min(MAX_ROUNDS, round + 1);
      setRound(nextRound);

      if (nextRound < MAX_ROUNDS) {
        await loadCandidates(nextRound);
      }

      setBoStatus('idle');
    } catch (error) {
      console.error(error);
      setBoStatus('error');
      setBoError('BOフィードバックの送信に失敗しました。');
    }
  };

  const isDone = round >= MAX_ROUNDS;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_90%_10%,_#ffe4e6_0%,_#ecfeff_45%,_#f8fafc_100%)] px-2 py-6 sm:px-4">
      <section className="mx-auto w-full rounded-2xl border border-rose-200/70 bg-white/90 p-4 shadow-[0_28px_90px_rgba(225,29,72,0.16)] backdrop-blur md:p-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold tracking-wide text-rose-800">
              Step 2 / HITL
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Pairwise Evaluation Session</h1>
            <p className="mt-2 text-sm text-slate-600">
              共有URL経由でアクセスした評価者が、資料画像と意図を見て最も近い候補を選択するフェーズです。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMetaPanels((current) => !current)}
              className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-400"
            >
              {showMetaPanels ? '情報を隠す' : '情報を表示'}
            </button>
            <Link href="/" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400">
              Creator Setupへ戻る
            </Link>
          </div>
        </header>

        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Round {Math.min(round, MAX_ROUNDS)} / {MAX_ROUNDS}
        </div>

        {showMetaPanels ? (
          <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">Session</p>
              <p className="text-sm font-bold text-slate-800">{sessionId || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Intent</p>
              <p className="text-sm font-bold text-slate-800">
                {sessionStatus === 'loading'
                  ? '読み込み中...'
                  : sessionGoal || 'セッションの意図が未設定です'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Round</p>
              <p className="text-sm font-bold text-slate-800">
                {Math.min(round, MAX_ROUNDS)} / {MAX_ROUNDS}
              </p>
            </div>
          </div>
        ) : null}

        {sessionStatus === 'error' ? (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sessionError}</p>
        ) : null}

        {showMetaPanels ? (
          <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">BO Strategy</p>
              <p className="text-sm font-bold text-slate-800">{boStrategy || 'loading'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Training Points</p>
              <p className="text-sm font-bold text-slate-800">{trainingSize}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Status</p>
              <p className="text-sm font-bold text-slate-800">{boStatus}</p>
            </div>
          </div>
        ) : null}

        {boStatus === 'error' ? (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{boError}</p>
        ) : null}

        <section className="grid w-full gap-2 md:grid-cols-2 md:gap-2">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => void handlePick(variant.id)}
              disabled={isDone || boStatus === 'loading' || boStatus === 'submitting' || sessionStatus !== 'loaded'}
              className="rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-rose-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="mb-2 aspect-[4/3] rounded-lg bg-[linear-gradient(130deg,#c7d2fe_0%,#f0f9ff_45%,#fee2e2_100%)] p-1">
                {renderPayload ? (
                  <CandidatePreview candidate={variant} renderPayload={renderPayload} />
                ) : (
                  <div className="grid h-full place-items-center rounded-lg border border-white/80 bg-white/70 text-xs font-semibold text-slate-600">
                    Candidate {variant.id}
                  </div>
                )}
              </div>
              <p className="text-xs font-bold text-slate-800">候補 {variant.id}</p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                delta: Eye x {variant.vector.eye_x}% / y {variant.vector.eye_y}% / scale {variant.vector.eye_scale}%
              </p>
              <p className="mt-1 text-[11px] text-rose-700">
                acquisition: {variant.acquisition === null ? 'N/A' : variant.acquisition.toFixed(3)}
              </p>
            </button>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-800">選択ログ</h2>
          {selected.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">まだ選択はありません。</p>
          ) : (
            <p className="mt-2 break-all text-sm text-slate-700">{selected.join(' | ')}</p>
          )}
          {isDone ? (
            <Link
              href="/aggregation-dashboard"
              className="mt-4 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:border-emerald-400"
            >
              診断結果を確認する
            </Link>
          ) : null}
        </section>
      </section>
    </main>
  );
}
