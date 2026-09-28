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
# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..

# 启动后端（终端1）
cd server && npm run dev

# 启动前端（终端2）
npm run dev
```

访问 http://localhost:5173 ，默认账号 `admin / admin123`

## AI配置

AI健康管家使用 OpenAI 兼容API，默认连接 deepseek-flash 模型。  
可在 `server/routes/ai.js` 中修改 `LLM_CONFIG` 或通过环境变量配置：

```env
LLM_API_URL=http://your-api-url
LLM_API_KEY=your-key
LLM_MODEL=deepseek-flash
```

## 目录结构

```
Vue25/
├── src/
│   ├── api/           # Axios封装与接口
│   ├── components/    # City3D 3D场景 / ChartPanel 图表
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
