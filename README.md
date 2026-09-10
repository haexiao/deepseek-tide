# deepseek-tide

Hermes 桌面插件 —— DeepSeek 峰谷计价潮汐指示器(状态栏实时显示)。

在 Hermes 桌面应用的底部状态栏显示当前是高峰还是空闲时段、距下次切换的倒计时,以及对应的分档价格。

## 功能

- **纯本地时钟计算** —— 无 API、无网络、无密钥,不依赖 `DEEPSEEK_API_KEY`
- 状态栏实时显示:`F⛰️ 高峰 9:00-12:00 剩余1:32:30 · 缓存¥0.04 输入¥2 输出¥8`
- **每秒刷新**倒计时,精确到秒
- 颜色指示:高峰橙色 ⛰️ / 空闲绿色 🌙
- **点击切换 Flash / Pro 价格**,标签前缀 `F` / `P` 标识当前档位
- 悬停显示完整计价详情(北京时间、窗口规则、当前档位价格表)

## 峰谷规则

DeepSeek 自 **2026-08-17** 起实行峰谷分档计价(北京时间):

| 时段 | 时间 | 价格 |
|------|------|------|
| ⛰️ 高峰 | 周一至周五 9:00–12:00、14:00–18:00 | 全价 |
| 🌙 空闲 | 其余时间(含整个周末) | **半价** |

### 当前价格(元 / 百万 tokens)

**Flash** —— `deepseek-v4-flash`,2026-09-10 12:00 起生效:

| 计费项 | 空闲时段 | 高峰时段 |
|--------|---------|---------|
| 输入(缓存命中) | ¥0.02 | ¥0.04 |
| 输入(缓存未命中) | ¥1 | ¥2 |
| 输出 | ¥4 | ¥8 |

**Pro** —— `deepseek-v4-pro`,2026-08-17 定价,至今未变:

| 计费项 | 空闲时段 | 高峰时段 |
|--------|---------|---------|
| 输入(缓存命中) | ¥0.15 | ¥0.30 |
| 输入(缓存未命中) | ¥4.5 | ¥9.0 |
| 输出 | ¥13.5 | ¥27.0 |

> ⏳ **2026-09-14 12:00 起 V4 Pro 下线**:届时访问 `deepseek-v4-pro` 的请求将路由至 V4.1 Flash,并按 V4.1 Flash 价格计费。

📜 DeepSeek API 的**完整调价史**见 **[PRICE-HISTORY.md](./PRICE-HISTORY.md)**(2024-04 首次公开定价至今);版本变更见 **[CHANGELOG.md](./CHANGELOG.md)**。

## 安装

```bash
mkdir -p ~/.hermes/desktop-plugins/deepseek-tide
cp desktop-plugin/plugin.js ~/.hermes/desktop-plugins/deepseek-tide/
```

然后按 `⌘K` → **"Reload desktop plugins"**(Windows 上为 `Ctrl+K`),状态栏即显示潮汐指示。

### 🤖 Agent 安装方式

如果你在跟 Hermes agent 对话,直接复制这条消息发给它:

```
帮我安装 deepseek-tide 插件:
1. 克隆 https://github.com/haexiao/deepseek-tide.git 到临时目录
2. 把 desktop-plugin/plugin.js 复制到 ~/.hermes/desktop-plugins/deepseek-tide/
3. 运行 ⌘K → "Reload desktop plugins"
```

## 依赖

无。纯前端本地时钟逻辑,不需要任何 API key 或网络连接。

## 说明

- 价格为官方分档价的最新一期,若官方调价需手动更新 `plugin.js` 中的 `PRICES` 常量(并在 `PRICE-HISTORY.md` 追加记录)
- 法定节假日目前按普通工作日处理(未内置中国节假日历)
- 当前版本:**v1.2.0**(2026-09-10)
