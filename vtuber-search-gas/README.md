# VTuber Radar - VTuberチャンネル検索・分析ツール

YouTubeからVTuberチャンネルを自動検索し、詳細情報をGoogleスプレッドシートに保存するGoogle Apps Script（GAS）ツールです。
Playboard.co風のモダンなダークテーマUIでWebアプリとしてデータを閲覧できます。

## ✨ 新機能: Webアプリダッシュボード

![VTuber Radar](https://via.placeholder.com/800x400?text=VTuber+Radar+Dashboard)

スプレッドシートに保存されたVTuberデータを、美しいWebインターフェースで閲覧できます。

### Webアプリの特徴

- 🌙 **ダークテーマUI** - Playboard.co風のモダンなデザイン
- 📊 **統計ダッシュボード** - 総チャンネル数、総登録者数などを一覧表示
- 🔍 **検索・フィルタ機能** - チャンネル名や説明文で検索
- 📈 **ソート機能** - 登録者数、平均再生数、最大同接数などでソート
- 🔴 **ライブ配信表示** - 最近のライブ配信情報を表示
- 📱 **レスポンシブデザイン** - スマートフォンでも快適に閲覧

## 機能一覧

### データ収集機能
- YouTube Data APIを使用したVTuberチャンネルの自動検索
- 登録者数、投稿頻度、平均再生回数などの詳細情報を自動取得
- Googleスプレッドシートへの自動保存
- 重複チェック機能
- 毎時自動実行（トリガー設定）

### ライブ配信監視機能
- ライブ配信の同時接続数監視
- 同時接続数の自動記録と最大値の追跡

### Webアプリ機能
- VTuberチャンネルのランキング表示
- 統計情報のダッシュボード
- リアルタイム検索・フィルタリング
- ページネーション対応

## 検索条件

- **検索キーワード**: 「VTuber 個人勢」「新人VTuber」
- **登録者数**: 5,000人以上
- **最大取得件数**: 500チャンネル
- **アクティブ判定**: 最終投稿が7日以内
- **除外条件**: 「除外キーワード」シートで管理（デフォルト: ホロライブ、にじさんじ、ぶいすぽなど）

## プロジェクト構成

```
vtuber-search-gas/
├── src/
│   ├── Code.js                    # メインエントリーポイント
│   ├── Config.js                  # 設定ファイル
│   ├── YouTubeSearch.js           # YouTube検索ロジック
│   ├── SpreadsheetManager.js      # スプレッドシート連携
│   ├── LiveStreamMonitor.js       # ライブ配信監視ロジック
│   ├── WebApp.js                  # Webアプリエントリーポイント
│   ├── Index.html                 # WebアプリUI
│   └── appsscript.json            # GASマニフェストファイル
├── scripts/
│   └── deploy.js                  # デプロイスクリプト
├── .clasp.json                    # clasp設定ファイル
├── .claspignore                   # claspで無視するファイル
├── .gitignore                     # Gitで無視するファイル
├── package.json                   # npm設定ファイル
└── README.md                      # このファイル
```

## 環境構築手順

### 1. 前提条件

- Node.js（v14以上）がインストールされていること
- Googleアカウントを持っていること
- Google Cloud Platformでプロジェクトを作成できること

### 2. claspのインストール

```bash
npm install -g @google/clasp
```

または、プロジェクトディレクトリで：

```bash
cd vtuber-search-gas
npm install
```

### 3. Googleアカウントでログイン

```bash
npm run login
```

ブラウザが開くので、Googleアカウントでログインし、claspへのアクセスを許可します。

### 4. GASプロジェクトを作成（新規の場合）

```bash
npm run create
```

成功すると、`.clasp.json`にスクリプトIDが自動設定されます。

### 5. YouTube Data APIを有効化

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. 左メニューから「APIとサービス」→「ライブラリ」を選択
4. 「YouTube Data API v3」を検索して選択
5. 「有効にする」をクリック

### 6. GASプロジェクトとGoogle Cloud Platformプロジェクトを紐付け

1. 以下のコマンドでGASエディタを開く：
   ```bash
   npm run open
   ```

2. GASエディタで「プロジェクトの設定」（歯車アイコン）をクリック

3. 「Google Cloud Platform（GCP）プロジェクト」セクションで「プロジェクトを変更」をクリック

4. 先ほど作成したGCPプロジェクトの「プロジェクト番号」を入力して「プロジェクトを設定」をクリック

## デプロイ手順

### コードのプッシュとデプロイ

```bash
# コードをGASにプッシュ＆デプロイ
npm run deploy
```

初回デプロイ時は新しいデプロイメントが作成され、`deploy.config.json`にデプロイメントIDが保存されます。
**2回目以降のデプロイでは同じURLが維持されます。**

### デプロイコマンド一覧

```bash
# コードをプッシュのみ
npm run push

# 新規デプロイメントを作成
npm run deploy:new

# 既存のデプロイメントを更新（URLを維持）
npm run deploy

# デプロイメント一覧を確認
npm run deployments

# Webアプリをブラウザで開く
npm run webapp:open
```

### Webアプリへのアクセス

デプロイ後、以下のURLでWebアプリにアクセスできます：

```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

デプロイメントIDは `npm run deployments` で確認できます。

## 使用方法

### Webアプリの使い方

1. WebアプリのURLにアクセス
2. ダッシュボードで統計情報を確認
3. タブでソート順を切り替え（登録者数、平均再生、最大同接、投稿頻度）
4. 検索ボックスでチャンネルを検索
5. チャンネルカードをクリックでYouTubeチャンネルを開く

### 初回セットアップ

1. GASエディタを開く：
   ```bash
   npm run open
   ```

2. メニューから「Code.gs」の`initializeSpreadsheet`関数を選択して実行

3. 初回実行時は認証が必要です：
   - 「承認が必要です」ダイアログで「権限を確認」をクリック
   - Googleアカウントを選択
   - 「詳細」→「{プロジェクト名}（安全ではないページ）に移動」をクリック
   - 「許可」をクリック

### トリガーの設定（毎時自動実行）

GASエディタで`setupTrigger`関数を実行

### ライブ配信監視の設定

1. VTuberリストシートで、監視したいチャンネルの「ライブ配信監視」列にチェックを入れる
2. GASエディタで`setupLiveStreamMonitorTrigger`関数を実行

### 除外キーワードの設定

「除外キーワード」シートでキーワードを追加・削除・編集できます。

## 設定のカスタマイズ

`src/Config.js`で以下の設定を変更できます：

```javascript
const CONFIG = {
  // スプレッドシートID（空の場合は自動作成）
  SPREADSHEET_ID: '',

  // 検索キーワード
  SEARCH_KEYWORDS: [
    'VTuber 個人勢',
    '新人VTuber'
  ],

  // 最小登録者数
  MIN_SUBSCRIBER_COUNT: 5000,

  // 最大取得件数
  MAX_RESULTS: 500,

  // アクティブ判定（日数）
  ACTIVE_DAYS_THRESHOLD: 7,

  // ライブ配信監視設定
  MONITOR_INTERVAL_MINUTES: 5,
  LIVE_STREAM_CHECK_ENABLED: true
};
```

設定を変更したら、`npm run deploy`で再デプロイしてください。

## APIクォータについて

YouTube Data API v3のクォータは**1日10,000ユニット**です。

### クォータ消費の目安

- 検索リクエスト: 100ユニット/回
- チャンネル詳細取得: 1ユニット/チャンネル
- 動画一覧取得: 1ユニット/チャンネル
- 動画詳細取得: 1ユニット/リクエスト

### クォータの確認方法

[Google Cloud Console](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas)でクォータ使用状況を確認できます。

## 開発コマンド一覧

```bash
# ログイン
npm run login

# GASプロジェクトを作成
npm run create

# コードをプッシュ
npm run push

# コードをプル
npm run pull

# デプロイ（URL維持）
npm run deploy

# 新規デプロイ
npm run deploy:new

# デプロイメント一覧
npm run deployments

# GASエディタを開く
npm run open

# Webアプリを開く
npm run webapp:open

# ログを表示
npm run logs
```

## トラブルシューティング

### エラー: "YouTube is not defined"

**原因**: YouTube Data API高度なサービスが有効化されていません。

**解決方法**:
1. GASエディタで左メニューの「サービス」をクリック
2. 「YouTube Data API」を追加

### エラー: "API クォータを超えました"

**原因**: YouTube Data APIの1日のクォータ（10,000ユニット）を超えました。

**解決方法**:
- 翌日まで待つ
- `CONFIG.MAX_RESULTS`を減らす
- 検索頻度を減らす

### Webアプリにアクセスできない

**原因**: デプロイメントが正しく行われていない可能性があります。

**解決方法**:
1. `npm run deployments`でデプロイメントIDを確認
2. `npm run deploy`で再デプロイ
3. GASエディタで「デプロイ」→「デプロイを管理」から確認

### WebアプリのURLが変わってしまう

**原因**: `deploy.config.json`がない状態で`npm run deploy`を実行した可能性があります。

**解決方法**:
1. `npm run deployments`で使用したいデプロイメントIDを確認
2. `deploy.config.json`を手動で作成：
   ```json
   {
     "deploymentId": "YOUR_DEPLOYMENT_ID"
   }
   ```
3. 以降は`npm run deploy`でURLが維持されます

## ライセンス

MIT License

## 注意事項

- YouTube Data APIの利用規約を遵守してください
- クォータ制限に注意してください
- スクレイピングではなく、公式APIを使用しています
- 個人利用・研究目的での使用を想定しています
