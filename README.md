# JIDORIPANIC7

> ⚠️ **IMPORTANT / 重要な注意事項** ⚠️
>
> **English**: The character images included in this repository (`satoshi.webp`, `cheki_00.png`, etc.) are copyrighted by **© MORI YUSAKU, GENDA SATOSHI, GUIDEWORKS**. These images are **NOT** licensed under AGPL-3.0. Redistribution, commercial use, modification, or any secondary use of the character images is **STRICTLY PROHIBITED** without explicit permission from the copyright holders.
>
> **日本語**: 本リポジトリに含まれるキャラクター画像（`satoshi.webp`, `cheki_00.png` など）は **© MORI YUSAKU, GENDA SATOSHI, GUIDEWORKS** が著作権を保有しています。これらの画像は **AGPL-3.0 の適用範囲外** です。キャラクター画像の**二次配布・商用利用・改変・その他二次利用は著作権者の明示的な許諾なく行うことを固く禁じます**。

---

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

本プロジェクトは**デュアルライセンス**構成です。

### コード部分（AGPL-3.0）

ソースコード（`.ts`, `.html`, `.css`, 設定ファイル等）は **[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE)** の下で公開されています。

- 改変・再配布自由（ただしAGPL-3.0の条項に従うこと）
- ネットワーク経由で利用させる場合、利用者にソースコードを提供する義務あり

### キャラクター画像（All Rights Reserved）

以下のファイルは **AGPL-3.0 の適用範囲外** です:

- `public/satoshi.webp`
- `public/cheki_00.png`
- `public/example_pet.webp`
- `public/back.png`

**Copyright © MORI YUSAKU, GENDA SATOSHI, GUIDEWORKS. All Rights Reserved.**

以下の行為を**禁止**します:
- 再配布（ファイル単体または組み込み問わず）
- 商用利用
- 改変・加工・派生物の作成
- 本プロジェクト以外のサービス・製品への転用
- SNS等での無断転載（本サービス上で生成された画像を個人が楽しむ範囲を除く）

## セルフホストする場合の注意

**本プロジェクトをフォーク・セルフホストする場合、キャラクター画像を独自に用意する必要があります。** GUIDEWORKS のキャラクター画像をそのまま使用することは著作権侵害となります。

画像参照箇所:
- `index.html` の OGP/Twitter Card メタタグ
- `src/main.ts` の `loadImage()` 呼び出し（L424-426）

これらを自分のアセットに差し替えてから使用してください。

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

- **コード**: Copyright (C) 2026 WAKKIN
- **キャラクター画像**: © MORI YUSAKU, GENDA SATOSHI, GUIDEWORKS

## お問い合わせ

キャラクター画像の使用許諾に関する問い合わせは GUIDEWORKS にお願いします。
