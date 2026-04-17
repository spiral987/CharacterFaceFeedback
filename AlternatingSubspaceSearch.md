# 実装要件：交互最適化（Alternating Subspace Search）による意味的次元の探索

## 概要
現在、`eye_x`, `eye_y` という物理的な座標を対象にベイズ最適化（BO）を行っていますが、これを「意味的次元（Semantic Dimensions）」の探索に改修します。
ユーザーの認知負荷を下げるため、目の「全体配置（マクロ）」と「表情（ミクロ）」の最適化をラウンドごとに交互に切り替えて実行する「Alternating Subspace Search」を実装してください。

## 前提条件
- 目のレイヤーは `L_Upper_Eye`, `R_Upper_Eye`, `L_Pupil`, `R_Pupil`, `L_Lower_Eye`, `R_Lower_Eye` などの名前でフロントエンドに渡されます。
- ユーザーは毎ラウンド、提示された4つの候補（Pairwise/1-of-k）から最も良いものを選択します。

## 具体的な実装ステップ

### Step 1: バックエンド スキーマの再定義（意味的次元への移行）
**対象ファイル:** `backend/app/schemas/session.py`
現在の `BOVector` を廃止し、以下の意味的パラメータを持つ構造に変更してください。
- マクロ次元（全体配置）
  - `global_x`: float (目グループ全体のX移動量)
  - `global_y`: float (目グループ全体のY移動量)
- ミクロ次元（表情）
  - `upper_eye_rotation`: float (つり目度。Upper_Eye の回転角)
  - `pupil_x`: float (目線。Pupil の X 位置移動)
  - `lower_upper_distance_y`: float (目開き度。Lower_Eye と Upper_Eye の Y 距離差)

### Step 2: バックエンド BOの交互最適化ロジック
**対象ファイル:** `backend/app/services/bo.py`, `backend/app/api/routes/sessions.py`
1. `/bo/next` APIで `round_index` を受け取り、現在のモード（`active_subspace`）を決定します。
   - 奇数ラウンド（1, 3, 5...）は「マクロモード（配置）」
   - 偶数ラウンド（2, 4, 6...）は「ミクロモード（表情）」
2. `bo.py` の `generate_candidates` において、`current_best`（これまでの最高評価のベクトル）を基準とします。
   - **マクロモード時:** `upper_eye_rotation`, `pupil_x`, `lower_upper_distance_y` は `current_best` の値で**固定**し、`global_x`, `global_y` のみを変数としてガウス過程回帰（UCB）を計算・生成します。
   - **ミクロモード時:** `global_x`, `global_y` を `current_best` の値で**固定**し、表情に関する3つの変数のみを探索して候補を生成します。

### Step 3: フロントエンド 描画ロジックの翻訳（Semantic to Physical）
**対象ファイル:** `frontend/app/evaluate/page.tsx`
`CandidatePreview` コンポーネント内の Canvas 描画ロジック (`ctx.translate` 等) を改修し、バックエンドから送られてきた意味的次元（`BOVector`）を、実際のレイヤーのアフィン変換に翻訳して描画してください。

**翻訳ルール（計算イメージ）:**
レイヤー名（`layer.name`）を判定して、適用する変数を変えます。
- **全体移動 (全レイヤー共通):** `global_x`, `global_y` を加算する。
- **目線 (Pupilのみ):** レイヤー名に `Pupil` が含まれる場合、さらに `pupil_x` をX座標に加算する。（左右で同方向に移動）
- **つり目度 (Upper_Eyeのみ):** レイヤー名に `Upper_Eye` が含まれる場合、中心点を基準に `upper_eye_rotation` 度を回転に加算する。左目（`L_`）には `+upper_eye_rotation`、右目（`R_`）には `-upper_eye_rotation` を適用。
- **目開き度 (Lower_Eye の Y):** レイヤー名に `Lower_Eye` が含まれる場合、Y座標に `lower_upper_distance_y` を加算する（正で目が開く、負で細くなる）。

## 開発の進め方
まずは Step 1 と Step 2 のバックエンドのスキーマ変更と、`bo.py` における「変数の固定・切り替えロジック（交互最適化）」からコードを生成してください。フロントエンドの描画計算はその後に行います。