/**
 * WebApp.js
 * GAS WebアプリのエントリーポイントとAPIエンドポイント
 */

/**
 * Webアプリのメインエントリーポイント
 * @param {Object} e イベントオブジェクト
 * @return {HtmlOutput} HTMLページ
 */
function doGet(e) {
  const page = e.parameter.page || 'index';
  
  // APIリクエストの場合
  if (e.parameter.action) {
    return handleApiRequest(e);
  }
  
  // HTMLページを返す
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('VTuber Radar - VTuberチャンネル分析')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * APIリクエストを処理
 * @param {Object} e イベントオブジェクト
 * @return {TextOutput} JSONレスポンス
 */
function handleApiRequest(e) {
  const action = e.parameter.action;
  let result;
  
  try {
    switch (action) {
      case 'getChannels':
        result = getChannelsApi(e.parameter);
        break;
      case 'getStats':
        result = getStatsApi();
        break;
      case 'getLiveStreams':
        result = getLiveStreamsApi();
        break;
      default:
        result = { error: 'Unknown action' };
    }
  } catch (error) {
    result = { error: error.message };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * チャンネル一覧を取得するAPI
 * @param {Object} params パラメータ
 * @return {Object} チャンネルデータ
 */
function getChannelsApi(params) {
  Logger.log('getChannelsApi called');
  
  const sheetManager = new SpreadsheetManager();
  const sheet = sheetManager.sheet;
  
  const lastRow = sheet.getLastRow();
  Logger.log('lastRow: ' + lastRow);
  
  if (lastRow <= 1) {
    return { channels: [], total: 0, page: 1, limit: 50, totalPages: 0 };
  }
  
  // 全データを取得
  const range = sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length);
  const data = range.getValues();
  const formulas = range.getFormulas();
  
  Logger.log('Data rows: ' + data.length);
  
  // チャンネルオブジェクトに変換（すべての値を安全な形式に変換）
  let channels = data.map((row, index) => ({
    rank: index + 1,
    liveMonitor: row[0] === true,
    excludeFlag: row[1] === true, // B列（除外フラグ）
    // C列（アイコン）: 式からURLを抽出、または値をそのまま使用
    thumbnailUrl: String(extractImageUrl(formulas[index][2]) || extractImageUrl(row[2]) || ''),
    channelId: String(row[3] || ''),
    channelName: String(row[4] || ''),
    // F列（チャンネルURL）: 式からURLを抽出、または値をそのまま使用
    channelUrl: String(extractHyperlinkUrl(formulas[index][5]) || extractHyperlinkUrl(row[5]) || `https://www.youtube.com/channel/${row[3]}`),
    subscriberCount: Number(row[6]) || 0,
    uploadFrequency: Number(row[7]) || 0,
    avgViewCount: Number(row[8]) || 0,
    avgLikeCount: Number(row[9]) || 0,
    avgCommentCount: Number(row[10]) || 0,
    lastPublishedAt: formatDateValue(row[11]),
    description: String(row[12] || ''),
    // N列（Twitter）: 式からURLを抽出、または値をそのまま使用
    twitterLink: String(extractHyperlinkUrl(formulas[index][13]) || extractHyperlinkUrl(row[13]) || row[13] || ''),
    fetchedAt: formatDateValue(row[14]),
    maxViewerCount: Number(row[15]) || 0,
    maxViewerCountDate: formatDateValue(row[16])
  })).filter(ch => ch.channelId && !ch.excludeFlag); // 空の行と除外フラグがtrueの行を除外
  
  Logger.log('Channels after filter: ' + channels.length);
  
  // ソート処理
  const sortBy = params.sortBy || 'maxViewerCount';
  const sortOrder = params.sortOrder || 'desc';
  
  channels.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    
    // 数値として比較
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    }
    
    // 文字列として比較
    return sortOrder === 'desc' 
      ? String(valB).localeCompare(String(valA))
      : String(valA).localeCompare(String(valB));
  });
  
  // ランキングを再設定
  channels.forEach((ch, index) => {
    ch.rank = index + 1;
  });
  
  // フィルタリング
  const search = params.search ? String(params.search).toLowerCase() : '';
  if (search) {
    channels = channels.filter(ch => 
      ch.channelName.toLowerCase().includes(search) ||
      ch.description.toLowerCase().includes(search)
    );
  }
  
  // ページネーション
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 50;
  const offset = (page - 1) * limit;
  
  const total = channels.length;
  const pagedChannels = channels.slice(offset, offset + limit);
  
  Logger.log('Returning ' + pagedChannels.length + ' channels');
  
  return {
    channels: pagedChannels,
    total: total,
    page: page,
    limit: limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * 日付値を文字列に変換
 * @param {*} value 日付値（Date, string, または他の値）
 * @return {string} 文字列形式の日付
 */
function formatDateValue(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'JST', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}

/**
 * 統計情報を取得するAPI
 * @return {Object} 統計データ
 */
function getStatsApi() {
  Logger.log('getStatsApi called');
  
  const sheetManager = new SpreadsheetManager();
  const sheet = sheetManager.sheet;
  
  const lastRow = sheet.getLastRow();
  Logger.log('Stats lastRow: ' + lastRow);
  
  if (lastRow <= 1) {
    return {
      totalChannels: 0,
      totalSubscribers: 0,
      avgSubscribers: 0,
      avgViewCount: 0,
      liveMonitorCount: 0
    };
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length).getValues();
  
  let totalSubscribers = 0;
  let totalAvgViews = 0;
  let liveMonitorCount = 0;
  let validCount = 0;
  
  data.forEach(row => {
    const excludeFlag = row[1]; // B列（除外フラグ）
    // 除外フラグがtrueの行はスキップ
    if (excludeFlag === true) {
      return;
    }
    
    if (row[3]) { // チャンネルIDがある場合（D列）
      validCount++;
      totalSubscribers += Number(row[6]) || 0; // 登録者数（G列）
      totalAvgViews += Number(row[8]) || 0; // 平均再生回数（I列）
      if (row[0] === true) {
        liveMonitorCount++;
      }
    }
  });
  
  const result = {
    totalChannels: validCount,
    totalSubscribers: totalSubscribers,
    avgSubscribers: validCount > 0 ? Math.round(totalSubscribers / validCount) : 0,
    avgViewCount: validCount > 0 ? Math.round(totalAvgViews / validCount) : 0,
    liveMonitorCount: liveMonitorCount
  };
  
  Logger.log('Stats result: ' + JSON.stringify(result));
  return result;
}

/**
 * ライブ配信情報を取得するAPI
 * @return {Object} ライブ配信データ
 */
function getLiveStreamsApi() {
  Logger.log('getLiveStreamsApi called');
  
  const sheetManager = new SpreadsheetManager();
  
  // 同時接続数シートからデータを取得
  const viewerCountSheet = sheetManager.spreadsheet.getSheetByName(CONFIG.VIEWER_COUNT_SHEET_NAME);
  
  if (!viewerCountSheet) {
    Logger.log('Viewer count sheet not found');
    return { liveStreams: [] };
  }
  
  const lastRow = viewerCountSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('Viewer count sheet is empty');
    return { liveStreams: [] };
  }
  
  // 直近24時間のデータを取得
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const range = viewerCountSheet.getRange(2, 1, lastRow - 1, CONFIG.VIEWER_COUNT_HEADERS.length);
  const data = range.getValues();
  const formulas = range.getFormulas();
  
  const liveStreams = data
    .map((row, index) => ({
      channelId: String(row[0] || ''),
      channelName: String(row[1] || ''),
      title: String(row[2] || ''),
      url: String(extractHyperlinkUrl(formulas[index][3]) || extractHyperlinkUrl(row[3]) || row[3] || ''),
      viewerCount: Number(row[4]) || 0,
      recordedAt: formatDateValue(row[5]),
      status: String(row[6] || '')
    }))
    .filter(stream => {
      if (!stream.recordedAt) return false;
      const recordedDate = new Date(stream.recordedAt);
      return recordedDate >= oneDayAgo;
    })
    .sort((a, b) => b.viewerCount - a.viewerCount);
  
  Logger.log('Live streams found: ' + liveStreams.length);
  return { liveStreams: liveStreams.slice(0, 20) };
}

/**
 * IMAGE関数からURLを抽出
 * @param {string|Object} cell セルの値
 * @return {string} URL
 */
function extractImageUrl(cell) {
  if (!cell) return '';
  
  const cellStr = String(cell);
  
  // =IMAGE("url", 1) 形式からURLを抽出
  const match = cellStr.match(/=IMAGE\("([^"]+)"/i);
  if (match) {
    return match[1];
  }
  
  // 既にURLの場合
  if (cellStr.startsWith('http')) {
    return cellStr;
  }
  
  return '';
}

/**
 * HYPERLINK関数からURLを抽出
 * @param {string|Object} cell セルの値
 * @return {string} URL
 */
function extractHyperlinkUrl(cell) {
  if (!cell) return '';
  
  const cellStr = String(cell);
  
  // =HYPERLINK("url", "text") 形式からURLを抽出
  const match = cellStr.match(/=HYPERLINK\("([^"]+)"/i);
  if (match) {
    return match[1];
  }
  
  // 既にURLの場合
  if (cellStr.startsWith('http')) {
    return cellStr;
  }
  
  return '';
}

/**
 * HTMLファイルをインクルードするヘルパー関数
 * @param {string} filename ファイル名
 * @return {string} HTMLコンテンツ
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
// クライアントサイド用関数（google.script.run から呼び出し可能）
// これらの関数はCORS問題を回避するために使用されます
// ============================================================

/**
 * チャンネル一覧を取得（クライアントサイド用）
 * @param {Object} params パラメータ
 * @return {Object} チャンネルデータ
 */
function getChannelsForClient(params) {
  Logger.log('getChannelsForClient called with params: ' + JSON.stringify(params));
  try {
    const result = getChannelsApi(params || {});
    Logger.log('getChannelsForClient success, channels count: ' + (result.channels ? result.channels.length : 0));
    return result;
  } catch (error) {
    Logger.log('getChannelsForClient error: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    return { channels: [], total: 0, page: 1, limit: 50, totalPages: 0, error: error.message };
  }
}

/**
 * 統計情報を取得（クライアントサイド用）
 * @return {Object} 統計データ
 */
function getStatsForClient() {
  Logger.log('getStatsForClient called');
  try {
    const result = getStatsApi();
    Logger.log('getStatsForClient success');
    return result;
  } catch (error) {
    Logger.log('getStatsForClient error: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    return { totalChannels: 0, totalSubscribers: 0, avgSubscribers: 0, avgViewCount: 0, liveMonitorCount: 0, error: error.message };
  }
}

/**
 * ライブ配信情報を取得（クライアントサイド用）
 * @return {Object} ライブ配信データ
 */
function getLiveStreamsForClient() {
  Logger.log('getLiveStreamsForClient called');
  try {
    const result = getLiveStreamsApi();
    Logger.log('getLiveStreamsForClient success');
    return result;
  } catch (error) {
    Logger.log('getLiveStreamsForClient error: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    return { liveStreams: [], error: error.message };
  }
}

/**
 * テスト用関数 - 接続確認
 * @return {Object} テスト結果
 */
function testConnection() {
  Logger.log('testConnection called');
  return { success: true, message: 'Connection OK', timestamp: new Date().toISOString() };
}

