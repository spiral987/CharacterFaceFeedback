'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';

type WipStage = 'ラフ' | '線画' | '着彩中' | '仕上げ前' | '完成版';

const stageOptions: WipStage[] = ['ラフ', '線画', '着彩中', '仕上げ前', '完成版'];

export default function ContextSharingPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<WipStage>('ラフ');
  const [intent, setIntent] = useState('');
  const [selectionReason, setSelectionReason] = useState('');
  const [growthGoal, setGrowthGoal] = useState('');
  const [currentBlocker, setCurrentBlocker] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [yesNoQuestions, setYesNoQuestions] = useState<string[]>([]);
  const [generatedLink, setGeneratedLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [previewUrl, referencePreviewUrl]);

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setGeneratedLink('');
    setErrorMessage('');
  };

  const onReferenceImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (referencePreviewUrl) {
      URL.revokeObjectURL(referencePreviewUrl);
    }

    setReferenceImageFile(file);
    setReferencePreviewUrl(URL.createObjectURL(file));
  };

  const handleAddQuestion = () => {
    const trimmed = questionInput.trim();
    if (!trimmed) {
      return;
    }

    setYesNoQuestions((current) => [...current, trimmed]);
    setQuestionInput('');
  };

  const handleRemoveQuestion = (question: string) => {
    setYesNoQuestions((current) => current.filter((item) => item !== question));
  };

  const handleGenerateLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!imageFile) {
      setErrorMessage('画像をアップロードしてください。');
      return;
    }

    if (!intent.trim()) {
      setErrorMessage('「伝えたい意図」を入力してください。');
      return;
    }

    setErrorMessage('');
    const shareId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setGeneratedLink(`${window.location.origin}/evaluate?session=${shareId}`);
  };

  const handleCopyLink = async () => {
    if (!generatedLink) {
      return;
    }

    await navigator.clipboard.writeText(generatedLink);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#fef3c7_0%,_#fff7ed_45%,_#eef2ff_100%)] px-4 py-10 sm:px-8">
      <section className="mx-auto max-w-5xl rounded-3xl border border-amber-200/80 bg-white/85 p-6 shadow-[0_24px_80px_rgba(146,64,14,0.16)] backdrop-blur md:p-10">
        <header className="mb-8">
          <p className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800">
            Iterative Canvas
          </p>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">Context Sharing</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base">
            評価者に見せる前に、作者の意図と悩みを整理して共有します。完成品だけでなく制作途中の状態も含めて提示することで、
            「どこが伝わっているか」を具体的に観測しやすくします。
          </p>
        </header>

        <form onSubmit={handleGenerateLink} className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label className="mb-3 block text-sm font-semibold text-zinc-800">1. WIP画像をアップロード</label>
              <input
                type="file"
                accept="image/*"
                onChange={onImageChange}
                className="mb-4 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-amber-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-600"
              />

              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="アップロードしたイラストのプレビュー"
                    width={1200}
                    height={900}
                    unoptimized
                    className="h-auto max-h-[420px] w-full object-contain"
                  />
                ) : (
                  <div className="grid min-h-[260px] place-items-center px-4 text-center text-sm text-zinc-500">
                    画像を選択するとここにプレビューが表示されます。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-3 text-sm font-semibold text-zinc-800">2. 制作フェーズを選択</p>
              <div className="flex flex-wrap gap-2">
                {stageOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setStage(item)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      stage === item
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label htmlFor="intent" className="mb-2 block text-sm font-semibold text-zinc-800">
                3. このイラストで伝えたい意図
              </label>
              <textarea
                id="intent"
                rows={4}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="例: キャラクターの活発な性格"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-amber-400 transition focus:ring-2"
              />
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label htmlFor="selectionReason" className="mb-2 block text-sm font-semibold text-zinc-800">
                4. 題材の選出理由
              </label>
              <textarea
                id="selectionReason"
                rows={3}
                value={selectionReason}
                onChange={(e) => setSelectionReason(e.target.value)}
                placeholder="例: 表情の難しいシーンに挑戦したくてこの題材を選びました"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-amber-400 transition focus:ring-2"
              />
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label htmlFor="growthGoal" className="mb-2 block text-sm font-semibold text-zinc-800">
                5. 成長目標
              </label>
              <textarea
                id="growthGoal"
                rows={3}
                value={growthGoal}
                onChange={(e) => setGrowthGoal(e.target.value)}
                placeholder="例: 構図で視線誘導を作る力を伸ばしたい"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-amber-400 transition focus:ring-2"
              />
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-semibold text-zinc-800">7. アイデアの参照元（画像）</label>
              <input
                type="file"
                accept="image/*"
                onChange={onReferenceImageChange}
                className="mb-3 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-amber-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-600"
              />
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {referencePreviewUrl ? (
                  <Image
                    src={referencePreviewUrl}
                    alt="参照画像のプレビュー"
                    width={1000}
                    height={700}
                    unoptimized
                    className="h-auto max-h-[280px] w-full object-contain"
                  />
                ) : (
                  <div className="grid min-h-[160px] place-items-center px-4 text-center text-sm text-zinc-500">
                    参照画像を選択するとここに表示されます。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label htmlFor="currentBlocker" className="mb-2 block text-sm font-semibold text-zinc-800">
                8. 行き詰っていること
              </label>
              <textarea
                id="currentBlocker"
                rows={3}
                value={currentBlocker}
                onChange={(e) => setCurrentBlocker(e.target.value)}
                placeholder="例: 背景との明度差が弱く、主役が埋もれて見える"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-amber-400 transition focus:ring-2"
              />
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-2 text-sm font-semibold text-zinc-800">9. 小さな質問リスト（Yes/Noで答えられる質問）</p>
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="例: 視線はキャラクターの顔に集まっていますか？"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-amber-400 transition focus:ring-2"
                />
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  追加
                </button>
              </div>
              <div className="space-y-2">
                {yesNoQuestions.length === 0 ? (
                  <p className="text-sm text-zinc-500">まだ質問はありません。Yes/Noで答えられる質問を追加してください。</p>
                ) : (
                  yesNoQuestions.map((question) => (
                    <div key={question} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <p className="text-sm text-zinc-700">{question}</p>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(question)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          
          </div>

          <div className="md:col-span-2">
            {errorMessage ? (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="mb-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-3">
                <p>
                  <span className="font-semibold">フェーズ:</span> {stage}
                </p>
                <p>
                  <span className="font-semibold">画像:</span> {imageFile?.name ?? '未選択'}
                </p>
                <p>
                  <span className="font-semibold">参照画像:</span> {referenceImageFile?.name ?? '未選択'}
                </p>
                <p>
                  <span className="font-semibold">質問数:</span> {yesNoQuestions.length}
                </p>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
              >
                評価リンクを生成する
              </button>

              {generatedLink ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="mb-2 text-sm font-semibold text-emerald-800">共有リンクが生成されました</p>
                  <p className="break-all text-sm text-emerald-900">{generatedLink}</p>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    リンクをコピー
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}