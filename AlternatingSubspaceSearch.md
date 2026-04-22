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

現在の `BOVector` を廃止し、以下 2 つのスキーマを新規作成してください：

#### `BOVectorMacro` - マクロ次元（全体配置・3D）
- `global_x`: float, 範囲 [-2, 2] (% 単位、BO 内部では [-1, 1] に正規化)
- `global_y`: float, 範囲 [-2, 2] (% 単位)
- `global_scale`: float, 範囲 [-6, 6] (% 単位)

#### `BOVectorMicro` - ミクロ次元（表情・3D）
- `upper_eye_rotation`: float, 範囲 [-45, 45] (度数、BO 内部では [-1, 1] に正規化)
- `pupil_x`: float, 範囲 [-2, 2] (% 単位)
- `lower_upper_distance_y`: float, 範囲 [-2, 2] (% 単位)

### Step 2: バックエンド BOの交互最適化ロジック
**対象ファイル:** `backend/app/services/bo.py`, `backend/app/services/store.py`, `backend/app/api/routes/sessions.py`

#### 2.1 セッション状態の分離管理
`store.py` において、セッション内に以下を追加します：
```python
class SessionData:
    observations_macro: list[(BOVectorMacro, reward)]  # Round 1, 3, 5, ... のデータ
    observations_micro: list[(BOVectorMicro, reward)]  # Round 2, 4, 6, ... のデータ
    best_macro: BOVectorMacro | None  # Round 1 選択 → Round 3+ で固定に使用
    best_micro: BOVectorMicro | None  # Round 2 選択 → Round 4+ で固定に使用
```

#### 2.2 交互探索ロジック
`/bo/next` API で `round_index` を受け取ります。

**Round 1（マクロ）:**
- `bo_macro` に `observations_macro` を入力
- `best_micro = (0, 0, 0)` （ゼロ初期化）
- 3D macro パラメータだけを探索

**Round 2（ミクロ）:**
- `bo_micro` に `observations_micro` を入力
- `best_macro` = Round 1 ユーザー選択のマクロベクトル
- 3D micro パラメータだけを探索

**Round 3（マクロ）:**
- `bo_macro` に `observations_macro` を入力（Round 1 のデータ + Round 3 のデータ）
- `best_micro` = Round 2 ユーザー選択のミクロベクトル
- macro を再探索（BO モデルが進化）

**Round 4（ミクロ）以降:**
- 同様に交互継続

#### 2.3 BO 生成時の正規化・デノーマライズ
- **BO 内部:** 入力は [-1, 1] 正規化空間
  - `global_x ∈ [-2, 2]` → 正規化 `x' = global_x / 2`
  - `global_y ∈ [-2, 2]` → 正規化 `y' = global_y / 2`
  - `global_scale ∈ [-6, 6]` → 正規化 `s' = global_scale / 6`
  - `upper_eye_rotation ∈ [-45, 45]` → 正規化 `r' = upper_eye_rotation / 45`
  - `pupil_x ∈ [-2, 2]` → 正規化 `px' = pupil_x / 2`
  - `lower_upper_distance_y ∈ [-2, 2]` → 正規化 `ly' = lower_upper_distance_y / 2`
- **API 返却:** [-1, 1] から元の範囲に逆変換して返す

### Step 3: フロントエンド 描画ロジックの翻訳（Semantic to Physical）
**対象ファイル:** `frontend/app/evaluate/page.tsx`

バックエンドから受け取った `BOVectorMacro` または `BOVectorMicro` を、レイヤーのアフィン変換に翻訳します。

#### 翻訳ルール
レイヤー名（`layer.name`）を判定して、適用する変数を変えます：

1. **全レイヤー共通（マクロ）:**
   ```
   新座標 = 基準座標 + (global_x, global_y)
   新スケール = 基準スケール * (1 + global_scale / 100)
   ```

2. **Upper_Eye（つり目度、符号反転で左右対称）:**
   - `L_Upper_Eye`: 中心点を基準に `+upper_eye_rotation` 度回転
   - `R_Upper_Eye`: 中心点を基準に `-upper_eye_rotation` 度回転

3. **Pupil（目線、左右同方向）:**
   ```
   X座標 += pupil_x
   ```
   左右両眼に同じ値を適用

4. **Lower_Eye（目開き度）:**
   ```
   Y座標 += lower_upper_distance_y
   ```
   正の値で目が開く、負の値で細くなる

## 開発の進め方
1. `backend/app/schemas/session.py`: `BOVectorMacro`, `BOVectorMicro` スキーマ新規作成
2. `backend/app/services/store.py`: `observations_macro/micro`, `best_macro/micro` フィールド追加
3. `backend/app/services/bo.py`: 正規化処理と `generate_candidates_macro()`, `generate_candidates_micro()` メソッド実装
4. `backend/app/api/routes/sessions.py`: `/bo/next` で round_index 判定、macro/micro 切り替え実装
5. `frontend/app/evaluate/page.tsx`: 描画翻訳ロジック実装（layer 名判定 + アフィン変換)

## BO 設計の詳細
- **独立した 2 つの BO モデル:** `bo_macro` (3D) と `bo_micro` (3D) を別々に訓練
- **データ分離:** macro ラウンドと micro ラウンドの観察を分開管理
- **正規化:** BO 内部処理は [-1, 1] 空間で統一し、次元バイアスを排除
- **初期化:** Round 1 で micro = (0, 0, 0)、以降は前ラウンド選択を基準に探索