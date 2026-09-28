# 康养数字孪生平台

基于 **Vue 3 + ECharts + Three.js + Express + SQLite** 打造的康养数字孪生可视化系统。  
面向养老院/康养中心的日常运营监测、住户健康管理、设备监控与智能预警等场景，提供沉浸式 3D 孪生大屏与多维度数据可视化能力。

> 本项目为毕业设计作品。

---

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite 5 | 组合式API单页应用 |
| 3D渲染 | Three.js | 康养场景3D数字孪生 |
| 图表 | ECharts 6 + ECharts GL | 健康趋势/护理分析/空间关系 |
| UI | Element Plus | 后台管理组件 |
| 状态 | Pinia | 用户态/主题态管理 |
| 后端 | Node.js + Express | REST API |
| 数据库 | SQLite (better-sqlite3) | 本地轻量数据库 |
| 鉴权 | JWT + bcryptjs | Token认证与密码加密 |
| AI | OpenAI兼容API (deepseek-flash) | 健康数据分析与智能问答 |

## 功能模块

- 3D康养孪生大屏（居室/走廊/餐厅/护理站/康复室五大场景）
- 健康监测图表（心率/血压/血氧/体温趋势）
- 护理分析（护理记录统计、质量评估）
- 空间关系图谱（房间布局、设备关联）
- 数据管理（住户档案/设备/告警等8张业务表CRUD + Excel导入导出）
- 用户权限管理（admin/editor/viewer三级角色）
- 健康风险预测（跌倒风险/健康异常/护理质量/综合风险四种模型）
- AI健康管家（基于实时数据的智能问答与分析建议）
- 系统样式设置（主题色/字体/3D场景默认主题）
- 数据库连接配置

## 快速启动

```bash
# 1. 安装前端依赖
npm install

# 2. 安装后端依赖
cd server && npm install && cd ..

# 3. 配置环境变量（首次必须执行）
cp server/.env.example server/.env
# 然后编辑 server/.env，至少填入 JWT_SECRET 与 LLM_API_KEY

# 4. 启动后端（终端1）
cd server && npm run dev

# 5. 启动前端（终端2）
npm run dev
```

访问 http://localhost:5173 ，默认账号 `admin / admin123`
（数据库首次启动会自动建表并写入演示数据，无需手工导入。）

## 环境变量

所有配置集中在 `server/.env`（**该文件已被 .gitignore 忽略，不会进入仓库**）。
`server/env.js` 是一个零依赖的 .env 加载器，在 `server/index.js` 首行执行；
已存在的进程环境变量优先级更高，因此部署时可用 systemd / pm2 直接注入而不改文件。

| 变量 | 说明 |
|---|---|
| `PORT` | 后端端口，默认 3001 |
| `NODE_ENV` | `development` / `production` |
| `JWT_SECRET` | 登录令牌签发密钥，**必须使用随机值** |
| `LLM_API_URL` | OpenAI 兼容接口地址，如 `https://api.siliconflow.cn` |
| `LLM_API_KEY` | 大模型服务密钥 |
| `LLM_MODEL` | 模型名，默认 `deepseek-flash` |

生成随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> ⚠️ **安全提示**：未配置 `LLM_API_URL` / `LLM_API_KEY` 时，AI 健康管家会返回 503 并提示「服务未配置」，
> 其余功能不受影响。**切勿把真实密钥写回源码** —— 本仓库是公开仓库，密钥一旦提交即等于公开。
> （历史上曾因此泄露过一个 LLM key，请到服务商后台确认其已吊销。）

## AI配置

AI健康管家使用 OpenAI 兼容 API，通过上面的环境变量配置 `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL`。
密钥只从环境变量读取，`server/routes/ai.js` 中不再内置任何默认值。

## 部署

线上环境：<http://152.136.36.198> （腾讯云 CVM · OpenCloudOS 9.6 · 2C2G）

| 项 | 位置 / 配置 |
|---|---|
| 项目目录 | `/opt/kangyang-twin` |
| 前端静态产物 | `/opt/kangyang-twin/dist`（nginx 直接托管） |
| 后端进程 | pm2 `kangyang-api` → `node server/index.js`（端口 3001） |
| nginx 配置 | `/etc/nginx/conf.d/kangyang.conf`（80 端口，`/api` 反代到 127.0.0.1:3001） |
| 环境变量 | `/opt/kangyang-twin/server/.env`（权限 600，不入 git） |
| 部署备份 | `/opt/kangyang-backups/deploy-<时间戳>.tar.gz` |

前端进程与 nginx 均已配置开机自启（`pm2-root` + `nginx` 的 systemd 服务均 enabled）。

### 重新发布

```bash
# 本地构建
npm run build

# 上传（凭据从环境变量读取，不落盘）
export DEPLOY_HOST=152.136.36.198 DEPLOY_PORT=22 DEPLOY_USER=root DEPLOY_PASSWORD='<密码>'
python scripts/deploy.py put ./dist /opt/kangyang-twin/dist          # 前端
python scripts/deploy.py putfile ./server/routes/ai.js \
       /opt/kangyang-twin/server/routes/ai.js                        # 后端单个文件

# 服务器上重启
python scripts/deploy.py exec "pm2 restart kangyang-api"
```

> ⚠️ Git Bash 下必须加 `MSYS_NO_PATHCONV=1`，否则 `/opt/...` 会被转换成 Windows 路径。
> 脚本已内置该检测，路径异常时会直接报错退出而不是建出一串垃圾目录。
>
> ⚠️ 上传前端时建议先传到 `dist-new` 再 `mv` 替换，避免上传中途站点处于半成品状态。
> 数据库 `server/data/` 与上传目录 `server/uploads/` **不要覆盖**，那是线上数据。

### 服务器运维命令

```bash
pm2 status                 # 进程状态
pm2 logs kangyang-api      # 实时日志
pm2 restart kangyang-api   # 重启后端
nginx -t && systemctl reload nginx
```

## 目录结构

```
Vue25/
├── src/
│   ├── api/           # Axios封装与接口
│   ├── components/    # Room3D 3D康养场景 / ChartPanel 图表
│   ├── router/        # 路由与权限守卫
│   ├── stores/        # Pinia 用户/主题状态
│   ├── styles/        # 全局样式
│   └── views/         # 页面组件
├── server/
│   ├── routes/        # auth data settings predict ai
│   ├── middleware/    # JWT认证
│   ├── data/          # SQLite数据库
│   └── uploads/       # 上传文件
└── vite.config.js
```

## 演示账号

| 角色 | 账号 | 密码 | 权限 |
|---|---|---|---|
| 管理员 | admin | admin123 | 全部 |
| 编辑员 | editor | editor123 | 数据/图表/预测 |
| 访客 | viewer | viewer123 | 仅查看 |
