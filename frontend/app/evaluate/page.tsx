'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Candidate = {
  id: string;
  macro: {
    global_x: number;
    global_y: number;
    global_scale: number;
  };
  micro: {
    upper_eye_rotation: number;
    pupil_x: number;
    lower_upper_distance_y: number;
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
  active_subspace: 'macro' | 'micro';
  strategy: string;
  training_size: number;
  candidates: Candidate[];
};

type BOFinalResponse = {
  session_id: string;
  training_size: number;
  strategy: string;
  candidate: Candidate;
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

type MacroVector = Candidate['macro'];
type MicroVector = Candidate['micro'];

type InteractiveCanvasProps = {
  renderPayload: RenderPayload;
  macroVector: MacroVector;
  microVector: MicroVector;
  disabled: boolean;
  onMacroChange: (next: MacroVector) => void;
};

type InteractiveCanvasAssets = {
  baseImage: HTMLImageElement;
  layerImages: Map<string, HTMLImageElement>;
};

const FACE_VIEWPORT_RATIO = 0.5;
const UPPER_EYE_ROTATION_RENDER_SCALE = 0.5;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViewportSize(renderPayload: RenderPayload): { width: number; height: number } {
  const width = renderPayload.canvasSize.width;
  const height = Math.max(1, Math.round(renderPayload.canvasSize.height * FACE_VIEWPORT_RATIO));
  return { width, height };
}

function resolveLayerTransform(
  layer: LayerSnapshot,
  macro: MacroVector,
  micro: MicroVector,
  canvasSize: RenderPayload['canvasSize'],
): LayerTransform {
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

  let x = base.x + canvasSize.width * (macro.global_x / 100);
  let y = base.y + canvasSize.height * (macro.global_y / 100);
  let rotation = base.rotation;
  const scale = base.scale * (1 + macro.global_scale / 100);

  if (layer.name.includes('Pupil')) {
    x += canvasSize.width * (micro.pupil_x / 100);
  }

  if (layer.name.includes('Lower_Eye')) {
    y += canvasSize.height * (micro.lower_upper_distance_y / 100);
  }

  if (layer.name.includes('Upper_Eye')) {
    if (layer.name.includes('L_')) {
      rotation += micro.upper_eye_rotation * UPPER_EYE_ROTATION_RENDER_SCALE;
    } else if (layer.name.includes('R_')) {
      rotation -= micro.upper_eye_rotation * UPPER_EYE_ROTATION_RENDER_SCALE;
    }
  }

  return {
    ...base,
    x,
    y,
    rotation,
    scale,
  };
}

function InteractiveCanvas({
  renderPayload,
  macroVector,
  microVector,
  disabled,
  onMacroChange,
}: InteractiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{ clientX: number; clientY: number; start: MacroVector } | null>(null);
  const currentRef = useRef(macroVector);
  const assetsRef = useRef<InteractiveCanvasAssets | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);

  const drawVector = useCallback((vector: MacroVector) => {
    const canvas = canvasRef.current;
    const assets = assetsRef.current;
    if (!canvas || !assets) {
      return;
    }

    const { width, height } = getViewportSize(renderPayload);
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(
      assets.baseImage,
      0,
      0,
      renderPayload.canvasSize.width,
      renderPayload.canvasSize.height * FACE_VIEWPORT_RATIO,
      0,
      0,
      width,
      height,
    );

    for (const layer of renderPayload.eyeLayers) {
      const image = assets.layerImages.get(layer.id);
      if (!image) {
        continue;
      }
      const applied = resolveLayerTransform(layer, vector, microVector, renderPayload.canvasSize);

      const centerX = layer.left + layer.width / 2;
      const centerY = layer.top + layer.height / 2;

      ctx.save();
      ctx.translate(centerX + applied.x, centerY + applied.y);
      ctx.rotate((applied.rotation * Math.PI) / 180);
      ctx.scale(applied.scale, applied.scale);
      ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      ctx.restore();
    }
  }, [microVector, renderPayload]);

  useEffect(() => {
    currentRef.current = macroVector;
  }, [macroVector]);

  useEffect(() => {
    let alive = true;

    const loadAssets = async () => {
      setAssetsReady(false);

      const baseImage = new Image();
      baseImage.src = renderPayload.baseImageDataUrl;
      await baseImage.decode();
      if (!alive) {
        return;
      }

      const decodedLayers = await Promise.all(
        renderPayload.eyeLayers.map(async (layer) => {
          const image = new Image();
          image.src = layer.imageDataUrl;
          await image.decode();
          return { id: layer.id, image };
        }),
      );

      if (!alive) {
        return;
      }

      assetsRef.current = {
        baseImage,
        layerImages: new Map(decodedLayers.map((item) => [item.id, item.image])),
      };
      setAssetsReady(true);
      drawVector(currentRef.current);
    };

    void loadAssets();

    return () => {
      alive = false;
    };
  }, [drawVector, renderPayload]);

  useEffect(() => {
    if (!assetsReady) {
      return;
    }
    drawVector(macroVector);
  }, [assetsReady, macroVector, drawVector]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      start: { ...currentRef.current },
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current || disabled) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const deltaXPct = ((event.clientX - dragStateRef.current.clientX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - dragStateRef.current.clientY) / rect.height) * 100;

    const next = {
      global_x: clamp(dragStateRef.current.start.global_x + deltaXPct, -2, 2),
      global_y: clamp(dragStateRef.current.start.global_y + deltaYPct, -2, 2),
      global_scale: dragStateRef.current.start.global_scale,
    };
    currentRef.current = next;
    drawVector(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    onMacroChange(currentRef.current);
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="block h-auto w-full touch-none rounded-xl border border-white/80 bg-white/70"
      style={{
        aspectRatio: `${renderPayload.canvasSize.width} / ${Math.max(1, Math.round(renderPayload.canvasSize.height * FACE_VIEWPORT_RATIO))}`,
        cursor: disabled ? 'not-allowed' : 'grab',
      }}
    />
  );
}

function CandidatePreview({ candidate, renderPayload }: CandidatePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { width, height } = getViewportSize(renderPayload);
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
      ctx.drawImage(
        baseImage,
        0,
        0,
        renderPayload.canvasSize.width,
        renderPayload.canvasSize.height * FACE_VIEWPORT_RATIO,
        0,
        0,
        width,
        height,
      );

      for (const layer of renderPayload.eyeLayers) {
        const image = new Image();
        image.src = layer.imageDataUrl;
        await image.decode();

        if (!alive) {
          return;
        }

        const applied = resolveLayerTransform(
          layer,
          candidate.macro,
          candidate.micro,
          renderPayload.canvasSize,
        );

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
      style={{
        aspectRatio: `${renderPayload.canvasSize.width} / ${Math.max(1, Math.round(renderPayload.canvasSize.height * FACE_VIEWPORT_RATIO))}`,
      }}
    />
  );
}

const MAX_ROUNDS = parsePositiveInt(process.env.NEXT_PUBLIC_BO_MAX_ROUNDS, 12);
const BO_CANDIDATE_COUNT = parsePositiveInt(process.env.NEXT_PUBLIC_BO_CANDIDATE_COUNT, 4);

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
  const [finalBoResult, setFinalBoResult] = useState<BOFinalResponse | null>(null);
  const [activeSubspace, setActiveSubspace] = useState<'macro' | 'micro'>('macro');
  const [macroVector, setMacroVector] = useState<MacroVector>({ global_x: 0, global_y: 0, global_scale: 0 });
  const [microVector, setMicroVector] = useState<MicroVector>({
    upper_eye_rotation: 0,
    pupil_x: 0,
    lower_upper_distance_y: 0,
  });

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
    const query = new URLSearchParams({
      round_index: String(roundIndex),
      k: String(BO_CANDIDATE_COUNT),
    });

    const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/bo/next?${query.toString()}`, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`BO candidate fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as BONextResponse;
    setCandidates(data.candidates);
    setActiveSubspace(data.active_subspace);
    setBoStrategy(data.strategy);
    setTrainingSize(data.training_size);
    if (data.candidates.length > 0) {
      // The non-active side is fixed for the current round and can be read from any candidate.
      setMacroVector(data.candidates[0].macro);
      setMicroVector(data.candidates[0].micro);
    }
  }, [apiBaseUrl, sessionId]);

  const loadFinalBoResult = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/bo/final`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`BO final result fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as BOFinalResponse;
    setFinalBoResult(data);
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
      const chosen = variants.find((variant) => variant.id === id);
      if (chosen) {
        setMacroVector(chosen.macro);
        setMicroVector(chosen.micro);
      }
      const nextRound = Math.min(MAX_ROUNDS, round + 1);
      setRound(nextRound);

      if (nextRound < MAX_ROUNDS) {
        await loadCandidates(nextRound);
      } else {
        await loadFinalBoResult();
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
            <div>
              <p className="text-xs font-semibold text-slate-500">Active Subspace</p>
              <p className="text-sm font-bold text-slate-800">{activeSubspace}</p>
            </div>
          </div>
        ) : null}

        {boStatus === 'error' ? (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{boError}</p>
        ) : null}

        {isDone ? (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-emerald-900">探索終了後の最適推定イラスト</h2>
                <p className="text-xs text-emerald-800">
                  最後の観測までを使って、BOが次に推す1件を再計算した結果です。
                </p>
              </div>
              {finalBoResult ? (
                <p className="text-xs font-semibold text-emerald-800">
                  strategy: {finalBoResult.strategy} / training: {finalBoResult.training_size}
                </p>
              ) : null}
            </div>

            {finalBoResult && renderPayload ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white p-2">
                  <CandidatePreview candidate={finalBoResult.candidate} renderPayload={renderPayload} />
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">推定パラメータ</p>
                      <p>Global x: {finalBoResult.candidate.macro.global_x.toFixed(2)}%</p>
                      <p>Global y: {finalBoResult.candidate.macro.global_y.toFixed(2)}%</p>
                      <p>Global scale: {finalBoResult.candidate.macro.global_scale.toFixed(2)}%</p>
                      <p className="mt-2">Upper rotation: {finalBoResult.candidate.micro.upper_eye_rotation.toFixed(2)}deg</p>
                      <p>Pupil x: {finalBoResult.candidate.micro.pupil_x.toFixed(2)}%</p>
                      <p>Lower-upper y: {finalBoResult.candidate.micro.lower_upper_distance_y.toFixed(2)}%</p>
                  <p className="mt-3 text-xs text-slate-500">
                    acquisition: {finalBoResult.candidate.acquisition === null ? 'N/A' : finalBoResult.candidate.acquisition.toFixed(3)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-emerald-200 bg-white px-3 py-4 text-sm text-emerald-900">
                最終候補を取得中です。
              </p>
            )}
          </section>
        ) : null}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">メイン操作キャンバス</h2>
              <p className="text-xs text-slate-600">
                目レイヤーをドラッグして大まかに位置を決めると、その近傍だけでBOが再探索します。
              </p>
            </div>
            <div className="min-w-[240px] rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600">Scale 微調整</p>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.1}
                value={macroVector.global_scale}
                disabled={isDone || boStatus === 'loading' || boStatus === 'submitting'}
                onChange={(event) => {
                  const next = {
                    ...macroVector,
                    global_scale: Number.parseFloat(event.target.value),
                  };
                  setMacroVector(next);
                }}
                className="mt-2 w-full"
              />
              <p className="mt-2 text-xs text-slate-500">
                x {macroVector.global_x.toFixed(2)}% / y {macroVector.global_y.toFixed(2)}% / scale {macroVector.global_scale.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
            {renderPayload ? (
              <InteractiveCanvas
                renderPayload={renderPayload}
                macroVector={macroVector}
                microVector={microVector}
                disabled={isDone || boStatus === 'loading' || boStatus === 'submitting'}
                onMacroChange={setMacroVector}
              />
            ) : (
              <div className="grid aspect-[4/3] place-items-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
                レンダー情報の読み込み待ちです。
              </div>
            )}
          </div>
        </section>

        <section className="grid w-full gap-0.5 md:grid-cols-2 md:gap-0.5">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => void handlePick(variant.id)}
              disabled={isDone || boStatus === 'loading' || boStatus === 'submitting' || sessionStatus !== 'loaded'}
              className="rounded-lg border border-slate-200 bg-white p-0.5 text-left transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div
                className="rounded-md bg-[linear-gradient(130deg,#c7d2fe_0%,#f0f9ff_45%,#fee2e2_100%)] p-0.5"
                style={{
                  aspectRatio: renderPayload
                    ? `${renderPayload.canvasSize.width} / ${Math.max(1, Math.round(renderPayload.canvasSize.height * FACE_VIEWPORT_RATIO))}`
                    : '4 / 3',
                }}
              >
                {renderPayload ? (
                  <CandidatePreview candidate={variant} renderPayload={renderPayload} />
                ) : (
                  <div className="grid h-full place-items-center rounded-lg border border-white/80 bg-white/70 text-xs font-semibold text-slate-600">
                    Candidate {variant.id}
                  </div>
                )}
              </div>
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
