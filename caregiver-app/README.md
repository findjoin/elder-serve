# 护工端前端原型

这是一个无需 Node 的静态前端原型，适合先把护工端流程跑通，再决定是否迁移到 `Vue 3 + Vite`。

## 当前覆盖

- 登录与工作台
- 批量任务与单项任务
- 健康数据录入
- 异常上报
- 交接班
- 个人中心、消息、打卡

## 本地预览

### 方式 1：VS Code

- 安装 `Live Server`
- 打开 [index.html](/c:/Users/14110/Desktop/elder_serve/caregiver-app/index.html)
- 右键选择 `Open with Live Server`

### 方式 2：Python

在 `c:\Users\14110\Desktop\elder_serve\caregiver-app` 目录运行：

```powershell
py -m http.server 5500
```

然后在浏览器打开：

```text
http://127.0.0.1:5500
```

## 推荐 VS Code 插件

- `ritwickdey.liveserver`
- `esbenp.prettier-vscode`
- `christian-kohler.path-intellisense`
- `editorconfig.editorconfig`
- `bradlc.vscode-tailwindcss`
