/**
 * VTuberチャンネル検索・収集メインスクリプト
 *
 * このスクリプトは、YouTube Data APIを使用してVTuberチャンネルを検索し、
 * 詳細情報をGoogleスプレッドシートに保存します。
 */

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 * Container-boundスクリプト（スプレッドシートに紐づいたスクリプト）の場合に自動実行される
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VTuber Radar')
    .addItem('チャンネルをURLで追加', 'showAddChannelDialog')
    .addSeparator()
    .addItem('スプレッドシートを初期化', 'initializeSpreadsheet')
    .addItem('除外キーワードシートを初期化', 'initializeExcludedKeywordsSheet')
    .addItem('属性管理シートを初期化', 'initializeAttributeSheet')
    .addSeparator()
    .addItem('APIクォータを確認', 'checkAPIQuota')
    .addToUi();
}

/**
 * チャンネル追加ダイアログを表示
 */
function showAddChannelDialog() {
  const ui = SpreadsheetApp.getUi();
  
  // URL入力ダイアログを表示
  const response = ui.prompt(
    'チャンネルURLを追加',
    'YouTubeチャンネルのURL、チャンネルID、またはハンドル名を入力してください：\n\n' +
    '例:\n' +
    '• https://www.youtube.com/@channelname\n' +
    '• https://www.youtube.com/channel/UCxxxxxxxxxxxxx\n' +
    '• @channelname\n' +
    '• UCxxxxxxxxxxxxx',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const channelIdentifier = response.getResponseText().trim();
    
    if (!channelIdentifier) {
      ui.alert('エラー', 'URLまたはチャンネルIDを入力してください。', ui.ButtonSet.OK);
      return;
    }
    
    // ライブ配信監視を有効にするか確認
    const monitorResponse = ui.alert(
      'ライブ配信監視',
      'ライブ配信監視を有効にしますか？',
      ui.ButtonSet.YES_NO
    );
    
    const enableLiveMonitor = monitorResponse === ui.Button.YES;
    
    // チャンネル追加処理を実行
    try {
      addChannelFromMenu(channelIdentifier, enableLiveMonitor);
      
      // 成功メッセージ
      ui.alert(
        '成功',
        'チャンネルを追加しました。\n\nスプレッドシートを更新して確認してください。',
        ui.ButtonSet.OK
      );
    } catch (error) {
      // エラーメッセージ
      const errorLogger = new ErrorLogger();
      let errorMessage = error.message;
      
      // クォータエラーの場合は特別なメッセージを表示
      if (errorLogger.isQuotaError(error)) {
        errorMessage = 'YouTube Data APIのクォータを超過しました。\n\n' +
          'クォータは1日10,000ユニットです。\n' +
          '翌日まで待つか、Google Cloud Consoleでクォータを確認してください。\n\n' +
          'https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas';
      }
      
      ui.alert(
        'エラー',
        'チャンネルの追加に失敗しました。\n\n' + errorMessage + '\n\nログを確認してください。',
        ui.ButtonSet.OK
      );
    }
  }
}

/**
 * メニューから呼び出されるチャンネル追加関数
 * @param {string} channelIdentifier チャンネルID、ハンドル名、またはURL
 * @param {boolean} enableLiveMonitor ライブ配信監視を有効にするか
 */
function addChannelFromMenu(channelIdentifier, enableLiveMonitor = false) {
  Logger.log(`=== メニューからチャンネル追加開始: ${channelIdentifier} ===`);

  const quotaTracker = new APIQuotaTracker('addChannelFromMenu');
  const errorLogger = new ErrorLogger();

  try {
    // チャンネルIDを取得
    let channelId;
    try {
      channelId = getChannelIdFromIdentifier(channelIdentifier);
    } catch (error) {
      // クォータエラーの場合は処理を中断
      if (errorLogger.isQuotaError(error)) {
        Logger.log('クォータエラーが発生しました。処理を中断します。');
        quotaTracker.logToSheet('異常終了', error.message);
        throw error; // クォータエラーを再throwして処理を中断
      }
      // その他のエラー
      const errorMsg = 'チャンネルIDを取得できませんでした。URLまたはチャンネルIDが正しいか確認してください。';
      Logger.log(`エラー: ${errorMsg}`);
      quotaTracker.logToSheet('異常終了', errorMsg);
      throw new Error(errorMsg);
    }

    if (!channelId) {
      const errorMsg = 'チャンネルIDを取得できませんでした。URLまたはチャンネルIDが正しいか確認してください。';
      Logger.log(`エラー: ${errorMsg}`);
      quotaTracker.logToSheet('異常終了', errorMsg);
      throw new Error(errorMsg);
    }

    Logger.log(`チャンネルID: ${channelId}`);

    // スプレッドシートマネージャーを初期化
    const sheetManager = new SpreadsheetManager();
    sheetManager.initializeSheet();

    // 既存のチャンネルかチェック
    const existingChannels = sheetManager.getExistingChannelIds();
    if (existingChannels.has(channelId)) {
      const info = existingChannels.get(channelId);
      Logger.log(`このチャンネルは既に登録されています（行番号: ${info.row}）`);
      
      // ライブ配信監視フラグを更新するか確認
      if (enableLiveMonitor) {
        sheetManager.sheet.getRange(info.row, 1).setValue(true); // A列のチェックボックスをON
        Logger.log('ライブ配信監視フラグを有効にしました');
      }
      
      quotaTracker.logToSheet('正常終了');
      return;
    }

    // チャンネル詳細を取得
    const searcher = new YouTubeSearcher(sheetManager, quotaTracker);
    const channelDetails = searcher.getChannelDetails([channelId]);

    if (channelDetails.length === 0) {
      const errorMsg = 'チャンネル情報を取得できませんでした。チャンネルが存在するか、または条件を満たしているか確認してください。';
      Logger.log(`エラー: ${errorMsg}`);
      quotaTracker.logToSheet('異常終了', errorMsg);
      throw new Error(errorMsg);
    }

    const channel = channelDetails[0];

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

    Logger.log(`=== チャンネル追加完了: ${channel.channelName} ===`);

    // API使用量をログに記録（正常終了）
    quotaTracker.logToSheet('正常終了');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    
    // クォータエラーの場合は処理を中断
    if (errorLogger.isQuotaError(error)) {
      Logger.log('クォータエラーが発生しました。処理を中断します。');
      errorLogger.logError(error, {
        functionName: 'addChannelFromMenu',
        apiName: 'YouTube.Search.list / YouTube.Channels.list',
        parameters: { channelIdentifier: channelIdentifier }
      });
      quotaTracker.logToSheet('異常終了', error.message);
      // クォータエラーを再throwして処理を中断
      throw error;
    }
    
    // その他のエラー
    errorLogger.logError(error, {
      functionName: 'addChannelFromMenu',
      apiName: 'YouTube.Search.list / YouTube.Channels.list',
      parameters: { channelIdentifier: channelIdentifier }
    });
    // API使用量をログに記録（異常終了）
    quotaTracker.logToSheet('異常終了', error.message);
    throw error;
  }
}

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
  sheetManager.initializeAttributeSheet();
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
 * @throws {Error} クォータエラーの場合、エラーをthrow
 */
function getChannelIdFromIdentifier(identifier) {
  const quotaTracker = new APIQuotaTracker('getChannelIdFromIdentifier');
  const errorLogger = new ErrorLogger();
  
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

      try {
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
      } catch (apiError) {
        // クォータエラーの場合は処理を中断
        if (errorLogger.isQuotaError(apiError)) {
          Logger.log('クォータエラーが発生しました。処理を中断します。');
          errorLogger.logError(apiError, {
            functionName: 'getChannelIdFromIdentifier',
            apiName: 'YouTube.Search.list',
            parameters: { identifier: identifier }
          });
          quotaTracker.logToSheet('異常終了', apiError.message);
          // クォータエラーを再throwして処理を中断
          throw new Error('YouTube Data APIのクォータを超過しました。翌日まで待つか、Google Cloud Consoleでクォータを確認してください。');
        }
        // その他のエラーは再throw
        throw apiError;
      }
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
    // クォータエラーの場合は再throwして処理を中断
    if (errorLogger.isQuotaError(error)) {
      Logger.log(`クォータエラー: ${error.message}`);
      errorLogger.logError(error, {
        functionName: 'getChannelIdFromIdentifier',
        apiName: 'YouTube.Search.list',
        parameters: { identifier: identifier }
      });
      quotaTracker.logToSheet('異常終了', error.message);
      throw error;
    }
    
    // その他のエラー
    Logger.log(`チャンネルID取得エラー: ${error.message}`);
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

/**
 * テキストからURLを削除するヘルパー関数
 * @param {string} text 元のテキスト
 * @return {string} URLを削除したテキスト
 */
function removeUrls(text) {
  if (!text) return '';
  
  // URLパターンを検出して削除
  // http://, https://, www. で始まるURL
  // メールアドレスも除外
  const urlPatterns = [
    /https?:\/\/[^\s]+/gi,  // http:// または https:// で始まるURL
    /www\.[^\s]+/gi,        // www. で始まるURL
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi  // メールアドレス
  ];
  
  let cleanedText = text;
  urlPatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, ' ');
  });
  
  // 連続する空白を1つに統一
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
  
  return cleanedText;
}

/**
 * 属性チェック処理のバッチ関数
 * 説明文内のキーワードを元に、VTuberに対して属性ラベルを振る
 * 1日1回実行する想定
 * URLは比較対象から除外される
 */
function checkAndAssignAttributes() {
  const startTime = new Date().getTime();
  Logger.log('=== 属性チェック処理開始 ===');

  const errorLogger = new ErrorLogger();

  try {
    const sheetManager = new SpreadsheetManager();
    const sheet = sheetManager.sheet;

    // 属性設定を取得
    const attributeSettings = sheetManager.getAttributeSettings();
    if (attributeSettings.length === 0) {
      Logger.log('属性設定がありません。処理をスキップします。');
      return;
    }

    Logger.log(`属性設定数: ${attributeSettings.length}`);

    // VTuberリストシートから全データを取得
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('データがありません。処理をスキップします。');
      return;
    }

    const data = sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length).getValues();
    Logger.log(`処理対象チャンネル数: ${data.length}`);

    let updatedCount = 0;

    // 各行を処理
    data.forEach((row, index) => {
      const actualRow = index + 2; // 実際の行番号（ヘッダー分+1、0-indexed分+1）
      const excludeFlag = row[1]; // B列（除外フラグ）
      const channelName = row[4]; // E列（チャンネル名）
      const description = row[13]; // N列（チャンネル説明文）
      const currentAttributes = row[7] || ''; // H列（属性）

      // 除外フラグがtrueの行はスキップ
      if (excludeFlag === true) {
        return;
      }

      // 説明文からURLを除外して検索対象テキストを作成
      const descriptionWithoutUrl = removeUrls(description || '');
      const searchText = ((channelName || '') + ' ' + descriptionWithoutUrl).toLowerCase();

      // 既存の属性を配列に変換（カンマ区切り）
      const existingAttributes = currentAttributes
        ? currentAttributes.split(',').map(attr => attr.trim()).filter(attr => attr !== '')
        : [];

      // 新しい属性を追加
      const newAttributes = [...existingAttributes];

      // 各属性設定をチェック
      attributeSettings.forEach(setting => {
        const filterText = setting.filterText.toLowerCase();
        const attributeValue = setting.attribute || setting.attributeName || filterText;

        // フィルタ文言が説明文またはチャンネル名に含まれているかチェック
        if (searchText.includes(filterText)) {
          // 既に同じ属性が設定されていないかチェック
          if (!existingAttributes.includes(attributeValue)) {
            newAttributes.push(attributeValue);
            Logger.log(`チャンネル "${channelName}" に属性 "${attributeValue}" を追加（フィルタ: "${setting.filterText}"）`);
          }
        }
      });

      // 属性が変更された場合のみ更新
      if (newAttributes.length !== existingAttributes.length) {
        const attributesString = newAttributes.join(', ');
        sheet.getRange(actualRow, 8).setValue(attributesString); // H列に属性を設定
        updatedCount++;
      }
    });

    const endTime = new Date().getTime();
    const executionTime = (endTime - startTime) / 1000;
    Logger.log(`更新されたチャンネル数: ${updatedCount}`);
    Logger.log(`実行時間: ${executionTime}秒`);
    Logger.log('=== 属性チェック処理完了 ===');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    errorLogger.logError(error, {
      functionName: 'checkAndAssignAttributes',
      apiName: '属性チェック処理'
    });
    throw error;
  }
}

/**
 * 手動実行用：属性管理シートの初期化
 */
function initializeAttributeSheet() {
  Logger.log('属性管理シートを初期化しています...');
  const sheetManager = new SpreadsheetManager();
  sheetManager.initializeAttributeSheet();
  Logger.log('属性管理シートの初期化が完了しました');
}

/**
 * 手動実行用：既存データに属性カラムを追加（移行用）
 * 既存のスプレッドシートにH列として属性カラムを挿入します
 */
function migrateToAttributeColumn() {
  Logger.log('=== 属性カラムへの移行開始 ===');

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
    
    // 既に属性カラムがあるかチェック（H列 = 8列目）
    if (currentHeaders.length >= 8 && currentHeaders[7] === '属性') {
      Logger.log('属性カラムは既に存在します。移行は不要です。');
      return;
    }

    Logger.log('属性カラムをH列に挿入します...');

    // H列に新しい列を挿入
    sheet.insertColumnBefore(8);
    
    // ヘッダー行に「属性」を設定
    sheet.getRange(1, 8).setValue('属性');
    sheet.getRange(1, 8).setFontWeight('bold');
    sheet.getRange(1, 8).setBackground('#4285f4');
    sheet.getRange(1, 8).setFontColor('#ffffff');

    // データ行に空文字を設定
    if (lastRow > 1) {
      const attributeRange = sheet.getRange(2, 8, lastRow - 1, 1);
      attributeRange.setValue('');
    }

    Logger.log('属性カラムの追加が完了しました');
    Logger.log('=== 属性カラムへの移行完了 ===');

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);
    const errorLogger = new ErrorLogger();
    errorLogger.logError(error, {
      functionName: 'migrateToAttributeColumn',
      apiName: 'スプレッドシート操作'
    });
    throw error;
  }
}

/**
 * 属性チェック処理トリガーの設定
 * 1日1回実行するトリガーを設定
 */
function setupAttributeCheckTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkAndAssignAttributes') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 毎日1回実行するトリガーを設定（午前3時）
  ScriptApp.newTrigger('checkAndAssignAttributes')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  Logger.log('属性チェック処理トリガーを設定しました: 毎日午前3時実行');
}

/**
 * 属性チェック処理トリガーの削除
 */
function deleteAttributeCheckTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkAndAssignAttributes') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  Logger.log('属性チェック処理トリガーを削除しました');
}
