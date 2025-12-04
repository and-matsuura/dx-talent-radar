/**
 * 設定ファイル
 * アプリケーション全体で使用する定数や設定値を定義
 */

const CONFIG = {
  // スプレッドシート設定
  // TODO: デプロイ後にスプレッドシートIDを設定してください
  // スプレッドシートのURLから取得: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
  SPREADSHEET_ID: '1vSXSm_fKGDp8oV34XAVEjGZlMFO3udfRZ-sujaaQFeg', 

  // シート名
  SHEET_NAME: 'VTuberリスト',

  // YouTube検索設定
  SEARCH_KEYWORDS: [
    'VTuber 個人勢',
    '新人VTuber'
  ],

  // 検索順序（複数指定可能）
  SEARCH_ORDERS: [
    'relevance',  // 関連度順
    'rating'      // 評価順
  ],

  // チャンネル条件
  MIN_SUBSCRIBER_COUNT: 5000, // 最小登録者数
  MAX_RESULTS: 500, // 最大取得件数
  ACTIVE_DAYS_THRESHOLD: 7, // アクティブ判定: 最終投稿が何日以内か
  UPDATE_INTERVAL_DAYS: 7, // 既存チャンネルの情報更新間隔（日数）

  // 除外する企業・グループ名（部分一致）
  EXCLUDED_KEYWORDS: [
    'ホロライブ',
    'hololive',
    'にじさんじ',
    'nijisanji',
    'ぶいすぽ',
    'VSPO',
    '.LIVE',
    '774inc',
    'Re:AcT',
    'のりプロ',
    'あおぎり高校',
    'RIONECTION'
  ],

  // API設定
  MAX_RESULTS_PER_REQUEST: 50, // YouTube APIの1リクエストあたりの最大取得数
  RECENT_VIDEOS_COUNT: 10, // 平均計算用の直近動画数

  // API クォータ設定
  // YouTube Data API v3のクォータは1日10,000ユニット
  // 検索: 100ユニット/リクエスト
  // チャンネル詳細: 1ユニット/リクエスト
  // 動画一覧: 1ユニット/リクエスト
  // 動画詳細: 1ユニット/リクエスト
  ESTIMATED_QUOTA_PER_CHANNEL: 15, // 1チャンネルあたりの推定クォータ使用量

  // 実行時間制限対策
  MAX_EXECUTION_TIME: 330, // 秒（5分30秒）GASの6分制限に対するバッファ

  // スプレッドシートのヘッダー
  SHEET_HEADERS: [
    'ライブ配信監視',
    '除外フラグ',
    'アイコン',
    'チャンネルID',
    'チャンネル名',
    'チャンネルURL',
    '登録者数',
    '投稿頻度（本/月）',
    '平均再生回数',
    '平均いいね数',
    '平均コメント数',
    '最終投稿日',
    'チャンネル説明文',
    'X（Twitter）リンク',
    '取得日時',
    '最大同時接続数',
    '最大同時接続数日時'
  ],

  // 同時接続数シート設定
  VIEWER_COUNT_SHEET_NAME: '同時接続数',
  VIEWER_COUNT_HEADERS: [
    'チャンネルID',
    'チャンネル名',
    '配信タイトル',
    '配信URL',
    '同時接続数',
    '記録日時',
    '配信ステータス'
  ],

  // ライブ配信監視設定
  MONITOR_INTERVAL_MINUTES: 5, // 監視間隔（分）
  LIVE_STREAM_CHECK_ENABLED: true, // ライブ配信チェック機能の有効/無効

  // 除外キーワードシート設定
  EXCLUDED_KEYWORDS_SHEET_NAME: '除外キーワード',
  EXCLUDED_KEYWORDS_HEADERS: [
    'キーワード',
    '説明'
  ],

  // エラーログシート設定
  ERROR_LOG_SHEET_NAME: 'エラーログ',
  ERROR_LOG_HEADERS: [
    '日時',
    'エラータイプ',
    'エラーメッセージ',
    '関数名',
    'API名',
    'チャンネルID',
    'チャンネル名',
    'パラメータ',
    'スタックトレース'
  ],

  // API使用量ログシート設定
  API_USAGE_LOG_SHEET_NAME: 'API使用量ログ',
  API_USAGE_LOG_HEADERS: [
    '開始日時',
    '終了日時',
    '実行時間（秒）',
    'ステータス',
    '関数名',
    'Search.list呼び出し回数',
    'Search.listクォータ',
    'Channels.list呼び出し回数',
    'Channels.listクォータ',
    'PlaylistItems.list呼び出し回数',
    'PlaylistItems.listクォータ',
    'Videos.list呼び出し回数',
    'Videos.listクォータ',
    '合計API呼び出し回数',
    '合計クォータ使用量',
    'エラーメッセージ'
  ]
};

/**
 * スプレッドシートIDが設定されているかチェック
 */
function validateConfig() {
  if (!CONFIG.SPREADSHEET_ID) {
    Logger.log('警告: SPREADSHEET_IDが設定されていません');
    Logger.log('新しいスプレッドシートが自動作成されます');
    return false;
  }
  return true;
}
