# 实验室使用预约网站

一个面向手机和桌面浏览器的实验室预约网站。当前使用人固定为：

- 王志鹏
- 周子茹
- 张正梁

功能包括本周/下周预约、每天 24 个整点小时段、同一小时仅一人预约、点击已预约时段取消，以及每周一访问时自动清理旧预约。

## 本地运行

```bash
npm install
npm run dev
```

如果没有配置 Supabase 环境变量，网站会进入本地演示模式，预约数据只保存在当前浏览器。

## Supabase 配置

1. 在 Supabase 创建一个新项目。
2. 打开 Supabase SQL Editor。
3. 执行 `supabase/schema.sql` 中的 SQL。
4. 复制项目的 URL 和 anon public key。
5. 在项目根目录创建 `.env.local`：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

重新运行 `npm run dev` 后，网站会切换为在线同步模式。

## 部署

推荐使用 GitHub Pages、Vercel 或 Netlify。

### GitHub Pages

项目已包含 GitHub Actions 自动部署文件：`.github/workflows/deploy.yml`。

1. 把代码推送到 GitHub 仓库的 `main` 或 `master` 分支。
2. 在 GitHub 仓库中打开 Settings > Secrets and variables > Actions。
3. 添加两个 Repository secrets：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. 打开 Settings > Pages，Source 选择 GitHub Actions。
5. 推送代码后，Actions 会自动构建并发布网站。

### Vercel 或 Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- 环境变量：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## 可用脚本

```bash
npm run dev
npm run build
npm run lint
npm run preview
```
