# JIDORIPANIC7

宣材用2ショットチェキ風画像を生成するWebアプリ。

🌐 **公開URL**: https://jidoripanic7.pages.dev/

## 概要

自撮り画像をアップロードすると、背景を自動で除去し、キャラクターと並んだチェキ風の画像を生成します。

## 技術スタック

- Vite + TypeScript
- 背景除去: [@imgly/background-removal](https://github.com/imgly/background-removal-js)（クライアントサイド処理）
- フォント: Zen Kurenaido
- ホスティング: Cloudflare Pages

## ライセンス

### コード

本プロジェクトのソースコードは **[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE)** の下で公開されています。

### キャラクター画像

リポジトリに含まれるキャラクター画像（`satoshi.png` など）は以下の著作権者が権利を保有しています:

**© MORI YUSAKU, GENDA SATOSHI, GUIDEWORKS**

- 商用利用・二次配布・転載は禁止です
- 本プロジェクトをフォーク・セルフホストする場合、**キャラクター画像を独自に用意する必要があります**
- キャラクター画像はAGPL-3.0の適用範囲外です

## セルフホストする場合の注意

1. リポジトリをクローン後、キャラクター画像は含まれない想定でコードを動作確認してください
2. 独自のキャラクター画像を `public/` または `src/assets/` に配置してください
3. 該当ファイルパスはソースコード内を参照

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## 著作権

- コード: Copyright (C) 2026 WAKKIN
- キャラクター: © MORI YUSAKU, GENDA SATOSHI, GUIDEWORKS
