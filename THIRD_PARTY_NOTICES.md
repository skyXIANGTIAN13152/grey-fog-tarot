# 数据与素材来源

本项目将牌库和图像保存在本地；抽牌、查牌与历史记录功能不依赖这些来源网站在线运行。核实日期：2026-11-06（Australia/Sydney）。

## 牌义数据：ekelen/tarot-api

- 仓库：<https://github.com/ekelen/tarot-api>
- 固定版本：`1a3cf8e17f036aeeb5d32fd6050deef5cced1662`
- 原始数据：<https://github.com/ekelen/tarot-api/blob/1a3cf8e17f036aeeb5d32fd6050deef5cced1662/static/card_data.json>
- 原始字段包括 `name`、`name_short`、`value`、`value_int`、`type`、`suit`（小阿卡纳）、`meaning_up`、`meaning_rev`、`desc`。本项目完整保留全部 78 条记录中的所有原始字段及其文本，不改写英文原文。原数据外层的 `nhits` 为 78，本地文件直接使用其中的 `cards` 数组。
- 上游 `package.json` 声明许可证为 **ISC**：<https://github.com/ekelen/tarot-api/blob/1a3cf8e17f036aeeb5d32fd6050deef5cced1662/package.json>。该版本未附独立 LICENSE 文件；不将 GitHub 的空许可证识别结果误写为 MIT。
- 上游 README 的 Local development 第 1 项明确欢迎将 JSON 数据用于自己的项目：<https://github.com/ekelen/tarot-api/blob/1a3cf8e17f036aeeb5d32fd6050deef5cced1662/README.md>。
- 数据作者：ekelen；原文来自 A. E. Waite 的 *The Pictorial Key to the Tarot*。这是古典牌义资料，包含其时代的观念与措辞，并不等同于现代牌义，也不构成事实预测。

本项目自行补充 `nameZh`、`meaningUpZh`、`meaningRevZh`、`descZh`。中文对应每张牌的英文内容，保留原文的多种解释、限定语与分歧；`descZh` 为逐牌译文，而非统一套用的牌面模板。中文名使用常见译名，例如原文 `Fortitude` 对应「力量」、`The Last Judgment` 对应「审判」。

上游的原始文本存在少量拼写、排版或截断问题，这些问题在英文字段中原样保留。特别是权杖五 `desc` 在一句话中途结束，中文字段明确标注原文中断；圣杯五 `desc` 本身重复了牌义与逆位内容，译文也保留了这些内容。

## 78 张牌面图像：Rider–Waite–Smith

- 原画作者：**Pamela Colman Smith**，Rider–Waite–Smith 牌组，1909 年出版。
- 图像归档：<https://archive.org/details/rider-waite-small-jpeg>
- 归档元数据：<https://archive.org/metadata/rider-waite-small-jpeg>
- 归档声明：**Creative Commons Public Domain Mark 1.0**，<https://creativecommons.org/publicdomain/mark/1.0/>。元数据中的 `licenseurl` 已核实为此链接。
- 实际下载镜像：J-York/TarotWhisper 的 `public/cards/`，固定版本 `e3a47f0376a87e19b779c99ad3842dde9d043266`。
- 镜像来源：<https://github.com/J-York/TarotWhisper/tree/e3a47f0376a87e19b779c99ad3842dde9d043266/public/cards>
- 该仓库的下载脚本明确将图像追溯至上述 Internet Archive 归档：<https://github.com/J-York/TarotWhisper/blob/e3a47f0376a87e19b779c99ad3842dde9d043266/scripts/download-cards.js>。

本项目没有修改牌面图像，仅以 tarot-api 的 `name_short` 重命名以建立稳定映射。图像均为正向 JPEG；需要逆位时在界面中旋转呈现。每张图像的镜像来源、归档原始 URL、大小与 SHA-256 见 `public/cards/PROVENANCE.json`。

TarotWhisper 的 MIT 许可只覆盖其源码，不覆盖牌面素材；本项目牌面的来源标识采用归档所声明的 Public Domain Mark，不以其源码 MIT 许可代替图像来源说明。本项目仅复用该仓库中的牌面图像，没有复制它的网站源码。

## 主题说明

入场及桌面使用的灰雾殿堂插画为本项目通过 AI 生成的原创场景。酒红烫金牌背、塔罗会印章和牌阵示意图均为本项目绘制，随本地网站提供。

「灰雾之上」的界面以用户指定的《诡秘之主》氛围为灵感，界面排版、装饰与交互为本项目编写；不宣称与原作或权利方存在官方关系。本项目所列第三方牌面是上文注明来源的 Rider–Waite–Smith 图像。
