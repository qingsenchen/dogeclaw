<p align="center">
  <img src="icons/icon-128.png" alt="onecai" width="96" height="96">
</p>

<h1 align="center">onecai</h1>

<p align="center">
  デスクトップペット風の AI アシスタントを Web ページ上で使える Chrome MV3 拡張機能です。
</p>

<p align="center">
  <a href="README.md">English</a>
  · <a href="README.zh-CN.md">简体中文</a>
  · 日本語
</p>

<p align="center">
  <a href="#features">Features</a>
  · <a href="#demo">Demo</a>
  · <a href="#quick-start">Quick Start</a>
  · <a href="#configuration">Configuration</a>
  · <a href="#usage">Usage</a>
  · <a href="#privacy-and-permissions">Privacy</a>
  · <a href="#development">Development</a>
</p>

## Overview

onecai、別名 汪柴 は、Chrome Manifest V3 ベースのブラウザ AI アシスタント拡張機能です。Web ページにドラッグ可能なフローティングペットを追加し、ページ内チャット、OpenAI-compatible LLM Provider、ツール呼び出し、ブラウザ操作、選択テキストの送信、任意の WeChat チャンネル連携をサポートします。

このプロジェクトは、ローカルで unpacked extension として読み込んで使うことを想定しています。API Key は同梱していません。

## Demo

<p align="center">
  <img src="docs/demo.gif" alt="onecai demo" width="720">
</p>

## Features

- Web ページ上に表示される、ドラッグ可能なデスクトップペット風アシスタント
- Chrome 拡張機能アイコンからページ単位で有効化・無効化
- ストリーミング LLM 応答に対応したページ内チャット UI
- OpenAI-compatible モデルプロバイダー設定
- ツール呼び出しとブラウザ制御に対応した agent loop
- 天気検索ツール
- 選択テキストを onecai に送る右クリックメニュー
- 任意の WeChat チャンネルログイン、ポーリング、メッセージ処理、メディア対応

## Quick Start

1. このリポジトリを clone または download します。
2. Chrome で `chrome://extensions/` を開きます。
3. Developer mode を有効にします。
4. Load unpacked をクリックします。
5. プロジェクトディレクトリを選択します。
6. 任意の Web ページを開く、または更新します。右下に onecai のフローティングボタンが表示されます。

拡張機能のファイルを変更した後は、`chrome://extensions/` の拡張機能カードで Reload をクリックし、対象ページを更新してください。

## Configuration

### LLM Provider

onecai は OpenAI-compatible Chat Completions API を使用します。チャット機能を使う前に、自分のプロバイダーを設定してください。

onecai のフローティングパネルを開き、LLM Provider 設定画面で以下を入力します。

- Base URL、例: `https://ai.gitee.com/v1`
- Model、例: `Qwen3.6-27B`
- 利用するプロバイダーの API Key

`model` と `apiBase` は、OpenAI、DashScope-compatible gateway、DeepSeek-compatible gateway、その他の OpenAI-compatible サービスに置き換えられます。

### Debug Logging

LLM debug logging はデフォルトで無効です。`config.js` で有効にすると、リクエストとレスポンスのペイロードがブラウザコンソールに出力される場合があります。プライベートなページ内容や機密性の高い prompt を扱うときは、有効化を避けてください。

## Usage

### onecai を開く・切り替える

Chrome ツールバーの onecai アイコンをクリックすると、現在のページでフローティングアシスタントを有効化または無効化できます。インストール後や再読み込み後に表示されない場合は、対象ページを更新してください。

### モデルプロバイダーを設定する

フローティングパネルを開き、LLM Provider 設定画面で Base URL、モデル名、API Key を保存します。API Key は Chrome 拡張機能のローカルストレージに保存され、このリポジトリにはコミットされません。

### ページ上でチャットする

フローティングペットをクリックするとチャットパネルが開きます。質問、ページ内容の要約、ブラウザ操作の依頼、対応ツールの利用ができます。設定したプロバイダーが streaming に対応している場合、応答はパネルに逐次表示されます。

### 選択テキストを送る

任意の Web ページでテキストを選択し、右クリックメニューから onecai の項目を選ぶと、選択内容をアシスタント入力欄に送れます。要約、翻訳、書き換え、特定箇所への追加質問に便利です。

### ブラウザ操作とツール

onecai は天気検索やブラウザ制御ヘルパーなどの対応ツールを呼び出せます。ブラウザ操作はユーザー指示に基づく自動化として扱い、プライベートなページや機密情報を含む内容を送る前に確認してください。

### WeChat チャンネル

WeChat チャンネルを有効にする場合は、フローティングパネルからチャンネル設定画面を開き、ログインフローに従って設定します。設定後、onecai はチャンネルをポーリングし、受信メッセージを処理し、設定済みの LLM Provider を使って返信できます。

### Troubleshooting

- ローカルファイルを変更した後は、`chrome://extensions/` で拡張機能を Reload してください。
- 拡張機能を Reload した後は、対象ページを更新してください。
- チャット応答に失敗する場合は、LLM Provider 設定画面を開き、Base URL、モデル名、API Key が正しいか確認してください。
- 開発時のエラーは、拡張機能の Service Worker console で確認できます。

## Privacy and Permissions

onecai は以下の Chrome 拡張機能 permissions を要求します。

- `activeTab`: 現在アクティブなページとやり取りするため
- `scripting`: ページへ拡張機能スクリプトを注入するため
- `storage`: ローカル設定とチャンネル状態を保存するため
- `alarms`: ポーリングタスクをスケジュールするため
- `tabs`: ページ単位のアシスタント状態とブラウザ操作を調整するため
- `contextMenus`: 選択テキスト用の右クリックメニューを追加するため
- `<all_urls>` host access: Web ページ上でアシスタント UI を読み込むため

onecai に送信した内容、入力メッセージ、選択テキスト、ページコンテキスト、スクリーンショット、ツール結果などは、設定した LLM Provider に送信される場合があります。機密情報を送る前に、利用するプロバイダーのデータポリシーを確認してください。

このリポジトリには API Key は含まれていません。自分の Key は Chrome 拡張機能のローカルストレージにのみ保存してください。

## Project Structure

```text
.
├── manifest.json              # Chrome Manifest V3 extension manifest
├── config.js                  # Runtime defaults and storage keys
├── background.js              # Service worker, agent routing, tools, channels
├── content.js                 # In-page assistant UI and page bridge
├── ui.js                      # Shared UI rendering helpers
├── pet.js                     # Floating pet animation and interaction logic
├── llm.js                     # OpenAI-compatible LLM client
├── agent.js                   # Agent loop and streaming orchestration
├── tools.js                   # Tool definitions exposed to the agent
├── browser.js                 # Browser-control helpers
├── channels/
│   └── wechat.js              # WeChat channel, login, polling, media handling
├── vendor/
│   └── qrcode-generator.js    # Third-party QR code generator, MIT licensed
└── icons/                     # Extension icons
```

## Development

JavaScript 構文チェックを実行します。

```sh
node --check background.js
node --check channels/wechat.js
node --check content.js
node --check llm.js
```

公開前には以下のチェックを推奨します。

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
node --check background.js
node --check channels/wechat.js
node --check content.js
node --check llm.js
```

このリポジトリでは、ローカル認証情報、ビルド成果物、ブラウザ拡張機能パッケージ、環境ファイルをコミットしない方針です。

## Third-Party Notices

- `vendor/qrcode-generator.js` は Kazuhiko Arase による QR Code Generator for JavaScript をベースにしており、MIT License で提供されています。

## License

MIT。詳細は [LICENSE](LICENSE) を参照してください。
