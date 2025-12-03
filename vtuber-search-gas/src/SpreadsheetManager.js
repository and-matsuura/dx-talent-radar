/**
 * スプレッドシート管理クラス
 * Googleスプレッドシートへのデータ書き込み・読み込みを管理
 */

class SpreadsheetManager {
  constructor() {
    this.spreadsheet = null;
    this.sheet = null;
    this.initialize();
  }

  /**
   * スプレッドシートとシートを初期化
   */
  initialize() {
    try {
      // スプレッドシートIDが設定されている場合は既存のものを開く
      if (CONFIG.SPREADSHEET_ID) {
        this.spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        Logger.log(`スプレッドシートを開きました: ${this.spreadsheet.getName()}`);
      } else {
        // 新規作成
        this.spreadsheet = SpreadsheetApp.create('VTuberチャンネルリスト');
        Logger.log(`新規スプレッドシートを作成しました: ${this.spreadsheet.getId()}`);
        Logger.log(`URL: ${this.spreadsheet.getUrl()}`);
        Logger.log('Config.gsのSPREADSHEET_IDにこのIDを設定してください');
      }

      // シートを取得または作成
      this.sheet = this.spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
      if (!this.sheet) {
        this.sheet = this.spreadsheet.insertSheet(CONFIG.SHEET_NAME);
        Logger.log(`シート "${CONFIG.SHEET_NAME}" を作成しました`);
      }

    } catch (error) {
      Logger.log(`スプレッドシート初期化エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * シートを初期化（ヘッダー行を設定）
   */
  initializeSheet() {
    // ヘッダー行が既に存在するかチェック
    const lastRow = this.sheet.getLastRow();
    if (lastRow === 0) {
      // ヘッダー行を追加
      this.sheet.appendRow(CONFIG.SHEET_HEADERS);

      // ヘッダー行を太字にし、背景色を設定
      const headerRange = this.sheet.getRange(1, 1, 1, CONFIG.SHEET_HEADERS.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');

      // 列幅を自動調整
      for (let i = 1; i <= CONFIG.SHEET_HEADERS.length; i++) {
        this.sheet.autoResizeColumn(i);
      }

      // 最初の行を固定
      this.sheet.setFrozenRows(1);

      Logger.log('シートヘッダーを初期化しました');
    } else {
      Logger.log('シートは既に初期化されています');
    }
  }

  /**
   * 既存のチャンネルIDと取得日時を取得
   * @return {Map} チャンネルID -> {row: 行番号, fetchedAt: 取得日時}
   */
  getExistingChannelIds() {
    const existingChannels = new Map();

    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) {
      // ヘッダーのみまたは空のシート
      return existingChannels;
    }

    // チャンネルID（D列）と取得日時（O列 = 15列目）を取得
    const data = this.sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length).getValues();

    data.forEach((row, index) => {
      const excludeFlag = row[1]; // B列（除外フラグ）
      const channelId = row[3]; // D列（0-indexedで3）
      const fetchedAt = row[14]; // O列（0-indexedで14）

      // 除外フラグがtrueの行はスキップ
      if (excludeFlag === true) {
        return;
      }

      if (channelId) {
        existingChannels.set(channelId, {
          row: index + 2, // 実際の行番号（ヘッダー分+1、0-indexed分+1）
          fetchedAt: new Date(fetchedAt)
        });
      }
    });

    return existingChannels;
  }

  /**
   * チャンネルを更新すべきか判定
   * @param {Date} lastFetchedAt 最終取得日時
   * @return {boolean} 更新すべき場合true
   */
  shouldUpdateChannel(lastFetchedAt) {
    const now = new Date();
    const daysSinceLastFetch = (now - lastFetchedAt) / (1000 * 60 * 60 * 24);
    return daysSinceLastFetch >= 1; // 1日以上経過していたら更新
  }

  /**
   * チャンネル情報をスプレッドシートに追加
   * @param {Array} channels チャンネル情報の配列
   */
  appendChannels(channels) {
    if (channels.length === 0) {
      Logger.log('追加するチャンネルがありません');
      return;
    }

    // データ行を構築
    const rows = channels.map(channel => [
      false, // ライブ配信監視フラグ（デフォルトはfalse）
      false, // 除外フラグ（デフォルトはfalse）
      channel.thumbnailUrl, // アイコンURL（後でIMAGE関数に変換）
      channel.channelId,
      channel.channelName,
      channel.channelUrl,
      channel.subscriberCount,
      channel.uploadFrequency,
      channel.avgViewCount,
      channel.avgLikeCount,
      channel.avgCommentCount,
      channel.lastPublishedAt,
      channel.description,
      channel.twitterLink,
      Utilities.formatDate(channel.fetchedAt, 'JST', 'yyyy-MM-dd HH:mm:ss'),
      0, // 最大同時接続数（初期値0）
      '' // 最大同時接続数日時（初期値空）
    ]);

    try {
      // シートに追加
      const startRow = this.sheet.getLastRow() + 1;
      const range = this.sheet.getRange(startRow, 1, rows.length, CONFIG.SHEET_HEADERS.length);
      range.setValues(rows);

      Logger.log(`${rows.length}件のチャンネル情報をスプレッドシートに追加しました`);

      // データ行の書式設定
      this.formatDataRows(startRow, rows.length);

    } catch (error) {
      Logger.log(`スプレッドシート書き込みエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 既存チャンネル情報を更新
   * @param {Array} channels チャンネル情報の配列（{channel: データ, row: 行番号}の形式）
   */
  updateChannels(channels) {
    if (channels.length === 0) {
      Logger.log('更新するチャンネルがありません');
      return;
    }

    Logger.log(`${channels.length}件のチャンネル情報を更新します`);

    channels.forEach(({channel, row}) => {
      // 既存のライブ配信監視フラグ、除外フラグ、最大同時接続数、最大同時接続数日時を取得
      const existingData = this.sheet.getRange(row, 1, 1, CONFIG.SHEET_HEADERS.length).getValues()[0];
      const liveMonitorFlag = existingData[0]; // ライブ配信監視フラグ
      const excludeFlag = existingData[1] || false; // 除外フラグ
      const maxViewerCount = existingData[15] || 0; // 最大同時接続数
      const maxViewerCountDate = existingData[16] || ''; // 最大同時接続数日時

      // データ行を構築
      const rowData = [
        liveMonitorFlag, // 既存のライブ配信監視フラグを保持
        excludeFlag, // 既存の除外フラグを保持
        channel.thumbnailUrl,
        channel.channelId,
        channel.channelName,
        channel.channelUrl,
        channel.subscriberCount,
        channel.uploadFrequency,
        channel.avgViewCount,
        channel.avgLikeCount,
        channel.avgCommentCount,
        channel.lastPublishedAt,
        channel.description,
        channel.twitterLink,
        Utilities.formatDate(channel.fetchedAt, 'JST', 'yyyy-MM-dd HH:mm:ss'),
        maxViewerCount, // 既存の最大同時接続数を保持
        maxViewerCountDate // 既存の最大同時接続数日時を保持
      ];

      try {
        // 指定された行を更新
        const range = this.sheet.getRange(row, 1, 1, CONFIG.SHEET_HEADERS.length);
        range.setValues([rowData]);

        // 書式を再適用
        this.formatDataRows(row, 1);

      } catch (error) {
        Logger.log(`行${row}の更新エラー: ${error.message}`);
      }
    });

    Logger.log(`${channels.length}件のチャンネル情報を更新しました`);
  }

  /**
   * データ行の書式を設定
   * @param {number} startRow 開始行
   * @param {number} numRows 行数
   */
  formatDataRows(startRow, numRows) {
    // ライブ配信監視列のチェックボックス設定（A列）
    const monitorRange = this.sheet.getRange(startRow, 1, numRows, 1);
    monitorRange.insertCheckboxes();

    // 除外フラグ列のチェックボックス設定（B列）
    const excludeRange = this.sheet.getRange(startRow, 2, numRows, 1);
    excludeRange.insertCheckboxes();

    // 数値列の書式設定（カンマ区切り）
    // 除外フラグ列追加により列番号が+1シフト
    const numberColumns = [7, 9, 10, 11, 16]; // 登録者数、平均再生回数、いいね数、コメント数、最大同時接続数
    numberColumns.forEach(col => {
      const range = this.sheet.getRange(startRow, col, numRows, 1);
      range.setNumberFormat('#,##0');
    });

    // 投稿頻度の書式設定（小数点1桁）
    const frequencyRange = this.sheet.getRange(startRow, 8, numRows, 1);
    frequencyRange.setNumberFormat('#,##0.0');

    // URLをハイパーリンクに設定、IMAGE関数を設定
    for (let i = 0; i < numRows; i++) {
      const row = startRow + i;

      // チャンネルアイコン（C列）をIMAGE関数で表示
      const iconCell = this.sheet.getRange(row, 3);
      const iconUrl = iconCell.getValue();
      if (iconUrl) {
        iconCell.setFormula(`=IMAGE("${iconUrl}", 1)`);
      }

      // チャンネルURL（F列）
      const channelUrlCell = this.sheet.getRange(row, 6);
      const channelUrl = channelUrlCell.getValue();
      if (channelUrl) {
        const channelName = this.sheet.getRange(row, 5).getValue();
        channelUrlCell.setFormula(`=HYPERLINK("${channelUrl}", "${channelName}")`);
      }

      // Twitterリンクのハイパーリンク設定（N列）
      const twitterCell = this.sheet.getRange(row, 14);
      const twitterLink = twitterCell.getValue();
      if (twitterLink && twitterLink !== 'N/A') {
        // URLからユーザー名を抽出（最後の/以降）
        const username = twitterLink.split('/').pop();
        twitterCell.setFormula(`=HYPERLINK("${twitterLink}", "@${username}")`);
      }

      // 除外フラグがtrueの場合は行を非表示にする
      const excludeFlagCell = this.sheet.getRange(row, 2);
      const excludeFlag = excludeFlagCell.getValue();
      if (excludeFlag === true) {
        this.sheet.hideRows(row);
      } else {
        this.sheet.showRows(row);
      }
    }

    // アイコン列の行の高さを設定（画像表示のため）
    this.sheet.setRowHeights(startRow, numRows, 80);

    // 交互の行に背景色を設定（見やすくするため）
    for (let i = 0; i < numRows; i++) {
      if (i % 2 === 0) {
        const range = this.sheet.getRange(startRow + i, 1, 1, CONFIG.SHEET_HEADERS.length);
        range.setBackground('#f3f3f3');
      }
    }
  }

  /**
   * スプレッドシートのURLを取得
   * @return {string} スプレッドシートのURL
   */
  getSpreadsheetUrl() {
    return this.spreadsheet.getUrl();
  }

  /**
   * スプレッドシートIDを取得
   * @return {string} スプレッドシートID
   */
  getSpreadsheetId() {
    return this.spreadsheet.getId();
  }

  /**
   * データをチャンネル名でソート
   */
  sortByChannelName() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return;

    const range = this.sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length);
    range.sort(5); // チャンネル名（5列目）でソート
    Logger.log('チャンネル名でソートしました');
  }

  /**
   * データを登録者数でソート（降順）
   */
  sortBySubscriberCount() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return;

    const range = this.sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length);
    range.sort([{column: 7, ascending: false}]); // 登録者数（7列目）で降順ソート
    Logger.log('登録者数でソートしました');
  }

  /**
   * データを平均再生回数でソート（降順）
   */
  sortByAvgViewCount() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return;

    const range = this.sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length);
    range.sort([{column: 9, ascending: false}]); // 平均再生回数（9列目）で降順ソート
    Logger.log('平均再生回数でソートしました');
  }

  /**
   * 重複データを削除
   */
  removeDuplicates() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return;

    const range = this.sheet.getRange(1, 1, lastRow, CONFIG.SHEET_HEADERS.length);
    const numDuplicates = range.removeDuplicates([4]).length; // チャンネルID（4列目）で重複チェック

    Logger.log(`${numDuplicates}件の重複データを削除しました`);
  }

  /**
   * ライブ配信監視が有効なチャンネル一覧を取得
   * @return {Array} {channelId, channelName, row}の配列
   */
  getMonitoredChannels() {
    const monitoredChannels = [];

    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) {
      return monitoredChannels;
    }

    const data = this.sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length).getValues();

    data.forEach((row, index) => {
      const liveMonitorFlag = row[0]; // A列（ライブ配信監視フラグ）
      const excludeFlag = row[1]; // B列（除外フラグ）
      const channelId = row[3]; // D列（チャンネルID）
      const channelName = row[4]; // E列（チャンネル名）

      // 除外フラグがtrueの行はスキップ
      if (excludeFlag === true) {
        return;
      }

      if (liveMonitorFlag === true && channelId) {
        monitoredChannels.push({
          channelId: channelId,
          channelName: channelName,
          row: index + 2 // 実際の行番号
        });
      }
    });

    return monitoredChannels;
  }

  /**
   * チャンネルの最大同時接続数を更新
   * @param {string} channelId チャンネルID
   * @param {number} viewerCount 同時接続数
   * @param {Date} recordedAt 記録日時
   */
  updateMaxViewerCount(channelId, viewerCount, recordedAt) {
    const existingChannels = this.getExistingChannelIds();

    if (!existingChannels.has(channelId)) {
      Logger.log(`チャンネル ${channelId} が見つかりません`);
      return;
    }

    const channelInfo = existingChannels.get(channelId);
    const row = channelInfo.row;

    // 現在の最大同時接続数を取得
    const currentMaxViewerCount = this.sheet.getRange(row, 16).getValue() || 0;

    // 新しい値が現在の最大値より大きい場合のみ更新
    if (viewerCount > currentMaxViewerCount) {
      this.sheet.getRange(row, 16).setValue(viewerCount); // P列：最大同時接続数
      this.sheet.getRange(row, 17).setValue(Utilities.formatDate(recordedAt, 'JST', 'yyyy-MM-dd HH:mm:ss')); // Q列：最大同時接続数日時
      Logger.log(`チャンネル ${channelId} の最大同時接続数を更新: ${viewerCount} (${Utilities.formatDate(recordedAt, 'JST', 'yyyy-MM-dd HH:mm:ss')})`);
    }
  }

  /**
   * 同時接続数シートを初期化
   */
  initializeViewerCountSheet() {
    let viewerCountSheet = this.spreadsheet.getSheetByName(CONFIG.VIEWER_COUNT_SHEET_NAME);

    if (!viewerCountSheet) {
      viewerCountSheet = this.spreadsheet.insertSheet(CONFIG.VIEWER_COUNT_SHEET_NAME);
      Logger.log(`シート "${CONFIG.VIEWER_COUNT_SHEET_NAME}" を作成しました`);
    }

    // ヘッダー行が既に存在するかチェック
    const lastRow = viewerCountSheet.getLastRow();
    if (lastRow === 0) {
      // ヘッダー行を追加
      viewerCountSheet.appendRow(CONFIG.VIEWER_COUNT_HEADERS);

      // ヘッダー行を太字にし、背景色を設定
      const headerRange = viewerCountSheet.getRange(1, 1, 1, CONFIG.VIEWER_COUNT_HEADERS.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#34a853');
      headerRange.setFontColor('#ffffff');

      // 列幅を自動調整
      for (let i = 1; i <= CONFIG.VIEWER_COUNT_HEADERS.length; i++) {
        viewerCountSheet.autoResizeColumn(i);
      }

      // 最初の行を固定
      viewerCountSheet.setFrozenRows(1);

      Logger.log('同時接続数シートヘッダーを初期化しました');
    }

    return viewerCountSheet;
  }

  /**
   * 同時接続数を記録
   * @param {Object} liveStreamData ライブ配信データ
   */
  recordViewerCount(liveStreamData) {
    const viewerCountSheet = this.initializeViewerCountSheet();

    // 同じ配信URLの行を検索
    const lastRow = viewerCountSheet.getLastRow();
    let existingRow = null;

    if (lastRow > 1) {
      // videoIdを抽出（URLから）
      const videoIdMatch = liveStreamData.url.match(/[?&]v=([^&]+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      
      // データ行を取得（D列: 配信URL）
      const data = viewerCountSheet.getRange(2, 4, lastRow - 1, 1).getValues();
      
      for (let i = 0; i < data.length; i++) {
        const rowNum = i + 2;
        const urlCell = viewerCountSheet.getRange(rowNum, 4);
        const urlValue = urlCell.getValue();
        const urlFormula = urlCell.getFormula();
        
        // URLが一致するかチェック
        let urlMatches = false;
        
        if (urlValue === liveStreamData.url) {
          urlMatches = true;
        } else if (urlFormula && urlFormula.includes(liveStreamData.url)) {
          urlMatches = true;
        } else if (videoId) {
          // videoIdで比較（より確実）
          const existingVideoIdMatch = (urlValue || '').match(/[?&]v=([^&]+)/);
          const existingFormulaVideoIdMatch = (urlFormula || '').match(/[?&]v=([^&]+)/);
          
          if ((existingVideoIdMatch && existingVideoIdMatch[1] === videoId) ||
              (existingFormulaVideoIdMatch && existingFormulaVideoIdMatch[1] === videoId)) {
            urlMatches = true;
          }
        }
        
        if (urlMatches) {
          existingRow = rowNum;
          break;
        }
      }
    }

    const rowData = [
      liveStreamData.channelId,
      liveStreamData.channelName,
      liveStreamData.title,
      liveStreamData.url,
      liveStreamData.viewerCount,
      Utilities.formatDate(liveStreamData.recordedAt, 'JST', 'yyyy-MM-dd HH:mm:ss'),
      liveStreamData.status
    ];

    if (existingRow) {
      // 既存の行を更新
      const range = viewerCountSheet.getRange(existingRow, 1, 1, CONFIG.VIEWER_COUNT_HEADERS.length);
      range.setValues([rowData]);
      
      // 数値列の書式設定
      viewerCountSheet.getRange(existingRow, 5).setNumberFormat('#,##0'); // 同時接続数

      // 配信URLをハイパーリンクに設定
      const urlCell = viewerCountSheet.getRange(existingRow, 4);
      const url = urlCell.getValue();
      if (url) {
        urlCell.setFormula(`=HYPERLINK("${liveStreamData.url}", "視聴する")`);
      }

      Logger.log(`同時接続数を更新: ${liveStreamData.channelName} - ${liveStreamData.viewerCount}人 (行${existingRow})`);
    } else {
      // 新しい行を追加
      viewerCountSheet.appendRow(rowData);

      // 数値列の書式設定
      const newLastRow = viewerCountSheet.getLastRow();
      viewerCountSheet.getRange(newLastRow, 5).setNumberFormat('#,##0'); // 同時接続数

      // 配信URLをハイパーリンクに設定
      const urlCell = viewerCountSheet.getRange(newLastRow, 4);
      const url = urlCell.getValue();
      if (url) {
        urlCell.setFormula(`=HYPERLINK("${liveStreamData.url}", "視聴する")`);
      }

      Logger.log(`同時接続数を記録: ${liveStreamData.channelName} - ${liveStreamData.viewerCount}人`);
    }
  }

  /**
   * 除外キーワードシートを初期化
   */
  initializeExcludedKeywordsSheet() {
    let excludedKeywordsSheet = this.spreadsheet.getSheetByName(CONFIG.EXCLUDED_KEYWORDS_SHEET_NAME);

    if (!excludedKeywordsSheet) {
      excludedKeywordsSheet = this.spreadsheet.insertSheet(CONFIG.EXCLUDED_KEYWORDS_SHEET_NAME);
      Logger.log(`シート "${CONFIG.EXCLUDED_KEYWORDS_SHEET_NAME}" を作成しました`);
    }

    // ヘッダー行が既に存在するかチェック
    const lastRow = excludedKeywordsSheet.getLastRow();
    if (lastRow === 0) {
      // ヘッダー行を追加
      excludedKeywordsSheet.appendRow(CONFIG.EXCLUDED_KEYWORDS_HEADERS);

      // ヘッダー行を太字にし、背景色を設定
      const headerRange = excludedKeywordsSheet.getRange(1, 1, 1, CONFIG.EXCLUDED_KEYWORDS_HEADERS.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#ea4335');
      headerRange.setFontColor('#ffffff');

      // デフォルトの除外キーワードを追加
      const defaultKeywords = [
        ['ホロライブ', 'ホロライブプロダクション所属'],
        ['hololive', 'ホロライブプロダクション所属（英語表記）'],
        ['にじさんじ', 'にじさんじ所属'],
        ['nijisanji', 'にじさんじ所属（英語表記）'],
        ['ぶいすぽ', 'ぶいすぽっ！所属'],
        ['VSPO', 'ぶいすぽっ！所属（英語表記）'],
        ['.LIVE', 'どっとライブ所属'],
        ['774inc', '774inc所属'],
        ['Re:AcT', 'Re:AcT所属'],
        ['のりプロ', 'のりプロ所属'],
        ['あおぎり高校', 'あおぎり高校所属'],
        ['RIONECTION', 'RIONECTION所属']
      ];

      defaultKeywords.forEach(keyword => {
        excludedKeywordsSheet.appendRow(keyword);
      });

      // 列幅を自動調整
      for (let i = 1; i <= CONFIG.EXCLUDED_KEYWORDS_HEADERS.length; i++) {
        excludedKeywordsSheet.autoResizeColumn(i);
      }

      // 最初の行を固定
      excludedKeywordsSheet.setFrozenRows(1);

      Logger.log('除外キーワードシートを初期化しました');
    }

    return excludedKeywordsSheet;
  }

  /**
   * 除外キーワードをスプレッドシートから取得
   * @return {Array} 除外キーワードの配列
   */
  getExcludedKeywords() {
    const excludedKeywordsSheet = this.initializeExcludedKeywordsSheet();
    const excludedKeywords = [];

    const lastRow = excludedKeywordsSheet.getLastRow();
    if (lastRow <= 1) {
      // ヘッダーのみまたは空のシート
      Logger.log('除外キーワードが設定されていません');
      return excludedKeywords;
    }

    // キーワード列（A列）を取得
    const data = excludedKeywordsSheet.getRange(2, 1, lastRow - 1, 1).getValues();

    data.forEach(row => {
      const keyword = row[0];
      if (keyword && keyword.toString().trim() !== '') {
        excludedKeywords.push(keyword.toString().trim());
      }
    });

    Logger.log(`除外キーワード数: ${excludedKeywords.length}`);
    return excludedKeywords;
  }

  /**
   * 除外フラグに基づいて行の表示/非表示を更新
   * 全データ行をチェックして、除外フラグがtrueの行を非表示にする
   */
  updateRowVisibility() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) {
      return;
    }

    const data = this.sheet.getRange(2, 1, lastRow - 1, CONFIG.SHEET_HEADERS.length).getValues();

    data.forEach((row, index) => {
      const excludeFlag = row[1]; // B列（除外フラグ）
      const actualRow = index + 2; // 実際の行番号

      if (excludeFlag === true) {
        this.sheet.hideRows(actualRow);
      } else {
        this.sheet.showRows(actualRow);
      }
    });

    Logger.log('行の表示/非表示を更新しました');
  }
}
