'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ChangeEvent,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Phase = 'intuitive' | 'questionnaire' | 'structured' | 'constructive';
type Impression = '明るい' | '暗い' | '楽しい' | '切ない' | '緊張感がある' | '落ち着く';
type StampType = 'いいね' | '違和感' | '注目';
type DrawTool = 'pen' | 'circle' | 'arrow';
type DrawColor = '#ef4444' | '#f59e0b' | '#2563eb';

interface FirstNoticeLog {
  xPercent: number;
  yPercent: number;
  timeMs: number;
}

interface StampItem {
  id: number;
  type: StampType;
  xPercent: number;
  yPercent: number;
}

interface QuestionItem {
  id:
    | 'themeLogic'
    | 'creativity'
    | 'layoutComposition'
    | 'spacePerspective'
    | 'orderliness'
    | 'lightShadow'
    | 'color'
    | 'detailTexture'
    | 'overallDana'
    | 'moodLi';
  label: string;
}



const impressions: Impression[] = ['明るい', '暗い', '楽しい', '切ない', '緊張感がある', '落ち着く'];
const stampOptions: Array<{ type: StampType; emoji: string; label: string }> = [
  { type: 'いいね', emoji: '♡', label: 'いいね' },
  { type: '違和感', emoji: '？', label: '違和感' },
  { type: '注目', emoji: '◎', label: '注目' },
];
const drawTools: DrawTool[] = ['pen', 'circle', 'arrow'];
const drawToolLabels: Record<DrawTool, string> = {
  pen: 'フリーハンド',
  circle: '丸',
  arrow: '矢印',
};
const drawColors: DrawColor[] = ['#ef4444', '#f59e0b', '#2563eb'];
const initialImage = '/kei.png';
const questionItems: QuestionItem[] = [
  { id: 'themeLogic', label: 'テーマと論理' },
  { id: 'creativity', label: '創造性' },
  { id: 'layoutComposition', label: 'レイアウトと構図' },
  { id: 'spacePerspective', label: '空間と遠近感' },
  { id: 'orderliness', label: '秩序感' },
  { id: 'lightShadow', label: '光と影' },
  { id: 'color', label: '色彩' },
  { id: 'detailTexture', label: '細部と質感' },
  { id: 'overallDana', label: '総合 Dana' },
  { id: 'moodLi', label: 'ムード' },
];

const initialQuestionScores: Record<QuestionItem['id'], number> = {
  themeLogic: 3,
  creativity: 3,
  layoutComposition: 3,
  spacePerspective: 3,
  orderliness: 3,
  lightShadow: 3,
  color: 3,
  detailTexture: 3,
  overallDana: 3,
  moodLi: 3,
};

export default function UnifiedEvaluationPage() {
  const [imageSrc, setImageSrc] = useState(initialImage);
  const [imageError, setImageError] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<Phase>('intuitive');

  const [firstNotice, setFirstNotice] = useState<FirstNoticeLog | null>(null);
  const [selectedImpression, setSelectedImpression] = useState<Impression | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [imageOrigin, setImageOrigin] = useState('50% 50%');
  const [questionScores, setQuestionScores] = useState(initialQuestionScores);

  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [selectedStampType, setSelectedStampType] = useState<StampType>('いいね');
  const [intentScore, setIntentScore] = useState(4);

  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [drawColor, setDrawColor] = useState<DrawColor>('#ef4444');
  const [drawWidth, setDrawWidth] = useState(4);

  const imageUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

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
    if (!containerRef.current) {
      return null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    const xPercent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));

    return { xPercent, yPercent };
  };

  const handleImageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (currentPhase !== 'intuitive') {
      return;
    }

    if (firstNotice) {
      return;
    }

    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setFirstNotice({
      ...point,
      timeMs: Date.now(),
    });
  };

  const handleWheelZoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (currentPhase !== 'intuitive') {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const direction = event.deltaY > 0 ? -1 : 1;
    const nextScale = Number(Math.min(3, Math.max(1, imageScale + direction * 0.15)).toFixed(2));
    if (nextScale === imageScale) {
      return;
    }

    setImageOrigin(`${point.xPercent}% ${point.yPercent}%`);
    setImageScale(nextScale);
  };



  const handleStampDragStart = (event: DragEvent<HTMLButtonElement>, type: StampType) => {
    event.dataTransfer.setData('text/plain', type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleStampDrop = (event: DragEvent<HTMLDivElement>) => {
    if (currentPhase !== 'structured') {
      return;
    }

    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain') as StampType;
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const validType = stampOptions.some((option) => option.type === type) ? type : selectedStampType;
    setStamps((current) => [
      ...current,
      {
        id: Date.now() + current.length,
        type: validType,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
      },
    ]);
  };

  const exportPayload = useMemo(() => {
    const base = {
      phase: currentPhase,
    };

    if (currentPhase === 'intuitive') {
      return {
        ...base,
        firstNotice,
        selectedImpression,
      };
    }

    if (currentPhase === 'questionnaire') {
      return {
        ...base,
        questionScores,
      };
    }

    if (currentPhase === 'structured') {
      return {
        ...base,
        intentScore,
        stamps,
      };
    }

    return {
      ...base,
      drawTool,
      drawColor,
      drawWidth,
    };
  }, [
    currentPhase,
    firstNotice,
    selectedImpression,
    questionScores,
    intentScore,
    stamps,
    drawTool,
    drawColor,
    drawWidth,
  ]);

  const handleCopyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
  };

  const phaseLabel: Record<Phase, string> = {
    intuitive: 'Intuitive & Implicit Phase',
    questionnaire: 'Questionnaire Phase',
    structured: 'Structured Visual Annotation',
    constructive: 'Constructive Suggestions',
  };

  const questionAverage =
    Math.round(
      (Object.values(questionScores).reduce((sum, score) => sum + score, 0) / questionItems.length) * 10,
    ) / 10;

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_20%_10%,#cffafe_0%,#f8fafc_44%,#ecfccb_100%)] flex flex-col`}>
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/90 px-6 py-4 backdrop-blur">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-500">Iterative Canvas</p>
          <h1 className="text-2xl font-black text-zinc-900">Unified Evaluation</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['intuitive', 'questionnaire', 'structured', 'constructive'] as Phase[]).map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setCurrentPhase(phase)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${currentPhase === phase ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'}`}
            >
              Step {phase === 'intuitive' ? '2' : phase === 'questionnaire' ? '3' : phase === 'structured' ? '4' : '5'}
            </button>
          ))}
        </div>
        <Link
          href="/"
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
        >
          Context Sharingへ
        </Link>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        <div className="flex flex-col bg-white/70 p-6 lg:border-r lg:border-zinc-200">
          <div className="mb-4 rounded-xl border border-zinc-300 bg-white">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="block w-full rounded-lg px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </div>

          <div
            ref={containerRef}
            className="relative aspect-[4/3] flex-1 overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-50"
            onClick={handleImageClick}
            onDragOver={handleDragOver}
            onDrop={handleStampDrop}
            onWheel={handleWheelZoom}
          >
            {!imageError ? (
              <div
                style={{
                  transform: currentPhase === 'intuitive' ? `scale(${imageScale})` : 'scale(1)',
                  transformOrigin: imageOrigin,
                }}
                className="h-full w-full transition-transform"
              >
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
              <div className="grid h-full place-items-center text-center text-sm text-zinc-500">
                画像をアップロードしてください
              </div>
            )}

            {currentPhase === 'intuitive' && firstNotice && (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-500 bg-rose-500/30 px-2 py-1 text-xs font-semibold text-rose-800"
                style={{ left: `${firstNotice.xPercent}%`, top: `${firstNotice.yPercent}%` }}
              >
                First Notice
              </div>
            )}

            {currentPhase === 'structured' &&
              stamps.map((stamp) => (
                <div
                  key={stamp.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-2xl font-black text-zinc-900 shadow-lg backdrop-blur"
                  style={{ left: `${stamp.xPercent}%`, top: `${stamp.yPercent}%` }}
                >
                  {stampOptions.find((option) => option.type === stamp.type)?.emoji}
                </div>
              ))}
          </div>
        </div>

        <div className={`overflow-y-auto bg-white/90 p-6 backdrop-blur lg:border-l lg:border-zinc-200`}>
          <h2 className="mb-4 text-lg font-black text-zinc-900">{phaseLabel[currentPhase]}</h2>

          {currentPhase === 'intuitive' && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">第一印象を選ぶ</h3>
                <div className="flex flex-wrap gap-2">
                  {impressions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSelectedImpression(item)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
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

              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">取得ログ</h3>
                <div className="space-y-1 text-sm text-zinc-700">
                  <p>First Notice: {firstNotice ? 'クリック済み' : '未クリック'}</p>
                  <p>第一印象: {selectedImpression ?? '未選択'}</p>
                </div>
              </section>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                JSONをコピー
              </button>
            </div>
          )}

          {currentPhase === 'questionnaire' && (
            <div className="space-y-4">
              <section className="space-y-4">
                {questionItems.map((item) => (
                  <div key={item.id}>
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold text-zinc-800">
                      <span>{item.label}</span>
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {questionScores[item.id]}/5
                      </span>
                    </div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>1</span>
                      <span>5</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={questionScores[item.id]}
                      onChange={(event) => {
                        const score = Number(event.target.value);
                        setQuestionScores((current) => ({
                          ...current,
                          [item.id]: score,
                        }));
                      }}
                      className="w-full accent-blue-600"
                    />
                  </div>
                ))}
              </section>

              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                <p className="mb-1 font-semibold text-zinc-800">質問フェーズ集計</p>
                <p>平均スコア: {questionAverage}/5</p>
              </section>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                JSONをコピー
              </button>
            </div>
          )}

          {currentPhase === 'structured' && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">スタンプを選ぶ</h3>
                <div className="flex flex-wrap gap-2">
                  {stampOptions.map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      draggable
                      onDragStart={(event) => handleStampDragStart(event, option.type)}
                      onClick={() => setSelectedStampType(option.type)}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                        selectedStampType === option.type
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                      }`}
                    >
                      <span className="text-base">{option.emoji}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">意図の達成度</h3>
                <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
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
                <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <span>スコア</span>
                  <span className="font-black text-rose-700">{intentScore}/7</span>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">配置済みスタンプ</h3>
                <p className="text-sm text-zinc-700">{stamps.length} 個</p>
              </section>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                JSONをコピー
              </button>
            </div>
          )}

          {currentPhase === 'constructive' && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">描画ツール</h3>
                <div className="mb-3 flex flex-wrap gap-2">
                  {drawTools.map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => setDrawTool(tool)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        drawTool === tool
                          ? 'border-sky-600 bg-sky-600 text-white'
                          : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                      }`}
                    >
                      {drawToolLabels[tool]}
                    </button>
                  ))}
                </div>

                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold text-zinc-800">色</p>
                  <div className="flex gap-2">
                    {drawColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDrawColor(color)}
                        className={`h-7 w-7 rounded-full border-2 ${drawColor === color ? 'border-zinc-900' : 'border-white'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-zinc-800">太さ</p>
                  <div className="flex gap-2">
                    {[2, 4, 8].map((width) => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => setDrawWidth(width)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          drawWidth === width
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                        }`}
                      >
                        {width}px
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                <p>・フリーハンドで気になる箇所を囲む</p>
                <p>・丸で注目点を示す</p>
                <p>・矢印で流れや視線誘導を提案する</p>
              </section>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                JSONをコピー
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
