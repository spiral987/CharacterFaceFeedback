import Link from 'next/link';

const deltaRows = [
  { target: 'Left Eye', parameter: 'translateX', current: '+5%', suggestion: '+2%' },
  { target: 'Left Eye', parameter: 'translateY', current: '-1%', suggestion: '+1%' },
  { target: 'Contour', parameter: 'scale', current: '-2%', suggestion: '-1%' },
  { target: 'Mouth', parameter: 'rotate', current: '+3deg', suggestion: '+1deg' },
];

export default function AggregationDashboardPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_8%,_#cffafe_0%,_#f0fdf4_44%,_#f8fafc_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-6xl rounded-3xl border border-emerald-200/80 bg-white/90 p-6 shadow-[0_30px_90px_rgba(16,185,129,0.18)] backdrop-blur md:p-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800">
              Step 3 / Diagnosis
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Delta Diagnosis Sheet</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              最適化後の画像をそのまま出力せず、制作で再現できる差分パラメータを提示します。描き手はこの結果を見ながら
              ペイントツール側で手動修正し、反復改善します。
            </p>
          </div>
          <Link href="/" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400">
            Creator Setupへ戻る
          </Link>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Session</p>
            <p className="mt-1 text-sm font-bold text-slate-800">session-demo-x4z8</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Objective</p>
            <p className="mt-1 text-sm font-bold text-slate-800">目元を落ち着かせて、年齢感を少し上げる</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Confidence</p>
            <p className="mt-1 text-sm font-bold text-emerald-700">0.81 (simulated)</p>
          </article>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Parameter Delta</h2>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Target Layer</th>
                  <th className="px-3 py-2">Parameter</th>
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Suggested</th>
                </tr>
              </thead>
              <tbody>
                {deltaRows.map((row) => (
                  <tr key={`${row.target}-${row.parameter}`} className="border-b border-slate-100 text-slate-700">
                    <td className="px-3 py-2 font-semibold">{row.target}</td>
                    <td className="px-3 py-2">{row.parameter}</td>
                    <td className="px-3 py-2">{row.current}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">{row.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Reflection Prompts</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              <li>左目の位置差分を適用したとき、キャラクター性は維持されるか。</li>
              <li>輪郭縮小の影響で年齢感が上がりすぎないか。</li>
              <li>次回ラウンドで検証したい仮説を2つ言語化できるか。</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Visual Heatmap (placeholder)</h3>
            <div className="mt-2 aspect-[4/3] rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_45%_38%,rgba(16,185,129,0.45)_0%,rgba(16,185,129,0.16)_25%,transparent_58%),radial-gradient(circle_at_62%_58%,rgba(239,68,68,0.45)_0%,rgba(239,68,68,0.16)_22%,transparent_54%),#f8fafc]" />
          </article>
        </section>
      </section>
    </main>
  );
}
