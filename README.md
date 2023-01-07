# hexo-gitalk-init

Hexo gitalk 轻量级初始化工具

## Feature

1. 无需安装其他的依赖，让你的hexo项目更干净
2. 不需要依赖或修改sitemap
3. 更适合自动化
4. 代码强迫症福音

## 使用示例

支持的配置

| 字段          | 说明                             | 默认值（env存在，则默认使用env的值）                                                                            |
|-------------|--------------------------------|--------------------------------------------------------------------------------------------------|
| username    | GitHub repository 所有者          | process.env.GITHUB_REPOSITORY_OWNER                                                              |    
| repo        | 储存评论issue的github仓库名            | process.env.GITAK_INIT_REPO                                                                      |    
| token       | GitHub 的 Personal access token | process.env.GITALK_TOKEN                                                                         |     |
| enableCache | 是否启用缓存                         | process.env.GITAK_INIT_CACHE, true                                                               |      
| cacheFile   | 缓存文件输出的位置                      | process.env.GITALK_INIT_CACHE_FILE,<br/> path.join(__dirname, './public/gitalk-init-cache.json') | 
| cacheRemote | 获取缓存的远程地址                      | process.env.GITALK_INIT_CACHE_REMOTE ,<br/> `https://${this.repo}/gitalk-init-cache.json`        |    
| postsDir    | hexo posts 文件路径                | 'source/_posts'                                                                                  |

###       

```json5
{
  "username": "GITHUB_USERNAME",
  "repo": "GITHUB_REPO",
  "token": "GITALK_TOKEN",
  "cache": true,
  "outputCacheFile": "./public/gitalk-init-cache.json",
  "outputCacheRemote": "OUTPUT_CACHE_REMOTE"
}
```
