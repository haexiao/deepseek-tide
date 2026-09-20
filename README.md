# deepseek-tide

Hermes 桌面插件 —— DeepSeek 峰谷计价潮汐指示器(状态栏实时显示)。

在 Hermes 桌面应用的底部状态栏显示当前是高峰还是空闲时段、距下次切换的倒计时,以及对应的分档价格。

## 功能

- **纯本地时钟计算** —— 无 API、无网络、无密钥,不依赖 `DEEPSEEK_API_KEY`
- 状态栏实时显示:`F⛰️ 高峰 9:00-12:00 剩余1:32:30 · 缓存¥0.04 输入¥2 输出¥8`
- **每秒刷新**倒计时,精确到秒
- 颜色指示:高峰橙色 ⛰️ / 空闲绿色 🌙
- **点击切换 Flash / Pro 价格**,标签前缀 `F` / `P` 标识当前档位,**选择会被记住**(重载插件、重启应用后保持)
- **多语言** —— 界面文案提供简体中文 / 繁體中文 / English / 日本語 四套,随应用语言自动切换
- **内置 2026 年法定节假日历** —— 节假日当天按空闲时段处理,倒计时自动指向下一个工作日(调休上班的周末仍算空闲,与官方「仅周一至周五为高峰」的规则一致)
- 悬停显示完整计价详情(北京时间、窗口规则、当前档位价格表)

## 峰谷规则

DeepSeek 自 **2026-08-17** 起实行峰谷分档计价(北京时间):

| 时段 | 时间 | 价格 |
|------|------|------|
| ⛰️ 高峰 | 周一至周五 9:00–12:00、14:00–18:00 | 全价 |
| 🌙 空闲 | 其余时间(含整个周末与法定节假日) | **半价** |

> 高峰时段不含**中国法定节假日**:节假日在工作日时同样按空闲计费(依据官方定价页脚注)。

### 当前价格(元 / 百万 tokens)

**Flash** —— `deepseek-flash`(DeepSeek-V4.1-Flash;旧名 `deepseek-v4-flash` 仍可调用,请求由 V4.1-Flash 提供),2026-09-10 12:00 起生效:

| 计费项 | 空闲时段 | 高峰时段 |
|--------|---------|---------|
| 输入(缓存命中) | ¥0.02 | ¥0.04 |
| 输入(缓存未命中) | ¥1 | ¥2 |
| 输出 | ¥4 | ¥8 |

**Pro** —— `deepseek-v4-pro`(DeepSeek-V4-Pro-0813),2026-08-17 定价,至今未变:

| 计费项 | 空闲时段 | 高峰时段 |
|--------|---------|---------|
| 输入(缓存命中) | ¥0.15 | ¥0.30 |
| 输入(缓存未命中) | ¥4.5 | ¥9.0 |
| 输出 | ¥13.5 | ¥27.0 |

> ✅ **V4 Pro 继续提供服务** —— 官方已于 2026-09-10 取消原定的下线计划,`deepseek-v4-pro` 的计费方式保持不变。

📜 DeepSeek API 的**完整调价史**见 **[PRICE-HISTORY.md](./PRICE-HISTORY.md)**(2024-04 首次公开定价至今);版本变更见 **[CHANGELOG.md](./CHANGELOG.md)**。

## 安装

```bash
mkdir -p ~/.hermes/desktop-plugins/deepseek-tide
cp desktop-plugin/plugin.js ~/.hermes/desktop-plugins/deepseek-tide/
```

然后按 `Ctrl+K` → **"Reload desktop plugins"**(macOS 为 `⌘K`),状态栏即显示潮汐指示。

### Agent 安装方式

如果你在跟 Hermes agent 对话,直接复制这条消息发给它:

```
帮我安装 deepseek-tide 插件:
1. 克隆 https://github.com/haexiao/deepseek-tide.git 到临时目录
2. 把 desktop-plugin/plugin.js 复制到 ~/.hermes/desktop-plugins/deepseek-tide/
3. 运行 Ctrl+K → "Reload desktop plugins"
```

## 依赖

无。纯前端本地时钟逻辑,不需要任何 API key 或网络连接。

## 实现说明

遵循 Hermes 桌面插件 SDK 规范:

| 项目 | 做法 |
|------|------|
| 字体/颜色 | 全部使用主题变量(`--ui-orange`、`--ui-green`、`--chrome-action-hover`),随主题自动换肤 |
| 区域注册 | `STATUSBAR_AREAS.right` 常量 |
| 多语言 | `ctx.i18n.register({ en, zh, 'zh-hant', ja })` + `usePluginI18n(id)`,`en` 为兜底层 |
| 偏好持久化 | `ctx.storage`(键自动命名空间化为 `hermes.plugin.deepseek-tide.*`) |
| 节假日历 | `HOLIDAYS` 为内置的北京日期集合(2026 年 33 天,依据国办发明电〔2025〕7号);未收录的年份退回「仅周末空闲」 |
| 依赖 | 仅 `@hermes/plugin-sdk` 与 `react` |

价格常量位于 `plugin.js` 的 `PRICES`;官方调价时需同步更新常量,并在 `PRICE-HISTORY.md` 追加一期记录。

## 已知限制

- 节假日历目前只收录 2026 年 —— 国务院一般于前一年 11 月公布次年安排,公布后需在 `plugin.js` 的 `HOLIDAYS` 中补入;未收录的年份按「仅周末空闲」处理
- 价格为内置常量,不会自动联网更新(设计如此:零网络依赖)

## 许可

[MIT](./LICENSE) © 2026 haexiao

当前版本:**v1.4.2**(2026-09-20)
