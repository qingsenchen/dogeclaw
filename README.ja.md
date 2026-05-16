<p align="center">
  <img src="icons/icon-128.png" alt="dogeclaw" width="96" height="96">
</p>

<h1 align="center">dogeclaw</h1>

<p align="center">
  Chrome 向けの browser-side agent として、site-specific tools、ページ内チャット、自動化を提供します。
</p>

<p align="center">
  <a href="README.md">English</a>
  · <a href="README.zh-CN.md">简体中文</a>
  · 日本語
</p>

<p align="center">
  <a href="#features">Features</a>
  · <a href="#demo">Demo</a>
  · <a href="#why-dogeclaw">Why dogeclaw?</a>
  · <a href="#quick-start">Quick Start</a>
  · <a href="#configuration">Configuration</a>
  · <a href="#usage">Usage</a>
  · <a href="#privacy-and-permissions">Privacy</a>
  · <a href="#development">Development</a>
</p>

## Overview

dogeclaw は、Chrome Manifest V3 ベースのブラウザ AI アシスタント拡張機能です。Web ページにドラッグ可能なフローティングペットを追加し、ページ内チャット、OpenAI-compatible LLM Provider、ツール呼び出し、ブラウザ操作、選択テキストの送信、任意の WeChat チャンネル連携をサポートします。

このプロジェクトは、ローカルで unpacked extension として読み込んで使うことを想定しています。API Key は同梱していません。

## Why dogeclaw?

dogeclaw は browser-side agent を目指しています。株式取引サイト、EC 管理画面、分析ダッシュボード、業務システムなど、多くの専門的な Web サイトは、ページ構造やドメイン固有のワークフローが大きく異なります。そのため、汎用的なページ理解だけで純粋な AI 操作にすべてを任せると、安定してタスクを完了することが難しくなります。

dogeclaw の方針は、サイトやワークフローごとにカスタム tool call を用意することです。AI にピクセルや DOM snapshot からすべての操作を推測させるのではなく、対象サイトの振る舞いを理解した browser-side tool を提供します。これにより、汎用ブラウザ自動化だけでは難しい機能も、より安定して実行できます。

openclaw と比べると、dogeclaw は設定を減らし、ブラウザへ直接読み込んで使いやすい形を重視しています。ただし、dogeclaw は openclaw を置き換えるものではありません。目標は openclaw の有力な補助役になることです。今後は A2A protocol を通じて openclaw と連携し、openclaw がより広い agent orchestration を担い、dogeclaw が専門サイト上の browser-side action や site-specific tools を担当する形を目指します。

つまり、dogeclaw と openclaw は補完関係にあります。dogeclaw は実用的な browser-side agent 能力、特に汎用 AI 操作だけでは完了しにくい専門サイト向けのカスタム tool call に注力します。

## Demo

<p align="center">
  <img src="docs/demo.gif" alt="dogeclaw demo" width="720">
</p>

## Features

- Web ページ上に表示される、ドラッグ可能なデスクトップペット風アシスタント
- Chrome 拡張機能アイコンからページ単位で有効化・無効化
- ストリーミング LLM 応答に対応したページ内チャット UI
- OpenAI-compatible モデルプロバイダー設定
- ツール呼び出しとブラウザ制御に対応した agent loop
- 天気検索ツール
- 選択テキストを dogeclaw に送る右クリックメニュー
- 任意の WeChat チャンネルログイン、ポーリング、メッセージ処理、メディア対応
- English、簡体中文、日本語のローカライズを内蔵

## Quick Start

1. このリポジトリを clone または download します。
2. Chrome で `chrome://extensions/` を開きます。
3. Developer mode を有効にします。
4. Load unpacked をクリックします。
5. プロジェクトディレクトリを選択します。
6. 任意の Web ページを開く、または更新します。右下に dogeclaw のフローティングボタンが表示されます。

拡張機能のファイルを変更した後は、`chrome://extensions/` の拡張機能カードで Reload をクリックし、対象ページを更新してください。

## Configuration

### LLM Provider

dogeclaw は OpenAI-compatible Chat Completions API を使用します。チャット機能を使う前に、自分のプロバイダーを設定してください。

dogeclaw のフローティングパネルを開き、LLM Provider 設定画面で以下を入力します。

- Base URL、例: `https://api.openai.com/v1`
- Model、例: `gpt-4o-mini`
- 利用するプロバイダーの API Key

`model` と `apiBase` は、OpenAI、DashScope-compatible gateway、DeepSeek-compatible gateway、その他の OpenAI-compatible サービスに置き換えられます。

### Debug Logging

LLM debug logging はデフォルトで無効です。`config.js` で有効にすると、リクエストとレスポンスのペイロードがブラウザコンソールに出力される場合があります。プライベートなページ内容や機密性の高い prompt を扱うときは、有効化を避けてください。

## Usage

### dogeclaw を開く・切り替える

Chrome ツールバーの dogeclaw アイコンをクリックすると、現在のページでフローティングアシスタントを有効化または無効化できます。インストール後や再読み込み後に表示されない場合は、対象ページを更新してください。

### モデルプロバイダーを設定する

フローティングパネルを開き、LLM Provider 設定画面で Base URL、モデル名、API Key を保存します。API Key は Chrome 拡張機能のローカルストレージに保存され、このリポジトリにはコミットされません。

### ページ上でチャットする

フローティングペットをクリックするとチャットパネルが開きます。質問、ページ内容の要約、ブラウザ操作の依頼、対応ツールの利用ができます。設定したプロバイダーが streaming に対応している場合、応答はパネルに逐次表示されます。

### 選択テキストを送る

任意の Web ページでテキストを選択し、右クリックメニューから dogeclaw の項目を選ぶと、選択内容をアシスタント入力欄に送れます。要約、翻訳、書き換え、特定箇所への追加質問に便利です。

### ブラウザ操作とツール

dogeclaw は天気検索やブラウザ制御ヘルパーなどの対応ツールを呼び出せます。ブラウザ操作はユーザー指示に基づく自動化として扱い、プライベートなページや機密情報を含む内容を送る前に確認してください。

### WeChat チャンネル

WeChat チャンネルを有効にする場合は、フローティングパネルからチャンネル設定画面を開き、ログインフローに従って設定します。設定後、dogeclaw はチャンネルをポーリングし、受信メッセージを処理し、設定済みの LLM Provider を使って返信できます。

### Troubleshooting

- ローカルファイルを変更した後は、`chrome://extensions/` で拡張機能を Reload してください。
- 拡張機能を Reload した後は、対象ページを更新してください。
- チャット応答に失敗する場合は、LLM Provider 設定画面を開き、Base URL、モデル名、API Key が正しいか確認してください。
- 開発時のエラーは、拡張機能の Service Worker console で確認できます。

## Privacy and Permissions

dogeclaw は以下の Chrome 拡張機能 permissions を要求します。

- `activeTab`: 現在アクティブなページとやり取りするため
- `scripting`: ページへ拡張機能スクリプトを注入するため
- `storage`: ローカル設定とチャンネル状態を保存するため
- `alarms`: ポーリングタスクをスケジュールするため
- `tabs`: ページ単位のアシスタント状態とブラウザ操作を調整するため
- `contextMenus`: 選択テキスト用の右クリックメニューを追加するため
- `downloads`: ダウンロード操作でユーザーが選択したページ資産を保存するため
- `<all_urls>` host access: Web ページ上でアシスタント UI を読み込むため

dogeclaw に送信した内容、入力メッセージ、選択テキスト、ページコンテキスト、スクリーンショット、ツール結果などは、設定した LLM Provider に送信される場合があります。機密情報を送る前に、利用するプロバイダーのデータポリシーを確認してください。

このリポジトリには API Key は含まれていません。自分の Key は Chrome 拡張機能のローカルストレージにのみ保存してください。

## Project Structure

```text
.
├── manifest.json              # Chrome local development manifest
├── manifest/                  # Browser target-specific manifest templates
├── scripts/build-extension.mjs # Chrome, Edge, and Firefox build script
├── _locales/                  # Chrome WebExtension locale messages
├── platform/
│   └── extension-api.js       # Cross-browser extension API adapter
├── config.js                  # Runtime defaults and storage keys
├── i18n.js                    # Runtime localization dictionaries and helpers
├── background.js              # Background agent routing, tools, channels
├── background-loader.js       # Chrome/Edge Service Worker script loader
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

### Local Browser Loading

Chrome と Edge の日常開発では、リポジトリのルートディレクトリを直接読み込めます。ルートの `manifest.json` は Chromium MV3 開発用 manifest です。

- Chrome: `chrome://extensions/` を開き、Developer mode を有効にして Load unpacked からリポジトリルートを選択します。
- Edge: `edge://extensions/` を開き、Developer mode を有効にして Load unpacked からリポジトリルートを選択します。

ファイルを変更した後は、ブラウザの拡張機能ページで拡張機能を reload し、テスト対象ページも更新してください。

Firefox は background loading の形が異なるため、生成された Firefox build を使うことを推奨します。

```sh
npm run build:firefox
```

その後 `about:debugging#/runtime/this-firefox` を開き、Load Temporary Add-on から `dist/firefox/manifest.json` を選択します。変更後は Firefox build を再生成し、一時アドオンを reload してください。

ブラウザ別の拡張機能ディレクトリをビルドします。

```sh
npm run build:chrome
npm run build:edge
npm run build:firefox
```

生成物は `dist/<target>` に出力されます。ルートの `manifest.json` は Chrome のローカル開発用として残し、生成される manifest でブラウザごとの background loading と互換性差分を分離します。

JavaScript 構文チェックを実行します。

```sh
npm run check
```

公開前には以下のチェックを推奨します。

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
npm run check
```

Browser API を追加する場合は、機能モジュールから `chrome.*` や `browser.*` を直接呼ばず、`platform/extension-api.js` を経由してください。Chrome、Edge、Firefox の互換性対応を platform layer と manifest templates に集約できます。

このリポジトリでは、ローカル認証情報、ビルド成果物、ブラウザ拡張機能パッケージ、環境ファイルをコミットしない方針です。

## Contributing

Contributions are welcome, especially for browser-side agent capabilities, site-specific tools, LLM provider compatibility, WeChat channel reliability, documentation, and i18n.

Before opening a pull request:

- Fork the repository and create a focused feature branch from `main`.
- Load the extension locally with Chrome Developer mode and test the changed workflow.
- Run the JavaScript syntax checks listed above.
- Run the basic secret scan listed above.
- Update English, Simplified Chinese, and Japanese i18n strings when changing user-visible text.
- Do not commit API keys, tokens, cookies, local logs, `.env` files, generated extension packages, or private screenshots.

Please include a clear description, manual testing steps, affected pages or browsers, and screenshots or GIFs when the change affects UI behavior.

For more details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Third-Party Notices

- `vendor/qrcode-generator.js` は Kazuhiko Arase による QR Code Generator for JavaScript をベースにしており、MIT License で提供されています。

## License

MIT。詳細は [LICENSE](LICENSE) を参照してください。
