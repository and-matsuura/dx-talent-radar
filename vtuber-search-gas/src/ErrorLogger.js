/**
 * エラーロガークラス
 * API実行時のエラーをログ用シートに記録
 */

class ErrorLogger {
  constructor() {
    this.sheetManager = new SpreadsheetManager();
    this.logSheet = null;
    this.initializeLogSheet();
  }

  /**
   * ログシートを初期化
   */
  initializeLogSheet() {
    try {
      let logSheet = this.sheetManager.spreadsheet.getSheetByName(CONFIG.ERROR_LOG_SHEET_NAME);

      if (!logSheet) {
        logSheet = this.sheetManager.spreadsheet.insertSheet(CONFIG.ERROR_LOG_SHEET_NAME);
        Logger.log(`シート "${CONFIG.ERROR_LOG_SHEET_NAME}" を作成しました`);
      }

      // ヘッダー行が既に存在するかチェック
      const lastRow = logSheet.getLastRow();
      if (lastRow === 0) {
        // ヘッダー行を追加
        logSheet.appendRow(CONFIG.ERROR_LOG_HEADERS);

        // ヘッダー行を太字にし、背景色を設定
        const headerRange = logSheet.getRange(1, 1, 1, CONFIG.ERROR_LOG_HEADERS.length);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#ea4335');
        headerRange.setFontColor('#ffffff');

        // 列幅を自動調整
        for (let i = 1; i <= CONFIG.ERROR_LOG_HEADERS.length; i++) {
          logSheet.autoResizeColumn(i);
        }

        // 最初の行を固定
        logSheet.setFrozenRows(1);

        Logger.log('エラーログシートヘッダーを初期化しました');
      }

      this.logSheet = logSheet;
    } catch (error) {
      Logger.log(`エラーログシート初期化エラー: ${error.message}`);
      // エラーログシートの初期化に失敗しても処理は続行
    }
  }

  /**
   * エラーをログシートに記録
   * @param {Error|string} error エラーオブジェクトまたはエラーメッセージ
   * @param {Object} context エラー発生時のコンテキスト情報
   * @param {string} context.functionName 関数名
   * @param {string} context.apiName API名（例: 'YouTube.Search.list'）
   * @param {Object} context.parameters APIパラメータ（オプション）
   * @param {string} context.channelId チャンネルID（オプション）
   * @param {string} context.channelName チャンネル名（オプション）
   */
  logError(error, context = {}) {
    try {
      if (!this.logSheet) {
        Logger.log('エラーログシートが初期化されていません');
        return;
      }

      // エラータイプを判定
      const errorType = this.determineErrorType(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : '';

      // ログデータを構築
      const logData = [
        Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), // 日時
        errorType, // エラータイプ
        errorMessage, // エラーメッセージ
        context.functionName || '不明', // 関数名
        context.apiName || '不明', // API名
        context.channelId || '', // チャンネルID
        context.channelName || '', // チャンネル名
        JSON.stringify(context.parameters || {}), // パラメータ（JSON形式）
        stackTrace.substring(0, 1000) // スタックトレース（1000文字まで）
      ];

      // ログシートに追加
      this.logSheet.appendRow(logData);

      // 日時列の書式設定
      const lastRow = this.logSheet.getLastRow();
      const dateRange = this.logSheet.getRange(lastRow, 1);
      dateRange.setNumberFormat('yyyy-MM-dd HH:mm:ss');

      // エラータイプに応じて行の背景色を設定
      const rowRange = this.logSheet.getRange(lastRow, 1, 1, CONFIG.ERROR_LOG_HEADERS.length);
      if (errorType === 'クォータエラー') {
        rowRange.setBackground('#fff4e6'); // 薄いオレンジ
      } else if (errorType === 'APIエラー') {
        rowRange.setBackground('#ffe6e6'); // 薄い赤
      } else if (errorType === 'ネットワークエラー') {
        rowRange.setBackground('#e6f3ff'); // 薄い青
      }

      Logger.log(`エラーをログシートに記録しました: ${errorType} - ${errorMessage}`);

    } catch (logError) {
      // ログ記録自体が失敗した場合はLoggerに記録
      Logger.log(`エラーログ記録エラー: ${logError.message}`);
      Logger.log(`元のエラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * エラータイプを判定
   * @param {Error|string} error エラーオブジェクトまたはエラーメッセージ
   * @return {string} エラータイプ
   */
  determineErrorType(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorString = errorMessage.toLowerCase();

    // クォータエラーの判定
    if (errorString.includes('quota') || 
        errorString.includes('quotaexceeded') ||
        errorString.includes('daily limit') ||
        errorString.includes('user rate limit')) {
      return 'クォータエラー';
    }

    // ネットワークエラーの判定
    if (errorString.includes('timeout') ||
        errorString.includes('network') ||
        errorString.includes('connection') ||
        errorString.includes('econnreset') ||
        errorString.includes('enotfound')) {
      return 'ネットワークエラー';
    }

    // APIエラーの判定
    if (errorString.includes('api') ||
        errorString.includes('invalid') ||
        errorString.includes('forbidden') ||
        errorString.includes('unauthorized') ||
        errorString.includes('not found') ||
        errorString.includes('bad request')) {
      return 'APIエラー';
    }

    // その他のエラー
    return 'その他のエラー';
  }

  /**
   * クォータエラーかどうかを判定
   * @param {Error|string} error エラーオブジェクトまたはエラーメッセージ
   * @return {boolean} クォータエラーの場合true
   */
  isQuotaError(error) {
    return this.determineErrorType(error) === 'クォータエラー';
  }
}
