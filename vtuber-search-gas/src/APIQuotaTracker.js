/**
 * API使用量追跡クラス
 * YouTube Data APIのクォータ消費量を追跡し、ログシートに記録
 */

class APIQuotaTracker {
  constructor(functionName) {
    this.functionName = functionName;
    this.startTime = new Date();
    this.quotaUsage = {
      'YouTube.Search.list': { count: 0, units: 0 }, // 100ユニット/リクエスト
      'YouTube.Channels.list': { count: 0, units: 0 }, // 1ユニット/リクエスト
      'YouTube.PlaylistItems.list': { count: 0, units: 0 }, // 1ユニット/リクエスト
      'YouTube.Videos.list': { count: 0, units: 0 } // 1ユニット/リクエスト
    };
    this.sheetManager = new SpreadsheetManager();
    this.logSheet = null;
    this.initializeLogSheet();
  }

  /**
   * API使用量ログシートを初期化
   */
  initializeLogSheet() {
    try {
      let logSheet = this.sheetManager.spreadsheet.getSheetByName(CONFIG.API_USAGE_LOG_SHEET_NAME);

      if (!logSheet) {
        logSheet = this.sheetManager.spreadsheet.insertSheet(CONFIG.API_USAGE_LOG_SHEET_NAME);
        Logger.log(`シート "${CONFIG.API_USAGE_LOG_SHEET_NAME}" を作成しました`);
      }

      // ヘッダー行が既に存在するかチェック
      const lastRow = logSheet.getLastRow();
      if (lastRow === 0) {
        // ヘッダー行を追加
        logSheet.appendRow(CONFIG.API_USAGE_LOG_HEADERS);

        // ヘッダー行を太字にし、背景色を設定
        const headerRange = logSheet.getRange(1, 1, 1, CONFIG.API_USAGE_LOG_HEADERS.length);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#4285f4');
        headerRange.setFontColor('#ffffff');

        // 列幅を自動調整
        for (let i = 1; i <= CONFIG.API_USAGE_LOG_HEADERS.length; i++) {
          logSheet.autoResizeColumn(i);
        }

        // 最初の行を固定
        logSheet.setFrozenRows(1);

        Logger.log('API使用量ログシートヘッダーを初期化しました');
      }

      this.logSheet = logSheet;
    } catch (error) {
      Logger.log(`API使用量ログシート初期化エラー: ${error.message}`);
      // エラーログシートの初期化に失敗しても処理は続行
    }
  }

  /**
   * API呼び出しを記録
   * @param {string} apiName API名（例: 'YouTube.Search.list'）
   * @param {number} units 消費クォータユニット数（デフォルト: API名から自動判定）
   */
  recordAPICall(apiName, units = null) {
    if (!this.quotaUsage[apiName]) {
      // 未知のAPIの場合は1ユニットとして記録
      this.quotaUsage[apiName] = { count: 0, units: 0 };
    }

    // ユニット数が指定されていない場合は自動判定
    if (units === null) {
      units = this.getQuotaUnits(apiName);
    }

    this.quotaUsage[apiName].count++;
    this.quotaUsage[apiName].units += units;
  }

  /**
   * API名からクォータユニット数を取得
   * @param {string} apiName API名
   * @return {number} クォータユニット数
   */
  getQuotaUnits(apiName) {
    const quotaMap = {
      'YouTube.Search.list': 100,
      'YouTube.Channels.list': 1,
      'YouTube.PlaylistItems.list': 1,
      'YouTube.Videos.list': 1
    };
    return quotaMap[apiName] || 1;
  }

  /**
   * 合計クォータ使用量を取得
   * @return {number} 合計クォータユニット数
   */
  getTotalQuota() {
    let total = 0;
    for (const apiName in this.quotaUsage) {
      total += this.quotaUsage[apiName].units;
    }
    return total;
  }

  /**
   * 合計API呼び出し回数を取得
   * @return {number} 合計API呼び出し回数
   */
  getTotalAPICalls() {
    let total = 0;
    for (const apiName in this.quotaUsage) {
      total += this.quotaUsage[apiName].count;
    }
    return total;
  }

  /**
   * 使用量の詳細を取得
   * @return {Object} API使用量の詳細
   */
  getUsageDetails() {
    return {
      functionName: this.functionName,
      startTime: this.startTime,
      endTime: new Date(),
      duration: (new Date() - this.startTime) / 1000, // 秒
      quotaUsage: this.quotaUsage,
      totalQuota: this.getTotalQuota(),
      totalAPICalls: this.getTotalAPICalls()
    };
  }

  /**
   * ログシートに記録
   * @param {string} status 処理ステータス（'正常終了' または '異常終了'）
   * @param {string} errorMessage エラーメッセージ（異常終了の場合）
   */
  logToSheet(status = '正常終了', errorMessage = '') {
    try {
      if (!this.logSheet) {
        Logger.log('API使用量ログシートが初期化されていません');
        return;
      }

      const usageDetails = this.getUsageDetails();
      const endTime = new Date();

      // ログデータを構築
      const logData = [
        Utilities.formatDate(usageDetails.startTime, 'JST', 'yyyy-MM-dd HH:mm:ss'), // 開始日時
        Utilities.formatDate(endTime, 'JST', 'yyyy-MM-dd HH:mm:ss'), // 終了日時
        Math.round(usageDetails.duration), // 実行時間（秒）
        status, // ステータス
        this.functionName, // 関数名
        usageDetails.quotaUsage['YouTube.Search.list'].count || 0, // Search.list呼び出し回数
        usageDetails.quotaUsage['YouTube.Search.list'].units || 0, // Search.listクォータ
        usageDetails.quotaUsage['YouTube.Channels.list'].count || 0, // Channels.list呼び出し回数
        usageDetails.quotaUsage['YouTube.Channels.list'].units || 0, // Channels.listクォータ
        usageDetails.quotaUsage['YouTube.PlaylistItems.list'].count || 0, // PlaylistItems.list呼び出し回数
        usageDetails.quotaUsage['YouTube.PlaylistItems.list'].units || 0, // PlaylistItems.listクォータ
        usageDetails.quotaUsage['YouTube.Videos.list'].count || 0, // Videos.list呼び出し回数
        usageDetails.quotaUsage['YouTube.Videos.list'].units || 0, // Videos.listクォータ
        usageDetails.totalAPICalls, // 合計API呼び出し回数
        usageDetails.totalQuota, // 合計クォータ使用量
        errorMessage.substring(0, 500) // エラーメッセージ（500文字まで）
      ];

      // ログシートに追加
      this.logSheet.appendRow(logData);

      // 日時列の書式設定
      const lastRow = this.logSheet.getLastRow();
      const startDateRange = this.logSheet.getRange(lastRow, 1);
      const endDateRange = this.logSheet.getRange(lastRow, 2);
      startDateRange.setNumberFormat('yyyy-MM-dd HH:mm:ss');
      endDateRange.setNumberFormat('yyyy-MM-dd HH:mm:ss');

      // 数値列の書式設定
      const numberColumns = [3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; // 実行時間、各API呼び出し回数・クォータ、合計
      numberColumns.forEach(col => {
        const range = this.logSheet.getRange(lastRow, col);
        range.setNumberFormat('#,##0');
      });

      // ステータスに応じて行の背景色を設定
      const rowRange = this.logSheet.getRange(lastRow, 1, 1, CONFIG.API_USAGE_LOG_HEADERS.length);
      if (status === '異常終了') {
        rowRange.setBackground('#ffe6e6'); // 薄い赤
      } else {
        rowRange.setBackground('#e6ffe6'); // 薄い緑
      }

      Logger.log(`API使用量をログシートに記録しました: ${usageDetails.totalQuota}ユニット (${usageDetails.totalAPICalls}回のAPI呼び出し)`);

    } catch (logError) {
      // ログ記録自体が失敗した場合はLoggerに記録
      Logger.log(`API使用量ログ記録エラー: ${logError.message}`);
      Logger.log(`合計クォータ使用量: ${this.getTotalQuota()}ユニット`);
    }
  }
}
