/**
 * ライブ配信監視クラス
 * YouTube Data APIを使用してライブ配信をチェックし、同時接続数を記録
 */

class LiveStreamMonitor {
  constructor() {
    this.sheetManager = new SpreadsheetManager();
    this.startTime = new Date().getTime();
  }

  /**
   * ライブ配信監視を実行
   */
  monitorLiveStreams() {
    Logger.log('=== ライブ配信監視開始 ===');

    if (!CONFIG.LIVE_STREAM_CHECK_ENABLED) {
      Logger.log('ライブ配信チェック機能が無効になっています');
      return;
    }

    // 監視対象のチャンネルを取得
    const monitoredChannels = this.sheetManager.getMonitoredChannels();
    Logger.log(`監視対象チャンネル数: ${monitoredChannels.length}`);

    if (monitoredChannels.length === 0) {
      Logger.log('監視対象のチャンネルがありません');
      return;
    }

    // 同時接続数シートを初期化
    this.sheetManager.initializeViewerCountSheet();

    let checkedCount = 0;
    let liveStreamCount = 0;

    // 各チャンネルのライブ配信をチェック
    for (const channel of monitoredChannels) {
      try {
        const liveStream = this.checkLiveStream(channel.channelId, channel.channelName);

        if (liveStream) {
          liveStreamCount++;

          // 同時接続数を記録
          this.sheetManager.recordViewerCount({
            channelId: channel.channelId,
            channelName: channel.channelName,
            title: liveStream.title,
            url: liveStream.url,
            viewerCount: liveStream.viewerCount,
            recordedAt: new Date(),
            status: liveStream.status
          });

          // 最大同時接続数を更新
          this.sheetManager.updateMaxViewerCount(
            channel.channelId,
            liveStream.viewerCount,
            new Date()
          );

          Logger.log(`ライブ配信検出: ${channel.channelName} - ${liveStream.viewerCount}人視聴中`);
        }

        checkedCount++;

        // 実行時間チェック
        if (this.isTimeoutApproaching()) {
          Logger.log('実行時間制限が近づいています。監視を中断します。');
          break;
        }

        // API制限を考慮した待機
        Utilities.sleep(100);

      } catch (error) {
        Logger.log(`チャンネル ${channel.channelName} のチェックエラー: ${error.message}`);
      }
    }

    Logger.log(`チェック完了: ${checkedCount}/${monitoredChannels.length}チャンネル`);
    Logger.log(`ライブ配信中: ${liveStreamCount}件`);
    Logger.log('=== ライブ配信監視完了 ===');
  }

  /**
   * チャンネルのライブ配信をチェック
   * @param {string} channelId チャンネルID
   * @param {string} channelName チャンネル名
   * @return {Object|null} ライブ配信情報、または配信していない場合はnull
   */
  checkLiveStream(channelId, channelName) {
    try {
      // YouTube Data API: search.list でライブ配信を検索
      const response = YouTube.Search.list('snippet', {
        channelId: channelId,
        type: 'video',
        eventType: 'live', // ライブ配信中のみ
        maxResults: 1
      });

      if (response.items && response.items.length > 0) {
        const liveVideo = response.items[0];
        const videoId = liveVideo.id.videoId;

        // 動画の詳細情報を取得（同時接続数を取得するため）
        const videoDetails = this.getVideoDetails(videoId);

        if (videoDetails) {
          return {
            videoId: videoId,
            title: liveVideo.snippet.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            viewerCount: videoDetails.viewerCount,
            status: videoDetails.status
          };
        }
      }

      return null;

    } catch (error) {
      // ライブ配信がない場合やAPIエラーの場合
      if (!error.message.includes('quotaExceeded')) {
        Logger.log(`ライブ配信チェックエラー (${channelName}): ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 動画の詳細情報を取得（同時接続数含む）
   * @param {string} videoId 動画ID
   * @return {Object|null} 動画詳細情報
   */
  getVideoDetails(videoId) {
    try {
      const response = YouTube.Videos.list('liveStreamingDetails,snippet', {
        id: videoId
      });

      if (response.items && response.items.length > 0) {
        const video = response.items[0];
        const liveDetails = video.liveStreamingDetails;

        // ライブ配信の詳細情報がない場合は配信終了済み
        if (!liveDetails) {
          return null;
        }

        return {
          viewerCount: parseInt(liveDetails.concurrentViewers) || 0,
          status: this.determineStatus(video.snippet.liveBroadcastContent, liveDetails)
        };
      }

      return null;

    } catch (error) {
      Logger.log(`動画詳細取得エラー (${videoId}): ${error.message}`);
      return null;
    }
  }

  /**
   * 配信ステータスを判定
   * @param {string} liveBroadcastContent ライブ配信コンテンツタイプ
   * @param {Object} liveDetails ライブ配信詳細
   * @return {string} ステータス
   */
  determineStatus(liveBroadcastContent, liveDetails) {
    if (liveBroadcastContent === 'live') {
      return 'ライブ配信中';
    } else if (liveBroadcastContent === 'upcoming') {
      return 'プレミア公開予定';
    } else if (liveBroadcastContent === 'none') {
      return '配信終了';
    }
    return '不明';
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
