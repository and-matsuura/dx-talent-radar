/**
 * YouTube検索クラス
 * YouTube Data APIを使用してVTuberチャンネルを検索・収集
 */

class YouTubeSearcher {
  constructor(sheetManager = null, quotaTracker = null) {
    this.startTime = new Date().getTime();
    this.foundChannels = [];
    this.sheetManager = sheetManager || new SpreadsheetManager();
    this.errorLogger = new ErrorLogger();
    this.quotaTracker = quotaTracker; // API使用量追跡オブジェクト（オプション）

    // 除外キーワードをスプレッドシートから取得
    this.excludedKeywords = this.sheetManager.getExcludedKeywords();

    // スプレッドシートにキーワードがない場合は、Config.jsのデフォルトを使用
    if (this.excludedKeywords.length === 0) {
      Logger.log('除外キーワードシートが空です。Config.jsのデフォルト値を使用します。');
      this.excludedKeywords = CONFIG.EXCLUDED_KEYWORDS;
    }
  }

  /**
   * VTuberチャンネルを検索
   * @param {Map} existingChannels 既存のチャンネル情報（ID -> {row, fetchedAt}）
   * @return {Object} {newChannels: 新規チャンネル配列, updateChannels: 更新チャンネル配列}
   */
  searchVTuberChannels(existingChannels) {
    Logger.log('--- YouTube検索開始 ---');

    const allChannelIds = new Set();

    // 各検索順序で検索
    for (const order of CONFIG.SEARCH_ORDERS) {
      Logger.log(`\n=== 検索順序: ${order} ===`);

      // 各キーワードで検索
      for (const keyword of CONFIG.SEARCH_KEYWORDS) {
        Logger.log(`キーワード: "${keyword}" (${order}) で検索中...`);

        try {
          const channelIds = this.searchByKeyword(keyword, order);
          Logger.log(`  ${channelIds.length}件のチャンネルを発見`);

          // チャンネルIDを統合（Setなので自動的に重複排除）
          channelIds.forEach(id => allChannelIds.add(id));

          // 実行時間チェック
          if (this.isTimeoutApproaching()) {
            Logger.log('実行時間制限が近づいています。検索を中断します。');
            break;
          }

        } catch (error) {
          Logger.log(`検索エラー (${keyword}, ${order}): ${error.message}`);
          this.errorLogger.logError(error, {
            functionName: 'searchVTuberChannels',
            apiName: 'YouTube.Search.list',
            parameters: { keyword: keyword, order: order }
          });
        }
      }

      // 実行時間チェック（外側のループ）
      if (this.isTimeoutApproaching()) {
        Logger.log('実行時間制限が近づいています。検索を中断します。');
        break;
      }
    }

    Logger.log(`合計発見チャンネル数: ${allChannelIds.size}`);

    // 新規チャンネルと更新対象チャンネルに分類
    const newChannelIds = [];
    const updateChannelIds = [];

    Array.from(allChannelIds).forEach(id => {
      if (existingChannels.has(id)) {
        // 既存チャンネル：指定日数以上経過していたら更新対象
        const channelInfo = existingChannels.get(id);
        const daysSinceLastFetch = (new Date() - channelInfo.fetchedAt) / (1000 * 60 * 60 * 24);
        if (daysSinceLastFetch >= CONFIG.UPDATE_INTERVAL_DAYS) {
          updateChannelIds.push({id: id, row: channelInfo.row});
        }
      } else {
        // 新規チャンネル
        newChannelIds.push(id);
      }
    });

    Logger.log(`新規チャンネル数: ${newChannelIds.length}`);
    Logger.log(`更新対象チャンネル数: ${updateChannelIds.length}`);

    // チャンネル詳細を取得
    const newChannels = this.getChannelDetails(newChannelIds);
    const updateChannels = this.getChannelDetailsForUpdate(updateChannelIds);

    Logger.log('--- YouTube検索完了 ---');
    return {
      newChannels: newChannels,
      updateChannels: updateChannels
    };
  }

  /**
   * キーワードでチャンネルを検索
   * @param {string} keyword 検索キーワード
   * @param {string} order 検索順序（relevance, rating, date, viewCount等）
   * @return {Array} チャンネルID一覧
   */
  searchByKeyword(keyword, order = 'relevance') {
    const channelIds = [];
    let pageToken = '';
    let pageCount = 0;

    do {
      try {
        // YouTube Data API: search.list
        const response = YouTube.Search.list('snippet', {
          q: keyword,
          type: 'channel',
          maxResults: CONFIG.MAX_RESULTS_PER_REQUEST,
          pageToken: pageToken,
          order: order,
          regionCode: 'JP',
          relevanceLanguage: 'ja'
        });

        // API使用量を記録
        if (this.quotaTracker) {
          this.quotaTracker.recordAPICall('YouTube.Search.list');
        }

        if (response.items) {
          response.items.forEach(item => {
            if (item.id && item.id.channelId) {
              channelIds.push(item.id.channelId);
            }
          });
        }

        pageToken = response.nextPageToken || '';
        pageCount++;

        // 実行時間・結果数チェック
        if (channelIds.length >= CONFIG.MAX_RESULTS || this.isTimeoutApproaching()) {
          break;
        }

        // API制限を考慮した待機
        Utilities.sleep(100);

      } catch (error) {
        Logger.log(`検索APIエラー: ${error.message}`);
        this.errorLogger.logError(error, {
          functionName: 'searchByKeyword',
          apiName: 'YouTube.Search.list',
          parameters: { keyword: keyword, order: order, pageToken: pageToken }
        });
        // クォータエラーの場合は処理を中断
        if (this.errorLogger.isQuotaError(error)) {
          Logger.log('クォータエラーが発生しました。検索を中断します。');
          break;
        }
        break;
      }

    } while (pageToken && pageCount < 20); // 最大20ページ

    return channelIds;
  }

  /**
   * 更新用チャンネル詳細情報を取得
   * @param {Array} channelInfos チャンネル情報一覧（{id, row}の配列）
   * @return {Array} {channel: チャンネルデータ, row: 行番号}の配列
   */
  getChannelDetailsForUpdate(channelInfos) {
    const channels = [];
    const batchSize = 50;

    const channelIds = channelInfos.map(info => info.id);

    for (let i = 0; i < channelIds.length; i += batchSize) {
      if (this.isTimeoutApproaching()) {
        Logger.log('実行時間制限が近づいています。更新処理を中断します。');
        break;
      }

      const batch = channelIds.slice(i, i + batchSize);
      Logger.log(`チャンネル更新情報取得中... (${i + 1}〜${i + batch.length}/${channelIds.length})`);

      try {
        const response = YouTube.Channels.list('snippet,statistics,contentDetails', {
          id: batch.join(','),
          maxResults: batchSize
        });

        // API使用量を記録
        if (this.quotaTracker) {
          this.quotaTracker.recordAPICall('YouTube.Channels.list');
        }

        if (response.items) {
          response.items.forEach(channel => {
            try {
              const channelData = this.processChannel(channel);
              if (channelData) {
                // 対応する行番号を見つける
                const channelInfo = channelInfos.find(info => info.id === channel.id);
                if (channelInfo) {
                  channels.push({
                    channel: channelData,
                    row: channelInfo.row
                  });
                }
              }
            } catch (error) {
              Logger.log(`チャンネル更新処理エラー (${channel.id}): ${error.message}`);
              this.errorLogger.logError(error, {
                functionName: 'getChannelDetailsForUpdate',
                apiName: 'YouTube.Channels.list',
                channelId: channel.id,
                channelName: channel.snippet?.title || ''
              });
            }
          });
        }

        Utilities.sleep(100);

      } catch (error) {
        Logger.log(`チャンネル更新詳細取得エラー: ${error.message}`);
        this.errorLogger.logError(error, {
          functionName: 'getChannelDetailsForUpdate',
          apiName: 'YouTube.Channels.list',
          parameters: { batchSize: batch.length }
        });
        // クォータエラーの場合は処理を中断
        if (this.errorLogger.isQuotaError(error)) {
          Logger.log('クォータエラーが発生しました。更新処理を中断します。');
          break;
        }
      }
    }

    return channels;
  }

  /**
   * チャンネル詳細情報を取得（最適化版）
   * Phase 1: 基本情報でフィルタリング（API呼び出し: channels.listのみ）
   * Phase 2: 合格チャンネルのみ動画情報を取得（API呼び出し: playlistItems.list, videos.list）
   * @param {Array} channelIds チャンネルID一覧
   * @return {Array} チャンネル詳細情報の配列
   */
  getChannelDetails(channelIds) {
    const batchSize = 50; // APIの上限

    // フィルタリング統計
    const filterStats = {
      total: 0,
      subscriberCount: 0,
      excluded: 0,
      noPlaylist: 0,
      invalidPlaylist: 0,
      noVideos: 0,
      inactive: 0,
      passed: 0
    };

    // ========================================
    // Phase 1: 基本情報でフィルタリング
    // ========================================
    Logger.log('--- Phase 1: 基本情報フィルタリング ---');
    const filteredChannels = []; // フィルタを通過したチャンネル情報

    for (let i = 0; i < channelIds.length; i += batchSize) {
      if (this.isTimeoutApproaching()) {
        Logger.log('実行時間制限が近づいています。詳細取得を中断します。');
        break;
      }

      const batch = channelIds.slice(i, i + batchSize);
      Logger.log(`チャンネル基本情報取得中... (${i + 1}〜${i + batch.length}/${channelIds.length})`);

      try {
        // YouTube Data API: channels.list
        const response = YouTube.Channels.list('snippet,statistics,contentDetails', {
          id: batch.join(','),
          maxResults: batchSize
        });

        // API使用量を記録
        if (this.quotaTracker) {
          this.quotaTracker.recordAPICall('YouTube.Channels.list');
        }

        if (response.items) {
          response.items.forEach(channel => {
            try {
              const result = this.filterChannelByBasicInfo(channel, filterStats);
              if (result) {
                filteredChannels.push(result);
              }
            } catch (error) {
              Logger.log(`チャンネルフィルタリングエラー (${channel.id}): ${error.message}`);
              this.errorLogger.logError(error, {
                functionName: 'getChannelDetails',
                apiName: 'YouTube.Channels.list',
                channelId: channel.id,
                channelName: channel.snippet?.title || ''
              });
            }
          });
        }

        // API制限を考慮した待機
        Utilities.sleep(100);

      } catch (error) {
        Logger.log(`チャンネル詳細取得エラー: ${error.message}`);
        this.errorLogger.logError(error, {
          functionName: 'getChannelDetails',
          apiName: 'YouTube.Channels.list',
          parameters: { batchSize: batch.length }
        });
        // クォータエラーの場合は処理を中断
        if (this.errorLogger.isQuotaError(error)) {
          Logger.log('クォータエラーが発生しました。詳細取得を中断します。');
          break;
        }
      }
    }

    Logger.log(`Phase 1完了: ${filteredChannels.length}件がフィルタ通過（${channelIds.length}件中）`);

    // ========================================
    // Phase 2: 動画情報を取得してアクティブ判定
    // ========================================
    Logger.log('--- Phase 2: 動画情報取得 ---');
    const channels = [];

    for (let i = 0; i < filteredChannels.length; i++) {
      if (this.isTimeoutApproaching()) {
        Logger.log('実行時間制限が近づいています。動画情報取得を中断します。');
        break;
      }

      const channelInfo = filteredChannels[i];

      try {
        const result = this.enrichChannelWithVideoData(channelInfo, filterStats);
        if (result) {
          channels.push(result);
        }
      } catch (error) {
        Logger.log(`動画情報取得エラー (${channelInfo.channelId}): ${error.message}`);
        this.errorLogger.logError(error, {
          functionName: 'enrichChannelWithVideoData',
          apiName: 'YouTube.PlaylistItems.list / YouTube.Videos.list',
          channelId: channelInfo.channelId,
          channelName: channelInfo.channelName
        });
      }

      // 10件ごとにログ出力
      if ((i + 1) % 10 === 0) {
        Logger.log(`動画情報取得中... (${i + 1}/${filteredChannels.length})`);
      }
    }

    // フィルタリング統計をログ出力
    Logger.log('--- フィルタリング統計 ---');
    Logger.log(`処理総数: ${filterStats.total}`);
    Logger.log(`Phase 1除外:`);
    Logger.log(`  登録者数不足 (<${CONFIG.MIN_SUBSCRIBER_COUNT}人): ${filterStats.subscriberCount}`);
    Logger.log(`  除外キーワード該当: ${filterStats.excluded}`);
    Logger.log(`  プレイリスト情報なし: ${filterStats.noPlaylist}`);
    Logger.log(`  不正なプレイリストID: ${filterStats.invalidPlaylist}`);
    Logger.log(`Phase 2除外:`);
    Logger.log(`  動画なし: ${filterStats.noVideos}`);
    Logger.log(`  非アクティブ (>${CONFIG.ACTIVE_DAYS_THRESHOLD}日): ${filterStats.inactive}`);
    Logger.log(`最終合格: ${filterStats.passed}`);

    return channels;
  }

  /**
   * 基本情報でチャンネルをフィルタリング（API呼び出しなし）
   * @param {Object} channel YouTube APIのチャンネルオブジェクト
   * @param {Object} filterStats フィルタリング統計
   * @return {Object|null} フィルタ通過したチャンネル情報、または除外される場合はnull
   */
  filterChannelByBasicInfo(channel, filterStats) {
    const snippet = channel.snippet;
    const statistics = channel.statistics;

    filterStats.total++;

    // 登録者数チェック
    const subscriberCount = parseInt(statistics.subscriberCount) || 0;
    if (subscriberCount < CONFIG.MIN_SUBSCRIBER_COUNT) {
      filterStats.subscriberCount++;
      return null;
    }

    // 除外キーワードチェック
    const channelName = snippet.title || '';
    const description = snippet.description || '';
    if (this.shouldExclude(channelName, description)) {
      filterStats.excluded++;
      return null;
    }

    // アップロード動画IDを取得
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      filterStats.noPlaylist++;
      return null;
    }

    // プレイリストIDの形式を検証（UUで始まる24文字）
    if (!uploadsPlaylistId.startsWith('UU') || uploadsPlaylistId.length !== 24) {
      filterStats.invalidPlaylist++;
      return null;
    }

    // チャンネルアイコンのURLを取得（高解像度を優先）
    const thumbnailUrl = snippet.thumbnails?.high?.url ||
                         snippet.thumbnails?.medium?.url ||
                         snippet.thumbnails?.default?.url || '';

    // X（Twitter）リンクを抽出
    const twitterLink = this.extractTwitterLink(description);

    // フィルタ通過：基本情報を返す
    return {
      channelId: channel.id,
      channelName: channelName,
      channelUrl: `https://www.youtube.com/channel/${channel.id}`,
      subscriberCount: subscriberCount,
      description: description.substring(0, 500),
      thumbnailUrl: thumbnailUrl,
      twitterLink: twitterLink,
      uploadsPlaylistId: uploadsPlaylistId
    };
  }

  /**
   * チャンネルに動画情報を付加（API呼び出しあり）
   * @param {Object} channelInfo 基本情報を持つチャンネルオブジェクト
   * @param {Object} filterStats フィルタリング統計
   * @return {Object|null} 完全なチャンネル情報、または除外される場合はnull
   */
  enrichChannelWithVideoData(channelInfo, filterStats) {
    // 最近の動画を取得（API呼び出し）
    const recentVideos = this.getRecentVideos(channelInfo.uploadsPlaylistId);
    if (recentVideos.length === 0) {
      filterStats.noVideos++;
      return null;
    }

    // 最終投稿日チェック（アクティブ判定）
    const lastPublishedAt = new Date(recentVideos[0].publishedAt);
    const daysSinceLastPost = (new Date() - lastPublishedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceLastPost > CONFIG.ACTIVE_DAYS_THRESHOLD) {
      filterStats.inactive++;
      return null;
    }

    // 動画の詳細情報を取得（API呼び出し）
    const videoDetails = this.getVideoDetails(recentVideos.map(v => v.videoId));

    // 統計情報を計算
    const stats = this.calculateStatistics(recentVideos, videoDetails);

    // フィルタ合格
    filterStats.passed++;

    // 完全なチャンネルデータを構築
    return {
      thumbnailUrl: channelInfo.thumbnailUrl,
      channelId: channelInfo.channelId,
      channelName: channelInfo.channelName,
      channelUrl: channelInfo.channelUrl,
      subscriberCount: channelInfo.subscriberCount,
      uploadFrequency: stats.uploadFrequency,
      avgViewCount: stats.avgViewCount,
      avgLikeCount: stats.avgLikeCount,
      avgCommentCount: stats.avgCommentCount,
      lastPublishedAt: Utilities.formatDate(lastPublishedAt, 'JST', 'yyyy-MM-dd HH:mm:ss'),
      description: channelInfo.description,
      twitterLink: channelInfo.twitterLink,
      fetchedAt: new Date()
    };
  }

  /**
   * チャンネル情報を処理・フィルタリング（更新処理用）
   * 新しいメソッドを内部で使用し、一貫性を保つ
   * @param {Object} channel YouTube APIのチャンネルオブジェクト
   * @param {Object} filterStats フィルタリング統計（オプション）
   * @return {Object|null} 処理済みチャンネル情報、または除外される場合はnull
   */
  processChannel(channel, filterStats = null) {
    // ダミーの統計オブジェクトを用意（filterStatsがnullの場合）
    const stats = filterStats || {
      total: 0,
      subscriberCount: 0,
      excluded: 0,
      noPlaylist: 0,
      invalidPlaylist: 0,
      noVideos: 0,
      inactive: 0,
      passed: 0
    };

    // Phase 1: 基本情報でフィルタリング
    const basicInfo = this.filterChannelByBasicInfo(channel, stats);
    if (!basicInfo) {
      return null;
    }

    // Phase 2: 動画情報を付加
    const result = this.enrichChannelWithVideoData(basicInfo, stats);
    return result;
  }

  /**
   * 除外すべきチャンネルかチェック
   * @param {string} channelName チャンネル名
   * @param {string} description 説明文
   * @return {boolean} 除外すべき場合true
   */
  shouldExclude(channelName, description) {
    const text = (channelName + ' ' + description).toLowerCase();

    for (const keyword of this.excludedKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * 最近の動画を取得
   * @param {string} uploadsPlaylistId アップロードプレイリストID
   * @return {Array} 動画情報の配列
   */
  getRecentVideos(uploadsPlaylistId) {
    try {
      const response = YouTube.PlaylistItems.list('snippet', {
        playlistId: uploadsPlaylistId,
        maxResults: CONFIG.RECENT_VIDEOS_COUNT
      });

      // API使用量を記録
      if (this.quotaTracker) {
        this.quotaTracker.recordAPICall('YouTube.PlaylistItems.list');
      }

      if (response.items && response.items.length > 0) {
        return response.items.map(item => ({
          videoId: item.snippet.resourceId.videoId,
          publishedAt: item.snippet.publishedAt
        }));
      }

    } catch (error) {
      // プレイリストが見つからない場合は詳細なログを出力
      if (error.message.includes('playlistId') || error.message.includes('cannot be found')) {
        Logger.log(`プレイリスト未検出: ${uploadsPlaylistId} - チャンネルに動画がないか、非公開の可能性があります`);
      } else {
        Logger.log(`動画取得エラー (${uploadsPlaylistId}): ${error.message}`);
        this.errorLogger.logError(error, {
          functionName: 'getRecentVideos',
          apiName: 'YouTube.PlaylistItems.list',
          parameters: { uploadsPlaylistId: uploadsPlaylistId }
        });
      }
    }

    return [];
  }

  /**
   * 動画の詳細情報を取得
   * @param {Array} videoIds 動画ID一覧
   * @return {Array} 動画詳細情報の配列
   */
  getVideoDetails(videoIds) {
    if (videoIds.length === 0) return [];

    try {
      const response = YouTube.Videos.list('statistics', {
        id: videoIds.join(','),
        maxResults: videoIds.length
      });

      // API使用量を記録
      if (this.quotaTracker) {
        this.quotaTracker.recordAPICall('YouTube.Videos.list');
      }

      if (response.items) {
        return response.items.map(item => ({
          videoId: item.id,
          viewCount: parseInt(item.statistics.viewCount) || 0,
          likeCount: parseInt(item.statistics.likeCount) || 0,
          commentCount: parseInt(item.statistics.commentCount) || 0
        }));
      }

    } catch (error) {
      Logger.log(`動画詳細取得エラー: ${error.message}`);
      this.errorLogger.logError(error, {
        functionName: 'getVideoDetails',
        apiName: 'YouTube.Videos.list',
        parameters: { videoIds: videoIds.length }
      });
    }

    return [];
  }

  /**
   * 統計情報を計算
   * @param {Array} recentVideos 最近の動画一覧
   * @param {Array} videoDetails 動画詳細一覧
   * @return {Object} 統計情報
   */
  calculateStatistics(recentVideos, videoDetails) {
    if (videoDetails.length === 0) {
      return {
        uploadFrequency: 0,
        avgViewCount: 0,
        avgLikeCount: 0,
        avgCommentCount: 0
      };
    }

    // 投稿頻度の計算（本/月）
    let uploadFrequency = 0;
    if (recentVideos.length >= 2) {
      const oldestDate = new Date(recentVideos[recentVideos.length - 1].publishedAt);
      const newestDate = new Date(recentVideos[0].publishedAt);
      const daysDiff = (newestDate - oldestDate) / (1000 * 60 * 60 * 24);

      if (daysDiff > 0) {
        uploadFrequency = Math.round((recentVideos.length / daysDiff) * 30 * 10) / 10;
      }
    }

    // 平均値の計算
    const totalViews = videoDetails.reduce((sum, v) => sum + v.viewCount, 0);
    const totalLikes = videoDetails.reduce((sum, v) => sum + v.likeCount, 0);
    const totalComments = videoDetails.reduce((sum, v) => sum + v.commentCount, 0);

    return {
      uploadFrequency: uploadFrequency,
      avgViewCount: Math.round(totalViews / videoDetails.length),
      avgLikeCount: Math.round(totalLikes / videoDetails.length),
      avgCommentCount: Math.round(totalComments / videoDetails.length)
    };
  }

  /**
   * X（Twitter）リンクを抽出
   * @param {string} description チャンネル説明文
   * @return {string} TwitterリンクまたはN/A
   */
  extractTwitterLink(description) {
    if (!description) return 'N/A';

    // TwitterおよびXのURL正規表現（優先順位順）
    const urlPatterns = [
      // 完全なURL形式（http/httpsあり）
      /https?:\/\/(www\.)?(twitter|x)\.com\/([a-zA-Z0-9_]+)/gi,
      // URLスキームなし
      /(twitter|x)\.com\/([a-zA-Z0-9_]+)/gi,
    ];

    // まずURL形式を検索
    for (const pattern of urlPatterns) {
      const match = description.match(pattern);
      if (match) {
        let link = match[0];
        // httpsが含まれていない場合は追加
        if (!link.startsWith('http')) {
          link = 'https://' + link;
        }
        // twitter.comをx.comに統一
        link = link.replace('twitter.com', 'x.com');
        return link;
      }
    }

    // URL形式が見つからない場合は @ユーザー名 を検索
    // ただし、@の後にスペースや記号がない、有効なユーザー名のみ
    const mentionPattern = /@([a-zA-Z0-9_]{1,15})(?:\s|$|[^\w])/g;
    const mentionMatch = description.match(mentionPattern);
    if (mentionMatch) {
      // @マークとその後の文字を抽出
      const username = mentionMatch[0].match(/@([a-zA-Z0-9_]+)/)[1];
      return `https://x.com/${username}`;
    }

    // Twitterキーワードと共にユーザー名が記載されているパターン
    // 例: "Twitter: username" または "X: username"
    const keywordPattern = /(?:twitter|X|x)[\s:：]+([a-zA-Z0-9_]{1,15})/gi;
    const keywordMatch = description.match(keywordPattern);
    if (keywordMatch) {
      const username = keywordMatch[0].match(/([a-zA-Z0-9_]+)$/)[0];
      return `https://x.com/${username}`;
    }

    return 'N/A';
  }

  /**
   * 実行時間制限が近づいているかチェック
   * @return {boolean} 制限が近い場合true
   */
  isTimeoutApproaching() {
    const currentTime = new Date().getTime();
    const elapsedTime = (currentTime - this.startTime) / 1000;
    return elapsedTime > CONFIG.MAX_EXECUTION_TIME;
  }
}
