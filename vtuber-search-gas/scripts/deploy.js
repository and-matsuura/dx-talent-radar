#!/usr/bin/env node
/**
 * デプロイスクリプト
 * 
 * 既存のデプロイメントIDを使用してデプロイを更新します。
 * これにより、デプロイURLが変更されません。
 * 
 * 使用方法:
 * 1. 初回デプロイ: npm run deploy:new
 * 2. デプロイメントID確認: npm run deployments
 * 3. .clasp.json に deploymentId を設定
 * 4. 以降のデプロイ: npm run deploy
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLASP_JSON_PATH = path.join(__dirname, '..', '.clasp.json');
const DEPLOY_CONFIG_PATH = path.join(__dirname, '..', 'deploy.config.json');

function main() {
  console.log('🚀 VTuber Radar デプロイを開始します...\n');

  // まずpushを実行
  console.log('📤 コードをGASにプッシュ中...');
  try {
    execSync('npx clasp push', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (error) {
    console.error('❌ プッシュに失敗しました');
    process.exit(1);
  }

  // deploy.config.json からデプロイメントIDを読み込み
  let deploymentId = null;

  if (fs.existsSync(DEPLOY_CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(DEPLOY_CONFIG_PATH, 'utf8'));
      deploymentId = config.deploymentId;
    } catch (error) {
      console.warn('⚠️ deploy.config.json の読み込みに失敗しました');
    }
  }

  if (deploymentId) {
    // 既存のデプロイメントを更新
    console.log(`\n🔄 既存のデプロイメント (${deploymentId}) を更新中...`);
    try {
      execSync(`npx clasp deploy --deploymentId ${deploymentId} --description "VTuber Radar WebApp - ${new Date().toISOString()}"`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('\n✅ デプロイが完了しました！');
      console.log('🌐 WebアプリのURLは変更されていません');
    } catch (error) {
      console.error('❌ デプロイメントの更新に失敗しました');
      console.log('💡 デプロイメントIDが無効な可能性があります。npm run deploy:new で新しいデプロイメントを作成してください');
      process.exit(1);
    }
  } else {
    // 新規デプロイ
    console.log('\n📝 デプロイメントIDが設定されていません。新規デプロイを作成します...');
    try {
      const result = execSync('npx clasp deploy --description "VTuber Radar WebApp"', {
        encoding: 'utf8',
        cwd: path.join(__dirname, '..')
      });
      console.log(result);

      // デプロイメントIDを抽出して保存
      const match = result.match(/- ([A-Za-z0-9_-]+) @/);
      if (match) {
        const newDeploymentId = match[1];
        const config = { deploymentId: newDeploymentId };
        fs.writeFileSync(DEPLOY_CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log(`\n✅ デプロイメントIDを保存しました: ${newDeploymentId}`);
        console.log('📁 deploy.config.json が作成されました');
      }

      console.log('\n✅ 新規デプロイが完了しました！');
      console.log('💡 次回以降のデプロイでは同じURLが使用されます');
    } catch (error) {
      console.error('❌ 新規デプロイに失敗しました');
      process.exit(1);
    }
  }

  // デプロイメント一覧を表示
  console.log('\n📋 現在のデプロイメント一覧:');
  try {
    execSync('npx clasp deployments', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (error) {
    // 無視
  }

  console.log('\n🎉 すべて完了！');
  console.log('🌐 WebアプリをブラウザでテストするにはL npm run webapp:open を実行してください');
}

main();

