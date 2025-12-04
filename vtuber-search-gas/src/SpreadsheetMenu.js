/**
 * スプレッドシートに直接追加する最小限のスクリプト
 * 
 * このファイルの内容を、スプレッドシートの「拡張機能」→「Apps Script」にコピー&ペーストしてください。
 * これにより、スプレッドシートを開くたびに自動でメニューが表示されます。
 * 
 * 注意: 実際の処理はStandaloneスクリプト側で実行されます。
 * このスクリプトはメニュー表示とStandaloneスクリプトの関数呼び出しのみを行います。
 */

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VTuber Radar')
    .addItem('チャンネルをURLで追加', 'showAddChannelDialog')
    .addSeparator()
    .addItem('スプレッドシートを初期化', 'callInitializeSpreadsheet')
    .addItem('除外キーワードシートを初期化', 'callInitializeExcludedKeywordsSheet')
    .addSeparator()
    .addItem('APIクォータを確認', 'callCheckAPIQuota')
    .addToUi();
}

/**
 * チャンネル追加ダイアログを表示
 * 注意: この関数はContainer-boundスクリプトから実行されますが、
 * 実際の処理はStandaloneスクリプト側で実行する必要があります。
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
    '• UCxxxxxxxxxxxxx\n\n' +
    '注意: この機能を使用するには、StandaloneスクリプトのGASエディタで\n' +
    '「addChannelManually」関数を実行してください。',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const channelIdentifier = response.getResponseText().trim();
    
    if (!channelIdentifier) {
      ui.alert('エラー', 'URLまたはチャンネルIDを入力してください。', ui.ButtonSet.OK);
      return;
    }
    
    // Standaloneスクリプトの関数を呼び出す方法を案内
    ui.alert(
      '実行方法',
      'チャンネルを追加するには、以下の手順を実行してください：\n\n' +
      '1. GASエディタでStandaloneスクリプトを開く\n' +
      '2. 「addChannelManually」関数を選択\n' +
      '3. 関数の引数に以下を指定して実行：\n' +
      `   addChannelManually("${channelIdentifier}")\n\n` +
      'または、Standaloneスクリプトで「createVTuberRadarMenu」関数を実行して、\n' +
      'メニューから直接実行できるようにすることもできます。',
      ui.ButtonSet.OK
    );
  }
}

/**
 * スプレッドシート初期化を呼び出す
 */
function callInitializeSpreadsheet() {
  SpreadsheetApp.getUi().alert(
    '実行方法',
    'この機能を使用するには、StandaloneスクリプトのGASエディタで\n' +
    '「initializeSpreadsheet」関数を実行してください。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * 除外キーワードシート初期化を呼び出す
 */
function callInitializeExcludedKeywordsSheet() {
  SpreadsheetApp.getUi().alert(
    '実行方法',
    'この機能を使用するには、StandaloneスクリプトのGASエディタで\n' +
    '「initializeExcludedKeywordsSheet」関数を実行してください。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * APIクォータ確認を呼び出す
 */
function callCheckAPIQuota() {
  SpreadsheetApp.getUi().alert(
    '実行方法',
    'この機能を使用するには、StandaloneスクリプトのGASエディタで\n' +
    '「checkAPIQuota」関数を実行してください。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
