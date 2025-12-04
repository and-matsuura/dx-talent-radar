/**
 * VTuberチャンネル検索・収集メインスクリプト
 *
 * このスクリプトは、YouTube Data APIを使用してVTuberチャンネルを検索し、
 * 詳細情報をGoogleスプレッドシートに保存します。
 */

/**
 * メインエントリーポイント
 * トリガーから実行される関数
 */
function searchAndSaveVTuberChannels() {
  const startTime = new Date().getTime();
  Logger.log('=== VTuberチャンネル検索開始 ===');

  const errorLogger = new ErrorLogger();
  const quotaTracker = new APIQuotaTracker('searchAndSaveVTuberChannels');

  try {
    // スプレッドシートマネージャーを初期化
    const sheetManager = new SpreadsheetManager();
    sheetManager.initializeSheet();

    // 既存のチャンネル情報を取得（ID、行番号、取得日時）
    const existingChannels = sheetManager.getExistingChannelIds();
    Logger.log(`既存チャンネル数: ${existingChannels.size}`);

    // YouTube検索を実行（SpreadsheetManagerとquotaTrackerを渡す）
    const searcher = new YouTubeSearcher(sheetManager, quotaTracker);
    const result = searcher.searchVTuberChannels(existingChannels);

    Logger.log(`新規チャンネル発見数: ${result.newChannels.length}`);
    Logger.log(`更新対象チャンネル数: ${result.updateChannels.length}`);

    // 新規チャンネル情報をスプレッドシートに追加
    if (result.newChannels.length > 0) {
      sheetManager.appendChannels(result.newChannels);
      Logger.log(`${result.newChannels.length}件のチャンネルをスプレッドシートに追加しました`);
    } else {
      Logger.log('新規チャンネルが見つかりませんでした');
    }

    // 既存チャンネル情報を更新
    if (result.updateChannels.length > 0) {
      sheetManager.updateChannels(result.updateChannels);
      Logger.log(`${result.updateChannels.length}件のチャンネル情報を更新しました`);
    } else {
      Logger.log('更新対象のチャンネルがありませんでした');
    }

    // 実行時間をログ出力
    const endTime = new Date().getTime();
    const executionTime = (endTime - startTime) / 1000;
    Logger.log(`実行時間: ${executionTime}秒`);
    Logger.log('=== VTuberチャンネル検索完了 ===');

    // 実行時間が5分を超えた場合は警告
    if (executionTime > 300) {
      Logger.log('警告: 実行時間が5分を超えています。GASの6分制限に注意してください。');
    }

    // API使用量をログに記録（正常終了）
    quotaTracker.logToSheet('正常終了');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    errorLogger.logError(error, {
      functionName: 'searchAndSaveVTuberChannels',
      apiName: 'メイン処理'
    });
    // API使用量をログに記録（異常終了）
    quotaTracker.logToSheet('異常終了', error.message);
    throw error;
  }
}

/**
 * 手動実行用：スプレッドシートの初期化
 */
function initializeSpreadsheet() {
  Logger.log('スプレッドシートを初期化しています...');
  const sheetManager = new SpreadsheetManager();
  sheetManager.initializeSheet();
  sheetManager.initializeViewerCountSheet();
  sheetManager.initializeExcludedKeywordsSheet();
  Logger.log('スプレッドシートの初期化が完了しました');
}

/**
 * 手動実行用：APIクォータの確認
 */
function checkAPIQuota() {
  Logger.log('YouTube Data APIクォータは直接確認できません');
  Logger.log('Google Cloud Consoleで確認してください:');
  Logger.log('https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas');
}

/**
 * 手動実行用：テスト検索（少量）
 */
function testSearch() {
  Logger.log('=== テスト検索開始 ===');

  const searcher = new YouTubeSearcher();
  const existingChannels = new Map();

  // テストモード: 最大5チャンネルのみ取得
  const originalMaxResults = CONFIG.MAX_RESULTS;
  CONFIG.MAX_RESULTS = 5;

  const result = searcher.searchVTuberChannels(existingChannels);
  const channels = result.newChannels;

  Logger.log(`発見チャンネル数: ${channels.length}`);
  channels.forEach((channel, index) => {
    Logger.log(`\n--- チャンネル ${index + 1} ---`);
    Logger.log(`名前: ${channel.channelName}`);
    Logger.log(`登録者数: ${channel.subscriberCount}`);
    Logger.log(`最終投稿日: ${channel.lastPublishedAt}`);
  });

  // 設定を元に戻す
  CONFIG.MAX_RESULTS = originalMaxResults;

  Logger.log('=== テスト検索完了 ===');
}

/**
 * トリガーの設定を行う関数
 * 初回実行時に手動で実行してください
 */
function setupTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'searchAndSaveVTuberChannels') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 毎時実行のトリガーを設定
  ScriptApp.newTrigger('searchAndSaveVTuberChannels')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('トリガーを設定しました: 毎時実行');
}

/**
 * トリガーの削除を行う関数
 */
function deleteTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'searchAndSaveVTuberChannels') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  Logger.log('トリガーを削除しました');
}

/**
 * ライブ配信監視メイン関数
 * トリガーから定期実行される
 */
function monitorLiveStreams() {
  const startTime = new Date().getTime();
  Logger.log('=== ライブ配信監視実行開始 ===');

  const errorLogger = new ErrorLogger();
  const quotaTracker = new APIQuotaTracker('monitorLiveStreams');

  try {
    const monitor = new LiveStreamMonitor(quotaTracker);
    monitor.monitorLiveStreams();

    const endTime = new Date().getTime();
    const executionTime = (endTime - startTime) / 1000;
    Logger.log(`実行時間: ${executionTime}秒`);
    Logger.log('=== ライブ配信監視実行完了 ===');

    // API使用量をログに記録（正常終了）
    quotaTracker.logToSheet('正常終了');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    errorLogger.logError(error, {
      functionName: 'monitorLiveStreams',
      apiName: 'メイン処理'
    });
    // API使用量をログに記録（異常終了）
    quotaTracker.logToSheet('異常終了', error.message);
    throw error;
  }
}

/**
 * ライブ配信監視トリガーの設定
 */
function setupLiveStreamMonitorTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'monitorLiveStreams') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 5分ごとに実行するトリガーを設定
  ScriptApp.newTrigger('monitorLiveStreams')
    .timeBased()
    .everyMinutes(CONFIG.MONITOR_INTERVAL_MINUTES)
    .create();

  Logger.log(`ライブ配信監視トリガーを設定しました: ${CONFIG.MONITOR_INTERVAL_MINUTES}分ごとに実行`);
}

/**
 * ライブ配信監視トリガーの削除
 */
function deleteLiveStreamMonitorTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'monitorLiveStreams') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  Logger.log('ライブ配信監視トリガーを削除しました');
}

/**
 * 手動実行用：ライブ配信監視のテスト
 */
function testLiveStreamMonitor() {
  Logger.log('=== ライブ配信監視テスト開始 ===');

  const monitor = new LiveStreamMonitor();
  monitor.monitorLiveStreams();

  Logger.log('=== ライブ配信監視テスト完了 ===');
}

/**
 * 手動実行用：除外キーワードシートの初期化
 */
function initializeExcludedKeywordsSheet() {
  Logger.log('除外キーワードシートを初期化しています...');
  const sheetManager = new SpreadsheetManager();
  sheetManager.initializeExcludedKeywordsSheet();
  Logger.log('除外キーワードシートの初期化が完了しました');
}

/**
 * 手動実行用：特定のチャンネルを手動で追加
 * @param {string} channelIdentifier チャンネルID、ハンドル名、またはURL
 * @param {boolean} enableLiveMonitor ライブ配信監視を有効にするか（デフォルト: false）
 */
function addChannelManually(channelIdentifier, enableLiveMonitor = false) {
  Logger.log(`=== チャンネル手動追加開始: ${channelIdentifier} ===`);

  const quotaTracker = new APIQuotaTracker('addChannelManually');
  const errorLogger = new ErrorLogger();

  try {
    // チャンネルIDを取得
    const channelId = getChannelIdFromIdentifier(channelIdentifier);

    if (!channelId) {
      Logger.log('エラー: チャンネルIDを取得できませんでした');
      quotaTracker.logToSheet('異常終了', 'チャンネルIDを取得できませんでした');
      return;
    }

    Logger.log(`チャンネルID: ${channelId}`);

    // スプレッドシートマネージャーを初期化
    const sheetManager = new SpreadsheetManager();

    // 既存のチャンネルかチェック
    const existingChannels = sheetManager.getExistingChannelIds();
    if (existingChannels.has(channelId)) {
      Logger.log('このチャンネルは既に登録されています');
      quotaTracker.logToSheet('正常終了');
      return;
    }

    // チャンネル詳細を取得
    const searcher = new YouTubeSearcher(sheetManager, quotaTracker);
    const channelDetails = searcher.getChannelDetails([channelId]);

    if (channelDetails.length === 0) {
      Logger.log('エラー: チャンネル情報を取得できませんでした');
      quotaTracker.logToSheet('異常終了', 'チャンネル情報を取得できませんでした');
      return;
    }

    const channel = channelDetails[0];

    // ライブ配信監視フラグを設定
    if (enableLiveMonitor) {
      Logger.log('ライブ配信監視を有効にします');
    }

    // チャンネルをスプレッドシートに追加
    sheetManager.appendChannels([channel]);

    // ライブ配信監視フラグを有効にする場合は、追加後に更新
    if (enableLiveMonitor) {
      const addedChannels = sheetManager.getExistingChannelIds();
      if (addedChannels.has(channelId)) {
        const channelInfo = addedChannels.get(channelId);
        sheetManager.sheet.getRange(channelInfo.row, 1).setValue(true); // A列のチェックボックスをON
        Logger.log('ライブ配信監視フラグを有効にしました');
      }
    }

    Logger.log('=== チャンネル手動追加完了 ===');

    // API使用量をログに記録（正常終了）
    quotaTracker.logToSheet('正常終了');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    errorLogger.logError(error, {
      functionName: 'addChannelManually',
      apiName: 'YouTube.Search.list / YouTube.Channels.list',
      parameters: { channelIdentifier: channelIdentifier }
    });
    // API使用量をログに記録（異常終了）
    quotaTracker.logToSheet('異常終了', error.message);
    throw error;
  }
}

/**
 * チャンネル識別子（ID、ハンドル名、URL）からチャンネルIDを取得
 * @param {string} identifier チャンネルID、ハンドル名、またはURL
 * @return {string|null} チャンネルID
 */
function getChannelIdFromIdentifier(identifier) {
  const quotaTracker = new APIQuotaTracker('getChannelIdFromIdentifier');
  
  try {
    // URLの場合はハンドル名またはチャンネルIDを抽出
    let channelIdentifier = identifier;

    if (identifier.includes('youtube.com') || identifier.includes('youtu.be')) {
      // URLからハンドル名またはチャンネルIDを抽出
      if (identifier.includes('/@')) {
        // ハンドル名の場合: https://www.youtube.com/@handle
        channelIdentifier = identifier.match(/@([^\/\?]+)/)[1];
        channelIdentifier = '@' + channelIdentifier;
      } else if (identifier.includes('/channel/')) {
        // チャンネルIDの場合: https://www.youtube.com/channel/UC...
        channelIdentifier = identifier.match(/\/channel\/([^\/\?]+)/)[1];
      }
    }

    Logger.log(`識別子: ${channelIdentifier}`);

    // ハンドル名の場合は検索APIでチャンネルIDを取得
    if (channelIdentifier.startsWith('@')) {
      const handle = channelIdentifier.substring(1); // @ を除去
      Logger.log(`ハンドル名から検索: ${handle}`);

      // YouTube Data API: search.list でハンドル名から検索
      const response = YouTube.Search.list('snippet', {
        q: handle,
        type: 'channel',
        maxResults: 1
      });

      // API使用量を記録
      quotaTracker.recordAPICall('YouTube.Search.list');

      if (response.items && response.items.length > 0) {
        quotaTracker.logToSheet('正常終了');
        return response.items[0].id.channelId;
      }

      Logger.log('ハンドル名からチャンネルが見つかりませんでした');
      quotaTracker.logToSheet('正常終了');
      return null;
    }

    // チャンネルIDの場合はそのまま返す
    if (channelIdentifier.startsWith('UC') && channelIdentifier.length === 24) {
      quotaTracker.logToSheet('正常終了');
      return channelIdentifier;
    }

    Logger.log('有効なチャンネルIDまたはハンドル名ではありません');
    quotaTracker.logToSheet('正常終了');
    return null;

  } catch (error) {
    Logger.log(`チャンネルID取得エラー: ${error.message}`);
    const errorLogger = new ErrorLogger();
    errorLogger.logError(error, {
      functionName: 'getChannelIdFromIdentifier',
      apiName: 'YouTube.Search.list',
      parameters: { identifier: identifier }
    });
    quotaTracker.logToSheet('異常終了', error.message);
    return null;
  }
}

/**
 * 手動実行用：スターバックスボサコーヒーチャンネルを追加（ライブ配信サンプル用）
 */
function addStarbucksBossaCoffeeChannel() {
  addChannelManually('https://www.youtube.com/@starbucksbossacoffee6122', true);
}

/**
 * 手動実行用：既存データに除外フラグ列を追加（移行用）
 * 既存のスプレッドシートにB列として除外フラグ列を挿入します
 */
function migrateToExcludeFlagColumn() {
  Logger.log('=== 除外フラグ列への移行開始 ===');

  try {
    const sheetManager = new SpreadsheetManager();
    const sheet = sheetManager.sheet;

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('データがありません。移行は不要です。');
      return;
    }

    // 現在のヘッダーを確認
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 既に除外フラグ列があるかチェック
    if (currentHeaders.length >= 2 && currentHeaders[1] === '除外フラグ') {
      Logger.log('除外フラグ列は既に存在します。移行は不要です。');
      return;
    }

    Logger.log('除外フラグ列をB列に挿入します...');

    // B列に新しい列を挿入
    sheet.insertColumnBefore(2);
    
    // ヘッダー行に「除外フラグ」を設定
    sheet.getRange(1, 2).setValue('除外フラグ');
    sheet.getRange(1, 2).setFontWeight('bold');
    sheet.getRange(1, 2).setBackground('#4285f4');
    sheet.getRange(1, 2).setFontColor('#ffffff');

    // データ行にfalse（チェックボックス）を設定
    if (lastRow > 1) {
      const excludeRange = sheet.getRange(2, 2, lastRow - 1, 1);
      excludeRange.insertCheckboxes();
      excludeRange.setValue(false);
    }

    Logger.log('除外フラグ列の追加が完了しました');
    Logger.log('行の表示/非表示を更新します...');

    // 行の表示/非表示を更新
    sheetManager.updateRowVisibility();

    Logger.log('=== 除外フラグ列への移行完了 ===');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    const errorLogger = new ErrorLogger();
    errorLogger.logError(error, {
      functionName: 'migrateToExcludeFlagColumn',
      apiName: 'スプレッドシート操作'
    });
    throw error;
  }
}
